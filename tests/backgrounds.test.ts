import { describe, expect, it } from "vitest";

import {
  PROCEDURAL_ALGORITHM_VERSIONS,
  PROCEDURAL_STYLE_IDS,
  createProceduralBackground,
  hashCanonical,
} from "../src/index.js";

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

  it.each(PROCEDURAL_STYLE_IDS)("%s adds the exact quiet-region overlay", (style) => {
    const result = createProceduralBackground(style, input);
    expect(result.elements.at(-1)).toMatchObject({
      id: "procedural-quiet-region",
      type: "rect",
      x: 60,
      y: 80,
      width: 300,
      height: 160,
      fill: "#FFFFFF",
    });
  });

  it("changes when the seed changes", () => {
    const first = createProceduralBackground("flow-field", input);
    const second = createProceduralBackground("flow-field", {
      ...input,
      seed: "different",
    });
    expect(hashCanonical(first)).not.toBe(hashCanonical(second));
  });
});
