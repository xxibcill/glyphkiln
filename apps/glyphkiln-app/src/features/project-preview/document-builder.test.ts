import { describe, expect, it } from "vitest";

import {
  DEVELOPMENT_FONT_SHA256,
  TEMPLATE_REGISTRY,
  createDevelopmentFont,
  hashCanonical,
  renderGraphic,
  validateDesignDocument,
} from "@glyphkiln/core";
import type { DesignDocument, FormatId, ValidationResult } from "@glyphkiln/core";

import {
  PREVIEW_TEMPLATE_IDS,
  createPreviewCatalog,
} from "@/lib/project-preview/catalog";

import { buildPreviewDocument, createInitialPreviewForm } from "./document-builder";
import type {
  EditorSelectableResource,
  PreviewFormState,
  PreviewTemplateId,
} from "./types";

const EXPECTED_LAYERS = {
  "testimonial-evidence": [
    ["background", "background"],
    ["eyebrow", "eyebrow"],
    ["headline", "headline"],
    ["attribution", "attribution"],
    ["subtitle", "subtitle"],
    ["cta", "cta"],
    ["footer", "footer"],
  ],
  comparison: [
    ["background", "background"],
    ["eyebrow", "eyebrow"],
    ["headline", "headline"],
    ["cta", "cta"],
    ["footer", "footer"],
    ["comparison", "comparison-table"],
  ],
  "problem-solution": [
    ["background", "background"],
    ["eyebrow", "eyebrow"],
    ["headline", "headline"],
    ["cta", "cta"],
    ["footer", "footer"],
    ["problem-solution", "problem-solution"],
  ],
  "offer-urgency": [
    ["background", "background"],
    ["eyebrow", "eyebrow"],
    ["headline", "headline"],
    ["badge", "badge"],
    ["subtitle", "subtitle"],
    ["cta", "cta"],
    ["footer", "footer"],
  ],

  "benefit-proof": [
    ["background", "background"],
    ["eyebrow", "eyebrow"],
    ["headline", "headline"],
    ["benefits", "benefit-list"],
    ["cta", "cta"],
    ["footer", "footer"],
  ],
  "product-announcement": [
    ["background", "background"],
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
    ["slide-number", "badge"],
    ["eyebrow", "eyebrow"],
    ["headline", "headline"],
    ["subtitle", "subtitle"],
    ["cta", "cta"],
    ["footer", "footer"],
  ],
} as const satisfies Record<
  (typeof PREVIEW_TEMPLATE_IDS)[number],
  readonly (readonly [string, string])[]
>;

const EXPECTED_STARTER_SVG_SHA256 = {
  "testimonial-evidence":
    "c93e7276b4aaad60ae64ae56c7259525ba054d971bc04e6b641e678da774e0b4",
  comparison: "2b33ffc2ba14941eeacea016b7e0e94b9390544e32efd3607ab67cf4fa450dc7",
  "problem-solution":
    "9bfa415cabc2c9713fb14b29c679b318a356de243192d42270e8badbdbab6371",
  "offer-urgency": "4a53862e705cc2a818256e0807f4df13c7266d6b4c04b92e9c74976361695f02",

  "benefit-proof": "2d2f7aba7eb2b86abe1b8632c2cfe4983b882f61dd88569874c4d53a750acc80",
  "product-announcement":
    "4da22629df58933338aa910ece11c861e179a644200650e5fd2e49360b780830",
  "statistic-card": "c5a384df3d54bcef1169f2f6f25894f0de86610d3be9e5c03a8a96011f2bf40d",
  "quote-card": "d3dfb4fb33b47c6a6a76373637018a0e2d036b5b3a9db575e1cc1548b8b9b09c",
  "article-cover": "36018946915663a84db9541e20abfccd7279434958f1344cdf22dcc5af47fd6d",
  "tiktok-carousel-slide":
    "172fd0e43992308fbe364c9a544f67ed46ed25e7659a8d6d1c604597e2bacf96",
} as const satisfies Record<(typeof PREVIEW_TEMPLATE_IDS)[number], string>;

describe("buildPreviewDocument", () => {
  it("adds an optional admitted carousel image with its exact focal intent", () => {
    const catalog = createPreviewCatalog({ resourceBacked: true });
    const state = createInitialPreviewForm(catalog);
    state.composition.templateId = "tiktok-carousel-slide";
    state.composition.formatId = "tiktok-photo-carousel";
    state.composition.imageFocalPoint = { x: 0.72, y: 0.4 };
    state.resources = {
      assetIds: ["product"],
      fontIds: [],
      imageAssetId: "product",
      imageAlt: "A ceramic lamp.",
    };
    const document = buildPreviewDocument(state, catalog, [
      rasterResource("product", "a"),
    ]);
    expect(document.template.version).toBe("1.1.1");
    expect(validateDesignDocument(document).success).toBe(true);
    expect(document.layers).toContainEqual(
      expect.objectContaining({
        type: "image",
        assetId: "product",
        alt: "A ceramic lamp.",
        focalPoint: { x: 0.72, y: 0.4 },
        fit: "cover",
      }),
    );
    expect(document.layers.some((layer) => layer.type === "logo")).toBe(false);
    delete state.resources.imageAssetId;
    state.resources.assetIds = [];
    const typographySlide = buildPreviewDocument(state, catalog, []);
    expect(typographySlide.layers.some((layer) => layer.type === "image")).toBe(false);
  });

  it("orders selected assets by deterministic code units", () => {
    const catalog = createPreviewCatalog({ resourceBacked: true });
    const state = createInitialPreviewForm(catalog);
    state.resources.assetIds = ["asset-a", "asset-Z"];

    const document = buildPreviewDocument(state, catalog, [
      rasterResource("asset-a", "a"),
      rasterResource("asset-Z", "b"),
    ]);

    expect(document.assets.map((asset) => asset.id)).toEqual(["asset-Z", "asset-a"]);
  });

  it("builds a Core-valid image-led draft from explicit resource roles", () => {
    const catalog = createPreviewCatalog({ resourceBacked: true });
    const state = createInitialPreviewForm(catalog);
    state.composition.templateId = "image-led-campaign";
    state.composition.formatId = "instagram-portrait";
    state.composition.imageFocalPoint = { x: 0.68, y: 0.42 };
    state.composition.imageTreatment = "dark-scrim";
    state.resources = {
      assetIds: ["campaign-image", "brand-logo"],
      fontIds: [],
      imageAssetId: "campaign-image",
      logoAssetId: "brand-logo",
      imageAlt: "A cobalt ceramic lamp on a warm plaster pedestal.",
      logoAlt: "Kilnform arch mark.",
    };
    const resources: EditorSelectableResource[] = [
      rasterResource("campaign-image", "a"),
      rasterResource("brand-logo", "b"),
    ];

    const document = buildPreviewDocument(state, catalog, resources);

    expect(validateDesignDocument(document)).toMatchObject({ success: true });
    expect(document.assets.map((asset) => asset.id)).toEqual([
      "brand-logo",
      "campaign-image",
    ]);
    expect(document.layers).toContainEqual(
      expect.objectContaining({
        type: "image",
        assetId: "campaign-image",
        focalPoint: { x: 0.68, y: 0.42 },
        treatment: "dark-scrim",
        alt: "A cobalt ceramic lamp on a warm plaster pedestal.",
      }),
    );
    expect(document.layers).toContainEqual(
      expect.objectContaining({
        type: "logo",
        assetId: "brand-logo",
        alt: "Kilnform arch mark.",
      }),
    );
  });

  it("binds admitted font declarations to explicit brand typography roles", () => {
    const catalog = createPreviewCatalog({ resourceBacked: true });
    const state = createInitialPreviewForm(catalog);
    state.brand.typography = {
      ...state.brand.typography,
      headlineFamily: "Kiln Sans",
      rolesEnabled: true,
      display: { weight: 700, lineHeight: 0.92, tracking: -0.01 },
    };
    state.resources.fontIds = ["font-kiln-sans-700"];
    const resources: EditorSelectableResource[] = [
      {
        id: "font-kiln-sans-700",
        kind: "font",
        mediaType: "font/ttf",
        contentHash: "c".repeat(64),
        family: "Kiln Sans",
        weight: 700,
        style: "normal",
        origin: { kind: "user-upload" },
        license: { status: "owned" },
      },
    ];

    const document = buildPreviewDocument(state, catalog, resources);

    expect(validateDesignDocument(document)).toMatchObject({ success: true });
    expect(document.brand.typography).toMatchObject({
      roles: {
        display: {
          family: "Kiln Sans",
          weight: 700,
          lineHeight: 0.92,
          tracking: -0.01,
        },
      },
    });
    expect(document.fonts).toContainEqual({
      family: "Kiln Sans",
      weight: 700,
      style: "normal",
      sha256: "c".repeat(64),
    });
  });

  it("builds a Core-valid document for every catalog template", () => {
    const catalog = createPreviewCatalog();

    for (const templateId of PREVIEW_TEMPLATE_IDS) {
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
    for (const templateId of PREVIEW_TEMPLATE_IDS) {
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
    for (const templateId of PREVIEW_TEMPLATE_IDS) {
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
      expect
        .soft(result.outputs[0]?.manifest.output.sha256, templateId)
        .toBe(EXPECTED_STARTER_SVG_SHA256[templateId]);
    }
  }, 30_000);

  it("omits blank optional copy while retaining valid required copy", () => {
    const product = createFormForTemplate("product-announcement");
    product.copy.productAnnouncement.eyebrow = " ";
    product.copy.productAnnouncement.subtitle = "";
    product.copy.productAnnouncement.cta = "\t";
    expectLayerIds(build(product)).toEqual(["background", "headline"]);
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
    expectLayerIds(build(tiktok)).toEqual(["background", "slide-number", "headline"]);
    expectCoreValid(build(tiktok));
  });

  it("builds a mutually exclusive metric mode for TikTok carousel slides", () => {
    const state = createFormForTemplate("tiktok-carousel-slide");
    state.copy.tiktokCarouselSlide.mode = "metric";
    const document = build(state);

    expectLayerIds(document).toEqual([
      "background",
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

  it("starts the TikTok carousel as a seven-slide typography-first sequence", () => {
    const state = createFormForTemplate("tiktok-carousel-slide");

    expect(state.composition.formatId).toBe("tiktok-photo-carousel");
    expect(state.copy.tiktokCarouselSlide.slideNumber).toBe("01 / 07");
    expect(state.copy.tiktokCarouselSlide.cta).toBe("SWIPE FOR THE PROOF →");
    expect(state.copy.tiktokCarouselSlide.footer).toBe(
      "@glyphkiln · typography-first series",
    );

    const document = build(state);
    expect(document.layers).not.toContainEqual(
      expect.objectContaining({ type: "procedural-decoration" }),
    );
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
      typography: state.brand.typography,
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

function rasterResource(id: string, hashCharacter: string): EditorSelectableResource {
  return {
    id,
    kind: "raster-asset",
    mediaType: "image/png",
    contentHash: hashCharacter.repeat(64),
    width: 1_200,
    height: 800,
    origin: { kind: "user-upload" },
    license: { status: "owned" },
  };
}

function createFormForTemplate(templateId: PreviewTemplateId): PreviewFormState {
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
