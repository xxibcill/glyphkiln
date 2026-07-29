import { describe, expect, it } from "vitest";

import {
  GlyphkilnError,
  TEMPLATE_REGISTRY,
  createDevelopmentFont,
  renderGraphic,
  type DesignDocument,
  type DesignLayer,
} from "../src/index.js";
import { cloneDocument, loadExample } from "./helpers.js";

const unsupportedLayerCases = [
  {
    id: "unsupported-logo",
    type: "logo",
    assetId: "unused-asset",
    alt: "Logo",
    fit: "contain",
    visible: true,
  },
  {
    id: "unsupported-image",
    type: "image",
    assetId: "unused-asset",
    alt: "Image",
    fit: "cover",
    visible: true,
  },
  {
    id: "unsupported-icon",
    type: "icon",
    name: "check",
    visible: true,
  },
  {
    id: "unsupported-shape",
    type: "shape",
    shape: "circle",
    color: "#FFFFFF",
    opacity: 1,
    visible: true,
  },
  {
    id: "unsupported-chart",
    type: "chart",
    chart: "bar",
    values: [
      { label: "A", value: 1 },
      { label: "B", value: 2 },
    ],
    visible: true,
  },
  {
    id: "unsupported-footer",
    type: "footer",
    text: "Footer",
    visible: true,
  },
] satisfies readonly DesignLayer[];

async function expectQualityIssue(
  document: DesignDocument,
  code: string,
  layerId: string,
): Promise<void> {
  try {
    await renderGraphic(document);
    expect.fail("Expected render to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(GlyphkilnError);
    const issues =
      error instanceof GlyphkilnError ? error.details?.["issues"] : undefined;
    expect(Array.isArray(issues)).toBe(true);
    if (!Array.isArray(issues)) return;
    expect(
      issues.some(
        (issue) =>
          typeof issue === "object" &&
          issue !== null &&
          (issue as Record<string, unknown>)["code"] === code &&
          (issue as Record<string, unknown>)["layerId"] === layerId &&
          (issue as Record<string, unknown>)["severity"] === "error",
      ),
    ).toBe(true);
  }
}

describe("template registry", () => {
  it("contains four stable versioned templates", () => {
    expect(Object.keys(TEMPLATE_REGISTRY)).toEqual([
      "product-announcement",
      "statistic-card",
      "quote-card",
      "article-cover",
    ]);
    for (const template of Object.values(TEMPLATE_REGISTRY)) {
      expect(template.version).toBe("1.1.0");
      expect(template.requiredLayers.length).toBeGreaterThan(0);
      expect(template.supportedLayers.length).toBeGreaterThan(0);
      expect(template.supportedFormats.length).toBeGreaterThan(0);
      expect(template.constraints.headlineMaximumLines).toBeGreaterThan(0);
    }
  });

  it.each(unsupportedLayerCases)(
    "rejects the unimplemented $type layer before resource resolution",
    async (layer) => {
      const document = cloneDocument(await loadExample("product-announcement"));
      document.layers.push(structuredClone(layer));
      await expectQualityIssue(document, "UNSUPPORTED_VISIBLE_LAYER", layer.id);
    },
  );

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

  it.each(["product-announcement", "statistic-card", "quote-card", "article-cover"])(
    "renders the %s template in a landscape format",
    async (name) => {
      const document = cloneDocument(await loadExample(name));
      document.format = "linkedin-landscape";
      await expect(
        renderGraphic(document, { formats: ["svg"] }),
      ).resolves.toBeDefined();
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

  it("blocks prohibited template or procedural styles", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.brand.prohibitedStyles = ["layered-waves"];
    try {
      await renderGraphic(document);
      expect.fail("Expected prohibited style to block rendering.");
    } catch (error) {
      expect(error).toBeInstanceOf(GlyphkilnError);
      const issues =
        error instanceof GlyphkilnError ? error.details?.["issues"] : undefined;
      expect(Array.isArray(issues)).toBe(true);
      expect(
        Array.isArray(issues) &&
          issues.some(
            (issue) =>
              typeof issue === "object" &&
              issue !== null &&
              (issue as Record<string, unknown>)["code"] === "PROHIBITED_STYLE",
          ),
      ).toBe(true);
    }
  });

  it("reports a non-preferred procedural style without blocking output", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    const procedural = document.layers.find(
      (layer) => layer.type === "procedural-decoration",
    );
    if (procedural?.type === "procedural-decoration") {
      procedural.style = "recursive-subdivision";
    }
    const result = await renderGraphic(document);
    expect(result.qualityIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "NON_PREFERRED_PROCEDURAL_STYLE",
          severity: "warning",
        }),
      ]),
    );
  });

  it("uses brand surface, spacing, and visual density in pixels", async () => {
    const source = cloneDocument(await loadExample("product-announcement"));
    const baseline = await renderGraphic(source);
    for (const mutate of [
      (document: DesignDocument) => {
        document.brand.themes.dark.surface = "#202840";
      },
      (document: DesignDocument) => {
        document.brand.spacingScale[0] = 1;
      },
      (document: DesignDocument) => {
        document.brand.visualDensity = "dense";
      },
    ]) {
      const changed = cloneDocument(source);
      mutate(changed);
      const result = await renderGraphic(changed);
      expect(result.outputs[0]?.bytes).not.toEqual(baseline.outputs[0]?.bytes);
    }
  });

  it("uses the monospace brand face for compact CTA copy", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    const development = createDevelopmentFont();
    document.brand.typography.monospaceFamily = "Brand Mono";
    document.fonts.push({
      family: "Brand Mono",
      weight: 700,
      style: "normal",
      sha256: development.sha256,
    });
    const result = await renderGraphic(document, {
      fonts: [
        {
          ...development,
          family: "Brand Mono",
          weight: 700,
        },
      ],
    });
    expect(result.outputs[0]?.manifest.fonts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "Brand Mono", weight: 700 }),
      ]),
    );
  });

  it("rejects unsupported template versions", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.template.version = "9.9.9";
    await expect(renderGraphic(document)).rejects.toMatchObject({
      code: "UNSUPPORTED_TEMPLATE_VERSION",
    });
  });

  it("rejects a rendered font face that the document did not declare", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.fonts = document.fonts.filter((font) => font.weight === 400);
    await expect(renderGraphic(document)).rejects.toMatchObject({
      code: "UNDECLARED_FONT_REFERENCE",
    });
  });

  it.each(["product-announcement", "statistic-card", "quote-card", "article-cover"])(
    "rejects a visible layer that the %s template does not implement",
    async (name) => {
      const document = cloneDocument(await loadExample(name));
      document.layers.push({
        id: "unsupported-icon",
        type: "icon",
        name: "check",
        visible: true,
      });
      await expectQualityIssue(
        document,
        "UNSUPPORTED_VISIBLE_LAYER",
        "unsupported-icon",
      );
    },
  );

  it("rejects a duplicate visible semantic layer instead of ignoring it", async () => {
    const document = cloneDocument(await loadExample("article-cover"));
    const headline = document.layers.find((layer) => layer.type === "headline")!;
    document.layers.push({ ...headline, id: "second-headline" });
    await expectQualityIssue(document, "DUPLICATE_VISIBLE_LAYER", "second-headline");
  });

  it("rejects mutually exclusive announcement eyebrow and badge layers", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers.push({
      id: "announcement-badge",
      type: "badge",
      text: "BETA",
      visible: true,
    });
    await expectQualityIssue(
      document,
      "CONFLICTING_VISIBLE_LAYERS",
      "announcement-badge",
    );
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
