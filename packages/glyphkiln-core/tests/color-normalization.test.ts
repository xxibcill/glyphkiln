import { deflateSync } from "node:zlib";

import { encode as encodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
  COLOR_NORMALIZATION_IMPLEMENTATION,
  COLOR_NORMALIZATION_LIMITS,
  COLOR_NORMALIZATION_POLICY_VERSION,
  normalizeRasterColor,
  sha256,
} from "../src/index.js";
import { normalizeRasterColorInProcess } from "../src/assets/color-normalization-engine.js";

const DISPLAY_P3_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAABP2lDQ1BpY2MAABiVfZC/SwJxGMY/l5V1WBA5Fhyh0FAQOdRSgRcFQRFqoDadp2agctz3wuZqqiVqibamGiJoaGjSsTEIHCv8AxoKaujHxVcHLahneT88PC/vywPKY94siHYNCkXHjsyHtXgiqXlrePDTTS+DhimsxehcDEAYJWE6dp4feq2iyHk3mjOK6a3amb23O/MWnL4+eApUL/hfajojTOADCJiW7YCiAUMlx5I8C/jNnJEGJQ6M2PFEEpQd6a81+EhyqsHnku1YRAelAmhrLZxq4UJ+Q96Vkt/7MsWVKNAFDCBYJoT+R6azntHRGQPZ1+8eRDY03tjyhaHj3nVfguA9hM99130/cd2vJfAcQ8Xf3N9+gKmypKa3UIbLCVCvmt7wJPSpcLNpGbZRtzxAW3Ydnk+hJwH9t6CufgN5X15BavQKkAAAAAlwSFlzAAAD6AAAA+gBtXtSawAAABFJREFUCJljeGWs9L/0t89/ABThBPrL4COZAAAAAElFTkSuQmCC",
  "base64",
);

const ORIENTATION_PIXELS = {
  A: [255, 0, 0, 255],
  B: [0, 255, 0, 255],
  C: [0, 0, 255, 255],
  D: [255, 255, 0, 255],
  E: [255, 0, 255, 255],
  F: [0, 255, 255, 255],
} as const;

describe("canonical sRGB color normalization", () => {
  it("re-encodes implicit-sRGB RGBA pixels deterministically without metadata", async () => {
    const source = createPng([255, 0, 0, 255, 0, 128, 255, 128], 2, 1);
    const original = source.slice();
    const first = await normalizeRasterColorInProcess({
      bytes: source,
      mimeType: "image/png",
    });
    const second = await normalizeRasterColorInProcess({
      bytes: source,
      mimeType: "image/png",
    });

    expect(source).toEqual(original);
    expect(first).toEqual(second);
    expect(first.report).toEqual({
      policyVersion: COLOR_NORMALIZATION_POLICY_VERSION,
      implementation: COLOR_NORMALIZATION_IMPLEMENTATION,
      source: {
        mimeType: "image/png",
        byteLength: 74,
        sha256: sha256(source),
        width: 2,
        height: 1,
        colorSpace: "srgb",
        profile: { kind: "implicit-srgb" },
        orientation: 1,
      },
      output: {
        mimeType: "image/png",
        byteLength: 74,
        sha256: "0ca86b21917f11884e6e6789f6c8c8c554fa29b7d8888beb6932ca7681cc0307",
        width: 2,
        height: 1,
        colorSpace: "srgb",
        hasAlpha: true,
      },
      changes: {
        colorConversion: "assumed-or-declared-srgb",
        orientationApplied: false,
        metadataStripped: true,
        reencoded: true,
      },
    });
    expect([...PNG.sync.read(Buffer.from(first.bytes)).data]).toEqual([
      255, 0, 0, 255, 0, 128, 255, 128,
    ]);
    expect(pngChunkTypes(first.bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("converts an embedded Display P3 profile and strips it from canonical output", async () => {
    const result = await normalizeRasterColorInProcess({
      bytes: DISPLAY_P3_PNG,
      mimeType: "image/png",
    });

    expect(result.report.source.profile).toEqual({
      kind: "embedded-icc",
      byteLength: 480,
      sha256: "231752984cd4a5278e1b8d2390fe496767d4511fc81f54e1a5c69ae9ab4c42b5",
    });
    expect(result.report.changes.colorConversion).toBe("embedded-profile-to-srgb");
    expect(result.report.output.sha256).toBe(
      "7db360a138d2c2e06809a6e84f1397dd110e19c68be37fef69b972947058e6f5",
    );
    expect([...PNG.sync.read(Buffer.from(result.bytes)).data]).toEqual([
      255, 0, 0, 255, 3, 255, 0, 255,
    ]);
    expect(pngChunkTypes(result.bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("recognizes a declared sRGB PNG and strips the declaration from output", async () => {
    const source = insertPngChunk(
      createPng([20, 40, 60, 255], 1, 1),
      "sRGB",
      Uint8Array.of(0),
    );

    const result = await normalizeRasterColorInProcess({
      bytes: source,
      mimeType: "image/png",
    });

    expect(result.report.source.profile).toEqual({ kind: "declared-srgb" });
    expect(result.report.changes.colorConversion).toBe("assumed-or-declared-srgb");
    expect([...PNG.sync.read(Buffer.from(result.bytes)).data]).toEqual([
      20, 40, 60, 255,
    ]);
    expect(pngChunkTypes(result.bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it.each([
    [1, 3, 2, ["A", "B", "C", "D", "E", "F"]],
    [2, 3, 2, ["C", "B", "A", "F", "E", "D"]],
    [3, 3, 2, ["F", "E", "D", "C", "B", "A"]],
    [4, 3, 2, ["D", "E", "F", "A", "B", "C"]],
    [5, 2, 3, ["A", "D", "B", "E", "C", "F"]],
    [6, 2, 3, ["D", "A", "E", "B", "F", "C"]],
    [7, 2, 3, ["F", "C", "E", "B", "D", "A"]],
    [8, 2, 3, ["C", "F", "B", "E", "A", "D"]],
  ] as const)(
    "applies EXIF orientation %i to exact PNG pixels",
    async (orientation, width, height, expectedPixels) => {
      const source = insertPngChunk(
        createPng(orientationPixels(["A", "B", "C", "D", "E", "F"]), 3, 2),
        "eXIf",
        createExif(orientation),
      );

      const result = await normalizeRasterColorInProcess({
        bytes: source,
        mimeType: "image/png",
      });

      expect(result.report.source.orientation).toBe(orientation);
      expect(result.report.output).toMatchObject({ width, height });
      expect(result.report.changes.orientationApplied).toBe(orientation !== 1);
      expect([...PNG.sync.read(Buffer.from(result.bytes)).data]).toEqual(
        orientationPixels(expectedPixels),
      );
    },
  );

  it("applies EXIF orientation before reporting canonical dimensions", async () => {
    const jpeg = encodeJpeg(
      {
        width: 2,
        height: 1,
        data: Uint8Array.of(255, 0, 0, 255, 0, 0, 255, 255),
      },
      100,
    ).data;
    const source = insertJpegApp(
      jpeg,
      0xe1,
      concatenate([Buffer.from("Exif\0\0", "latin1"), createExif(6)]),
    );

    const result = await normalizeRasterColorInProcess({
      bytes: source,
      mimeType: "image/jpeg",
    });

    expect(result.report.source).toMatchObject({
      mimeType: "image/jpeg",
      width: 2,
      height: 1,
      orientation: 6,
    });
    expect(result.report.output).toMatchObject({ width: 1, height: 2 });
    expect(result.report.changes.orientationApplied).toBe(true);
    expect([...PNG.sync.read(Buffer.from(result.bytes)).data]).toEqual([
      254, 0, 0, 255, 0, 0, 254, 255,
    ]);
  });

  it("rejects decompression bombs before profile conversion", async () => {
    const source = createPng([0, 0, 0, 255], 1, 1);
    const oversizedProfile = new Uint8Array(
      COLOR_NORMALIZATION_LIMITS.maxColorProfileBytes + 1,
    );
    const iccp = Buffer.concat([
      Buffer.from("profile\0\0", "latin1"),
      deflateSync(oversizedProfile),
    ]);
    const crafted = insertPngChunk(source, "iCCP", iccp);

    await expect(
      normalizeRasterColorInProcess({ bytes: crafted, mimeType: "image/png" }),
    ).rejects.toMatchObject({
      code: "COLOR_PROFILE_LIMIT_EXCEEDED",
      details: {
        maximum: COLOR_NORMALIZATION_LIMITS.maxColorProfileBytes,
        actual: COLOR_NORMALIZATION_LIMITS.maxColorProfileBytes + 1,
      },
    });
  });

  it("rejects a high-entropy raster whose canonical PNG exceeds the output limit", async () => {
    const width = 2_500;
    const height = 2_500;
    const jpeg = encodeJpeg(
      { width, height, data: createDeterministicNoise(width, height) },
      70,
    ).data;
    expect(jpeg.byteLength).toBeLessThanOrEqual(
      COLOR_NORMALIZATION_LIMITS.maxInputBytes,
    );

    await expect(
      normalizeRasterColorInProcess({ bytes: jpeg, mimeType: "image/jpeg" }),
    ).rejects.toMatchObject({
      code: "COLOR_NORMALIZATION_OUTPUT_LIMIT_EXCEEDED",
      details: {
        maximum: COLOR_NORMALIZATION_LIMITS.maxOutputBytes,
      },
    });
  }, 60_000);

  it("rejects conflicting PNG color-profile declarations", async () => {
    const source = createPng([0, 0, 0, 255], 1, 1);
    const withSrgb = insertPngChunk(source, "sRGB", Uint8Array.of(0));
    const crafted = insertPngChunk(
      withSrgb,
      "iCCP",
      Buffer.concat([Buffer.from("profile\0\0", "latin1"), deflateSync("x")]),
    );

    await expect(
      normalizeRasterColorInProcess({ bytes: crafted, mimeType: "image/png" }),
    ).rejects.toMatchObject({ code: "COLOR_PROFILE_INVALID" });
  });

  it("rejects an out-of-range PNG sRGB rendering intent", async () => {
    const source = createPng([0, 0, 0, 255], 1, 1);
    const crafted = insertPngChunk(source, "sRGB", Uint8Array.of(255));

    await expect(
      normalizeRasterColorInProcess({ bytes: crafted, mimeType: "image/png" }),
    ).rejects.toMatchObject({ code: "COLOR_PROFILE_INVALID" });
  });

  it("rejects incomplete JPEG ICC chunk sequences", async () => {
    const jpeg = encodeJpeg(
      { width: 1, height: 1, data: Uint8Array.of(20, 40, 60, 255) },
      90,
    ).data;
    const app2Data = concatenate([
      Buffer.from("ICC_PROFILE\0", "latin1"),
      Uint8Array.of(1, 2),
      Uint8Array.of(1, 2, 3),
    ]);
    const crafted = insertJpegApp(jpeg, 0xe2, app2Data);

    await expect(
      normalizeRasterColorInProcess({ bytes: crafted, mimeType: "image/jpeg" }),
    ).rejects.toMatchObject({ code: "COLOR_PROFILE_INVALID" });
  });

  it.each([
    ["a second complete image", (jpeg: Uint8Array) => concatenate([jpeg, jpeg])],
    [
      "trailing bytes",
      (jpeg: Uint8Array) => concatenate([jpeg, Uint8Array.of(1, 2, 3)]),
    ],
  ])("rejects JPEG input containing %s", async (_description, appendData) => {
    const jpeg = encodeJpeg(
      { width: 1, height: 1, data: Uint8Array.of(20, 40, 60, 255) },
      90,
    ).data;

    await expect(
      normalizeRasterColorInProcess({
        bytes: appendData(jpeg),
        mimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "COLOR_NORMALIZATION_RASTER_INVALID" });
  });

  it("rejects CMYK sample data until raw CMYK decoding is available", async () => {
    const jpeg = encodeJpeg(
      { width: 1, height: 1, data: Uint8Array.of(20, 40, 60, 255) },
      90,
    ).data;
    const crafted = mutateJpegComponentCount(jpeg, 4);

    await expect(
      normalizeRasterColorInProcess({ bytes: crafted, mimeType: "image/jpeg" }),
    ).rejects.toMatchObject({
      code: "COLOR_PROFILE_COLOR_SPACE_UNSUPPORTED",
      details: { colorSpace: "cmyk" },
    });
  });

  it("rejects accessors, extra authority fields, and MIME mismatches", () => {
    const source = createPng([0, 0, 0, 255], 1, 1);
    const accessorInput = { mimeType: "image/png" } as Record<string, unknown>;
    Object.defineProperty(accessorInput, "bytes", {
      enumerable: true,
      get: () => source,
    });

    expect(() => normalizeRasterColor(accessorInput)).toThrow(
      expect.objectContaining({ code: "INVALID_COLOR_NORMALIZATION_INPUT" }),
    );
    expect(() =>
      normalizeRasterColor({
        bytes: source,
        mimeType: "image/png",
        sourcePath: "/untrusted/path",
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_COLOR_NORMALIZATION_INPUT" }));
    expect(() =>
      normalizeRasterColor({ bytes: source, mimeType: "image/jpeg" }),
    ).toThrow(expect.objectContaining({ code: "COLOR_NORMALIZATION_MIME_MISMATCH" }));
  });
});

function createPng(data: number[], width: number, height: number): Uint8Array {
  const png = new PNG({ width, height });
  png.data = Buffer.from(data);
  return new Uint8Array(PNG.sync.write(png));
}

function orientationPixels(
  labels: readonly (keyof typeof ORIENTATION_PIXELS)[],
): number[] {
  return labels.flatMap((label) => ORIENTATION_PIXELS[label]);
}

function createDeterministicNoise(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  let state = 0x6d2b79f5;
  for (let offset = 0; offset < data.byteLength; offset += 4) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    data[offset] = state & 0xff;
    data[offset + 1] = (state >>> 8) & 0xff;
    data[offset + 2] = (state >>> 16) & 0xff;
    data[offset + 3] = 255;
  }
  return data;
}

function createExif(orientation: number): Uint8Array {
  const tiff = new Uint8Array(26);
  tiff.set(Buffer.from("II", "ascii"), 0);
  writeUint16Le(tiff, 2, 42);
  writeUint32Le(tiff, 4, 8);
  writeUint16Le(tiff, 8, 1);
  writeUint16Le(tiff, 10, 0x0112);
  writeUint16Le(tiff, 12, 3);
  writeUint32Le(tiff, 14, 1);
  writeUint16Le(tiff, 18, orientation);
  writeUint32Le(tiff, 22, 0);
  return tiff;
}

function pngChunkTypes(bytes: Uint8Array): string[] {
  const types: string[] = [];
  let offset = 8;
  while (offset < bytes.byteLength) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    types.push(type);
    offset += 12 + length;
  }
  return types;
}

function insertPngChunk(bytes: Uint8Array, type: string, data: Uint8Array): Uint8Array {
  const firstChunkEnd = 8 + 12 + readUint32(bytes, 8);
  const chunk = new Uint8Array(12 + data.byteLength);
  writeUint32(chunk, 0, data.byteLength);
  chunk.set(Buffer.from(type, "ascii"), 4);
  chunk.set(data, 8);
  return concatenate([
    bytes.subarray(0, firstChunkEnd),
    chunk,
    bytes.subarray(firstChunkEnd),
  ]);
}

function insertJpegApp(
  bytes: Uint8Array,
  marker: number,
  data: Uint8Array,
): Uint8Array {
  const segment = new Uint8Array(4 + data.byteLength);
  segment[0] = 0xff;
  segment[1] = marker;
  writeUint16(segment, 2, data.byteLength + 2);
  segment.set(data, 4);
  return concatenate([bytes.subarray(0, 2), segment, bytes.subarray(2)]);
}

function mutateJpegComponentCount(bytes: Uint8Array, count: number): Uint8Array {
  const output = bytes.slice();
  let offset = 2;
  while (offset + 4 <= output.byteLength) {
    if (output[offset] !== 0xff) throw new Error("invalid test JPEG");
    const marker = output[offset + 1]!;
    const length = readUint16(output, offset + 2);
    if (marker === 0xc0) {
      output[offset + 9] = count;
      return output;
    }
    offset += length + 2;
  }
  throw new Error("test JPEG has no baseline frame");
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

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 0x100 + bytes[offset + 1]!;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 +
    bytes[offset + 3]!
  );
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeUint16Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
