import { canonicalJson } from "@glyphkiln/core/browser";
import type { BrandSnapshot, DesignDocument, DesignLayer } from "@glyphkiln/core";

import type { BrandSnapshotDraft, ManualDraft } from "@/server/app-workflow";
import {
  buildPreviewDocument,
  createInitialPreviewForm,
} from "@/features/project-preview/document-builder";
import type {
  PreviewCatalog,
  PreviewFormState,
} from "@/features/project-preview/types";

export function buildManualDraft(
  state: PreviewFormState,
  catalog: PreviewCatalog,
): ManualDraft {
  const document = buildPreviewDocument(state, catalog);
  return {
    templateId: document.template.id,
    format: document.format,
    seed: document.seed,
    mode: document.mode,
    layers: document.layers,
    ...(state.resources.assetIds.length === 0 && state.resources.fontIds.length === 0
      ? {}
      : {
          resources: {
            assetIds: [...state.resources.assetIds],
            fontIds: [...state.resources.fontIds],
          },
        }),
  };
}

export function buildBrandSnapshotDraft(state: PreviewFormState): BrandSnapshotDraft {
  return {
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
      top: state.brand.safeArea,
      right: state.brand.safeArea,
      bottom: state.brand.safeArea,
      left: state.brand.safeArea,
    },
    prohibitedColors: [],
    prohibitedStyles: [],
  };
}

export function withBrandSnapshot(
  state: PreviewFormState,
  snapshot: BrandSnapshot,
): PreviewFormState {
  return {
    ...state,
    brand: {
      ...state.brand,
      name: snapshot.name,
      snapshotId: snapshot.snapshotId,
      version: snapshot.version,
      primary: snapshot.palette.primary,
      secondary: snapshot.palette.secondary,
      accent: snapshot.palette.accent,
      paper: snapshot.themes.light.background,
      surface: snapshot.themes.light.surface,
      ink: snapshot.themes.light.text,
      mutedInk: snapshot.themes.light.mutedText,
      darkBackground: snapshot.themes.dark.background,
      darkSurface: snapshot.themes.dark.surface,
      darkText: snapshot.themes.dark.text,
      darkMutedText: snapshot.themes.dark.mutedText,
      visualDensity: snapshot.visualDensity,
      safeArea: snapshot.safeArea.top,
    },
    composition: {
      ...state.composition,
      proceduralStyle:
        snapshot.preferredProceduralStyles[0] ?? state.composition.proceduralStyle,
    },
  };
}

export function formFromStoredDocument(
  document: DesignDocument,
  catalog: PreviewCatalog,
  previousState?: PreviewFormState,
): PreviewFormState {
  const state = previousState ?? createInitialPreviewForm(catalog);
  const procedural = document.layers.find(isProceduralLayer);
  const next = withBrandSnapshot(state, document.brand);
  const resources = storedResourceSelection(document) ?? {
    assetIds: [],
    fontIds: [],
  };

  return {
    ...next,
    resources,
    brand: { ...next.brand, mode: document.mode },
    composition: {
      ...next.composition,
      templateId: document.template.id,
      formatId: document.format,
      seed: document.seed,
      ...(procedural === undefined
        ? {}
        : {
            proceduralStyle: procedural.style,
            intensity: procedural.intensity,
            density: procedural.density,
            complexity: procedural.complexity,
            contrast: procedural.contrast,
            quietRegion: { ...procedural.quietRegion },
          }),
    },
    copy: {
      productAnnouncement: {
        eyebrow: textFor(document.layers, "eyebrow"),
        headline: textFor(document.layers, "headline"),
        subtitle: textFor(document.layers, "subtitle"),
        cta: textFor(document.layers, "cta"),
      },
      statisticCard: {
        headline: textFor(document.layers, "headline"),
        value: statisticFor(document.layers)?.value ?? "",
        label: statisticFor(document.layers)?.label ?? "",
        trend: statisticFor(document.layers)?.trend ?? "",
      },
      quoteCard: {
        quote: textFor(document.layers, "quote"),
        attribution: textFor(document.layers, "attribution"),
      },
      articleCover: {
        eyebrow: textFor(document.layers, "eyebrow"),
        headline: textFor(document.layers, "headline"),
        attribution: textFor(document.layers, "attribution"),
      },
      tiktokCarouselSlide: {
        mode: statisticFor(document.layers) === undefined ? "narrative" : "metric",
        slideNumber: badgeTextFor(document.layers, "slide-number"),
        eyebrow: textFor(document.layers, "eyebrow"),
        headline: textFor(document.layers, "headline"),
        subtitle: textFor(document.layers, "subtitle"),
        value: statisticFor(document.layers)?.value ?? "",
        label: statisticFor(document.layers)?.label ?? "",
        trend: statisticFor(document.layers)?.trend ?? "",
        cta: textFor(document.layers, "cta"),
        footer: textFor(document.layers, "footer"),
      },
    },
  };
}

export function manualDraftKey(draft: ManualDraft): string {
  return canonicalJson(draft);
}

export function documentMatchesManualInput(
  document: DesignDocument,
  brand: BrandSnapshot,
  draft: ManualDraft,
  developmentFontSha256: string,
): boolean {
  return (
    document.template.id === draft.templateId &&
    document.format === draft.format &&
    document.seed === draft.seed &&
    document.mode === draft.mode &&
    canonicalJson(document.brand) === canonicalJson(brand) &&
    canonicalJson(document.layers) === canonicalJson(draft.layers) &&
    documentMatchesResourceSelection(document, draft, developmentFontSha256) &&
    document.metadata?.source === "glyphkiln-app-manual"
  );
}

function documentMatchesResourceSelection(
  document: DesignDocument,
  draft: ManualDraft,
  developmentFontSha256: string,
): boolean {
  const stored = storedResourceSelection(document);
  if (stored === undefined) return false;
  const submitted = draft.resources ?? { assetIds: [], fontIds: [] };
  if (
    canonicalJson(stored.assetIds) !== canonicalJson([...submitted.assetIds].sort()) ||
    canonicalJson(stored.fontIds) !== canonicalJson([...submitted.fontIds].sort()) ||
    canonicalJson(document.assets.map((asset) => asset.id).sort()) !==
      canonicalJson([...submitted.assetIds].sort())
  ) {
    return false;
  }

  const versions = resourceVersionRecords(document);
  if (versions === undefined) return false;
  return (
    versions.fonts.every((version) =>
      document.fonts.some((font) => fontMatchesVersion(font, version)),
    ) &&
    document.fonts.every(
      (font) =>
        isDevelopmentFont(font, developmentFontSha256) ||
        versions.fonts.some((version) => fontMatchesVersion(font, version)),
    )
  );
}

function fontMatchesVersion(
  font: DesignDocument["fonts"][number],
  version: ResourceVersionRecord,
): boolean {
  return (
    font.family === version.family &&
    font.weight === version.weight &&
    font.style === version.style &&
    font.sha256 === version.sha256
  );
}

function isDevelopmentFont(
  font: DesignDocument["fonts"][number],
  developmentFontSha256: string,
): boolean {
  return (
    font.family === "Inter" &&
    font.style === "normal" &&
    font.sha256 === developmentFontSha256
  );
}

function storedResourceSelection(
  document: DesignDocument,
): PreviewFormState["resources"] | undefined {
  const versions = resourceVersionRecords(document);
  if (versions === undefined) return undefined;
  return {
    assetIds: versions.assets.map((version) => version.id).sort(),
    fontIds: versions.fonts.map((version) => version.id).sort(),
  };
}

type ResourceVersionRecord = Record<string, unknown> & {
  id: string;
  family?: string;
  weight?: number;
  style?: string;
  sha256?: string;
};

function resourceVersionRecords(document: DesignDocument):
  | {
      assets: ResourceVersionRecord[];
      fonts: ResourceVersionRecord[];
    }
  | undefined {
  const resourceVersions = document.metadata?.resourceVersions;
  if (resourceVersions === undefined) return { assets: [], fonts: [] };
  if (!isRecord(resourceVersions)) return undefined;
  const { assets, fonts } = resourceVersions;
  if (!Array.isArray(assets) || !Array.isArray(fonts)) return undefined;
  const assetRecords: ResourceVersionRecord[] = [];
  for (const asset of assets) {
    if (!hasResourceId(asset)) return undefined;
    assetRecords.push(asset);
  }
  const fontRecords: ResourceVersionRecord[] = [];
  for (const font of fonts) {
    if (!hasResourceId(font)) return undefined;
    fontRecords.push(font);
  }
  return { assets: assetRecords, fonts: fontRecords };
}

function hasResourceId(value: unknown): value is ResourceVersionRecord {
  return isRecord(value) && typeof value.id === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProceduralLayer(
  layer: DesignLayer,
): layer is Extract<DesignLayer, { type: "procedural-decoration" }> {
  return layer.type === "procedural-decoration";
}

function textFor(layers: DesignLayer[], id: string): string {
  const layer = layers.find(
    (
      candidate,
    ): candidate is Extract<
      DesignLayer,
      {
        type: "headline" | "subtitle" | "eyebrow" | "cta" | "footer" | "attribution";
      }
    > => candidate.id === id && "text" in candidate,
  );
  return layer?.text ?? "";
}

function badgeTextFor(layers: DesignLayer[], id: string): string {
  const layer = layers.find(
    (candidate): candidate is Extract<DesignLayer, { type: "badge" }> =>
      candidate.id === id && candidate.type === "badge",
  );
  return layer?.text ?? "";
}

function statisticFor(
  layers: DesignLayer[],
): Extract<DesignLayer, { type: "statistic" }> | undefined {
  return layers.find(
    (candidate): candidate is Extract<DesignLayer, { type: "statistic" }> =>
      candidate.type === "statistic",
  );
}
