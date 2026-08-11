import {
  canonicalJson,
  validateCandidateDocuments,
  type CandidateDocumentValidation,
  type DesignDocument,
  type DesignLayer,
} from "@glyphkiln/core";
import { readInertArrayDataValue, readInertArrayLength } from "@glyphkiln/core/browser";

export const AUTHORING_LOCK_CONTRACT_VERSION = "1.0.0" as const;
export const AUTHORING_LOCK_VALIDATION_VERSION = "1.0.0" as const;

export const AUTHORING_LOCK_IDS = Object.freeze([
  "copy",
  "image",
  "crop",
  "typography",
  "palette",
  "composition",
] as const);
export type AuthoringLockId = (typeof AUTHORING_LOCK_IDS)[number];

export const AUTHORING_LOCK_LIMITS = Object.freeze({
  maximumLocks: AUTHORING_LOCK_IDS.length,
  maximumIssues: AUTHORING_LOCK_IDS.length,
} as const);

export const AUTHORING_LOCK_ISSUE_CODES = Object.freeze([
  "LOCK_SELECTION_INVALID",
  "BASE_DOCUMENT_INVALID",
  "CANDIDATE_DOCUMENT_INVALID",
  "COPY_LOCK_VIOLATED",
  "IMAGE_LOCK_VIOLATED",
  "CROP_LOCK_VIOLATED",
  "TYPOGRAPHY_LOCK_VIOLATED",
  "PALETTE_LOCK_VIOLATED",
  "COMPOSITION_LOCK_VIOLATED",
] as const);
export type AuthoringLockIssueCode = (typeof AUTHORING_LOCK_ISSUE_CODES)[number];

export type AuthoringLockIssueAction =
  | "select-server-locks"
  | "repair-base-document"
  | "repair-candidate-document"
  | "restore-locked-copy"
  | "restore-locked-image"
  | "restore-locked-crop"
  | "restore-locked-typography"
  | "restore-locked-palette"
  | "restore-locked-composition";

export type AuthoringLockIssue = {
  readonly code: AuthoringLockIssueCode;
  readonly severity: "error";
  readonly source: "selection" | "base" | "candidate" | "lock";
  readonly action: AuthoringLockIssueAction;
  readonly message: string;
  readonly lock?: AuthoringLockId;
};

export type AuthoringLockValidation = {
  readonly version: typeof AUTHORING_LOCK_VALIDATION_VERSION;
  readonly authority: "proposal-only";
  readonly success: boolean;
  readonly locks: readonly AuthoringLockId[];
  readonly baseValidation: CandidateDocumentValidation;
  readonly candidateValidation: CandidateDocumentValidation;
  readonly issues: readonly AuthoringLockIssue[];
};

type LockIssueDefinition = Readonly<{
  source: AuthoringLockIssue["source"];
  action: AuthoringLockIssueAction;
  message: string;
  lock?: AuthoringLockId;
}>;

export const AUTHORING_LOCK_ISSUE_REGISTRY = Object.freeze({
  LOCK_SELECTION_INVALID: issueDefinition(
    "selection",
    "select-server-locks",
    "Use each supported server-owned lock at most once.",
  ),
  BASE_DOCUMENT_INVALID: issueDefinition(
    "base",
    "repair-base-document",
    "Choose a base document that passes Core candidate validation.",
  ),
  CANDIDATE_DOCUMENT_INVALID: issueDefinition(
    "candidate",
    "repair-candidate-document",
    "Revise the proposal until it passes Core candidate validation.",
  ),
  COPY_LOCK_VIOLATED: lockIssueDefinition(
    "copy",
    "restore-locked-copy",
    "Restore the normalized copy and its visible semantic roles from the base.",
  ),
  IMAGE_LOCK_VIOLATED: lockIssueDefinition(
    "image",
    "restore-locked-image",
    "Restore the normalized asset declarations and visible image choices from the base.",
  ),
  CROP_LOCK_VIOLATED: lockIssueDefinition(
    "crop",
    "restore-locked-crop",
    "Restore the normalized fit and focal-point choices from the base.",
  ),
  TYPOGRAPHY_LOCK_VIOLATED: lockIssueDefinition(
    "typography",
    "restore-locked-typography",
    "Restore the normalized font declarations, roles, and text controls from the base.",
  ),
  PALETTE_LOCK_VIOLATED: lockIssueDefinition(
    "palette",
    "restore-locked-palette",
    "Restore the normalized mode, brand colors, and layer colors from the base.",
  ),
  COMPOSITION_LOCK_VIOLATED: lockIssueDefinition(
    "composition",
    "restore-locked-composition",
    "Restore the normalized template, canvas, seed, brand layout, and layer structure from the base.",
  ),
} as const satisfies Record<AuthoringLockIssueCode, LockIssueDefinition>);

const LOCK_ISSUE_CODES = Object.freeze({
  copy: "COPY_LOCK_VIOLATED",
  image: "IMAGE_LOCK_VIOLATED",
  crop: "CROP_LOCK_VIOLATED",
  typography: "TYPOGRAPHY_LOCK_VIOLATED",
  palette: "PALETTE_LOCK_VIOLATED",
  composition: "COMPOSITION_LOCK_VIOLATED",
} as const satisfies Record<AuthoringLockId, AuthoringLockIssueCode>);

const LOCK_IDS = new Set<string>(AUTHORING_LOCK_IDS);

export function validateAuthoringLocks(
  baseInput: unknown,
  candidateInput: unknown,
  serverLockInput: unknown,
): AuthoringLockValidation {
  const documents = validateCandidateDocuments([baseInput, candidateInput]);
  const baseValidation = documents.candidates.at(0);
  const candidateValidation = documents.candidates.at(1);
  if (baseValidation === undefined || candidateValidation === undefined) {
    throw new Error("Core candidate validation violated its two-document contract.");
  }

  const locks = readLocks(serverLockInput);
  const issues: AuthoringLockIssue[] = [];
  if (locks === undefined) {
    issues.push(createIssue("LOCK_SELECTION_INVALID"));
  }
  if (baseValidation.status === "invalid") {
    issues.push(createIssue("BASE_DOCUMENT_INVALID"));
  }
  if (candidateValidation.status === "invalid") {
    issues.push(createIssue("CANDIDATE_DOCUMENT_INVALID"));
  }
  if (
    locks !== undefined &&
    baseValidation.status === "valid" &&
    candidateValidation.status === "valid"
  ) {
    for (const lock of locks) {
      if (!lockMatches(lock, baseValidation.document, candidateValidation.document)) {
        issues.push(createIssue(LOCK_ISSUE_CODES[lock]));
      }
    }
  }

  return {
    version: AUTHORING_LOCK_VALIDATION_VERSION,
    authority: "proposal-only",
    success: issues.length === 0,
    locks: locks ?? [],
    baseValidation,
    candidateValidation,
    issues: issues.slice(0, AUTHORING_LOCK_LIMITS.maximumIssues),
  };
}

function readLocks(input: unknown): AuthoringLockId[] | undefined {
  const inputLength = readInertArrayLength(input);
  if (
    inputLength === undefined ||
    !Array.isArray(input) ||
    inputLength > AUTHORING_LOCK_LIMITS.maximumLocks
  ) {
    return undefined;
  }
  const selected = new Set<AuthoringLockId>();
  for (let index = 0; index < inputLength; index += 1) {
    const value = readInertArrayDataValue(input, index);
    if (typeof value !== "string" || !LOCK_IDS.has(value)) return undefined;
    const lock = value as AuthoringLockId;
    if (selected.has(lock)) return undefined;
    selected.add(lock);
  }
  return AUTHORING_LOCK_IDS.filter((lock) => selected.has(lock));
}

function lockMatches(
  lock: AuthoringLockId,
  base: DesignDocument,
  candidate: DesignDocument,
): boolean {
  return (
    canonicalJson(projectLock(lock, base)) ===
    canonicalJson(projectLock(lock, candidate))
  );
}

function projectLock(lock: AuthoringLockId, document: DesignDocument): unknown {
  switch (lock) {
    case "copy":
      return projectUnorderedLayers(document, copyProjection);
    case "image":
      return {
        assets: projectUnorderedValues(document.assets),
        layers: projectUnorderedLayers(document, imageProjection),
      };
    case "crop":
      return projectUnorderedLayers(document, cropProjection);
    case "typography":
      return {
        brand: document.brand.typography,
        fonts: projectUnorderedValues(document.fonts),
        layers: projectUnorderedLayers(document, typographyProjection),
      };
    case "palette":
      return {
        mode: document.mode,
        palette: document.brand.palette,
        themes: document.brand.themes,
        prohibitedColors: projectUnorderedValues(document.brand.prohibitedColors),
        layers: projectUnorderedLayers(document, paletteProjection),
      };
    case "composition":
      return {
        schemaVersion: document.schemaVersion,
        template: document.template,
        format: document.format,
        seed: document.seed,
        brand: {
          snapshotId: document.brand.snapshotId,
          version: document.brand.version,
          name: document.brand.name,
          spacingScale: document.brand.spacingScale,
          borderRadii: document.brand.borderRadii,
          visualDensity: document.brand.visualDensity,
          preferredProceduralStyles: projectUnorderedValues(
            document.brand.preferredProceduralStyles,
          ),
          safeArea: document.brand.safeArea,
          prohibitedStyles: projectUnorderedValues(document.brand.prohibitedStyles),
        },
        layers: document.layers.map(compositionProjection),
      };
  }
}

function projectUnorderedLayers(
  document: DesignDocument,
  project: (layer: DesignLayer) => unknown[],
): unknown[] {
  return projectUnorderedValues(document.layers.flatMap(project));
}

function projectUnorderedValues(values: readonly unknown[]): unknown[] {
  return values
    .map((value) => ({ canonical: canonicalJson(value), value }))
    .sort((left, right) =>
      left.canonical < right.canonical ? -1 : left.canonical > right.canonical ? 1 : 0,
    )
    .map(({ value }) => value);
}

function copyProjection(layer: DesignLayer): unknown[] {
  const identity = layerIdentity(layer);
  switch (layer.type) {
    case "headline":
    case "subtitle":
    case "eyebrow":
    case "cta":
    case "footer":
    case "attribution":
    case "badge":
      return [{ ...identity, text: layer.text }];
    case "statistic":
      return [
        { ...identity, value: layer.value, label: layer.label, trend: layer.trend },
      ];
    case "chart":
      return [
        {
          ...identity,
          values: layer.values.map(({ label, value }) => ({ label, value })),
        },
      ];
    case "logo":
    case "product-screenshot":
    case "image":
      return [{ ...identity, alt: layer.alt }];
    default:
      return [];
  }
}

function imageProjection(layer: DesignLayer): unknown[] {
  switch (layer.type) {
    case "logo":
    case "product-screenshot":
      return [{ ...layerIdentity(layer), assetId: layer.assetId }];
    case "image":
      return [
        {
          ...layerIdentity(layer),
          assetId: layer.assetId,
          treatment: "treatment" in layer ? layer.treatment : undefined,
        },
      ];
    default:
      return [];
  }
}

function cropProjection(layer: DesignLayer): unknown[] {
  switch (layer.type) {
    case "logo":
    case "product-screenshot":
      return [{ id: layer.id, type: layer.type, fit: layer.fit }];
    case "image":
      return [
        {
          id: layer.id,
          type: layer.type,
          fit: layer.fit,
          focalPoint: "focalPoint" in layer ? layer.focalPoint : undefined,
        },
      ];
    default:
      return [];
  }
}

function typographyProjection(layer: DesignLayer): unknown[] {
  switch (layer.type) {
    case "headline":
    case "subtitle":
    case "eyebrow":
    case "cta":
    case "footer":
    case "attribution":
      return [
        {
          id: layer.id,
          type: layer.type,
          color: layer.color,
          fontFamily: layer.fontFamily,
          fontWeight: layer.fontWeight,
          fontSize: layer.fontSize,
          maxLines: layer.maxLines,
          align: layer.align,
          keepTogether: "keepTogether" in layer ? layer.keepTogether : undefined,
        },
      ];
    default:
      return [];
  }
}

function paletteProjection(layer: DesignLayer): unknown[] {
  switch (layer.type) {
    case "background":
    case "icon":
    case "badge":
    case "shape":
    case "headline":
    case "subtitle":
    case "eyebrow":
    case "cta":
    case "footer":
    case "attribution":
      return [{ id: layer.id, type: layer.type, color: layer.color }];
    case "chart":
      return [
        {
          id: layer.id,
          type: layer.type,
          colors: layer.values.map(({ color }) => color),
        },
      ];
    default:
      return [];
  }
}

function compositionProjection(layer: DesignLayer): unknown {
  const identity = layerIdentity(layer);
  switch (layer.type) {
    case "procedural-decoration":
      return {
        ...identity,
        style: layer.style,
        intensity: layer.intensity,
        density: layer.density,
        complexity: layer.complexity,
        contrast: layer.contrast,
        quietRegion: layer.quietRegion,
      };
    case "icon":
      return { ...identity, name: layer.name };
    case "shape":
      return { ...identity, shape: layer.shape, opacity: layer.opacity };
    case "chart":
      return { ...identity, chart: layer.chart };
    default:
      return identity;
  }
}

function layerIdentity(layer: DesignLayer) {
  return { id: layer.id, type: layer.type, visible: layer.visible } as const;
}

function issueDefinition(
  source: LockIssueDefinition["source"],
  action: AuthoringLockIssueAction,
  message: string,
): LockIssueDefinition {
  return Object.freeze({ source, action, message });
}

function lockIssueDefinition(
  lock: AuthoringLockId,
  action: AuthoringLockIssueAction,
  message: string,
): LockIssueDefinition {
  return Object.freeze({ source: "lock" as const, action, message, lock });
}

function createIssue(code: AuthoringLockIssueCode): AuthoringLockIssue {
  const definition = AUTHORING_LOCK_ISSUE_REGISTRY[code];
  return {
    code,
    severity: "error",
    ...definition,
  };
}
