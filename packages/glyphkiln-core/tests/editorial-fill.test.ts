import { describe, expect, it } from "vitest";

import {
  AUTHORING_TEMPLATE_REGISTRY,
  TEMPLATE_REGISTRY,
  renderGraphic,
  reviewGraphicCraft,
  type DesignDocument,
  type FormatId,
} from "../src/index.js";
import { cloneDocument, loadExample, loadExampleAssets } from "./helpers.js";

const FORMATS: FormatId[] = [
  "linkedin-landscape",
  "instagram-square",
  "instagram-portrait",
  "instagram-story",
  "x-landscape",
  "youtube-thumbnail",
];

async function example(id: "quote-card" | "statistic-card"): Promise<DesignDocument> {
  const document = cloneDocument(await loadExample(id));
  document.template.version = "1.2.0";
  return document;
}

function setText(document: DesignDocument, type: "headline", text: string): void {
  const layer = document.layers.find((candidate) => candidate.type === type);
  if (layer?.type !== "headline") throw new Error(`Missing ${type} layer.`);
  layer.text = text;
}

describe("editorial fill templates 1.2.0", () => {
  it("are registered as exact versions with authoring contracts, without changing the current defaults", () => {
    expect(TEMPLATE_REGISTRY["quote-card"].version).toBe("1.1.0");
    expect(TEMPLATE_REGISTRY["statistic-card"].version).toBe("1.1.0");
    expect(AUTHORING_TEMPLATE_REGISTRY["quote-card@1.2.0"].compositionVariant.id).toBe(
      "typographic-quote",
    );
    expect(
      AUTHORING_TEMPLATE_REGISTRY["statistic-card@1.2.0"].compositionVariant.id,
    ).toBe("hero-statistic-fill");
  });

  it.each(
    FORMATS.flatMap((format) => [
      { id: "quote-card" as const, format },
      { id: "statistic-card" as const, format },
    ]),
  )("render $id@1.2.0 in $format without quality errors", async ({ id, format }) => {
    const document = await example(id);
    document.format = format;
    const result = await renderGraphic(document, {
      formats: ["svg"],
      assets: await loadExampleAssets(document),
      creationTimestamp: "2026-10-22T00:00:00.000Z",
    });
    expect(result.qualityIssues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    const safe = result.evidence.safeArea;
    for (const text of result.evidence.text) {
      expect(text.bounds.x).toBeGreaterThanOrEqual(safe.x - 0.001);
      expect(text.bounds.y).toBeGreaterThanOrEqual(safe.y - 0.001);
      expect(text.bounds.x + text.bounds.width).toBeLessThanOrEqual(
        safe.x + safe.width + 0.001,
      );
      expect(text.bounds.y + text.bounds.height).toBeLessThanOrEqual(
        safe.y + safe.height + 0.001,
      );
    }
  });

  it("render deterministically", async () => {
    for (const id of ["quote-card", "statistic-card"] as const) {
      const document = await example(id);
      const options = {
        formats: ["svg", "png"] as const,
        assets: await loadExampleAssets(document),
        creationTimestamp: "2026-10-22T00:00:00.000Z",
      };
      const first = await renderGraphic(document, {
        ...options,
        formats: [...options.formats],
      });
      const second = await renderGraphic(cloneDocument(document), {
        ...options,
        formats: [...options.formats],
      });
      expect(second.outputs.map((output) => output.fingerprint)).toEqual(
        first.outputs.map((output) => output.fingerprint),
      );
      expect(
        Buffer.from(second.outputs[1]!.bytes).equals(
          Buffer.from(first.outputs[1]!.bytes),
        ),
      ).toBe(true);
    }
  });

  it("fit a short quote to its field instead of leaving the panel bare", async () => {
    const legacy = cloneDocument(await loadExample("quote-card"));
    setText(legacy, "headline", "Light should give a room a place to rest.");
    const typographic = await example("quote-card");
    setText(typographic, "headline", "Light should give a room a place to rest.");

    const before = await reviewGraphicCraft(legacy);
    const after = await reviewGraphicCraft(typographic);
    const beforeSize = before.metrics.text.find((text) => text.elementId === "quote")!;
    const afterSize = after.metrics.text.find((text) => text.elementId === "quote")!;
    expect(afterSize.fontSize).toBeGreaterThan(beforeSize.fontSize * 1.5);
    expect(
      after.findings.filter(
        (finding) =>
          finding.code === "CRAFT_DEAD_SPACE" &&
          finding.details["scope"] === "container",
      ),
    ).toEqual([]);
    const rendered = await renderGraphic(typographic);
    expect(rendered.qualityIssues.map((issue) => issue.code)).not.toContain(
      "ORPHAN_LINE",
    );
  });

  it("draw one accent hanging quotation mark and keep the accent off other elements", async () => {
    const document = await example("quote-card");
    const review = await reviewGraphicCraft(document);
    expect(review.metrics.accent.elementIds).toEqual(["quote-mark"]);
  });

  it("let the statistic value fill the field and carry the only accent", async () => {
    const legacy = cloneDocument(await loadExample("statistic-card"));
    const hero = await example("statistic-card");
    const before = await reviewGraphicCraft(legacy);
    const after = await reviewGraphicCraft(hero);
    const value = (review: typeof after) =>
      review.metrics.text.find((text) => text.elementId.endsWith("-value"))!;
    expect(value(after).fontSize).toBeGreaterThan(value(before).fontSize);
    expect(after.metrics.accent.elementIds).toEqual([value(after).elementId]);
  });

  it("fall back from an illegible accent to the text color", async () => {
    const document = await example("statistic-card");
    document.brand.palette.accent = document.brand.themes[document.mode].surface;
    document.brand.palette.primary = document.brand.themes[document.mode].surface;
    const result = await renderGraphic(document);
    expect(result.qualityIssues.map((issue) => issue.code)).not.toContain(
      "LOW_TEXT_CONTRAST",
    );
  });

  it("use the safe area as the field when no procedural decoration is declared", async () => {
    const document = await example("quote-card");
    document.layers = document.layers.filter(
      (layer) => layer.type !== "procedural-decoration",
    );
    const result = await renderGraphic(document);
    expect(result.qualityIssues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    const quote = result.evidence.text.find((text) => text.layerId === "quote")!;
    expect(quote.bounds.width).toBeGreaterThan(result.evidence.safeArea.width * 0.6);
  });
});
