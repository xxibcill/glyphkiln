import {
  DESIGN_DOCUMENT_VERSION,
  DEVELOPMENT_FONT_SHA256,
  TEMPLATE_REGISTRY,
  validateDesignDocument,
} from "@glyphkiln/core";
import type {
  BrandSnapshot,
  AssetDeclaration,
  DesignDocument,
  FontDeclaration,
  ValidationProblem,
} from "@glyphkiln/core";

import { compareCanonicalStrings } from "@/server/deterministic-order";

import type { ManualDraft } from "./contracts";

const DEVELOPMENT_FONT_WEIGHTS = [400, 500, 600, 700, 800] as const;

export type DocumentConstruction =
  { ok: true; document: DesignDocument } | { ok: false; problems: ValidationProblem[] };

type ManualResourceLicense = {
  status: "owned" | "licensed" | "public-domain" | "unknown";
  identifier?: string;
  name?: string;
  reference?: string;
  notes?: string;
};

export type ManualResourceVersions = {
  assets: {
    id: string;
    sha256: string;
    origin: AssetDeclaration["origin"];
    license: ManualResourceLicense;
  }[];
  fonts: {
    id: string;
    family: string;
    weight: number;
    style: "normal" | "italic";
    sha256?: string;
    origin: AssetDeclaration["origin"];
    license: ManualResourceLicense;
  }[];
};

export function constructManualDocument(input: {
  documentId: string;
  brand: BrandSnapshot;
  draft: ManualDraft;
  assets?: readonly AssetDeclaration[];
  fonts?: readonly FontDeclaration[];
  resourceVersions?: ManualResourceVersions;
}): DocumentConstruction {
  const template = TEMPLATE_REGISTRY[input.draft.templateId];
  const assets = [...(input.assets ?? [])].sort((left, right) =>
    compareCanonicalStrings(left.id, right.id),
  );
  const selectedFonts = [...(input.fonts ?? [])].sort(compareFonts);
  const selectedFontKeys = new Set(selectedFonts.map(fontKey));
  const fonts = [
    ...developmentFontDeclarations().filter(
      (font) => !selectedFontKeys.has(fontKey(font)),
    ),
    ...selectedFonts,
  ];
  const resourceVersions =
    input.resourceVersions ?? fallbackResourceVersions(assets, selectedFonts);
  const candidate = {
    schemaVersion: DESIGN_DOCUMENT_VERSION,
    id: input.documentId,
    template: {
      id: template.id,
      version: template.version,
    },
    format: input.draft.format,
    seed: input.draft.seed,
    mode: input.draft.mode,
    brand: input.brand,
    assets,
    fonts,
    layers: input.draft.layers,
    metadata: {
      source: "glyphkiln-app-manual",
      ...(resourceVersions.assets.length === 0 && resourceVersions.fonts.length === 0
        ? {}
        : {
            resourceVersions: {
              assets: resourceVersions.assets.map(copyAssetResourceVersion),
              fonts: resourceVersions.fonts.map(copyFontResourceVersion),
            },
          }),
    },
  };
  const validation = validateDesignDocument(candidate);
  return validation.success
    ? { ok: true, document: validation.data }
    : { ok: false, problems: validation.problems };
}

function fallbackResourceVersions(
  assets: readonly AssetDeclaration[],
  fonts: readonly FontDeclaration[],
): ManualResourceVersions {
  return {
    assets: assets.map((asset) => ({
      id: asset.id,
      sha256: asset.sha256,
      origin: { ...asset.origin },
      license: { status: "unknown" },
    })),
    fonts: fonts.map((font) => ({
      id: [
        font.family,
        font.weight.toString(),
        font.style,
        font.sha256 ?? "unversioned",
      ].join(":"),
      family: font.family,
      weight: font.weight,
      style: font.style,
      ...(font.sha256 === undefined ? {} : { sha256: font.sha256 }),
      origin: { kind: "unknown" },
      license: { status: "unknown" },
    })),
  };
}

function copyAssetResourceVersion(
  version: ManualResourceVersions["assets"][number],
): ManualResourceVersions["assets"][number] {
  return {
    ...version,
    origin: { ...version.origin },
    license: { ...version.license },
  };
}

function copyFontResourceVersion(
  version: ManualResourceVersions["fonts"][number],
): ManualResourceVersions["fonts"][number] {
  return {
    ...version,
    origin: { ...version.origin },
    license: { ...version.license },
  };
}

function compareFonts(left: FontDeclaration, right: FontDeclaration): number {
  return compareCanonicalStrings(fontKey(left), fontKey(right));
}

function fontKey(font: FontDeclaration): string {
  return [font.family, font.weight.toString(), font.style].join("\u0000");
}

function developmentFontDeclarations(): FontDeclaration[] {
  return DEVELOPMENT_FONT_WEIGHTS.map((weight) => ({
    family: "Inter",
    weight,
    style: "normal",
    sha256: DEVELOPMENT_FONT_SHA256,
  }));
}
