import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

import { sha256 } from "../cache/canonical.js";
import { GlyphkilnError, type ResolvedAsset } from "../domain/types.js";
import { RENDER_RESOURCE_LIMITS, assertAssetResources } from "../resources/index.js";
import type { AssetDeclaration, DesignDocument } from "../schema/design-document.js";

export class AssetRegistry {
  readonly #assets = new Map<string, ResolvedAsset>();

  public constructor(
    declarations: readonly AssetDeclaration[],
    assets: readonly ResolvedAsset[],
  ) {
    assertAssetDeclarationCount(declarations, assets.length);
    assertAssetResources(assets);
    const suppliedIds = new Set<string>();
    let totalPixels = 0;
    for (const asset of assets) {
      if (suppliedIds.has(asset.id)) {
        throw new GlyphkilnError(
          `Resolved asset ID "${asset.id}" was supplied more than once.`,
          "DUPLICATE_RESOLVED_ASSET",
          { assetId: asset.id },
        );
      }
      suppliedIds.add(asset.id);
      const verified = verifyAssetBytes(asset);
      totalPixels = addAssetPixels(totalPixels, verified);
      this.#assets.set(asset.id, verified);
    }
    for (const declaration of declarations) {
      this.#verifyDeclaration(declaration);
    }
  }

  public get(id: string): ResolvedAsset {
    const asset = this.#assets.get(id);
    if (asset === undefined) {
      throw new GlyphkilnError(
        `Asset "${id}" was declared but its bytes were not supplied.`,
        "UNRESOLVED_ASSET",
        { assetId: id },
      );
    }
    return asset;
  }

  public list(): ResolvedAsset[] {
    return [...this.#assets.values()];
  }

  #verifyDeclaration(declaration: AssetDeclaration): void {
    const asset = this.get(declaration.id);
    const mismatches: string[] = [];
    if (asset.sha256 !== declaration.sha256) mismatches.push("sha256");
    if (asset.mimeType !== declaration.mimeType) mismatches.push("mimeType");
    if (asset.width !== declaration.width) mismatches.push("width");
    if (asset.height !== declaration.height) mismatches.push("height");
    if (!originsEqual(asset.origin, declaration.origin)) {
      mismatches.push("origin");
    }
    if (mismatches.length > 0) {
      throw new GlyphkilnError(
        `Resolved asset "${declaration.id}" does not match its declaration.`,
        "ASSET_DECLARATION_MISMATCH",
        { assetId: declaration.id, fields: mismatches },
      );
    }
  }
}

export function validateAssetReferences(
  document: DesignDocument,
  registry: AssetRegistry,
): void {
  const declared = new Set(document.assets.map((asset) => asset.id));
  for (const layer of document.layers) {
    if (
      layer.type === "logo" ||
      layer.type === "image" ||
      layer.type === "product-screenshot"
    ) {
      if (!declared.has(layer.assetId)) {
        throw new GlyphkilnError(
          `Layer "${layer.id}" references undeclared asset "${layer.assetId}".`,
          "UNDECLARED_ASSET_REFERENCE",
          { layerId: layer.id, assetId: layer.assetId },
        );
      }
      registry.get(layer.assetId);
    }
  }
}

export function assetDataUri(asset: ResolvedAsset): string {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.bytes).toString("base64")}`;
}

function verifyAssetBytes(asset: ResolvedAsset): ResolvedAsset {
  if (!(asset.bytes instanceof Uint8Array)) {
    throw new GlyphkilnError(
      `Asset "${asset.id}" must provide Uint8Array bytes.`,
      "INVALID_ASSET_BYTES",
      { assetId: asset.id },
    );
  }
  if (asset.bytes.byteLength > RENDER_RESOURCE_LIMITS.maxAssetBytes) {
    throw new GlyphkilnError(
      `Asset "${asset.id}" exceeds the per-asset byte limit.`,
      "ASSET_BYTES_LIMIT_EXCEEDED",
      {
        assetId: asset.id,
        maximum: RENDER_RESOURCE_LIMITS.maxAssetBytes,
        actual: asset.bytes.byteLength,
      },
    );
  }
  const detectedMimeType = detectImageMimeType(asset.bytes);
  if (detectedMimeType !== asset.mimeType) {
    throw new GlyphkilnError(
      `Asset "${asset.id}" content is ${detectedMimeType ?? "unsupported"}, not ${asset.mimeType}.`,
      "ASSET_MIME_MISMATCH",
      { assetId: asset.id, expected: asset.mimeType, actual: detectedMimeType },
    );
  }
  const dimensions =
    detectedMimeType === "image/png"
      ? inspectPngDimensions(asset)
      : inspectJpegDimensions(asset);
  assertAssetDimensions(asset.id, dimensions);
  if (asset.width !== dimensions.width || asset.height !== dimensions.height) {
    throw new GlyphkilnError(
      `Asset "${asset.id}" dimensions do not match its raster content.`,
      "ASSET_DIMENSION_MISMATCH",
      {
        assetId: asset.id,
        expected: { width: asset.width, height: asset.height },
        actual: dimensions,
      },
    );
  }
  assertRasterDecodes(asset);
  const actualHash = sha256(asset.bytes);
  if (actualHash !== asset.sha256) {
    throw new GlyphkilnError(
      `Asset "${asset.id}" bytes do not match its declared SHA-256.`,
      "ASSET_HASH_MISMATCH",
      { assetId: asset.id, expected: asset.sha256, actual: actualHash },
    );
  }
  return { ...asset, bytes: new Uint8Array(asset.bytes) };
}

function assertRasterDecodes(asset: ResolvedAsset): void {
  try {
    const decoded =
      asset.mimeType === "image/png"
        ? PNG.sync.read(Buffer.from(asset.bytes), { checkCRC: true })
        : decodeJpeg(asset.bytes, {
            useTArray: true,
            formatAsRGBA: false,
            maxResolutionInMP: Math.ceil(
              RENDER_RESOURCE_LIMITS.maxAssetPixels / 1_000_000,
            ),
            maxMemoryUsageInMB: 256,
          });
    if (decoded.width !== asset.width || decoded.height !== asset.height) {
      throw new Error("Decoded dimensions disagree with raster metadata.");
    }
  } catch {
    throw new GlyphkilnError(
      `Asset "${asset.id}" could not be fully decoded as ${asset.mimeType}.`,
      "ASSET_DECODE_FAILED",
      { assetId: asset.id, mimeType: asset.mimeType },
    );
  }
}

function detectImageMimeType(bytes: Uint8Array): ResolvedAsset["mimeType"] | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  return undefined;
}

function inspectPngDimensions(asset: ResolvedAsset): {
  width: number;
  height: number;
} {
  const bytes = asset.bytes;
  let offset = 8;
  let dimensions: { width: number; height: number } | undefined;
  let chunkIndex = 0;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) throwMalformedRaster(asset);
    const dataLength = readUint32(bytes, offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > bytes.byteLength) throwMalformedRaster(asset);
    const chunkType = ascii(bytes, offset + 4, 4);
    if (chunkIndex === 0 && (chunkType !== "IHDR" || dataLength !== 13)) {
      throwMalformedRaster(asset);
    }
    if (chunkType === "IHDR") {
      if (dimensions !== undefined || dataLength !== 13) throwMalformedRaster(asset);
      dimensions = {
        width: readUint32(bytes, offset + 8),
        height: readUint32(bytes, offset + 12),
      };
    }
    if (chunkType === "IEND") {
      if (
        dataLength !== 0 ||
        chunkEnd !== bytes.byteLength ||
        dimensions === undefined
      ) {
        throwMalformedRaster(asset);
      }
      return dimensions;
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  throwMalformedRaster(asset);
}

function inspectJpegDimensions(asset: ResolvedAsset): {
  width: number;
  height: number;
} {
  const bytes = asset.bytes;
  if (
    bytes.byteLength < 4 ||
    bytes[bytes.byteLength - 2] !== 0xff ||
    bytes[bytes.byteLength - 1] !== 0xd9
  ) {
    throwMalformedRaster(asset);
  }
  let offset = 2;
  let dimensions: { width: number; height: number } | undefined;
  while (offset < bytes.byteLength - 2) {
    if (bytes[offset] !== 0xff) throwMalformedRaster(asset);
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0x00) throwMalformedRaster(asset);
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.byteLength) throwMalformedRaster(asset);
    const segmentLength = readUint16(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      throwMalformedRaster(asset);
    }
    if (isStartOfFrame(marker)) {
      if (segmentLength < 7) throwMalformedRaster(asset);
      dimensions = {
        width: readUint16(bytes, offset + 5),
        height: readUint16(bytes, offset + 3),
      };
    }
    if (marker === 0xda) {
      if (dimensions === undefined) throwMalformedRaster(asset);
      return dimensions;
    }
    offset += segmentLength;
  }
  if (dimensions === undefined) throwMalformedRaster(asset);
  return dimensions;
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

function assertAssetDeclarationCount(
  declarations: readonly AssetDeclaration[],
  resolvedCount: number,
): void {
  if (declarations.length > RENDER_RESOURCE_LIMITS.maxAssets) {
    throw new GlyphkilnError(
      `At most ${RENDER_RESOURCE_LIMITS.maxAssets} assets are accepted.`,
      "ASSET_COUNT_LIMIT_EXCEEDED",
      {
        maximum: RENDER_RESOURCE_LIMITS.maxAssets,
        declarations: declarations.length,
        resolved: resolvedCount,
      },
    );
  }
}

function addAssetPixels(totalPixels: number, asset: ResolvedAsset): number {
  const nextTotal = totalPixels + asset.width * asset.height;
  if (nextTotal > RENDER_RESOURCE_LIMITS.maxTotalAssetPixels) {
    throw new GlyphkilnError(
      "Resolved assets exceed the total decoded-pixel limit.",
      "TOTAL_ASSET_PIXELS_LIMIT_EXCEEDED",
      {
        maximum: RENDER_RESOURCE_LIMITS.maxTotalAssetPixels,
        actual: nextTotal,
      },
    );
  }
  return nextTotal;
}

function assertAssetDimensions(
  assetId: string,
  dimensions: { width: number; height: number },
): void {
  if (
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > RENDER_RESOURCE_LIMITS.maxAssetDimension ||
    dimensions.height > RENDER_RESOURCE_LIMITS.maxAssetDimension
  ) {
    throw new GlyphkilnError(
      `Asset "${assetId}" exceeds the decoded-dimension limit.`,
      "ASSET_DIMENSION_LIMIT_EXCEEDED",
      {
        assetId,
        maximum: RENDER_RESOURCE_LIMITS.maxAssetDimension,
        actual: dimensions,
      },
    );
  }
  const pixels = dimensions.width * dimensions.height;
  if (pixels > RENDER_RESOURCE_LIMITS.maxAssetPixels) {
    throw new GlyphkilnError(
      `Asset "${assetId}" exceeds the decoded-pixel limit.`,
      "ASSET_PIXELS_LIMIT_EXCEEDED",
      {
        assetId,
        maximum: RENDER_RESOURCE_LIMITS.maxAssetPixels,
        actual: pixels,
      },
    );
  }
}

function originsEqual(
  left: ResolvedAsset["origin"],
  right: AssetDeclaration["origin"],
): boolean {
  const keys = [
    "kind",
    "sourceName",
    "sourceReference",
    "generativeImageModel",
  ] as const;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    keys.every((key) => left[key] === right[key])
  );
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function throwMalformedRaster(asset: ResolvedAsset): never {
  throw new GlyphkilnError(
    `Asset "${asset.id}" is not a structurally valid ${asset.mimeType} raster.`,
    "MALFORMED_RASTER_ASSET",
    { assetId: asset.id, mimeType: asset.mimeType },
  );
}
