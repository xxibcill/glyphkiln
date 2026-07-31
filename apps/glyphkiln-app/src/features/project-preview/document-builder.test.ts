import { describe, expect, it } from "vitest";

import {
  DEVELOPMENT_FONT_SHA256,
  TEMPLATE_IDS,
  TEMPLATE_REGISTRY,
  createDevelopmentFont,
  hashCanonical,
  renderGraphic,
  validateDesignDocument,
} from "@glyphkiln/core";
import type {
  DesignDocument,
  FormatId,
  TemplateId,
  ValidationResult,
} from "@glyphkiln/core";

import { createPreviewCatalog } from "@/lib/project-preview/catalog";

import { buildPreviewDocument, createInitialPreviewForm } from "./document-builder";
import type { PreviewFormState } from "./types";

const EXPECTED_LAYERS = {
  "product-announcement": [
    ["background", "background"],
    ["procedure", "procedural-decoration"],
    ["eyebrow", "eyebrow"],
    ["headline", "headline"],
    ["subtitle", "subtitle"],
    ["cta", "cta"],
  ],
  "statistic-card": [
    ["background", "background"],
    ["procedure", "procedural-decoration"],
    ["headline", "headline"],
    ["statistic", "statistic"],
  ],
  "quote-card": [
    ["background", "background"],
    ["procedure", "procedural-decoration"],
    ["quote", "headline"],
    ["attribution", "attribution"],
  ],
  "article-cover": [
    ["background", "background"],
    ["procedure", "procedural-decoration"],
    ["eyebrow", "eyebrow"],
    ["headline", "headline"],
    ["attribution", "attribution"],
  ],
  "tiktok-carousel-slide": [
    ["background", "background"],
    ["procedure", "procedural-decoration"],
    ["slide-number", "badge"],
    ["eyebrow", "eyebrow"],
    ["headline", "headline"],
    ["subtitle", "subtitle"],
    ["cta", "cta"],
    ["footer", "footer"],
  ],
} as const satisfies Record<TemplateId, readonly (readonly [string, string])[]>;

const EXPECTED_STARTER_SVG_SHA256 = {
  "product-announcement":
    "5633eabc6c0de601b052da3688b2202b8cdf945853335c2f1356423322f09ac9",
  "statistic-card": "c5a384df3d54bcef1169f2f6f25894f0de86610d3be9e5c03a8a96011f2bf40d",
  "quote-card": "d3dfb4fb33b47c6a6a76373637018a0e2d036b5b3a9db575e1cc1548b8b9b09c",
  "article-cover": "36018946915663a84db9541e20abfccd7279434958f1344cdf22dcc5af47fd6d",
  "tiktok-carousel-slide":
    "e3f130df329dda5b2387145d1a77d737a1d7ccfa4b7f8e0aa55472b3a3e3d158",
} as const satisfies Record<TemplateId, string>;

describe("buildPreviewDocument", () => {
  it("builds a Core-valid document for every catalog template", () => {
    const catalog = createPreviewCatalog();

    for (const templateId of TEMPLATE_IDS) {
      const state = createFormForTemplate(templateId);
      const catalogTemplate = catalog.templates.find(
        (template) => template.id === templateId,
      );
      if (catalogTemplate === undefined) {
        throw new Error(`Missing catalog template "${templateId}".`);
      }

      const formatId = firstSupportedFormat(catalogTemplate.supportedFormats);
      state.composition.formatId = formatId;
      const document = buildPreviewDocument(state, catalog);

      expect(validateDesignDocument(document)).toMatchObject({ success: true });
      expect(document.template).toEqual({
        id: templateId,
        version: catalogTemplate.version,
      });
      expect(document.format).toBe(formatId);
      expect(TEMPLATE_REGISTRY[templateId].supportedFormats).toContain(document.format);
    }
  });

  it("builds the required template-specific layer set", () => {
    for (const templateId of TEMPLATE_IDS) {
      const document = buildPreviewDocument(
        createFormForTemplate(templateId),
        createPreviewCatalog(),
      );

      expect(document.layers.map((layer) => [layer.id, layer.type])).toEqual(
        EXPECTED_LAYERS[templateId],
      );

      for (const requiredType of TEMPLATE_REGISTRY[templateId].requiredLayers) {
        expect(document.layers).toContainEqual(
          expect.objectContaining({ type: requiredType, visible: true }),
        );
      }
    }
  });

  it("renders a clean starter proof for every catalog template", async () => {
    for (const templateId of TEMPLATE_IDS) {
      const result = await renderGraphic(build(createFormForTemplate(templateId)), {
        formats: ["svg"],
        fonts: [createDevelopmentFont()],
        creationTimestamp: "2026-07-30T06:00:00.000Z",
      });

      expect(
        result.qualityIssues.filter((issue) => issue.severity === "error"),
        templateId,
      ).toEqual([]);
      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0]?.format).toBe("svg");
      expect(result.outputs[0]?.manifest.output.sha256).toBe(
        EXPECTED_STARTER_SVG_SHA256[templateId],
      );
    }
  });

  it("omits blank optional copy while retaining valid required copy", () => {
    const product = createFormForTemplate("product-announcement");
    product.copy.productAnnouncement.eyebrow = " ";
    product.copy.productAnnouncement.subtitle = "";
    product.copy.productAnnouncement.cta = "\t";
    expectLayerIds(build(product)).toEqual(["background", "procedure", "headline"]);
    expectCoreValid(build(product));

    const statistic = createFormForTemplate("statistic-card");
    statistic.copy.statisticCard.headline = " ";
    statistic.copy.statisticCard.trend = "\n";
    const statisticDocument = build(statistic);
    expectLayerIds(statisticDocument).toEqual(["background", "procedure", "statistic"]);
    expect(
      statisticDocument.layers.find((layer) => layer.type === "statistic"),
    ).not.toHaveProperty("trend");
    expectCoreValid(statisticDocument);

    const article = createFormForTemplate("article-cover");
    article.copy.articleCover.eyebrow = "";
    article.copy.articleCover.attribution = " ";
    expectLayerIds(build(article)).toEqual(["background", "procedure", "headline"]);
    expectCoreValid(build(article));

    const tiktok = createFormForTemplate("tiktok-carousel-slide");
    tiktok.copy.tiktokCarouselSlide.eyebrow = " ";
    tiktok.copy.tiktokCarouselSlide.subtitle = "";
    tiktok.copy.tiktokCarouselSlide.cta = "\t";
    tiktok.copy.tiktokCarouselSlide.footer = "\n";
    expectLayerIds(build(tiktok)).toEqual([
      "background",
      "procedure",
      "slide-number",
      "headline",
    ]);
    expectCoreValid(build(tiktok));
  });

  it("builds a mutually exclusive metric mode for TikTok carousel slides", () => {
    const state = createFormForTemplate("tiktok-carousel-slide");
    state.copy.tiktokCarouselSlide.mode = "metric";
    const document = build(state);

    expectLayerIds(document).toEqual([
      "background",
      "procedure",
      "slide-number",
      "eyebrow",
      "headline",
      "carousel-statistic",
      "cta",
      "footer",
    ]);
    expect(document.layers).toContainEqual(
      expect.objectContaining({
        id: "carousel-statistic",
        type: "statistic",
        value: "100%",
      }),
    );
    expect(document.layers).not.toContainEqual(
      expect.objectContaining({ type: "subtitle" }),
    );
    expectCoreValid(document);
  });

  it.each([
    {
      name: "product-announcement headline",
      templateId: "product-announcement" as const,
      clear: (state: PreviewFormState) => {
        state.copy.productAnnouncement.headline = " ";
      },
    },
    {
      name: "statistic-card value",
      templateId: "statistic-card" as const,
      clear: (state: PreviewFormState) => {
        state.copy.statisticCard.value = "";
      },
    },
    {
      name: "statistic-card label",
      templateId: "statistic-card" as const,
      clear: (state: PreviewFormState) => {
        state.copy.statisticCard.label = "\t";
      },
    },
    {
      name: "quote-card quote",
      templateId: "quote-card" as const,
      clear: (state: PreviewFormState) => {
        state.copy.quoteCard.quote = "";
      },
    },
    {
      name: "quote-card attribution",
      templateId: "quote-card" as const,
      clear: (state: PreviewFormState) => {
        state.copy.quoteCard.attribution = " ";
      },
    },
    {
      name: "article-cover headline",
      templateId: "article-cover" as const,
      clear: (state: PreviewFormState) => {
        state.copy.articleCover.headline = "\n";
      },
    },
    {
      name: "TikTok carousel headline",
      templateId: "tiktok-carousel-slide" as const,
      clear: (state: PreviewFormState) => {
        state.copy.tiktokCarouselSlide.headline = " ";
      },
    },
    {
      name: "TikTok carousel slide number",
      templateId: "tiktok-carousel-slide" as const,
      clear: (state: PreviewFormState) => {
        state.copy.tiktokCarouselSlide.slideNumber = " ";
      },
    },
    {
      name: "TikTok carousel metric value",
      templateId: "tiktok-carousel-slide" as const,
      clear: (state: PreviewFormState) => {
        state.copy.tiktokCarouselSlide.mode = "metric";
        state.copy.tiktokCarouselSlide.value = "";
      },
    },
    {
      name: "TikTok carousel metric label",
      templateId: "tiktok-carousel-slide" as const,
      clear: (state: PreviewFormState) => {
        state.copy.tiktokCarouselSlide.mode = "metric";
        state.copy.tiktokCarouselSlide.label = "\t";
      },
    },
  ])("lets Core reject blank required copy: $name", ({ templateId, clear }) => {
    const state = createFormForTemplate(templateId);
    clear(state);

    expect(validateDesignDocument(build(state))).toMatchObject({
      success: false,
    });
  });

  it("embeds the immutable brand snapshot without asset references", () => {
    const state = createFormForTemplate("product-announcement");
    state.brand = {
      name: " Kiln & Co ",
      snapshotId: "brand-kiln-contract",
      version: "2.3.4",
      mode: "dark",
      visualDensity: "dense",
      primary: "#112233",
      secondary: "#223344",
      accent: "#334455",
      paper: "#F1F2F3",
      surface: "#E1E2E3",
      ink: "#141516",
      mutedInk: "#454647",
      darkBackground: "#070809",
      darkSurface: "#171819",
      darkText: "#FAFBFC",
      darkMutedText: "#CACBCC",
      safeArea: 0.11,
    };

    const document = build(state);

    expect(document.brand).toEqual({
      snapshotId: "brand-kiln-contract",
      version: "2.3.4",
      name: "Kiln & Co",
      palette: {
        primary: "#112233",
        secondary: "#223344",
        accent: "#334455",
        neutrals: ["#F1F2F3", "#141516"],
      },
      themes: {
        light: {
          background: "#F1F2F3",
          surface: "#E1E2E3",
          text: "#141516",
          mutedText: "#454647",
        },
        dark: {
          background: "#070809",
          surface: "#171819",
          text: "#FAFBFC",
          mutedText: "#CACBCC",
        },
      },
      typography: {
        headlineFamily: "Inter",
        bodyFamily: "Inter",
        monospaceFamily: "Inter",
      },
      spacingScale: [4, 8, 12, 16, 24, 32, 48, 64],
      borderRadii: [0, 12, 24],
      visualDensity: "dense",
      preferredProceduralStyles: ["layered-waves"],
      safeArea: {
        top: 0.11,
        right: 0.11,
        bottom: 0.11,
        left: 0.11,
      },
      prohibitedColors: [],
      prohibitedStyles: [],
    });
    expect(document.assets).toEqual([]);
  });

  it("declares every bundled Inter weight with the exact Core font hash", () => {
    const document = build(createFormForTemplate("product-announcement"));

    expect(document.fonts).toEqual(
      [400, 500, 600, 700, 800].map((weight) => ({
        family: "Inter",
        weight,
        style: "normal",
        sha256: DEVELOPMENT_FONT_SHA256,
      })),
    );
  });

  it("produces identical documents and hashes for identical input", () => {
    const state = createFormForTemplate("quote-card");

    const first = build(state);
    const second = build(structuredClone(state));

    expect(second).toEqual(first);
    expect(hashCanonical(second)).toBe(hashCanonical(first));
  });
});

function createFormForTemplate(templateId: TemplateId): PreviewFormState {
  const catalog = createPreviewCatalog();
  const template = catalog.templates.find((candidate) => candidate.id === templateId);
  if (template === undefined) {
    throw new Error(`Missing catalog template "${templateId}".`);
  }

  const state = createInitialPreviewForm(catalog);
  state.composition.templateId = templateId;
  state.composition.formatId = firstSupportedFormat(template.supportedFormats);
  return state;
}

function firstSupportedFormat(formats: readonly FormatId[]): FormatId {
  const format = formats.at(0);
  if (format === undefined) {
    throw new Error("A preview template must support at least one format.");
  }
  return format;
}

function build(state: PreviewFormState): DesignDocument {
  return buildPreviewDocument(state, createPreviewCatalog());
}

function expectLayerIds(document: DesignDocument) {
  return expect(document.layers.map((layer) => layer.id));
}

function expectCoreValid(document: DesignDocument): void {
  const validation: ValidationResult = validateDesignDocument(document);
  expect(validation).toMatchObject({ success: true });
}
