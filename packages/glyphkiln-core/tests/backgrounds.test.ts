import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";

import {
  PROCEDURAL_ALGORITHM_VERSIONS,
  PROCEDURAL_STYLE_IDS,
  createProceduralBackground,
  hashCanonical,
} from "../src/index.js";
import { renderSceneToSvg } from "../src/renderer/index.js";

const input = {
  width: 600,
  height: 400,
  seed: "background-test",
  palette: ["#112233", "#445566", "#778899"],
  backgroundColor: "#FFFFFF",
  intensity: 0.5,
  density: 0.4,
  complexity: 0.6,
  contrast: 0.5,
  quietRegion: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  mode: "light" as const,
};

describe("procedural backgrounds", () => {
  it.each(PROCEDURAL_STYLE_IDS)(
    "renders %s deterministically with a version",
    (style) => {
      const first = createProceduralBackground(style, input);
      const second = createProceduralBackground(style, input);
      expect(hashCanonical(first)).toBe(hashCanonical(second));
      expect(first.version).toBe(PROCEDURAL_ALGORITHM_VERSIONS[style]);
      expect(first.elements.length).toBeGreaterThan(1);
    },
  );

  it.each(PROCEDURAL_STYLE_IDS)(
    "%s keeps numeric geometry within the canvas",
    (style) => {
      const result = createProceduralBackground(style, input);
      for (const element of result.elements) {
        if (element.type === "rect") {
          expect(element.x).toBeGreaterThanOrEqual(0);
          expect(element.y).toBeGreaterThanOrEqual(0);
          expect(element.x + element.width).toBeLessThanOrEqual(input.width);
          expect(element.y + element.height).toBeLessThanOrEqual(input.height);
        } else if (element.type === "path") {
          const values = [...element.data.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) =>
            Number(match[0]),
          );
          for (const [index, value] of values.entries()) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(
              index % 2 === 0 ? input.width : input.height,
            );
          }
        }
      }
    },
  );

  it.each(PROCEDURAL_STYLE_IDS)(
    "%s excludes the exact quiet region natively",
    (style) => {
      const result = createProceduralBackground(style, input);
      expect(result.elements).not.toHaveLength(0);
      for (const element of result.elements) {
        expect(element.exclusion).toEqual({
          canvas: { width: 600, height: 400 },
          bounds: { x: 60, y: 80, width: 300, height: 160 },
        });
        expect(element.id).not.toBe("procedural-quiet-region");
      }
    },
  );

  it("changes when the seed changes", () => {
    const first = createProceduralBackground("flow-field", input);
    const second = createProceduralBackground("flow-field", {
      ...input,
      seed: "different",
    });
    expect(hashCanonical(first)).not.toBe(hashCanonical(second));
  });

  it.each(PROCEDURAL_STYLE_IDS)(
    "%s paints zero procedural pixels inside the quiet region",
    (style) => {
      const result = createProceduralBackground(style, input);
      const svg = renderSceneToSvg({
        dimensions: { width: input.width, height: input.height },
        title: "Quiet-region density test",
        description: "Procedural geometry only.",
        backgroundColor: "#FFFFFF",
        elements: result.elements,
      });
      const raster = PNG.sync.read(
        new Resvg(svg, {
          font: { loadSystemFonts: false },
        })
          .render()
          .asPng(),
      );
      let insidePainted = 0;
      let outsidePainted = 0;
      for (let y = 0; y < raster.height; y += 1) {
        for (let x = 0; x < raster.width; x += 1) {
          const offset = (y * raster.width + x) * 4;
          const painted =
            raster.data[offset] !== 255 ||
            raster.data[offset + 1] !== 255 ||
            raster.data[offset + 2] !== 255;
          if (!painted) continue;
          if (x >= 60 && x < 360 && y >= 80 && y < 240) {
            insidePainted += 1;
          } else {
            outsidePainted += 1;
          }
        }
      }
      expect(insidePainted).toBe(0);
      expect(outsidePainted).toBeGreaterThan(0);
    },
  );
});
