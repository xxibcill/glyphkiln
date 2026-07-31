import { describe, expect, it } from "vitest";

import {
  GlyphkilnError,
  TEMPLATE_IDS,
  TEMPLATE_REGISTRY,
  createDevelopmentFont,
  renderGraphic,
  type DesignDocument,
  type DesignLayer,
  type ResolvedAsset,
} from "../src/index.js";
import { cloneDocument, loadExample, loadExampleAssets } from "./helpers.js";

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
  assets?: readonly ResolvedAsset[],
): Promise<void> {
  try {
    await renderGraphic(document, assets === undefined ? {} : { assets });
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

async function loadLegacyTikTokCarouselDocument(): Promise<DesignDocument> {
  const document = cloneDocument(await loadExample("tiktok-carousel-slide"));
  document.template.version = "1.0.1";
  document.format = "tiktok-carousel";
  document.brand.safeArea = { top: 0.07, right: 0.16, bottom: 0.18, left: 0.07 };
  document.layers.splice(1, 0, {
    id: "kiln-witness",
    type: "procedural-decoration",
    visible: true,
    style: "recursive-subdivision",
    intensity: 0.42,
    density: 0.62,
    complexity: 0.58,
    contrast: 0.3,
    quietRegion: { x: 0.07, y: 0.105, width: 0.7, height: 0.48 },
  });
  for (const layer of document.layers) {
    if (layer.type === "badge") layer.text = "01 / 06";
    if (layer.type === "cta") layer.text = "SWIPE TO INSPECT →";
    if (layer.type === "footer") {
      layer.text = "@glyphkiln · deterministic series";
    }
  }
  document.metadata = {
    campaignId: "swipe-ledger-v1",
    slideIndex: 1,
    slideCount: 6,
    reviewed: true,
  };
  return document;
}

function svgTextYBounds(
  markup: string,
  layerId: string,
): { top: number; bottom: number } {
  const group = new RegExp(`<g id="${layerId}"[\\s\\S]*?</g>`).exec(markup)?.[0];
  if (group === undefined) throw new Error(`Missing SVG text group "${layerId}".`);

  const coordinates = [...group.matchAll(/\sd="([^"]+)"/g)].flatMap((match) =>
    [...match[1]!.matchAll(/-?(?:\d+\.?\d*|\.\d+)/g)].map((value) => Number(value[0])),
  );
  const yCoordinates = coordinates.filter((_, index) => index % 2 === 1);
  if (yCoordinates.length === 0) {
    throw new Error(`SVG text group "${layerId}" has no outline coordinates.`);
  }
  return { top: Math.min(...yCoordinates), bottom: Math.max(...yCoordinates) };
}

describe("template registry", () => {
  it("contains six stable versioned templates", () => {
    expect(Object.keys(TEMPLATE_REGISTRY)).toEqual([
      "product-announcement",
      "statistic-card",
      "quote-card",
      "article-cover",
      "tiktok-carousel-slide",
      "image-led-campaign",
    ]);
    const expectedVersions = {
      "product-announcement": "1.1.1",
      "statistic-card": "1.1.0",
      "quote-card": "1.1.0",
      "article-cover": "1.1.0",
      "tiktok-carousel-slide": "1.0.3",
      "image-led-campaign": "1.0.0",
    };
    for (const template of Object.values(TEMPLATE_REGISTRY)) {
      expect(template.version).toBe(expectedVersions[template.id]);
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

  it.each(TEMPLATE_IDS)("renders the %s template deterministically", async (name) => {
    const document = await loadExample(name);
    const assets = await loadExampleAssets(document);
    const first = await renderGraphic(document, {
      formats: ["svg"],
      creationTimestamp: "2026-01-01T00:00:00.000Z",
      assets,
    });
    const second = await renderGraphic(document, {
      formats: ["svg"],
      creationTimestamp: "2026-01-01T00:00:00.000Z",
      assets,
    });
    expect(first.outputs[0]?.bytes).toEqual(second.outputs[0]?.bytes);
    expect(first.outputs[0]?.fingerprint).toBe(second.outputs[0]?.fingerprint);
  });

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

  it("uses the organic photo format without repointing the legacy ad format", async () => {
    const document = cloneDocument(await loadExample("tiktok-carousel-slide"));
    const result = await renderGraphic(document, { formats: ["svg"] });
    expect(result.outputs[0]?.manifest.dimensions).toEqual({
      width: 1080,
      height: 1440,
    });

    document.format = "tiktok-carousel";
    await expect(renderGraphic(document, { formats: ["svg"] })).rejects.toMatchObject({
      code: "UNSUPPORTED_TEMPLATE_FORMAT",
    });

    document.template.version = "1.0.2";
    await expect(renderGraphic(document, { formats: ["svg"] })).resolves.toBeDefined();
  });

  it("renders focal image, logo, role typography, and bounded proof as one campaign", async () => {
    const document = await loadExample("image-led-campaign");
    const assets = await loadExampleAssets(document);
    const result = await renderGraphic(document, {
      formats: ["svg"],
      assets,
      creationTimestamp: "2026-07-31T00:00:00.000Z",
    });
    const markup = new TextDecoder().decode(result.outputs[0]!.bytes);

    expect(markup).toContain('<g id="campaign-image"><clipPath');
    expect(markup).toContain('id="campaign-image-treatment"');
    expect(markup).toContain('id="brand-mark"');
    expect(result.evidence).toMatchObject({
      version: "1.0.0",
      crops: [
        expect.objectContaining({
          layerId: "campaign-image",
          assetId: "kilnform-lamp-campaign",
          treatment: "dark-scrim",
          policyVersion: "focal-cover-v1",
        }),
      ],
    });
    expect(result.evidence.text.map((entry) => entry.layerId)).toEqual([
      "eyebrow",
      "headline",
      "subtitle",
      "cta",
    ]);
    expect(result.evidence.contrast).toHaveLength(4);
    expect(
      result.evidence.contrast.every(
        (entry) =>
          entry.samples.length === 25 && entry.minimumRatio >= entry.minimumRequired,
      ),
    ).toBe(true);
    expect(result.outputs[0]!.manifest.includedGenerativeAssetUsed).toBe(true);
  });

  it("blocks low composited contrast and unsupported image-led formats", async () => {
    const document = cloneDocument(await loadExample("image-led-campaign"));
    const assets = await loadExampleAssets(document);
    const image = document.layers.find((layer) => layer.type === "image");
    if (image?.type !== "image" || !("treatment" in image)) {
      throw new Error("Expected a current image treatment.");
    }
    image.treatment = "light-scrim";
    await expectQualityIssue(document, "LOW_TEXT_CONTRAST", "headline", assets);

    image.treatment = "dark-scrim";
    document.format = "instagram-story";
    await expect(renderGraphic(document, { assets })).rejects.toMatchObject({
      code: "UNSUPPORTED_TEMPLATE_FORMAT",
    });
  });

  it("rejects image-led fit policy before resolving asset bytes", async () => {
    const document = cloneDocument(await loadExample("image-led-campaign"));
    const image = document.layers.find((layer) => layer.type === "image");
    if (image?.type !== "image") throw new Error("Expected an image layer.");
    image.fit = "contain";

    await expectQualityIssue(document, "ASSET_FIT_REQUIRED", "campaign-image");
  });

  it("keeps saved TikTok 1.0.2 ad slides exactly renderable", async () => {
    const document = cloneDocument(await loadExample("tiktok-carousel-slide"));
    document.template.version = "1.0.2";
    document.format = "tiktok-carousel";
    document.brand.safeArea = { top: 0.07, right: 0.16, bottom: 0.18, left: 0.07 };

    const result = await renderGraphic(document, {
      formats: ["png"],
      creationTimestamp: "2026-07-29T10:00:00.000Z",
    });
    expect(result.outputs[0]?.manifest.output.sha256).toBe(
      "2cedc78003240b1b23553defd532190ad52742c16d1c4535a5a8e21c70eefb57",
    );
  });

  it("keeps the reviewed TikTok starter typography-first and free of visual assets", async () => {
    const document = cloneDocument(await loadExample("tiktok-carousel-slide"));
    const template = TEMPLATE_REGISTRY["tiktok-carousel-slide"];

    expect(template.constraints.layout).toContain("typography-first");
    expect(template.constraints.layout).toContain(
      "no generated illustration or SVG asset",
    );
    expect(document.assets).toEqual([]);
    expect(document.layers).not.toContainEqual(
      expect.objectContaining({ type: "procedural-decoration" }),
    );

    const result = await renderGraphic(document, { formats: ["svg"] });
    const markup = new TextDecoder().decode(result.outputs[0]?.bytes);
    expect(result.outputs[0]?.manifest.proceduralAlgorithmVersions).toEqual({});
    expect(markup).toContain("carousel-type-field");
    expect(markup).not.toContain("<image ");
  });

  it("keeps saved TikTok 1.0.1 revisions exactly renderable", async () => {
    const document = await loadLegacyTikTokCarouselDocument();
    const result = await renderGraphic(document, { formats: ["svg"] });

    expect(result.outputs[0]?.manifest.output.sha256).toBe(
      "19273db0fa957644ece47792d8d8b62b6839f59ccdb42b42e49a8f6fd52c4b3f",
    );
  });

  it("keeps TikTok interface regions clear when the brand inset is permissive", async () => {
    const document = cloneDocument(await loadExample("tiktok-carousel-slide"));
    document.brand.safeArea = {
      top: 0.07,
      right: 0.07,
      bottom: 0.07,
      left: 0.07,
    };

    const result = await renderGraphic(document, { formats: ["svg"] });
    const markup = new TextDecoder().decode(result.outputs[0]?.bytes);
    expect(result.evidence.safeArea.x).toBeCloseTo(75.6);
    expect(result.evidence.safeArea.y).toBeCloseTo(100.8);
    expect(result.evidence.safeArea.width).toBeCloseTo(853.2);
    expect(result.evidence.safeArea.height).toBeCloseTo(1_224);
    expect(markup).toContain('<rect id="slide-number-background" x="774.8" y="100.8"');
    expect(markup).toContain('<rect id="cta-rule" x="119.6" y="956.8"');
  });

  it.each([0.15, 0.16, 0.18, 0.2])(
    "keeps TikTok CTA and footer text apart at a %s App inset",
    async (inset) => {
      const document = cloneDocument(await loadExample("tiktok-carousel-slide"));
      document.brand.safeArea = {
        top: inset,
        right: inset,
        bottom: inset,
        left: inset,
      };

      const result = await renderGraphic(document, { formats: ["svg"] });
      const markup = new TextDecoder().decode(result.outputs[0]?.bytes);
      const cta = svgTextYBounds(markup, "cta");
      const footer = svgTextYBounds(markup, "footer");

      expect(cta.bottom).toBeLessThan(footer.top);
    },
  );

  it("rejects TikTok copy that cannot fit inside the effective safe area", async () => {
    const document = cloneDocument(await loadExample("tiktok-carousel-slide"));
    document.brand.safeArea = {
      top: 0.4,
      right: 0,
      bottom: 0.4,
      left: 0,
    };

    await expectQualityIssue(document, "TEXT_OUTSIDE_SAFE_AREA", "cta");
  });

  it("renders narrative or metric TikTok slides but not both at once", async () => {
    const narrative = cloneDocument(await loadExample("tiktok-carousel-slide"));
    const metric = cloneDocument(narrative);
    metric.layers = metric.layers.filter((layer) => layer.type !== "subtitle");
    metric.layers.push({
      id: "metric",
      type: "statistic",
      value: "100%",
      label: "reproducible from one pinned seed, font, and renderer",
      trend: "NO MODEL · NO NETWORK · NO DRIFT",
      visible: true,
    });

    const narrativeResult = await renderGraphic(narrative, { formats: ["svg"] });
    const metricResult = await renderGraphic(metric, { formats: ["svg"] });
    expect(metricResult.outputs[0]?.bytes).not.toEqual(
      narrativeResult.outputs[0]?.bytes,
    );
    expect(metricResult.outputs[0]?.manifest.output.sha256).toBe(
      "d8b10716091efab468ceef6e5a57d04849d9b003f0444d0ace1dc076ddc667f8",
    );

    metric.layers.push({
      id: "conflicting-subtitle",
      type: "subtitle",
      text: "This conflicts with the metric mode.",
      visible: true,
    });
    await expectQualityIssue(
      metric,
      "CONFLICTING_VISIBLE_LAYERS",
      "conflicting-subtitle",
    );
  });

  it("requires visible slide numbering on every TikTok carousel slide", async () => {
    const document = cloneDocument(await loadExample("tiktok-carousel-slide"));
    document.layers = document.layers.filter((layer) => layer.type !== "badge");

    try {
      await renderGraphic(document);
      expect.fail("Expected the missing slide number to block rendering.");
    } catch (error) {
      const issue = findQualityIssue(error, "REQUIRED_LAYER_MISSING");
      expect(error).toMatchObject({ code: "QUALITY_VALIDATION_FAILED" });
      expect(issue["details"]).toMatchObject({ layerType: "badge" });
    }
  });

  it("does not render progress chrome that can contradict the slide number", async () => {
    const document = cloneDocument(await loadExample("tiktok-carousel-slide"));
    const badge = document.layers.find((layer) => layer.type === "badge");
    if (badge?.type !== "badge") {
      throw new Error("The carousel example must include a slide-number badge.");
    }
    badge.text = "04 / 06";

    const result = await renderGraphic(document, { formats: ["svg"] });
    const markup = new TextDecoder().decode(result.outputs[0]?.bytes);
    expect(markup).toContain("slide-number");
    expect(markup).not.toContain("carousel-progress-");
  });

  it("enforces the declared TikTok headline line limit", async () => {
    const document = cloneDocument(await loadExample("tiktok-carousel-slide"));
    const headline = document.layers.find((layer) => layer.type === "headline");
    if (headline?.type !== "headline") {
      throw new Error("The carousel example must include a headline.");
    }
    headline.text = "A deliberately oversized carousel headline ".repeat(8);
    headline.maxLines = 20;

    try {
      await renderGraphic(document);
      expect.fail("Expected the oversized headline to block rendering.");
    } catch (error) {
      const issue = findQualityIssue(error, "TEXT_OVERFLOW");
      expect(issue).toMatchObject({ layerId: "headline" });
      expect(issue["details"]).toMatchObject({
        maximumLines:
          TEMPLATE_REGISTRY["tiktok-carousel-slide"].constraints.headlineMaximumLines,
      });
    }
  });

  it("blocks a Thai token that must be broken internally", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    const headline = document.layers.find((layer) => layer.type === "headline");
    if (headline?.type !== "headline") {
      throw new Error("The product example must include a headline.");
    }
    headline.text = "ก".repeat(200);

    try {
      await renderGraphic(document);
      expect.fail("Expected an internally broken Thai token to block rendering.");
    } catch (error) {
      const issue = findQualityIssue(error, "LINGUISTIC_WORD_BROKEN");
      expect(error).toMatchObject({ code: "QUALITY_VALIDATION_FAILED" });
      expect(issue).toMatchObject({
        severity: "error",
        layerId: "headline",
      });
      expect(issue["details"]).toMatchObject({
        token: "ก".repeat(200),
        segmentationPolicyVersion: "budoux-th@0.7.0",
      });
    }
  });

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

  it("blocks prohibited colors supplied by visible layers", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    const headline = document.layers.find((layer) => layer.type === "headline");
    if (headline?.type === "headline") {
      headline.color = "#FFFFFF";
    }
    document.brand.prohibitedColors = ["#FFFFFF"];
    await expectQualityIssue(document, "PROHIBITED_COLOR", "headline");
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
    const eyebrow = document.layers.find((layer) => layer.type === "eyebrow");
    if (eyebrow !== undefined) eyebrow.visible = false;
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

  it("renders supported badge text instead of an unlabeled pill", async () => {
    const source = cloneDocument(await loadExample("product-announcement"));
    source.layers = source.layers.filter((layer) => layer.type !== "eyebrow");
    const first = cloneDocument(source);
    first.layers.push({
      id: "announcement-badge",
      type: "badge",
      text: "BETA",
      visible: true,
    });
    const second = cloneDocument(source);
    second.layers.push({
      id: "announcement-badge",
      type: "badge",
      text: "LIVE",
      visible: true,
    });
    const firstOutput = await renderGraphic(first, { formats: ["svg"] });
    const secondOutput = await renderGraphic(second, { formats: ["svg"] });
    expect(firstOutput.outputs[0]?.bytes).not.toEqual(secondOutput.outputs[0]?.bytes);
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

  it.each(TEMPLATE_IDS)(
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

function findQualityIssue(error: unknown, code: string): Record<string, unknown> {
  expect(error).toBeInstanceOf(GlyphkilnError);
  const issues =
    error instanceof GlyphkilnError ? error.details?.["issues"] : undefined;
  if (!Array.isArray(issues)) {
    throw new Error("Expected structured quality issues.");
  }
  const issue: unknown = issues.find(
    (candidate: unknown) =>
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as Record<string, unknown>)["code"] === code,
  );
  if (typeof issue !== "object" || issue === null) {
    throw new Error(`Expected quality issue "${code}".`);
  }
  return issue as Record<string, unknown>;
}
