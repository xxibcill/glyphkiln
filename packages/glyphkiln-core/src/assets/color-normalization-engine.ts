import { inflateSync } from "node:zlib";

import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

import { sha256 } from "../cache/canonical.js";
import { GlyphkilnError } from "../domain/types.js";
import {
  LITTLE_CMS_COLOR_SPACE,
  closeLittleCmsProfile,
  createLittleCmsSrgbProfile,
  createLittleCmsTransform,
  deleteLittleCmsTransform,
  getLittleCmsColorSpace,
  initializeLittleCms,
  openLittleCmsProfile,
  transformLittleCmsPixels,
  type LittleCmsInputFormat,
  type LittleCmsProfile,
  type LittleCmsTransform,
} from "./little-cms-adapter.js";
import {
  COLOR_NORMALIZATION_IMPLEMENTATION,
  COLOR_NORMALIZATION_LIMITS,
  COLOR_NORMALIZATION_POLICY_VERSION,
  type ColorNormalizationInput,
  type ColorNormalizationProfile,
  type NormalizedRasterColor,
} from "./color-normalization.js";

type SourceColorSpace = "srgb" | "cmyk" | "grayscale" | "other";

type SourceInspection = {
  width: number;
  height: number;
  colorSpace: SourceColorSpace;
  profile: ColorNormalizationProfile;
  profileBytes?: Uint8Array;
  orientation: number;
};

type DecodedRaster = {
  width: number;
  height: number;
  rgba: Uint8Array;
};

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG_ICC_SIGNATURE = Buffer.from("ICC_PROFILE\0", "latin1");
const JPEG_EXIF_SIGNATURE = Buffer.from("Exif\0\0", "latin1");

export async function normalizeRasterColorInProcess(
  input: ColorNormalizationInput,
): Promise<NormalizedRasterColor> {
  const sourceBytes = new Uint8Array(input.bytes);
  assertEngineInput(sourceBytes, input.mimeType);
  const inspection =
    input.mimeType === "image/png" ? inspectPng(sourceBytes) : inspectJpeg(sourceBytes);
  assertDimensions(inspection.width, inspection.height);

  const decoded = decodeRaster(sourceBytes, input.mimeType, inspection);
  const normalizedColor = await normalizeColor(decoded.rgba, inspection);
  const oriented = applyOrientation(
    normalizedColor,
    decoded.width,
    decoded.height,
    inspection.orientation,
  );
  const outputBytes = encodeCanonicalPng(oriented);
  if (outputBytes.byteLength > COLOR_NORMALIZATION_LIMITS.maxOutputBytes) {
    throw new GlyphkilnError(
      "Canonical PNG output exceeds the color-normalization byte limit.",
      "COLOR_NORMALIZATION_OUTPUT_LIMIT_EXCEEDED",
      {
        maximum: COLOR_NORMALIZATION_LIMITS.maxOutputBytes,
        actual: outputBytes.byteLength,
      },
    );
  }

  return {
    bytes: outputBytes,
    report: {
      policyVersion: COLOR_NORMALIZATION_POLICY_VERSION,
      implementation: COLOR_NORMALIZATION_IMPLEMENTATION,
      source: {
        mimeType: input.mimeType,
        byteLength: sourceBytes.byteLength,
        sha256: sha256(sourceBytes),
        width: inspection.width,
        height: inspection.height,
        colorSpace: inspection.colorSpace,
        profile: inspection.profile,
        orientation: inspection.orientation,
      },
      output: {
        mimeType: "image/png",
        byteLength: outputBytes.byteLength,
        sha256: sha256(outputBytes),
        width: oriented.width,
        height: oriented.height,
        colorSpace: "srgb",
        hasAlpha: true,
      },
      changes: {
        colorConversion:
          inspection.profile.kind === "embedded-icc"
            ? "embedded-profile-to-srgb"
            : "assumed-or-declared-srgb",
        orientationApplied: inspection.orientation !== 1,
        metadataStripped: true,
        reencoded: true,
      },
    },
  };
}

function assertEngineInput(
  bytes: Uint8Array,
  mimeType: ColorNormalizationInput["mimeType"],
): void {
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > COLOR_NORMALIZATION_LIMITS.maxInputBytes
  ) {
    throw new GlyphkilnError(
      "Raster input exceeds the color-normalization byte limit.",
      "COLOR_NORMALIZATION_INPUT_LIMIT_EXCEEDED",
      {
        maximum: COLOR_NORMALIZATION_LIMITS.maxInputBytes,
        actual: bytes.byteLength,
      },
    );
  }
  const isPng = hasPrefix(bytes, PNG_SIGNATURE);
  const isJpeg =
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  if ((mimeType === "image/png" && !isPng) || (mimeType === "image/jpeg" && !isJpeg)) {
    throw new GlyphkilnError(
      "Raster bytes do not match the declared color-normalization MIME type.",
      "COLOR_NORMALIZATION_MIME_MISMATCH",
      { expected: mimeType },
    );
  }
}

function inspectPng(bytes: Uint8Array): SourceInspection {
  let offset = PNG_SIGNATURE.byteLength;
  let width: number | undefined;
  let height: number | undefined;
  let colorSpace: SourceColorSpace | undefined;
  let profileBytes: Uint8Array | undefined;
  let declaredSrgb = false;
  let orientation = 1;
  let sawExif = false;
  let sawEnd = false;

  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) throwInvalidRaster("PNG chunk header");
    const length = readUint32Be(bytes, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.byteLength) {
      throwInvalidRaster("PNG chunk bounds");
    }
    const type = ascii(bytes, offset + 4, offset + 8);
    const data = bytes.subarray(dataStart, dataEnd);

    if (width === undefined && type !== "IHDR") {
      throwInvalidRaster("PNG IHDR order");
    }
    switch (type) {
      case "IHDR": {
        if (width !== undefined || length !== 13) throwInvalidRaster("PNG IHDR");
        width = readUint32Be(data, 0);
        height = readUint32Be(data, 4);
        if (data[8] !== 8) {
          throw new GlyphkilnError(
            "Only 8-bit PNG inputs are supported for color normalization.",
            "COLOR_NORMALIZATION_RASTER_UNSUPPORTED",
            { format: "png", bitDepth: data[8] ?? -1 },
          );
        }
        const colorType = data[9];
        colorSpace =
          colorType === 0 || colorType === 4
            ? "grayscale"
            : colorType === 2 || colorType === 3 || colorType === 6
              ? "srgb"
              : "other";
        break;
      }
      case "iCCP":
        if (profileBytes !== undefined || declaredSrgb) throwInvalidProfile();
        profileBytes = readPngProfile(data);
        break;
      case "sRGB":
        if (
          declaredSrgb ||
          profileBytes !== undefined ||
          length !== 1 ||
          data[0]! > 3
        ) {
          throwInvalidProfile();
        }
        declaredSrgb = true;
        break;
      case "eXIf":
        if (sawExif) throwInvalidOrientation();
        sawExif = true;
        orientation = readExifOrientation(data);
        break;
      case "acTL":
        throw new GlyphkilnError(
          "Animated PNG inputs are not supported for color normalization.",
          "COLOR_NORMALIZATION_RASTER_UNSUPPORTED",
          { format: "apng" },
        );
      case "IEND":
        if (length !== 0) throwInvalidRaster("PNG IEND");
        sawEnd = true;
        offset = chunkEnd;
        if (offset !== bytes.byteLength) throwInvalidRaster("PNG trailing data");
        break;
      default:
        break;
    }
    if (sawEnd) break;
    offset = chunkEnd;
  }

  if (
    width === undefined ||
    height === undefined ||
    colorSpace === undefined ||
    !sawEnd
  ) {
    throwInvalidRaster("PNG structure");
  }
  return {
    width,
    height,
    colorSpace,
    profile:
      profileBytes === undefined
        ? declaredSrgb
          ? { kind: "declared-srgb" }
          : { kind: "implicit-srgb" }
        : embeddedProfile(profileBytes),
    ...(profileBytes === undefined ? {} : { profileBytes }),
    orientation,
  };
}

function readPngProfile(data: Uint8Array): Uint8Array {
  const nameEnd = data.indexOf(0);
  if (
    nameEnd < 1 ||
    nameEnd > 79 ||
    nameEnd + 2 > data.byteLength ||
    data[nameEnd + 1] !== 0
  ) {
    throwInvalidProfile();
  }
  const compressed = data.subarray(nameEnd + 2);
  if (compressed.byteLength === 0) throwInvalidProfile();
  try {
    const inflated = new Uint8Array(
      inflateSync(compressed, {
        maxOutputLength: COLOR_NORMALIZATION_LIMITS.maxColorProfileBytes + 1,
      }),
    );
    assertProfileLimit(inflated.byteLength);
    return inflated;
  } catch (error) {
    if (isOutputLimitError(error)) {
      throw new GlyphkilnError(
        "Embedded color profile exceeds the decompressed byte limit.",
        "COLOR_PROFILE_LIMIT_EXCEEDED",
        { maximum: COLOR_NORMALIZATION_LIMITS.maxColorProfileBytes },
      );
    }
    if (error instanceof GlyphkilnError) throw error;
    throwInvalidProfile();
  }
}

function inspectJpeg(bytes: Uint8Array): SourceInspection {
  let offset = 2;
  let width: number | undefined;
  let height: number | undefined;
  let componentCount: number | undefined;
  let orientation = 1;
  let sawExif = false;
  let reachedImageData = false;
  let sawEnd = false;
  let restartInterval = 0;
  const profileChunks = new Map<number, Uint8Array>();
  let expectedProfileChunks: number | undefined;
  let totalProfileBytes = 0;

  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) throwInvalidRaster("JPEG marker");
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) throwInvalidRaster("JPEG marker byte");
    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0xd9) {
      sawEnd = true;
      if (offset !== bytes.byteLength) throwInvalidRaster("JPEG trailing data");
      break;
    }
    if (marker === 0xd8) throwInvalidRaster("JPEG additional image");
    if (marker === 0x01) {
      continue;
    }
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      throwInvalidRaster("JPEG marker placement");
    }
    if (offset + 2 > bytes.byteLength) throwInvalidRaster("JPEG segment length");
    const segmentLength = readUint16Be(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      throwInvalidRaster("JPEG segment bounds");
    }
    const data = bytes.subarray(offset + 2, offset + segmentLength);
    if (isStartOfFrame(marker)) {
      if (data.byteLength < 6 || width !== undefined) {
        throwInvalidRaster("JPEG frame header");
      }
      height = readUint16Be(data, 1);
      width = readUint16Be(data, 3);
      componentCount = data[5];
    } else if (marker === 0xe1 && hasPrefix(data, JPEG_EXIF_SIGNATURE)) {
      if (sawExif) throwInvalidOrientation();
      sawExif = true;
      orientation = readExifOrientation(data.subarray(JPEG_EXIF_SIGNATURE.byteLength));
    } else if (marker === 0xe2 && hasPrefix(data, JPEG_ICC_SIGNATURE)) {
      if (data.byteLength < JPEG_ICC_SIGNATURE.byteLength + 2) {
        throwInvalidProfile();
      }
      const index = data[JPEG_ICC_SIGNATURE.byteLength]!;
      const count = data[JPEG_ICC_SIGNATURE.byteLength + 1]!;
      if (
        index < 1 ||
        count < 1 ||
        count > COLOR_NORMALIZATION_LIMITS.maxJpegColorProfileChunks ||
        (expectedProfileChunks !== undefined && expectedProfileChunks !== count) ||
        profileChunks.has(index)
      ) {
        throwInvalidProfile();
      }
      expectedProfileChunks = count;
      const chunk = data.subarray(JPEG_ICC_SIGNATURE.byteLength + 2);
      totalProfileBytes += chunk.byteLength;
      assertProfileLimit(totalProfileBytes);
      profileChunks.set(index, new Uint8Array(chunk));
    } else if (marker === 0xdd) {
      if (data.byteLength !== 2) throwInvalidRaster("JPEG restart interval");
      restartInterval = readUint16Be(data, 0);
    }
    offset += segmentLength;
    if (marker === 0xda) {
      reachedImageData = true;
      offset = findJpegScanEnd(bytes, offset, restartInterval);
    }
  }

  if (
    width === undefined ||
    height === undefined ||
    componentCount === undefined ||
    !reachedImageData ||
    !sawEnd
  ) {
    throwInvalidRaster("JPEG structure");
  }
  let profileBytes: Uint8Array | undefined;
  if (expectedProfileChunks !== undefined) {
    if (profileChunks.size !== expectedProfileChunks) throwInvalidProfile();
    const chunks: Uint8Array[] = [];
    for (let index = 1; index <= expectedProfileChunks; index += 1) {
      const chunk = profileChunks.get(index);
      if (chunk === undefined) throwInvalidProfile();
      chunks.push(chunk);
    }
    profileBytes = concatenate(chunks);
  }
  const colorSpace: SourceColorSpace =
    componentCount === 1
      ? "grayscale"
      : componentCount === 3
        ? "srgb"
        : componentCount === 4
          ? "cmyk"
          : "other";
  return {
    width,
    height,
    colorSpace,
    profile:
      profileBytes === undefined
        ? { kind: "implicit-srgb" }
        : embeddedProfile(profileBytes),
    ...(profileBytes === undefined ? {} : { profileBytes }),
    orientation,
  };
}

function findJpegScanEnd(
  bytes: Uint8Array,
  start: number,
  restartInterval: number,
): number {
  let offset = start;
  let expectedRestartMarker = 0xd0;
  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const markerStart = offset;
    offset += 1;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) throwInvalidRaster("JPEG scan marker");
    const marker = bytes[offset]!;
    if (marker === 0x00) {
      offset += 1;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      if (restartInterval === 0 || marker !== expectedRestartMarker) {
        throwInvalidRaster("JPEG restart marker");
      }
      expectedRestartMarker = 0xd0 + ((marker - 0xd0 + 1) % 8);
      offset += 1;
      continue;
    }
    return markerStart;
  }
  throwInvalidRaster("JPEG scan end");
}

function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function readExifOrientation(tiff: Uint8Array): number {
  try {
    if (tiff.byteLength < 8) throw new Error("short TIFF header");
    const byteOrder = ascii(tiff, 0, 2);
    if (byteOrder !== "II" && byteOrder !== "MM") {
      throw new Error("invalid TIFF byte order");
    }
    const littleEndian = byteOrder === "II";
    if (readUint16(tiff, 2, littleEndian) !== 42) {
      throw new Error("invalid TIFF marker");
    }
    const ifdOffset = readUint32(tiff, 4, littleEndian);
    if (ifdOffset + 2 > tiff.byteLength) throw new Error("invalid IFD offset");
    const entryCount = readUint16(tiff, ifdOffset, littleEndian);
    if (entryCount > 4_096) throw new Error("excessive IFD entry count");
    const entriesEnd = ifdOffset + 2 + entryCount * 12;
    if (entriesEnd > tiff.byteLength) throw new Error("truncated IFD");
    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = ifdOffset + 2 + index * 12;
      if (readUint16(tiff, entryOffset, littleEndian) !== 0x0112) continue;
      if (
        readUint16(tiff, entryOffset + 2, littleEndian) !== 3 ||
        readUint32(tiff, entryOffset + 4, littleEndian) !== 1
      ) {
        throw new Error("invalid orientation entry");
      }
      const orientation = readUint16(tiff, entryOffset + 8, littleEndian);
      if (orientation < 1 || orientation > 8) {
        throw new Error("invalid orientation value");
      }
      return orientation;
    }
    return 1;
  } catch {
    throwInvalidOrientation();
  }
}

function decodeRaster(
  bytes: Uint8Array,
  mimeType: ColorNormalizationInput["mimeType"],
  inspection: SourceInspection,
): DecodedRaster {
  if (inspection.colorSpace === "cmyk" || inspection.colorSpace === "other") {
    throwUnsupportedColorSpace(inspection.colorSpace);
  }
  try {
    if (mimeType === "image/png") {
      const decoded = PNG.sync.read(Buffer.from(bytes), { checkCRC: true });
      assertDecodedDimensions(decoded.width, decoded.height, inspection);
      return {
        width: decoded.width,
        height: decoded.height,
        rgba: new Uint8Array(decoded.data),
      };
    }
    const decoded = decodeJpeg(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: false,
      maxResolutionInMP: Math.ceil(COLOR_NORMALIZATION_LIMITS.maxPixels / 1_000_000),
      maxMemoryUsageInMB: 256,
    });
    assertDecodedDimensions(decoded.width, decoded.height, inspection);
    return { width: decoded.width, height: decoded.height, rgba: decoded.data };
  } catch (error) {
    if (error instanceof GlyphkilnError) throw error;
    throw new GlyphkilnError(
      "Raster bytes could not be decoded safely for color normalization.",
      "COLOR_NORMALIZATION_RASTER_INVALID",
      { format: mimeType === "image/png" ? "png" : "jpeg" },
    );
  }
}

function assertDecodedDimensions(
  width: number,
  height: number,
  inspection: SourceInspection,
): void {
  if (width !== inspection.width || height !== inspection.height) {
    throwInvalidRaster("decoded dimensions");
  }
  if (width * height * 4 <= 0) throwInvalidRaster("decoded pixel buffer");
}

async function normalizeColor(
  rgba: Uint8Array,
  inspection: SourceInspection,
): Promise<Uint8Array> {
  if (inspection.profileBytes === undefined) return new Uint8Array(rgba);
  await runLittleCmsStage(initializeLittleCms(), "initialize");

  let inputProfile: LittleCmsProfile | undefined;
  let outputProfile: LittleCmsProfile | undefined;
  let transform: LittleCmsTransform | undefined;
  try {
    inputProfile = await runLittleCmsStage(
      openLittleCmsProfile(inspection.profileBytes),
      "open-profile",
    );
    outputProfile = await runLittleCmsStage(
      createLittleCmsSrgbProfile(),
      "create-srgb-profile",
    );
    const profileColorSpace = await runLittleCmsStage(
      getLittleCmsColorSpace(inputProfile),
      "read-color-space",
    );
    let inputPixels: Uint8Array;
    let inputFormat: LittleCmsInputFormat;
    if (profileColorSpace === LITTLE_CMS_COLOR_SPACE.rgb) {
      if (inspection.colorSpace !== "srgb") {
        throwInvalidProfileColorSpace(inspection.colorSpace);
      }
      inputPixels = extractRgb(rgba);
      inputFormat = "rgb8";
    } else if (profileColorSpace === LITTLE_CMS_COLOR_SPACE.gray) {
      if (inspection.colorSpace !== "grayscale") {
        throwInvalidProfileColorSpace(inspection.colorSpace);
      }
      inputPixels = extractGray(rgba);
      inputFormat = "gray8";
    } else if (profileColorSpace === LITTLE_CMS_COLOR_SPACE.cmyk) {
      throwUnsupportedColorSpace("cmyk");
    } else {
      throwUnsupportedColorSpace("other");
    }

    transform = await runLittleCmsStage(
      createLittleCmsTransform(inputProfile, inputFormat, outputProfile),
      "create-transform",
    );
    const rgb = await runLittleCmsStage(
      transformLittleCmsPixels(transform, inputPixels, rgba.byteLength / 4),
      "transform",
    );
    if (rgb.byteLength !== (rgba.byteLength / 4) * 3) {
      throw new Error("LittleCMS returned an unexpected output length.");
    }
    return restoreAlpha(rgb, rgba);
  } catch (error) {
    if (error instanceof GlyphkilnError) throw error;
    throw new GlyphkilnError(
      "Embedded ICC profile could not be converted to canonical sRGB.",
      "COLOR_PROFILE_INVALID",
      { stage: littleCmsErrorStage(error) },
    );
  } finally {
    if (transform !== undefined) await deleteLittleCmsTransform(transform);
    if (outputProfile !== undefined) await closeLittleCmsProfile(outputProfile);
    if (inputProfile !== undefined) await closeLittleCmsProfile(inputProfile);
  }
}

async function runLittleCmsStage<T>(operation: Promise<T>, stage: string): Promise<T> {
  try {
    return await operation;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    Object.defineProperty(error, "glyphkilnStage", { value: stage });
    throw error;
  }
}

function littleCmsErrorStage(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown";
  const descriptor = Object.getOwnPropertyDescriptor(error, "glyphkilnStage");
  return typeof descriptor?.value === "string" ? descriptor.value : "unknown";
}

function extractRgb(rgba: Uint8Array): Uint8Array {
  const rgb = new Uint8Array((rgba.byteLength / 4) * 3);
  for (let source = 0, target = 0; source < rgba.byteLength; source += 4) {
    rgb[target] = rgba[source]!;
    rgb[target + 1] = rgba[source + 1]!;
    rgb[target + 2] = rgba[source + 2]!;
    target += 3;
  }
  return rgb;
}

function extractGray(rgba: Uint8Array): Uint8Array {
  const gray = new Uint8Array(rgba.byteLength / 4);
  for (let source = 0, target = 0; source < rgba.byteLength; source += 4) {
    gray[target] = rgba[source]!;
    target += 1;
  }
  return gray;
}

function restoreAlpha(rgb: Uint8Array, sourceRgba: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(sourceRgba.byteLength);
  for (let target = 0, source = 0; target < rgba.byteLength; target += 4) {
    rgba[target] = rgb[source]!;
    rgba[target + 1] = rgb[source + 1]!;
    rgba[target + 2] = rgb[source + 2]!;
    rgba[target + 3] = sourceRgba[target + 3]!;
    source += 3;
  }
  return rgba;
}

function applyOrientation(
  rgba: Uint8Array,
  width: number,
  height: number,
  orientation: number,
): DecodedRaster {
  if (orientation === 1) return { width, height, rgba };
  const swapsAxes = orientation >= 5;
  const outputWidth = swapsAxes ? height : width;
  const outputHeight = swapsAxes ? width : height;
  const output = new Uint8Array(rgba.byteLength);
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const [sourceX, sourceY] = orientationSource(orientation, x, y, width, height);
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const outputOffset = (y * outputWidth + x) * 4;
      output.set(rgba.subarray(sourceOffset, sourceOffset + 4), outputOffset);
    }
  }
  return { width: outputWidth, height: outputHeight, rgba: output };
}

function orientationSource(
  orientation: number,
  x: number,
  y: number,
  width: number,
  height: number,
): readonly [number, number] {
  switch (orientation) {
    case 2:
      return [width - 1 - x, y];
    case 3:
      return [width - 1 - x, height - 1 - y];
    case 4:
      return [x, height - 1 - y];
    case 5:
      return [y, x];
    case 6:
      return [y, height - 1 - x];
    case 7:
      return [width - 1 - y, height - 1 - x];
    case 8:
      return [width - 1 - y, x];
    default:
      throwInvalidOrientation();
  }
}

function encodeCanonicalPng(raster: DecodedRaster): Uint8Array {
  try {
    const png = new PNG({ width: raster.width, height: raster.height });
    png.data = Buffer.from(raster.rgba);
    return new Uint8Array(
      PNG.sync.write(png, {
        colorType: 6,
        inputColorType: 6,
        bitDepth: 8,
        inputHasAlpha: true,
        deflateLevel: 9,
        deflateStrategy: 3,
        filterType: 4,
      }),
    );
  } catch {
    throw new GlyphkilnError(
      "Canonical PNG output could not be encoded.",
      "COLOR_NORMALIZATION_ENCODING_FAILED",
    );
  }
}

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > COLOR_NORMALIZATION_LIMITS.maxDimension ||
    height > COLOR_NORMALIZATION_LIMITS.maxDimension ||
    width * height > COLOR_NORMALIZATION_LIMITS.maxPixels
  ) {
    throw new GlyphkilnError(
      "Raster dimensions exceed the color-normalization resource boundary.",
      "COLOR_NORMALIZATION_DIMENSIONS_LIMIT_EXCEEDED",
      {
        width,
        height,
        maximumDimension: COLOR_NORMALIZATION_LIMITS.maxDimension,
        maximumPixels: COLOR_NORMALIZATION_LIMITS.maxPixels,
      },
    );
  }
}

function embeddedProfile(bytes: Uint8Array): ColorNormalizationProfile {
  assertProfileLimit(bytes.byteLength);
  assertProfileDeclaredLength(bytes);
  return {
    kind: "embedded-icc",
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function assertProfileDeclaredLength(bytes: Uint8Array): void {
  if (bytes.byteLength < 4 || readUint32Be(bytes, 0) !== bytes.byteLength) {
    throwInvalidProfile();
  }
}

function assertProfileLimit(actual: number): void {
  if (actual > COLOR_NORMALIZATION_LIMITS.maxColorProfileBytes) {
    throw new GlyphkilnError(
      "Embedded color profile exceeds the byte limit.",
      "COLOR_PROFILE_LIMIT_EXCEEDED",
      {
        maximum: COLOR_NORMALIZATION_LIMITS.maxColorProfileBytes,
        actual,
      },
    );
  }
}

function throwUnsupportedColorSpace(colorSpace: "cmyk" | "other"): never {
  throw new GlyphkilnError(
    "The embedded or raster color space is not supported for safe normalization.",
    "COLOR_PROFILE_COLOR_SPACE_UNSUPPORTED",
    { colorSpace },
  );
}

function throwInvalidProfileColorSpace(colorSpace: SourceColorSpace): never {
  throw new GlyphkilnError(
    "Embedded color profile does not match the raster sample color space.",
    "COLOR_PROFILE_INVALID",
    { rasterColorSpace: colorSpace },
  );
}

function throwInvalidProfile(): never {
  throw new GlyphkilnError(
    "Embedded color-profile metadata is invalid or incomplete.",
    "COLOR_PROFILE_INVALID",
  );
}

function throwInvalidOrientation(): never {
  throw new GlyphkilnError(
    "Embedded EXIF orientation metadata is invalid.",
    "COLOR_NORMALIZATION_ORIENTATION_INVALID",
  );
}

function throwInvalidRaster(stage: string): never {
  throw new GlyphkilnError(
    "Raster bytes have an invalid or incomplete structure.",
    "COLOR_NORMALIZATION_RASTER_INVALID",
    { stage },
  );
}

function isOutputLimitError(error: unknown): boolean {
  return (
    error instanceof RangeError ||
    (error instanceof Error && /larger than|maxOutputLength/i.test(error.message))
  );
}

function hasPrefix(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.byteLength < prefix.byteLength) return false;
  for (let index = 0; index < prefix.byteLength; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function readUint16Be(bytes: Uint8Array, offset: number): number {
  if (offset + 2 > bytes.byteLength) throw new RangeError("uint16 bounds");
  return bytes[offset]! * 0x100 + bytes[offset + 1]!;
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.byteLength) throw new RangeError("uint32 bounds");
  return (
    bytes[offset]! * 0x1000000 +
    bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 +
    bytes[offset + 3]!
  );
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset + 2 > bytes.byteLength) throw new RangeError("uint16 bounds");
  return littleEndian
    ? bytes[offset]! + bytes[offset + 1]! * 0x100
    : bytes[offset]! * 0x100 + bytes[offset + 1]!;
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset + 4 > bytes.byteLength) throw new RangeError("uint32 bounds");
  return littleEndian
    ? bytes[offset]! +
        bytes[offset + 1]! * 0x100 +
        bytes[offset + 2]! * 0x10000 +
        bytes[offset + 3]! * 0x1000000
    : readUint32Be(bytes, offset);
}
