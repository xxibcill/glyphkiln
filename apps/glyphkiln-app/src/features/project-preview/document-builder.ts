import type { DesignDocument, DesignLayer } from "@glyphkiln/core";

import type { PreviewCatalog, PreviewCatalogTemplate, PreviewFormState } from "./types";

const FONT_WEIGHTS = [400, 500, 600, 700, 800] as const;

export function createInitialPreviewForm(catalog: PreviewCatalog): PreviewFormState {
  const template = findPreferredTemplate(catalog);
  const formatId =
    template.supportedFormats.find((format) => format === "linkedin-landscape") ??
    template.supportedFormats.at(0) ??
    catalog.formats.at(0)?.id;
  const proceduralStyle =
    catalog.proceduralStyles.find((style) => style.id === "layered-waves")?.id ??
    catalog.proceduralStyles.at(0)?.id;

  if (formatId === undefined || proceduralStyle === undefined) {
    throw new Error("The preview catalog must include formats and procedural styles.");
  }

  return {
    brand: {
      name: "Glyphkiln Workshop",
      snapshotId: "brand-glyphkiln-workshop",
      version: "1.0.0",
      mode: "light",
      visualDensity: "balanced",
      primary: "#A4462A",
      secondary: "#47665C",
      accent: "#A4462A",
      paper: "#F4EEDF",
      surface: "#FBF8F0",
      ink: "#262119",
      mutedInk: "#665E51",
      darkBackground: "#262119",
      darkSurface: "#342E25",
      darkText: "#F4EEDF",
      darkMutedText: "#C8BCAA",
      safeArea: 0.07,
    },
    composition: {
      templateId: template.id,
      formatId,
      proceduralStyle,
      seed: "workshop-proof-01",
      intensity: 0.52,
      density: 0.56,
      complexity: 0.48,
      contrast: 0.42,
      quietRegion: {
        x: 0.04,
        y: 0.14,
        width: 0.72,
        height: 0.62,
      },
    },
    copy: {
      productAnnouncement: {
        eyebrow: "FROM THE GLYPHKILN",
        headline: "Turn structured direction into reproducible graphics",
        subtitle:
          "A deliberate design document becomes the same SVG, PNG, and provenance every time.",
        cta: "Inspect the proof →",
      },
      statisticCard: {
        headline: "Proofs reproduced without drift",
        value: "100%",
        label: "of this graphic is described by a versioned design document",
        trend: "Same seed · same registered font · same pixels",
      },
      quoteCard: {
        quote:
          "Good systems make the right thing repeatable without making the result feel repetitive.",
        attribution: "Glyphkiln workshop note",
      },
      articleCover: {
        eyebrow: "WORKSHOP PRACTICE",
        headline: "A practical determinism contract for graphics",
        attribution: "Glyphkiln · Field notes",
      },
      tiktokCarouselSlide: {
        mode: "narrative",
        slideNumber: "01 / 06",
        eyebrow: "GLYPHKILN / SWIPE LEDGER",
        headline: "Same brief. Different pixels?",
        subtitle: "That is not a creative problem. It is a rendering-contract problem.",
        value: "100%",
        label: "reproducible from one pinned seed, font, and renderer",
        trend: "NO MODEL · NO NETWORK · NO DRIFT",
        cta: "SWIPE TO INSPECT →",
        footer: "@glyphkiln · deterministic series",
      },
    },
    resources: {
      assetIds: [],
      fontIds: [],
    },
  };
}

export function buildPreviewDocument(
  state: PreviewFormState,
  catalog: PreviewCatalog,
): DesignDocument {
  const template = findTemplate(catalog, state.composition.templateId);
  const safeArea = state.brand.safeArea;
  const layers = buildLayers(state);

  return {
    schemaVersion: catalog.schemaVersion as DesignDocument["schemaVersion"],
    id: `preview-${state.composition.templateId}`,
    template: {
      id: state.composition.templateId,
      version: template.version,
    },
    format: state.composition.formatId,
    seed: state.composition.seed.trim(),
    mode: state.brand.mode,
    brand: {
      snapshotId: state.brand.snapshotId.trim(),
      version: state.brand.version.trim(),
      name: state.brand.name.trim(),
      palette: {
        primary: state.brand.primary,
        secondary: state.brand.secondary,
        accent: state.brand.accent,
        neutrals: [state.brand.paper, state.brand.ink],
      },
      themes: {
        light: {
          background: state.brand.paper,
          surface: state.brand.surface,
          text: state.brand.ink,
          mutedText: state.brand.mutedInk,
        },
        dark: {
          background: state.brand.darkBackground,
          surface: state.brand.darkSurface,
          text: state.brand.darkText,
          mutedText: state.brand.darkMutedText,
        },
      },
      typography: {
        headlineFamily: "Inter",
        bodyFamily: "Inter",
        monospaceFamily: "Inter",
      },
      spacingScale: [4, 8, 12, 16, 24, 32, 48, 64],
      borderRadii: [0, 12, 24],
      visualDensity: state.brand.visualDensity,
      preferredProceduralStyles: [state.composition.proceduralStyle],
      safeArea: {
        top: safeArea,
        right: safeArea,
        bottom: safeArea,
        left: safeArea,
      },
      prohibitedColors: [],
      prohibitedStyles: [],
    },
    assets: [],
    fonts: FONT_WEIGHTS.map((weight) => ({
      family: "Inter",
      weight,
      style: "normal" as const,
      sha256: catalog.developmentFontSha256,
    })),
    layers,
    metadata: {
      source: "glyphkiln-app-local-preview",
    },
  };
}

function buildLayers(state: PreviewFormState): DesignLayer[] {
  const layers: DesignLayer[] = [
    {
      id: "background",
      type: "background",
      visible: true,
    },
    {
      id: "procedure",
      type: "procedural-decoration",
      visible: true,
      style: state.composition.proceduralStyle,
      intensity: state.composition.intensity,
      density: state.composition.density,
      complexity: state.composition.complexity,
      contrast: state.composition.contrast,
      quietRegion: state.composition.quietRegion,
    },
  ];

  switch (state.composition.templateId) {
    case "product-announcement": {
      const copy = state.copy.productAnnouncement;
      addTextLayer(layers, "eyebrow", "eyebrow", copy.eyebrow);
      addTextLayer(layers, "headline", "headline", copy.headline, true);
      addTextLayer(layers, "subtitle", "subtitle", copy.subtitle);
      addTextLayer(layers, "cta", "cta", copy.cta);
      break;
    }
    case "statistic-card": {
      const copy = state.copy.statisticCard;
      addTextLayer(layers, "headline", "headline", copy.headline);
      layers.push({
        id: "statistic",
        type: "statistic",
        visible: true,
        value: copy.value.trim(),
        label: copy.label.trim(),
        ...(copy.trend.trim() === "" ? {} : { trend: copy.trend.trim() }),
      });
      break;
    }
    case "quote-card": {
      const copy = state.copy.quoteCard;
      addTextLayer(layers, "quote", "headline", copy.quote, true);
      addTextLayer(layers, "attribution", "attribution", copy.attribution, true);
      break;
    }
    case "article-cover": {
      const copy = state.copy.articleCover;
      addTextLayer(layers, "eyebrow", "eyebrow", copy.eyebrow);
      addTextLayer(layers, "headline", "headline", copy.headline, true);
      addTextLayer(layers, "attribution", "attribution", copy.attribution);
      break;
    }
    case "tiktok-carousel-slide": {
      const copy = state.copy.tiktokCarouselSlide;
      const slideNumber = copy.slideNumber.trim();
      if (slideNumber !== "") {
        layers.push({
          id: "slide-number",
          type: "badge",
          text: slideNumber,
          visible: true,
        });
      }
      addTextLayer(layers, "eyebrow", "eyebrow", copy.eyebrow);
      addTextLayer(layers, "headline", "headline", copy.headline, true);
      if (copy.mode === "metric") {
        layers.push({
          id: "carousel-statistic",
          type: "statistic",
          value: copy.value.trim(),
          label: copy.label.trim(),
          ...(copy.trend.trim() === "" ? {} : { trend: copy.trend.trim() }),
          visible: true,
        });
      } else {
        addTextLayer(layers, "subtitle", "subtitle", copy.subtitle);
      }
      addTextLayer(layers, "cta", "cta", copy.cta);
      addTextLayer(layers, "footer", "footer", copy.footer);
      break;
    }
  }

  return layers;
}

function addTextLayer(
  layers: DesignLayer[],
  id: string,
  type: "headline" | "subtitle" | "eyebrow" | "cta" | "footer" | "attribution",
  value: string,
  required = false,
): void {
  const text = value.trim();
  if (text === "" && !required) return;
  layers.push({
    id,
    type,
    visible: true,
    text,
  });
}

function findPreferredTemplate(catalog: PreviewCatalog): PreviewCatalogTemplate {
  const template =
    catalog.templates.find((candidate) => candidate.id === "product-announcement") ??
    catalog.templates.at(0);
  if (template === undefined) {
    throw new Error("The preview catalog must include at least one template.");
  }
  return template;
}

function findTemplate(
  catalog: PreviewCatalog,
  templateId: PreviewFormState["composition"]["templateId"],
): PreviewCatalogTemplate {
  const template = catalog.templates.find((candidate) => candidate.id === templateId);
  if (template === undefined) {
    throw new Error(
      `Template "${templateId}" is not available in the preview catalog.`,
    );
  }
  return template;
}
