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

  return {
    ...next,
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
): boolean {
  return (
    document.template.id === draft.templateId &&
    document.format === draft.format &&
    document.seed === draft.seed &&
    document.mode === draft.mode &&
    canonicalJson(document.brand) === canonicalJson(brand) &&
    canonicalJson(document.layers) === canonicalJson(draft.layers) &&
    document.assets.length === 0 &&
    document.metadata?.source === "glyphkiln-app-manual"
  );
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
        type: "headline" | "subtitle" | "eyebrow" | "cta" | "attribution";
      }
    > => candidate.id === id && "text" in candidate,
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
