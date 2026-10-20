import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  renderGraphic,
  reviewCarouselSequence,
  type DesignDocument,
} from "../src/index.js";
import { loadExampleAssets } from "./helpers.js";

async function fixture(name: string): Promise<DesignDocument> {
  return JSON.parse(
    await readFile(`tests/visual/baselines/${name}.design.json`, "utf8"),
  ) as DesignDocument;
}

describe("reference-led editorial compositions", () => {
  it("keeps header and action positions consistent when a photo slide becomes a type slide", async () => {
    const document = await fixture("image-carousel-balanced");
    const image = await renderGraphic(document, {
      formats: ["svg"],
      assets: await loadExampleAssets(document),
    });
    document.layers = document.layers.filter((layer) => layer.type !== "image");
    document.assets = [];
    const type = await renderGraphic(document, { formats: ["svg"] });
    for (const layerType of ["badge", "eyebrow", "cta"]) {
      const id = document.layers.find((layer) => layer.type === layerType)!.id;
      expect(type.evidence.text.find((text) => text.layerId === id)).toEqual(
        image.evidence.text.find((text) => text.layerId === id),
      );
    }
    expect(type.evidence.crops).toEqual([]);
    expect(
      type.evidence.text.find((text) => text.layerId === "headline")!.fontSize,
    ).toBeGreaterThan(
      image.evidence.text.find((text) => text.layerId === "headline")!.fontSize,
    );
  });

  it("fits longer supported copy without collisions and rejects an overflowing latest-version headline", async () => {
    const document = await fixture("image-carousel-balanced");
    const headline = document.layers.find((layer) => layer.type === "headline")!;
    Object.assign(headline, {
      text: "A sculptural light for rooms that make space for a different point of view.",
    });
    const assets = await loadExampleAssets(document);
    const result = await renderGraphic(document, { assets, formats: ["svg"] });
    const repeated = await renderGraphic(document, { assets, formats: ["svg"] });
    expect(result.outputs[0]!.bytes).toEqual(repeated.outputs[0]!.bytes);
    const title = result.evidence.text.find((text) => text.layerId === headline.id)!;
    const subtitle = result.evidence.text.find((text) => text.layerId === "subtitle")!;
    expect(title.bounds.y + title.bounds.height).toBeLessThan(subtitle.bounds.y);
    expect(result.qualityIssues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    Object.assign(headline, {
      text: "An excessively long editorial headline ".repeat(8),
    });
    await expect(renderGraphic(document, { assets })).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
  });

  it.each([
    "split-editorial-landscape",
    "split-editorial-square",
    "split-editorial-portrait",
    "image-carousel",
    "image-carousel-metric",
    "split-editorial-landscape-balanced",
    "split-editorial-square-balanced",
    "split-editorial-portrait-balanced",
    "image-carousel-balanced",
    "image-carousel-metric-balanced",
  ])("keeps %s text readable and separate from its focal image", async (name) => {
    const document = await fixture(name);
    const result = await renderGraphic(document, {
      formats: ["svg"],
      assets: await loadExampleAssets(document),
    });
    expect(result.qualityIssues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    const image = result.evidence.crops[0]!.destinationBounds;
    const safe = result.evidence.safeArea;
    expect(image.x).toBeGreaterThanOrEqual(safe.x);
    expect(image.y).toBeGreaterThanOrEqual(safe.y);
    expect(image.x + image.width).toBeLessThanOrEqual(safe.x + safe.width + 0.001);
    expect(image.y + image.height).toBeLessThanOrEqual(safe.y + safe.height + 0.001);
    for (const text of result.evidence.text) {
      const box = text.bounds;
      const overlaps =
        box.x < image.x + image.width &&
        box.x + box.width > image.x &&
        box.y < image.y + image.height &&
        box.y + box.height > image.y;
      expect(overlaps, text.layerId).toBe(false);
      expect(text.overflow, text.layerId).toBe(false);
    }
  });

  it("recognizes image/type rhythm from visible document content", async () => {
    const document = await fixture("image-carousel");
    const slides = [0, 1, 2].map((ordinal) => ({
      document: {
        ...structuredClone(document),
        id: `rhythm-${ordinal}`,
        layers: document.layers.filter(
          (layer) => ordinal !== 1 || layer.type !== "image",
        ),
      },
      ordinal,
      narrativeRole: ordinal === 0 ? "hook" : ordinal === 2 ? "action" : "context",
      compositionVariantId: "organic-photo-editorial",
      altText: "A ceramic lamp and editorial copy.",
    }));
    const review = reviewCarouselSequence({
      deliveryProfileId: "tiktok-organic-photo",
      slides,
    });
    expect(review.success).toBe(true);
    expect(
      review.issues.some((issue) => issue.code === "COMPOSITION_RHYTHM_REVIEW"),
    ).toBe(false);
    slides[1]!.document.layers = structuredClone(document.layers);
    expect(
      reviewCarouselSequence({ deliveryProfileId: "tiktok-organic-photo", slides })
        .issues,
    ).toContainEqual(expect.objectContaining({ code: "COMPOSITION_RHYTHM_REVIEW" }));
  });

  it("renders a dark image slide with a footer and no optional header or role overrides", async () => {
    const document = await fixture("image-carousel");
    document.mode = "dark";
    document.brand.typography = { headlineFamily: "Inter", bodyFamily: "Inter" };
    document.layers = document.layers.filter((layer) =>
      ["image", "headline", "badge"].includes(layer.type),
    );
    document.layers.push({
      id: "footer",
      type: "footer",
      text: "KILNFORM / SERIES 01",
      visible: true,
    });
    Object.assign(
      document.layers.find((layer) => layer.type === "image")!,
      { treatment: "light-scrim" },
    );
    const result = await renderGraphic(document, {
      formats: ["svg"],
      assets: await loadExampleAssets(document),
    });
    expect(result.evidence.text.map((text) => text.layerId)).toEqual([
      "slide-number",
      "headline",
      "footer",
    ]);
    expect(result.evidence.crops[0]?.treatment).toBe("light-scrim");
    expect(new TextDecoder().decode(result.outputs[0]!.bytes)).toContain(
      "campaign-image-treatment",
    );
    expect(result.qualityIssues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
  });

  it.each(["1.1.0"])(
    "preserves exact typography-only carousel pixels when opting into %s",
    async (version) => {
      const document = await fixture("image-carousel");
      document.layers = document.layers.filter((layer) => layer.type !== "image");
      document.assets = [];
      document.fonts.push(
        { ...document.fonts[0]!, weight: 500 },
        { ...document.fonts[0]!, weight: 600 },
      );
      document.template.version = "1.0.4";
      const previous = await renderGraphic(document, { formats: ["svg", "png"] });
      document.template.version = version;
      const current = await renderGraphic(document, { formats: ["svg", "png"] });
      expect(current.outputs.map((output) => output.bytes)).toEqual(
        previous.outputs.map((output) => output.bytes),
      );
    },
  );

  it("changes focal crops deterministically without moving editorial text", async () => {
    const document = await fixture("image-carousel");
    const assets = await loadExampleAssets(document);
    const first = await renderGraphic(document, { formats: ["svg"], assets });
    const image = document.layers.find((layer) => layer.type === "image")!;
    Object.assign(image, { focalPoint: { x: 0, y: 0.5 } });
    const changed = await renderGraphic(document, { formats: ["svg"], assets });
    const repeat = await renderGraphic(document, { formats: ["svg"], assets });
    expect(changed.evidence.crops[0]!.sourceBounds).not.toEqual(
      first.evidence.crops[0]!.sourceBounds,
    );
    expect(changed.evidence.text).toEqual(first.evidence.text);
    expect(changed.outputs[0]!.bytes).toEqual(repeat.outputs[0]!.bytes);
  });

  it("rejects overflowing copy and unsupported image fit", async () => {
    const document = await fixture("image-carousel");
    const assets = await loadExampleAssets(document);
    Object.assign(
      document.layers.find((layer) => layer.type === "headline")!,
      { text: "A very long editorial headline ".repeat(25) },
    );
    await expect(renderGraphic(document, { assets })).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
    Object.assign(
      document.layers.find((layer) => layer.type === "headline")!,
      { text: "A ceramic silhouette" },
    );
    Object.assign(
      document.layers.find((layer) => layer.type === "image")!,
      { fit: "contain" },
    );
    await expect(renderGraphic(document, { assets })).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
  });
});
