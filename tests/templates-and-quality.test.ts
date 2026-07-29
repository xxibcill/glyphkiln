import { describe, expect, it } from "vitest";

import { GlyphkilnError, TEMPLATE_REGISTRY, renderGraphic } from "../src/index.js";
import { cloneDocument, loadExample } from "./helpers.js";

describe("template registry", () => {
  it("contains four stable versioned templates", () => {
    expect(Object.keys(TEMPLATE_REGISTRY)).toEqual([
      "product-announcement",
      "statistic-card",
      "quote-card",
      "article-cover",
    ]);
    for (const template of Object.values(TEMPLATE_REGISTRY)) {
      expect(template.version).toBe("1.0.0");
      expect(template.requiredLayers.length).toBeGreaterThan(0);
      expect(template.supportedFormats.length).toBeGreaterThan(0);
      expect(template.constraints.headlineMaximumLines).toBeGreaterThan(0);
    }
  });

  it.each(["product-announcement", "statistic-card", "quote-card", "article-cover"])(
    "renders the %s template deterministically",
    async (name) => {
      const document = await loadExample(name);
      const first = await renderGraphic(document, {
        formats: ["svg"],
        creationTimestamp: "2026-01-01T00:00:00.000Z",
      });
      const second = await renderGraphic(document, {
        formats: ["svg"],
        creationTimestamp: "2026-01-01T00:00:00.000Z",
      });
      expect(first.outputs[0]?.bytes).toEqual(second.outputs[0]?.bytes);
      expect(first.outputs[0]?.fingerprint).toBe(second.outputs[0]?.fingerprint);
    },
  );

  it("allows a missing optional subtitle", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers = document.layers.filter((layer) => layer.type !== "subtitle");
    await expect(renderGraphic(document)).resolves.toBeDefined();
  });

  it("blocks a missing required layer", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers = document.layers.filter((layer) => layer.type !== "headline");
    await expect(renderGraphic(document)).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
  });

  it("blocks low-contrast text", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.brand.themes.dark.text = "#101525";
    await expect(renderGraphic(document)).rejects.toMatchObject({
      code: "QUALITY_VALIDATION_FAILED",
    });
  });

  it("rejects unsupported template versions", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.template.version = "1.1.0";
    await expect(renderGraphic(document)).rejects.toMatchObject({
      code: "UNSUPPORTED_TEMPLATE_VERSION",
    });
  });

  it("returns structured quality details without leaking stack traces", async () => {
    const document = cloneDocument(await loadExample("quote-card"));
    document.layers = document.layers.filter((layer) => layer.type !== "attribution");
    try {
      await renderGraphic(document);
      expect.fail("Expected render to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(GlyphkilnError);
      expect((error as GlyphkilnError).details?.["issues"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "REQUIRED_LAYER_MISSING",
            severity: "error",
          }),
        ]),
      );
    }
  });
});
