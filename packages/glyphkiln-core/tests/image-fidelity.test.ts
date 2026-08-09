import { PNG } from "pngjs";
import { encode as encodeJpeg } from "jpeg-js";
import { describe, expect, it } from "vitest";

import {
  FOCAL_CROP_POLICY_VERSION,
  GlyphkilnError,
  calculateFocalCrop,
  sha256,
  type ResolvedAsset,
} from "../src/index.js";
import {
  decodeRasterForContrast,
  inspectImageTextContrast,
} from "../src/assets/image-contrast.js";

describe("focal crop geometry", () => {
  it("centers and clamps a landscape source inside a square destination", () => {
    const centered = calculateFocalCrop({
      source: { width: 1_536, height: 1_024 },
      destination: { x: 10, y: 20, width: 1_080, height: 1_080 },
      focalPoint: { x: 0.5, y: 0.5 },
    });
    expect(centered).toMatchObject({
      policyVersion: FOCAL_CROP_POLICY_VERSION,
      sourceBounds: { x: 256, y: 0, width: 1_024, height: 1_024 },
      destinationBounds: { x: 10, y: 20, width: 1_080, height: 1_080 },
      renderedBounds: { x: -260, y: 20, width: 1_620, height: 1_080 },
    });

    expect(
      calculateFocalCrop({
        source: { width: 1_536, height: 1_024 },
        destination: { x: 0, y: 0, width: 1_080, height: 1_080 },
        focalPoint: { x: 0, y: 0.5 },
      }).sourceBounds.x,
    ).toBe(0);
    expect(
      calculateFocalCrop({
        source: { width: 1_536, height: 1_024 },
        destination: { x: 0, y: 0, width: 1_080, height: 1_080 },
        focalPoint: { x: 1, y: 0.5 },
      }).sourceBounds.x,
    ).toBe(512);
  });

  it("rejects invalid direct helper input with stable errors", () => {
    expect(() =>
      calculateFocalCrop({
        source: { width: 0, height: 100 },
        destination: { x: 0, y: 0, width: 100, height: 100 },
        focalPoint: { x: 0.5, y: 0.5 },
      }),
    ).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_FOCAL_CROP_GEOMETRY",
      }),
    );
    expect(() =>
      calculateFocalCrop({
        source: { width: 100, height: 100 },
        destination: { x: 0, y: 0, width: 100, height: 100 },
        focalPoint: { x: 1.1, y: 0.5 },
      }),
    ).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_FOCAL_POINT",
      }),
    );
    expect(() =>
      calculateFocalCrop({
        source: { width: 100, height: 100 },
        destination: { x: Number.NaN, y: 0, width: 100, height: 100 },
        focalPoint: { x: 0.5, y: 0.5 },
      }),
    ).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_FOCAL_CROP_GEOMETRY",
      }),
    );
  });
});

describe("composited raster contrast evidence", () => {
  it.each([
    { treatment: "none", expectedBackground: "#6496C8" },
    { treatment: "dark-scrim", expectedBackground: "#2C4258" },
    { treatment: "light-scrim", expectedBackground: "#DDE8F3" },
  ] as const)(
    "pins exact $treatment composition before contrast measurement",
    ({ treatment, expectedBackground }) => {
      const pixel = [100, 150, 200, 255];
      const asset = rgbaAsset([...pixel, ...pixel, ...pixel, ...pixel]);
      const crop = calculateFocalCrop({
        source: { width: 2, height: 2 },
        destination: { x: 0, y: 0, width: 100, height: 100 },
        focalPoint: { x: 0.5, y: 0.5 },
      });
      const evidence = inspectImageTextContrast({
        layerId: "headline",
        raster: decodeRasterForContrast(asset),
        crop,
        textBounds: { x: 0, y: 0, width: 100, height: 100 },
        foreground: "#FFFFFF",
        sceneBackground: "#000000",
        treatment,
      });

      expect(new Set(evidence.samples.map((sample) => sample.background))).toEqual(
        new Set([expectedBackground]),
      );
    },
  );

  it("samples a fixed bounded grid after source alpha and treatment", () => {
    const asset = rgbaAsset([
      255, 255, 255, 255, 255, 0, 0, 128, 0, 0, 0, 255, 0, 0, 255, 0,
    ]);
    const crop = calculateFocalCrop({
      source: { width: 2, height: 2 },
      destination: { x: 0, y: 0, width: 100, height: 100 },
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const first = inspectImageTextContrast({
      layerId: "headline",
      raster: decodeRasterForContrast(asset),
      crop,
      textBounds: { x: 0, y: 0, width: 100, height: 100 },
      foreground: "#FFFFFF",
      sceneBackground: "#000000",
      treatment: "dark-scrim",
    });
    const second = inspectImageTextContrast({
      layerId: "headline",
      raster: decodeRasterForContrast(asset),
      crop,
      textBounds: { x: 0, y: 0, width: 100, height: 100 },
      foreground: "#FFFFFF",
      sceneBackground: "#000000",
      treatment: "dark-scrim",
    });

    expect(first).toEqual(second);
    expect(first.policyVersion).toBe("composited-srgb-grid-5x5-v1");
    expect(first.samples).toHaveLength(25);
    expect(first.samples[0]).toMatchObject({
      canvasPoint: { x: 10, y: 10 },
      sourcePixel: { x: 0, y: 0 },
      background: "#707070",
    });
    expect(first.minimumRatio).toBeGreaterThanOrEqual(4.5);
    expect(first.maximumRatio).toBeGreaterThanOrEqual(first.minimumRatio);
  });

  it("decodes JPEG sources into the same bounded RGBA raster contract", () => {
    const source = Uint8Array.from([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const encoded = encodeJpeg({ width: 2, height: 2, data: source }, 90).data;
    const bytes = new Uint8Array(encoded);
    const raster = decodeRasterForContrast({
      id: "jpeg-sample",
      mimeType: "image/jpeg",
      sha256: sha256(bytes),
      width: 2,
      height: 2,
      origin: { kind: "unknown" },
      bytes,
    });

    expect(raster).toMatchObject({ width: 2, height: 2 });
    expect(raster.data).toHaveLength(16);
    expect([...raster.data].filter((_, index) => index % 4 === 3)).toEqual([
      255, 255, 255, 255,
    ]);
  });

  it("bounds JPEG contrast decoding with a stable renderer error", () => {
    const bytes = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x13, 0x88, 0x20, 0x00, 0x03, 0x01,
      0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
    ]);

    expect(() =>
      decodeRasterForContrast({
        id: "oversized-jpeg",
        mimeType: "image/jpeg",
        sha256: sha256(bytes),
        width: 8_192,
        height: 5_000,
        origin: { kind: "unknown" },
        bytes,
      }),
    ).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "ASSET_CONTRAST_DECODE_FAILED",
        details: {
          assetId: "oversized-jpeg",
          mimeType: "image/jpeg",
        },
      }),
    );
  });
});

function rgbaAsset(data: number[]): ResolvedAsset {
  const png = new PNG({ width: 2, height: 2 });
  png.data = Buffer.from(data);
  const bytes = new Uint8Array(PNG.sync.write(png));
  return {
    id: "sample",
    mimeType: "image/png",
    sha256: sha256(bytes),
    width: 2,
    height: 2,
    origin: { kind: "unknown" },
    bytes,
  };
}
