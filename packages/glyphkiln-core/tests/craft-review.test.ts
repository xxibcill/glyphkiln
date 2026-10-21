import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CRAFT_FINDING_CODES,
  CRAFT_REVIEW_DEFAULTS,
  CRAFT_REVIEW_POLICY_VERSION,
  renderGraphic,
  reviewGraphicCraft,
  sha256,
} from "../src/index.js";
import { analyzeCraft, type CraftReview } from "../src/craft/analyze.js";
import { pathDataBounds } from "../src/craft/geometry.js";
import type { CraftElement, CraftModel, CraftRaster } from "../src/craft/model.js";
import { reviewSceneCraft } from "../src/scene/index.js";
import { cloneDocument, loadExample, loadExampleAssets } from "./helpers.js";

type Rgb = readonly [number, number, number];

function raster(width: number, height: number, color: Rgb): CraftRaster {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set([...color, 255], index * 4);
  }
  return { width, height, data };
}

function paint(
  target: CraftRaster,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Rgb,
) {
  for (let row = y; row < y + h; row += 1) {
    for (let column = x; column < x + w; column += 1) {
      target.data.set([...color, 255], (row * target.width + column) * 4);
    }
  }
}

function element(
  partial: Partial<CraftElement> & Pick<CraftElement, "id">,
): CraftElement {
  return {
    kind: "rect",
    decoration: false,
    bounds: null,
    fill: null,
    stroke: null,
    opacity: 1,
    ...partial,
  };
}

function text(
  id: string,
  fontSize: number,
  bounds: CraftElement["bounds"],
): CraftElement {
  return element({
    id,
    kind: "text",
    bounds,
    fill: "#111111",
    text: { fontSize, xHeightRatio: 0.5, lineCount: 1 },
  });
}

function model(
  elements: CraftElement[],
  options: { raster?: CraftRaster; accentColors?: string[] } = {},
): CraftModel {
  return {
    canvas: { width: 1000, height: 1000 },
    raster: options.raster ?? raster(1000, 1000, [255, 255, 255]),
    elements,
    accentColors: options.accentColors ?? [],
  };
}

const codes = (review: CraftReview) => review.findings.map((finding) => finding.code);
const fullWidth = { x: 0, y: 0, width: 1000, height: 1000 };

describe("craft review policy", () => {
  it("publishes a closed, versioned advisory vocabulary", () => {
    expect(CRAFT_REVIEW_POLICY_VERSION).toBe("1.0.0");
    expect(CRAFT_FINDING_CODES).toEqual([
      "CRAFT_TEXT_SMALL_AT_DELIVERY",
      "CRAFT_WEAK_SCALE_CONTRAST",
      "CRAFT_DEAD_SPACE",
      "CRAFT_ACCENT_OVERUSE",
    ]);
    expect(Object.isFrozen(CRAFT_REVIEW_DEFAULTS)).toBe(true);
    const review = analyzeCraft(model([text("tiny", 10, fullWidth)]));
    expect(review.findings.map((finding) => finding.severity)).toEqual(["advisory"]);
  });

  it("rejects unknown or non-positive thresholds", () => {
    expect(() => analyzeCraft(model([]), { displayWidth: 0 })).toThrow(
      expect.objectContaining({ code: "INVALID_CRAFT_REVIEW_OPTIONS" }),
    );
    expect(() =>
      analyzeCraft(model([]), { unknown: 1 } as unknown as Record<string, number>),
    ).toThrow(expect.objectContaining({ code: "INVALID_CRAFT_REVIEW_OPTIONS" }));
  });
});

describe("delivered-size legibility", () => {
  it("flags text whose x-height falls below the minimum at the display width", () => {
    // 1000 px canvas shown 360 px wide: 30 px type → 10.8 px, x-height 5.4 px.
    const review = analyzeCraft(
      model([text("caption", 30, fullWidth), text("headline", 100, fullWidth)]),
    );
    const finding = review.findings.find(
      (item) => item.code === "CRAFT_TEXT_SMALL_AT_DELIVERY",
    );
    expect(finding?.elementId).toBe("caption");
    expect(finding?.details).toMatchObject({
      displayWidth: 360,
      displayedFontSize: 10.8,
      displayedXHeight: 5.4,
    });
    expect(review.metrics.text.map((metric) => metric.elementId)).toEqual([
      "caption",
      "headline",
    ]);
  });

  it("depends on the declared display width", () => {
    const elements = [text("caption", 30, fullWidth)];
    expect(codes(analyzeCraft(model(elements)))).toContain(
      "CRAFT_TEXT_SMALL_AT_DELIVERY",
    );
    expect(codes(analyzeCraft(model(elements), { displayWidth: 600 }))).not.toContain(
      "CRAFT_TEXT_SMALL_AT_DELIVERY",
    );
  });

  it("ignores procedural decoration", () => {
    const decorative = { ...text("texture", 4, fullWidth), decoration: true };
    expect(analyzeCraft(model([decorative])).metrics.text).toEqual([]);
  });
});

describe("scale contrast", () => {
  it("flags competing text sizes and lists every competitor", () => {
    const review = analyzeCraft(
      model([
        text("headline", 80, fullWidth),
        text("price", 70, fullWidth),
        text("caption", 30, fullWidth),
      ]),
    );
    const finding = review.findings.find(
      (item) => item.code === "CRAFT_WEAK_SCALE_CONTRAST",
    );
    expect(finding?.elementId).toBe("headline");
    expect(finding?.details["competingElementIds"]).toEqual(["headline", "price"]);
    expect(review.metrics.dominance).toEqual({
      firstElementId: "headline",
      secondElementId: "price",
      ratio: 1.1429,
    });
  });

  it("accepts a clearly dominant element and breaks ties by paint order", () => {
    const clear = analyzeCraft(
      model([text("caption", 30, fullWidth), text("headline", 90, fullWidth)]),
    );
    expect(codes(clear)).not.toContain("CRAFT_WEAK_SCALE_CONTRAST");
    const tied = analyzeCraft(
      model([text("a", 40, fullWidth), text("b", 40, fullWidth)]),
    );
    expect(tied.metrics.dominance.firstElementId).toBe("a");
  });
});

describe("dead space", () => {
  const panel = { x: 100, y: 100, width: 800, height: 600 };
  const surface: Rgb = [40, 40, 40];

  it("flags a container whose fill is mostly bare", () => {
    const pixels = raster(1000, 1000, [255, 255, 255]);
    paint(pixels, 100, 100, 800, 600, surface);
    paint(pixels, 150, 150, 300, 80, [250, 250, 250]);
    const review = analyzeCraft(
      model(
        [
          element({ id: "panel", bounds: panel, fill: "#282828" }),
          text("headline", 80, { x: 150, y: 150, width: 300, height: 80 }),
        ],
        { raster: pixels },
      ),
    );
    const finding = review.findings.find(
      (item) => item.code === "CRAFT_DEAD_SPACE" && item.elementId === "panel",
    );
    expect(finding?.details).toMatchObject({ scope: "container", axis: "rows" });
    expect(review.metrics.containers[0]!.emptyFraction).toBeGreaterThan(0.9);
  });

  it("accepts a container filled by its content", () => {
    const pixels = raster(1000, 1000, [255, 255, 255]);
    paint(pixels, 100, 100, 800, 600, surface);
    for (let row = 0; row < 12; row += 1) {
      paint(pixels, 110, 110 + row * 48, 780, 30, [250, 250, 250]);
    }
    const review = analyzeCraft(
      model([element({ id: "panel", bounds: panel, fill: "#282828" })], {
        raster: pixels,
      }),
    );
    expect(review.findings.filter((item) => item.elementId === "panel")).toEqual([]);
  });

  it("flags a large canvas band without content", () => {
    const review = analyzeCraft(
      model([text("headline", 80, { x: 50, y: 50, width: 900, height: 200 })]),
    );
    const finding = review.findings.find(
      (item) => item.code === "CRAFT_DEAD_SPACE" && item.elementId === undefined,
    );
    expect(finding?.details).toMatchObject({
      scope: "canvas",
      axis: "rows",
      start: 250,
      end: 1000,
      fraction: 0.75,
    });
  });

  it("treats full-bleed photographs as content but full-canvas rectangles as ground", () => {
    const photo = analyzeCraft(
      model([element({ id: "photo", kind: "image", bounds: fullWidth })]),
    );
    expect(codes(photo)).not.toContain("CRAFT_DEAD_SPACE");
    const ground = analyzeCraft(
      model([element({ id: "ground", bounds: fullWidth, fill: "#ffffff" })]),
    );
    expect(codes(ground)).toContain("CRAFT_DEAD_SPACE");
  });

  it("does not let thin rules hide an empty band", () => {
    const review = analyzeCraft(
      model([
        text("headline", 80, { x: 50, y: 50, width: 900, height: 200 }),
        element({
          id: "spine",
          bounds: { x: 20, y: 0, width: 6, height: 1000 },
          fill: "#000000",
        }),
      ]),
    );
    expect(review.metrics.canvasEmptyBand?.fraction).toBe(0.75);
  });
});

describe("accent budget", () => {
  const accent = "#F3C879";

  it("counts repeated same-size marks as one systematic use", () => {
    const marks = Array.from({ length: 8 }, (_, index) =>
      element({
        id: `index-${index}`,
        bounds: { x: index * 100, y: 0, width: 20, height: 20 },
        fill: "#f3c879",
      }),
    );
    const review = analyzeCraft(model(marks, { accentColors: [accent] }));
    expect(review.metrics.accent.usageCount).toBe(1);
    expect(review.metrics.accent.elementIds).toHaveLength(8);
    expect(codes(review)).not.toContain("CRAFT_ACCENT_OVERUSE");
  });

  it("flags many distinct accent uses", () => {
    const uses = Array.from({ length: 6 }, (_, index) =>
      element({
        id: `use-${index}`,
        bounds: { x: 0, y: index * 100, width: 10 + index, height: 10 },
        fill: "#f3c879",
      }),
    );
    const review = analyzeCraft(model(uses, { accentColors: [accent] }));
    const finding = review.findings.find(
      (item) => item.code === "CRAFT_ACCENT_OVERUSE",
    );
    expect(finding?.details).toMatchObject({ usageCount: 6, elementCount: 6 });
  });

  it("measures accent area outside photographs", () => {
    const pixels = raster(1000, 1000, [255, 255, 255]);
    paint(pixels, 0, 0, 1000, 500, [243, 200, 121]);
    const overused = analyzeCraft(
      model([], { raster: pixels, accentColors: [accent] }),
    );
    expect(overused.metrics.accent.areaFraction).toBe(0.5);
    expect(codes(overused)).toContain("CRAFT_ACCENT_OVERUSE");

    const photo = element({
      id: "photo",
      kind: "image",
      bounds: { x: 0, y: 0, width: 1000, height: 500 },
    });
    const inPhoto = analyzeCraft(
      model([photo], { raster: pixels, accentColors: [accent] }),
    );
    expect(inPhoto.metrics.accent.areaFraction).toBe(0);
  });

  it("skips the budget when no accent is declared", () => {
    expect(analyzeCraft(model([])).metrics.accent).toEqual({
      colors: [],
      areaFraction: null,
      usageCount: 0,
      elementIds: [],
    });
  });
});

describe("path bounds", () => {
  it("handles absolute, relative, implicit and closing commands", () => {
    expect(pathDataBounds("M10 20 L30 40 Z")).toEqual({
      x: 10,
      y: 20,
      width: 20,
      height: 20,
    });
    expect(pathDataBounds("m10 20 l5 5 5 5 h10 v-30 z")).toEqual({
      x: 10,
      y: 0,
      width: 20,
      height: 30,
    });
    expect(pathDataBounds("M0 0 C10 -10 20 10 30 0")).toEqual({
      x: 0,
      y: -10,
      width: 30,
      height: 20,
    });
    expect(pathDataBounds("M0 0 A5 5 0 0 1 10 0")).toEqual({
      x: -5,
      y: -5,
      width: 20,
      height: 10,
    });
    expect(pathDataBounds("")).toBeNull();
    expect(pathDataBounds("10 10")).toBeNull();
  });
});

describe("reviewGraphicCraft", () => {
  it("is deterministic and leaves rendered bytes unchanged", async () => {
    const document = await loadExample("quote-card");
    const assets = await loadExampleAssets(document);
    const before = await renderGraphic(document, {
      formats: ["svg", "png"],
      assets,
      creationTimestamp: "2026-10-20T00:00:00.000Z",
    });
    const first = await reviewGraphicCraft(document, { assets });
    const second = await reviewGraphicCraft(cloneDocument(document), { assets });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const after = await renderGraphic(document, {
      formats: ["svg", "png"],
      assets,
      creationTimestamp: "2026-10-20T00:00:00.000Z",
    });
    expect(after.outputs.map((output) => sha256(output.bytes))).toEqual(
      before.outputs.map((output) => sha256(output.bytes)),
    );
    expect(after.qualityIssues).toEqual(before.qualityIssues);
    expect(first.policyVersion).toBe("1.0.0");
    expect(first.metrics.accent.colors).toEqual([
      document.brand.palette.accent.toLowerCase(),
    ]);
    for (const finding of first.findings) {
      expect(CRAFT_FINDING_CODES).toContain(finding.code);
    }
  });

  it("applies the same blocking checks as renderGraphic", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.brand.themes.dark.text = "#101525";
    await expect(reviewGraphicCraft(document)).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
    await expect(reviewGraphicCraft({ invalid: true })).rejects.toMatchObject({
      code: "INVALID_DESIGN_DOCUMENT",
    });
  });

  it("validates accent colors", async () => {
    const document = await loadExample("quote-card");
    await expect(
      reviewGraphicCraft(document, { accentColors: ["gold"] }),
    ).rejects.toMatchObject({ code: "INVALID_CRAFT_REVIEW_OPTIONS" });
  });
});

describe("reviewSceneCraft", () => {
  it("reviews a scene with an explicit accent without changing its outputs", async () => {
    const scene = JSON.parse(
      await readFile(
        resolve("fixtures/scene-kernel/editorial-decoder-spread-v1.scene.json"),
        "utf8",
      ),
    ) as unknown;
    const first = await reviewSceneCraft(scene, { accentColors: ["#B94A35"] });
    const second = await reviewSceneCraft(scene, { accentColors: ["#B94A35"] });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.metrics.text.length).toBeGreaterThan(0);
    expect(first.metrics.accent.colors).toEqual(["#b94a35"]);
    const withoutAccent = await reviewSceneCraft(scene);
    expect(withoutAccent.metrics.accent.areaFraction).toBeNull();
  });

  it("rejects invalid scenes", async () => {
    await expect(reviewSceneCraft({})).rejects.toMatchObject({
      code: "INVALID_SCENE_DOCUMENT",
    });
  });
});
