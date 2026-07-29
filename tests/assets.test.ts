import { describe, expect, it } from "vitest";

import { AssetRegistry, sha256, type ResolvedAsset } from "../src/index.js";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

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
