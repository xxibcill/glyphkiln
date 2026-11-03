import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  renderGraphic,
  reviewFormatSet,
  reviewGraphicCraft,
  sha256,
  type CraftReview,
  type DesignDocument,
} from "../src/index.js";
import { analyzeCraft } from "../src/craft/analyze.js";
import { describeLayout } from "../src/craft/layout.js";
import { encode as encodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

import type { FontRegistry } from "../src/fonts/index.js";
import {
  buildCraftModel,
  type CraftElement,
  type CraftModel,
  type CraftRaster,
} from "../src/craft/model.js";
import { createCraftImageDecoder } from "../src/craft/review.js";
import type { SceneKernel, SceneKernelElement } from "../src/renderer/scene.js";
import { reviewFormatSet as sceneReviewFormatSet } from "../src/scene/index.js";

type Rgb = readonly [number, number, number];

const REPOSITORY = resolve(import.meta.dirname, "../../..");
const ASSET_FILES: Record<string, string> = {
  "kilnform-lamp-campaign":
    "packages/glyphkiln-core/examples/assets/kilnform-lamp-campaign.png",
  "kilnform-mark": "packages/glyphkiln-core/examples/assets/kilnform-mark.png",
};
const CAMPAIGN_FORMATS = [
  "campaign-instagram-square",
  "campaign-instagram-portrait",
  "campaign-linkedin-landscape",
] as const;
const STRESS_TEST = "Deliverables/designer-stress-test-2026-09-25/designs";
const P1_CRAFT = "Deliverables/benchmarks/p1-craft-2026-10/designs";

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
  alpha = 255,
) {
  for (let row = y; row < y + h; row += 1) {
    for (let column = x; column < x + w; column += 1) {
      target.data.set([...color, alpha], (row * target.width + column) * 4);
    }
  }
}

/** Over-composites a straight-alpha color onto the whole raster. */
function scrim(target: CraftRaster, color: Rgb, opacity: number) {
  for (let offset = 0; offset < target.data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      target.data[offset + channel] = Math.round(
        color[channel]! * opacity + target.data[offset + channel]! * (1 - opacity),
      );
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

const OCHRE: Rgb = [196, 140, 70];
const COBALT: Rgb = [20, 60, 170];

/** A 200×200 photograph: ochre wall with a cobalt product in the middle. */
function photograph(): CraftRaster {
  const source = raster(200, 200, OCHRE);
  paint(source, 70, 60, 60, 100, COBALT);
  return source;
}

/** The photograph placed 1:1 across a 400×400 canvas at twice the size. */
function photoModel(
  rendered: CraftRaster,
  extra: CraftElement[] = [],
  source = photograph(),
): CraftModel {
  const box = { x: 0, y: 0, width: 400, height: 400 };
  return {
    canvas: { width: 400, height: 400 },
    raster: rendered,
    elements: [
      element({ id: "photo", kind: "image", bounds: box, visibleBounds: box }),
      ...extra,
    ],
    accentColors: [],
    marks: { elementIds: [], background: null },
    images: [{ elementId: "photo", source, placed: box, visible: box }],
  };
}

function renderedPhoto(): CraftRaster {
  const rendered = raster(400, 400, OCHRE);
  paint(rendered, 140, 120, 120, 200, COBALT);
  return rendered;
}

const dimmedCodes = (review: CraftReview) =>
  review.findings.filter((finding) => finding.code === "CRAFT_PRODUCT_COLOR_DIMMED");

describe("product color", () => {
  it("accepts a photograph rendered at full strength", () => {
    const review = analyzeCraft(photoModel(renderedPhoto()));
    expect(dimmedCodes(review)).toEqual([]);
    const metric = review.metrics.images[0]!;
    expect(metric.elementId).toBe("photo");
    expect(metric.sampleCount).toBeGreaterThan(8_000);
    expect(metric.colors.map((color) => color.hueRange)).toEqual([
      [60, 90],
      [240, 270],
    ]);
    for (const color of metric.colors) {
      expect(color.chromaRetention).toBeGreaterThan(0.99);
      expect(Math.abs(color.lightnessChange)).toBeLessThan(0.01);
    }
  });

  it("flags a global dark scrim that dims the product color", () => {
    const rendered = renderedPhoto();
    scrim(rendered, [0, 0, 0], 0.56);
    const review = analyzeCraft(
      photoModel(rendered, [
        element({
          id: "scrim",
          bounds: { x: 0, y: 0, width: 400, height: 400 },
          fill: "#000000",
          opacity: 0.56,
        }),
      ]),
    );
    const [finding] = dimmedCodes(review);
    expect(finding?.elementId).toBe("photo");
    expect(finding?.severity).toBe("advisory");
    const dimmed = finding!.details["dimmedColors"] as { hueRange: number[] }[];
    expect(dimmed.map((color) => color.hueRange)).toContainEqual([240, 270]);
    const cobalt = review.metrics.images[0]!.colors.find(
      (color) => color.hueRange[0] === 240,
    )!;
    expect(cobalt.chromaRetention).toBeLessThan(0.75);
    expect(cobalt.lightnessChange).toBeLessThan(-0.1);
  });

  it("flags a light wash by its lost chroma", () => {
    const rendered = renderedPhoto();
    scrim(rendered, [255, 255, 255], 0.78);
    const review = analyzeCraft(photoModel(rendered));
    const cobalt = review.metrics.images[0]!.colors.find(
      (color) => color.hueRange[0] === 240,
    )!;
    expect(cobalt.lightnessChange).toBeGreaterThan(0);
    expect(cobalt.dimmed).toBe(true);
    expect(dimmedCodes(review)).toHaveLength(1);
  });

  it("ignores pixels under later opaque content such as copy panels", () => {
    // An opaque panel covers the left half; the product stays untouched.
    const rendered = renderedPhoto();
    paint(rendered, 0, 0, 130, 400, [10, 10, 10]);
    const panel = element({
      id: "panel",
      bounds: { x: 0, y: 0, width: 130, height: 400 },
      fill: "#0a0a0a",
    });
    expect(dimmedCodes(analyzeCraft(photoModel(rendered, [panel])))).toEqual([]);
    // Without the panel's geometry, the same pixels would read as dimmed ochre.
    expect(dimmedCodes(analyzeCraft(photoModel(rendered)))).toHaveLength(1);
  });

  it("respects the documented thresholds", () => {
    const rendered = renderedPhoto();
    scrim(rendered, [0, 0, 0], 0.2);
    const model = photoModel(rendered);
    expect(dimmedCodes(analyzeCraft(model))).toHaveLength(1);
    expect(
      dimmedCodes(
        analyzeCraft(model, { imageChromaRetention: 0.5, imageLightnessDrop: 0.5 }),
      ),
    ).toEqual([]);
  });

  it("skips marks, small images, transparent and neutral sources", () => {
    const rendered = renderedPhoto();
    scrim(rendered, [0, 0, 0], 0.56);
    const asMark = {
      ...photoModel(rendered),
      marks: { elementIds: ["photo"], background: null },
    };
    expect(analyzeCraft(asMark).metrics.images).toEqual([]);

    const small = photoModel(rendered);
    small.images = [
      { ...small.images![0]!, visible: { x: 0, y: 0, width: 60, height: 60 } },
    ];
    expect(analyzeCraft(small).metrics.images).toEqual([]);

    const transparent = photograph();
    paint(transparent, 0, 0, 200, 200, OCHRE, 0);
    const clear = analyzeCraft(photoModel(rendered, [], transparent));
    expect(clear.metrics.images[0]).toMatchObject({ sampleCount: 0, colors: [] });

    const grey = raster(200, 200, [128, 128, 128]);
    const neutral = analyzeCraft(photoModel(rendered, [], grey));
    expect(neutral.metrics.images[0]).toMatchObject({
      chromaticSampleCount: 0,
      colors: [],
    });
    expect(dimmedCodes(neutral)).toEqual([]);
  });

  it("treats models without decoded images as having none", () => {
    const model: CraftModel = photoModel(renderedPhoto());
    delete model.images;
    expect(analyzeCraft(model).metrics.images).toEqual([]);
  });
});

describe("image placement and decoding", () => {
  const source = raster(200, 100, OCHRE);
  const noFonts = {} as FontRegistry;
  function build(elements: SceneKernelElement[], decoded: CraftRaster | null = source) {
    const scene: SceneKernel = {
      dimensions: { width: 400, height: 400 },
      title: "t",
      description: "d",
      backgroundColor: "#ffffff",
      elements,
    };
    return buildCraftModel({
      scene,
      raster: raster(400, 400, [255, 255, 255]),
      fonts: noFonts,
      accentColors: [],
      decodeImage: () => decoded,
    });
  }
  const image = (fit: "cover" | "contain", extra: object = {}): SceneKernelElement => ({
    id: "photo",
    type: "image",
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    href: "data:image/png;base64,AA==",
    fit,
    ...extra,
  });

  it("follows the serializer's meet and slice placement and clips", () => {
    const contain = build([image("contain")]);
    expect(contain.images?.[0]).toMatchObject({
      placed: { x: 0, y: 100, width: 400, height: 200 },
      visible: { x: 0, y: 100, width: 400, height: 200 },
    });
    const cover = build([image("cover")]);
    expect(cover.images?.[0]).toMatchObject({
      placed: { x: -200, y: 0, width: 800, height: 400 },
      visible: { x: 0, y: 0, width: 400, height: 400 },
    });
    const clipped = build([
      image("cover", { clipBounds: { x: 100, y: 0, width: 100, height: 400 } }),
    ]);
    expect(clipped.elements[0]!.visibleBounds).toEqual({
      x: 100,
      y: 0,
      width: 100,
      height: 400,
    });
    const outside = build([
      image("contain", { clipBounds: { x: 0, y: 0, width: 400, height: 50 } }),
    ]);
    expect(outside.elements[0]!.visibleBounds).toBeNull();
    expect(outside.images).toEqual([]);
  });

  it("maps translated and scaled groups but not rotated ones", () => {
    const moved = build([
      {
        id: "group",
        type: "group",
        transforms: [
          { type: "translate", x: 10, y: 20 },
          { type: "scale", x: 0.5, y: 0.5 },
        ],
        elements: [image("contain")],
      },
    ]);
    expect(moved.images?.[0]!.visible).toEqual({
      x: 10,
      y: 70,
      width: 200,
      height: 100,
    });
    const rotated = build([
      {
        id: "group",
        type: "group",
        transforms: [{ type: "rotate", degrees: 30, cx: 200, cy: 200 }],
        elements: [image("contain")],
      },
    ]);
    expect(rotated.elements[0]!.visibleBounds).toBeNull();
    expect(rotated.images).toEqual([]);
  });

  it("keeps the box as the visible region when the source cannot be decoded", () => {
    const model = build([image("contain")], null);
    expect(model.elements[0]!.visibleBounds).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 400,
    });
    expect(model.images).toEqual([]);
  });

  it("decodes embedded PNG and JPEG once and rejects anything else", () => {
    const png = new PNG({ width: 2, height: 1 });
    png.data.set([1, 2, 3, 255, 4, 5, 6, 255]);
    const pngHref = `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
    const jpeg = encodeJpeg(
      { width: 2, height: 2, data: new Uint8Array(16).fill(200) },
      90,
    );
    const jpegHref = `data:image/jpeg;base64,${Buffer.from(jpeg.data).toString("base64")}`;
    const decode = createCraftImageDecoder();
    const decoded = decode(pngHref)!;
    expect(decoded).toMatchObject({ width: 2, height: 1 });
    expect([...decoded.data]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
    expect(decode(pngHref)).toBe(decoded);
    expect(decode(jpegHref)).toMatchObject({ width: 2, height: 2 });
    expect(decode("data:image/png;base64,AAAA")).toBeNull();
    expect(decode("https://example.invalid/image.png")).toBeNull();
  });
});

function layoutModel(
  width: number,
  height: number,
  elements: CraftElement[],
  marks: string[] = [],
): CraftReview {
  return analyzeCraft({
    canvas: { width, height },
    raster: raster(width, height, [255, 255, 255]),
    elements,
    accentColors: [],
    marks: { elementIds: marks, background: null },
  });
}

function text(id: string, bounds: CraftElement["bounds"]): CraftElement {
  return element({
    id,
    kind: "text",
    bounds,
    text: { fontSize: 60, xHeightRatio: 0.5, lineCount: 1 },
  });
}

function photo(id: string, visibleBounds: CraftElement["bounds"]): CraftElement {
  return element({
    id,
    kind: "image",
    bounds: visibleBounds,
    visibleBounds,
  });
}

/** One composition expressed in fractions of any canvas: resizing only. */
function resized(width: number, height: number): CraftReview {
  return layoutModel(
    width,
    height,
    [
      photo("photo", { x: 0, y: 0, width, height }),
      element({
        id: "logo",
        kind: "image",
        bounds: { x: width * 0.07, y: height * 0.08, width: 70, height: 70 },
      }),
      text("headline", {
        x: width * 0.07,
        y: height * 0.2,
        width: width * 0.3,
        height: height * 0.12,
      }),
      element({ id: "rule", bounds: { x: 0, y: 0, width: 10, height: height } }),
    ],
    ["logo"],
  );
}

describe("normalized layout", () => {
  it("describes text, image and mark elements in reading order", () => {
    const review = resized(1000, 500);
    expect(review.metrics.layout.map((item) => [item.elementId, item.role])).toEqual([
      ["logo", "mark"],
      ["headline", "text"],
      ["photo", "image"],
    ]);
    expect(review.metrics.layout[1]!.bounds).toEqual({
      x: 0.07,
      y: 0.2,
      width: 0.3,
      height: 0.12,
    });
  });

  it("uses only the visible part of an image and skips hidden content", () => {
    const layout = describeLayout({
      canvas: { width: 100, height: 100 },
      raster: raster(100, 100, [255, 255, 255]),
      elements: [
        element({
          id: "cropped",
          kind: "image",
          bounds: { x: -50, y: 0, width: 200, height: 100 },
          visibleBounds: { x: 50, y: 0, width: 100, height: 100 },
        }),
        element({ id: "unmapped", kind: "image", bounds: null, visibleBounds: null }),
        text("offcanvas", { x: 200, y: 200, width: 10, height: 10 }),
        { ...text("invisible", { x: 0, y: 0, width: 10, height: 10 }), opacity: 0 },
        { ...text("texture", { x: 0, y: 0, width: 10, height: 10 }), decoration: true },
      ],
      accentColors: [],
      marks: { elementIds: [], background: null },
    });
    expect(layout).toEqual([
      {
        elementId: "cropped",
        role: "image",
        bounds: { x: 0.5, y: 0, width: 0.5, height: 1 },
      },
    ]);
  });
});

describe("reviewFormatSet", () => {
  it("flags formats that resize one composition", () => {
    const set = reviewFormatSet([
      { format: "square", review: resized(1080, 1080) },
      { format: "portrait", review: resized(1080, 1350) },
      { format: "landscape", review: resized(1200, 627) },
    ]);
    expect(set.findings).toHaveLength(3);
    expect(set.findings[0]).toMatchObject({
      code: "CRAFT_FORMATS_NOT_RECOMPOSED",
      severity: "advisory",
      details: { formats: ["square", "portrait"], sameReadingOrder: true },
    });
    expect(set.metrics.pairs.every((pair) => pair.layoutDistance < 0.05)).toBe(true);
    expect(set.formats.map((item) => item.canvas)).toEqual([
      { width: 1080, height: 1080 },
      { width: 1080, height: 1350 },
      { width: 1200, height: 627 },
    ]);
  });

  it("accepts formats recomposed for their shape", () => {
    const split = layoutModel(1200, 627, [
      photo("photo", { x: 600, y: 0, width: 600, height: 627 }),
      text("headline", { x: 80, y: 150, width: 460, height: 320 }),
    ]);
    const stacked = layoutModel(1080, 1350, [
      photo("photo", { x: 0, y: 0, width: 1080, height: 700 }),
      text("headline", { x: 80, y: 800, width: 900, height: 300 }),
    ]);
    const set = reviewFormatSet([
      { format: "landscape", review: split },
      { format: "portrait", review: stacked },
    ]);
    expect(set.findings).toEqual([]);
    expect(set.metrics.pairs[0]).toMatchObject({
      sameReadingOrder: false,
      notRecomposed: false,
    });
  });

  it("counts reordered or unmatched elements as recomposition", () => {
    const base = resized(1080, 1080);
    const reordered: CraftReview = {
      ...base,
      metrics: { ...base.metrics, layout: [...base.metrics.layout].reverse() },
    };
    const swapped = reviewFormatSet([
      { format: "a", review: base },
      { format: "b", review: reordered },
    ]);
    expect(swapped.metrics.pairs[0]).toMatchObject({
      layoutDistance: 0,
      sameReadingOrder: false,
      notRecomposed: false,
    });

    const extra: CraftReview = {
      ...base,
      metrics: {
        ...base.metrics,
        layout: [
          ...base.metrics.layout.slice(0, 2),
          {
            elementId: "badge",
            role: "text",
            bounds: { x: 0, y: 0, width: 1, height: 1 },
          },
        ],
      },
    };
    const pair = reviewFormatSet([
      { format: "a", review: base },
      { format: "b", review: extra },
    ]).metrics.pairs[0]!;
    expect(pair.unmatchedElementIds).toEqual(["photo", "badge"]);
    expect(pair.layoutDistance).toBe(0.5);
    expect(pair.notRecomposed).toBe(false);

    const empty: CraftReview = { ...base, metrics: { ...base.metrics, layout: [] } };
    expect(
      reviewFormatSet([
        { format: "a", review: empty },
        { format: "b", review: empty },
      ]).metrics.pairs[0],
    ).toMatchObject({ layoutDistance: 1, notRecomposed: false });
  });

  it("depends on the format layout threshold", () => {
    const entries = [
      { format: "square", review: resized(1080, 1080) },
      { format: "landscape", review: resized(1200, 627) },
    ];
    expect(
      reviewFormatSet(entries, { thresholds: { formatLayoutDistance: 0.001 } })
        .findings,
    ).toEqual([]);
    expect(() =>
      reviewFormatSet(entries, { thresholds: { formatLayoutDistance: 0 } }),
    ).toThrow(expect.objectContaining({ code: "INVALID_CRAFT_REVIEW_OPTIONS" }));
  });

  it("validates its entries and is exported from the scene entry", () => {
    const review = resized(1080, 1080);
    const rejects = (entries: unknown) =>
      expect(() =>
        reviewFormatSet(entries as Parameters<typeof reviewFormatSet>[0]),
      ).toThrow(expect.objectContaining({ code: "INVALID_CRAFT_REVIEW_OPTIONS" }));
    rejects([{ format: "only", review }]);
    rejects("nope");
    rejects(Array.from({ length: 17 }, (_, index) => ({ format: `${index}`, review })));
    rejects([
      { format: "", review },
      { format: "b", review },
    ]);
    rejects([null, { format: "b", review }]);
    rejects([
      { format: "a", review: { ...review, policyVersion: "1.1.0" } },
      { format: "b", review },
    ]);
    rejects([
      { format: "a", review: { ...review, canvas: undefined } },
      { format: "b", review },
    ]);
    expect(sceneReviewFormatSet).toBe(reviewFormatSet);
  });
});

async function loadCampaign(
  directory: string,
  name: string,
): Promise<{ document: DesignDocument; review: CraftReview }> {
  const document = JSON.parse(
    await readFile(resolve(REPOSITORY, directory, `${name}.json`), "utf8"),
  ) as DesignDocument;
  const assets = await Promise.all(
    document.assets.map(async (asset) => ({
      ...asset,
      bytes: new Uint8Array(
        await readFile(resolve(REPOSITORY, ASSET_FILES[asset.id]!)),
      ),
    })),
  );
  return { document, review: await reviewGraphicCraft(document, { assets }) };
}

async function loadCampaignSet(directory: string) {
  return Promise.all(CAMPAIGN_FORMATS.map((name) => loadCampaign(directory, name)));
}

describe("Kilnform campaign (critique CA-1, CA-3)", () => {
  it("flags the 25 September dark-scrim campaign as dimmed and not recomposed", async () => {
    const campaign = await loadCampaignSet(STRESS_TEST);
    for (const { document, review } of campaign) {
      expect(`${document.template.id}@${document.template.version}`).toBe(
        "image-led-campaign@1.0.1",
      );
      const finding = review.findings.find(
        (item) => item.code === "CRAFT_PRODUCT_COLOR_DIMMED",
      );
      expect(finding?.elementId).toBe("campaign-image");
      // The cobalt product color is among the reviewed colors and is dimmed.
      const cobalt = review.metrics.images[0]!.colors.find(
        (color) => color.hueRange[0] === 240,
      );
      expect(cobalt?.dimmed).toBe(true);
    }
    const set = reviewFormatSet(
      campaign.map(({ document, review }) => ({ format: document.format, review })),
    );
    expect(set.findings.map((finding) => finding.details["formats"])).toEqual([
      ["instagram-square", "instagram-portrait"],
      ["instagram-square", "linkedin-landscape"],
      ["instagram-portrait", "linkedin-landscape"],
    ]);
  }, 60_000);

  it("accepts the P1 recomposition with an untreated photograph", async () => {
    const campaign = await loadCampaignSet(P1_CRAFT);
    for (const { document, review } of campaign) {
      expect(`${document.template.id}@${document.template.version}`).toBe(
        "image-led-campaign@1.1.1",
      );
      expect(
        review.findings.filter((item) => item.code === "CRAFT_PRODUCT_COLOR_DIMMED"),
      ).toEqual([]);
      expect(review.metrics.images[0]!.colors.length).toBeGreaterThan(0);
    }
    const set = reviewFormatSet(
      campaign.map(({ document, review }) => ({ format: document.format, review })),
    );
    expect(set.findings).toEqual([]);
  }, 60_000);

  it("leaves rendered bytes unchanged", async () => {
    const { document } = await loadCampaign(STRESS_TEST, "campaign-instagram-square");
    const assets = await Promise.all(
      document.assets.map(async (asset) => ({
        ...asset,
        bytes: new Uint8Array(
          await readFile(resolve(REPOSITORY, ASSET_FILES[asset.id]!)),
        ),
      })),
    );
    const options = {
      formats: ["svg", "png"] as ("svg" | "png")[],
      assets,
      creationTimestamp: "2026-10-20T00:00:00.000Z",
    };
    const before = await renderGraphic(document, options);
    await reviewGraphicCraft(document, { assets });
    const after = await renderGraphic(document, options);
    expect(after.outputs.map((output) => sha256(output.bytes))).toEqual(
      before.outputs.map((output) => sha256(output.bytes)),
    );
  }, 60_000);
});
