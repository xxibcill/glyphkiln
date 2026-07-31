import { RENDER_RESOURCE_LIMITS, sha256 } from "@glyphkiln/core";
import { describe, expect, it } from "vitest";

import { inspectRasterEnvelope, validateRasterBytes } from "./raster-validation";

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    "base64",
  ),
);

const JPEG = Uint8Array.from(
  Buffer.from(
    [
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsN",
      "DhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRQBAwQEBQQFCQUFCRQNCw0UFBQUFBQUFBQUFBQUFBQU",
      "FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFP/AABEIAAEAAQMBEQACEQEDEQH/xAGiAAAB",
      "BQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQci",
      "cRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVm",
      "Z2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV",
      "1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIE",
      "BAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYn",
      "KCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqi",
      "o6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEA",
      "AhEDEQA/APnSvww/1TP/2Q==",
    ].join(""),
    "base64",
  ),
);

const ORIGIN = { kind: "user-upload" } as const;

function pngEnvelope(width: number, height: number): Uint8Array {
  const bytes = PNG.slice();
  writeUint32(bytes, 16, width);
  writeUint32(bytes, 20, height);
  return bytes;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

describe("raster envelope inspection", () => {
  it("reads dimensions from valid PNG and JPEG envelopes", () => {
    expect(inspectRasterEnvelope(PNG, "image/png")).toEqual({
      width: 1,
      height: 1,
    });
    expect(inspectRasterEnvelope(JPEG, "image/jpeg")).toEqual({
      width: 1,
      height: 1,
    });
  });

  it.each([
    [
      "an empty PNG",
      new Uint8Array(),
      "image/png",
      "Raster signature does not match image/png.",
    ],
    [
      "JPEG bytes declared as PNG",
      JPEG,
      "image/png",
      "Raster signature does not match image/png.",
    ],
    [
      "an empty JPEG",
      new Uint8Array(),
      "image/jpeg",
      "Raster signature does not match image/jpeg.",
    ],
    [
      "PNG bytes declared as JPEG",
      PNG,
      "image/jpeg",
      "Raster signature does not match image/jpeg.",
    ],
  ] as const)(
    "rejects a mismatched signature for %s",
    (_label, bytes, mediaType, message) => {
      expect(() => inspectRasterEnvelope(bytes, mediaType)).toThrow(
        expect.objectContaining({
          code: "RESOURCE_BYTES_INVALID",
          message,
        }),
      );
    },
  );

  it.each([
    ["a truncated header", PNG.slice(0, 32)],
    [
      "a non-IHDR first chunk",
      (() => {
        const bytes = PNG.slice();
        bytes.set(Buffer.from("IDAT"), 12);
        return bytes;
      })(),
    ],
    [
      "an invalid IHDR length",
      (() => {
        const bytes = PNG.slice();
        writeUint32(bytes, 8, 12);
        return bytes;
      })(),
    ],
  ])("rejects a PNG with %s", (_label, bytes) => {
    expect(() => inspectRasterEnvelope(bytes, "image/png")).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message: "The PNG header is incomplete or malformed.",
      }),
    );
  });

  it("rejects a raster before parsing when its encoded bytes exceed the limit", () => {
    const bytes = new Uint8Array(RENDER_RESOURCE_LIMITS.maxAssetBytes + 1);
    bytes.set(PNG.subarray(0, 24));

    expect(() => inspectRasterEnvelope(bytes, "image/png")).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        details: {
          maximum: RENDER_RESOURCE_LIMITS.maxAssetBytes,
          actual: bytes.byteLength,
        },
      }),
    );
  });

  it.each([
    ["zero width", 0, 1],
    ["zero height", 1, 0],
    ["excessive width", RENDER_RESOURCE_LIMITS.maxAssetDimension + 1, 1],
    ["excessive height", 1, RENDER_RESOURCE_LIMITS.maxAssetDimension + 1],
  ])("rejects decoded dimensions with %s", (_label, width, height) => {
    expect(() =>
      inspectRasterEnvelope(pngEnvelope(width, height), "image/png"),
    ).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message: "The raster exceeds the decoded-dimension limit.",
        details: {
          maximum: RENDER_RESOURCE_LIMITS.maxAssetDimension,
          actual: { width, height },
        },
      }),
    );
  });

  it("rejects a legal-dimension raster whose decoded pixel count is excessive", () => {
    const width = RENDER_RESOURCE_LIMITS.maxAssetDimension;
    const height = Math.floor(RENDER_RESOURCE_LIMITS.maxAssetPixels / width) + 1;

    expect(() =>
      inspectRasterEnvelope(pngEnvelope(width, height), "image/png"),
    ).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message: "The raster exceeds the decoded-pixel limit.",
        details: {
          maximum: RENDER_RESOURCE_LIMITS.maxAssetPixels,
          actual: width * height,
        },
      }),
    );
  });

  it("walks JPEG fill, standalone, and non-frame markers to a valid frame", () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xff, 0xd0, 0xff, 0xc4, 0x00, 0x02, 0xff, 0xc0, 0x00, 0x0b,
      0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00,
    ]);

    expect(inspectRasterEnvelope(jpeg, "image/jpeg")).toEqual({
      width: 3,
      height: 2,
    });
  });

  it.each([
    [
      "non-marker data",
      Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0x00]),
      "The JPEG marker structure is malformed.",
    ],
    [
      "a truncated segment length",
      Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]),
      "The JPEG header has no valid frame dimensions.",
    ],
    [
      "a segment shorter than its length field",
      Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x08, 0x00]),
      "The JPEG header has no valid frame dimensions.",
    ],
    [
      "an invalid zero-length segment",
      Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]),
      "The JPEG header has no valid frame dimensions.",
    ],
    [
      "a truncated start-of-frame segment",
      Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x06, 0x08, 0x00, 0x01, 0x00]),
      "The JPEG header has no valid frame dimensions.",
    ],
    [
      "an early end-of-image marker",
      Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      "The JPEG header has no valid frame dimensions.",
    ],
  ])("rejects JPEG marker structure containing %s", (_label, bytes, message) => {
    expect(() => inspectRasterEnvelope(bytes, "image/jpeg")).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message,
      }),
    );
  });
});

describe("complete raster validation", () => {
  it.each([
    ["PNG", PNG, "image/png"],
    ["JPEG", JPEG, "image/jpeg"],
  ] as const)(
    "accepts a fully decodable %s with pinned identity",
    (_label, bytes, mediaType) => {
      expect(() => {
        validateRasterBytes({
          bytes,
          contentHash: sha256(bytes),
          mediaType,
          origin: ORIGIN,
          width: 1,
          height: 1,
        });
      }).not.toThrow();
    },
  );

  it("reports the Core validation code for corrupt compressed pixels", () => {
    const bytes = PNG.slice();
    bytes[45] = bytes[45] ^ 0xff;

    expect(() => {
      validateRasterBytes({
        bytes,
        contentHash: sha256(bytes),
        mediaType: "image/png",
        origin: ORIGIN,
        width: 1,
        height: 1,
      });
    }).toThrow(
      expect.objectContaining({
        code: "RESOURCE_BYTES_INVALID",
        message: "The raster did not pass complete structural and decode validation.",
        details: { validationCode: "ASSET_DECODE_FAILED" },
      }),
    );
  });

  it.each([
    ["hash", { contentHash: "0".repeat(64) }, "ASSET_HASH_MISMATCH"],
    ["width", { width: 2 }, "ASSET_DIMENSION_MISMATCH"],
    ["media type", { mediaType: "image/jpeg" as const }, "ASSET_MIME_MISMATCH"],
  ])(
    "preserves the Core validation code for a mismatched %s",
    (_label, overrides, code) => {
      expect(() => {
        validateRasterBytes({
          bytes: PNG,
          contentHash: sha256(PNG),
          mediaType: "image/png",
          origin: ORIGIN,
          width: 1,
          height: 1,
          ...overrides,
        });
      }).toThrow(
        expect.objectContaining({
          code: "RESOURCE_BYTES_INVALID",
          details: { validationCode: code },
        }),
      );
    },
  );
});
