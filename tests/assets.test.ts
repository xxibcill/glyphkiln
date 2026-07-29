import { describe, expect, it } from "vitest";

import {
  AssetRegistry,
  RENDER_RESOURCE_LIMITS,
  sha256,
  type ResolvedAsset,
} from "../src/index.js";

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2Z9sAAAAASUVORK5CYII=",
    "base64",
  ),
);
const jpeg = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
  0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xff, 0xd9,
]);

function asset(overrides: Partial<ResolvedAsset> = {}): ResolvedAsset {
  return {
    id: "asset-1",
    mimeType: "image/png",
    sha256: sha256(png),
    width: 1,
    height: 1,
    origin: { kind: "user-upload" },
    bytes: png,
    ...overrides,
  };
}

describe("asset resolution", () => {
  it("accepts supplied bytes matching a strict declaration", () => {
    const resolved = asset();
    const registry = new AssetRegistry(
      [
        {
          id: resolved.id,
          mimeType: resolved.mimeType,
          sha256: resolved.sha256,
          width: resolved.width,
          height: resolved.height,
          origin: resolved.origin,
        },
      ],
      [resolved],
    );
    expect(registry.get("asset-1").bytes).toEqual(png);
  });

  it("accepts a bounded JPEG marker structure with matching dimensions", () => {
    const resolved = asset({
      mimeType: "image/jpeg",
      bytes: jpeg,
      sha256: sha256(jpeg),
    });
    const registry = new AssetRegistry(
      [
        {
          id: resolved.id,
          mimeType: resolved.mimeType,
          sha256: resolved.sha256,
          width: resolved.width,
          height: resolved.height,
          origin: resolved.origin,
        },
      ],
      [resolved],
    );
    expect(registry.get("asset-1").bytes).toEqual(jpeg);
  });

  it("rejects a declared MIME type that disagrees with magic bytes", () => {
    expect(() => new AssetRegistry([], [asset({ mimeType: "image/jpeg" })])).toThrow(
      /content is image\/png/,
    );
  });

  it("rejects mismatched hashes", () => {
    expect(() => new AssetRegistry([], [asset({ sha256: "0".repeat(64) })])).toThrow(
      /do not match/,
    );
  });

  it("rejects a malformed raster with only valid magic bytes", () => {
    const malformed = png.slice(0, 9);
    expect(
      () =>
        new AssetRegistry(
          [],
          [
            asset({
              bytes: malformed,
              sha256: sha256(malformed),
            }),
          ],
        ),
    ).toThrow(
      expect.objectContaining({
        code: "MALFORMED_RASTER_ASSET",
      }),
    );
  });

  it("rejects dimensions that disagree with decoded raster metadata", () => {
    expect(() => new AssetRegistry([], [asset({ width: 2 })])).toThrow(
      expect.objectContaining({
        code: "ASSET_DIMENSION_MISMATCH",
      }),
    );
  });

  it("rejects decoded dimensions above the public limit", () => {
    const oversized = png.slice();
    const width = RENDER_RESOURCE_LIMITS.maxAssetDimension + 1;
    oversized[16] = (width >>> 24) & 0xff;
    oversized[17] = (width >>> 16) & 0xff;
    oversized[18] = (width >>> 8) & 0xff;
    oversized[19] = width & 0xff;
    expect(
      () =>
        new AssetRegistry(
          [],
          [
            asset({
              bytes: oversized,
              sha256: sha256(oversized),
              width,
            }),
          ],
        ),
    ).toThrow(
      expect.objectContaining({
        code: "ASSET_DIMENSION_LIMIT_EXCEEDED",
      }),
    );
  });

  it("rejects an asset before hashing when its byte limit is exceeded", () => {
    const oversized = new Uint8Array(RENDER_RESOURCE_LIMITS.maxAssetBytes + 1);
    expect(
      () =>
        new AssetRegistry([], [asset({ bytes: oversized, sha256: "0".repeat(64) })]),
    ).toThrow(
      expect.objectContaining({
        code: "ASSET_BYTES_LIMIT_EXCEEDED",
      }),
    );
  });

  it("rejects unresolved declarations without fetching", () => {
    const resolved = asset();
    expect(
      () =>
        new AssetRegistry(
          [
            {
              id: resolved.id,
              mimeType: resolved.mimeType,
              sha256: resolved.sha256,
              width: resolved.width,
              height: resolved.height,
              origin: resolved.origin,
            },
          ],
          [],
        ),
    ).toThrow(/bytes were not supplied/);
  });
});
