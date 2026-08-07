import type { QualityIssue } from "../domain/types.js";

import { AUTHORING_ISSUE_REGISTRY, type AuthoringIssueCode } from "./metadata.js";

export const AUTHORING_QUALITY_ISSUE_MAPPING_VERSION = "1.0.0" as const;
export const CANDIDATE_DOCUMENT_LIMITS = Object.freeze({
  maximumCandidates: 8,
  maximumIssuesPerCandidate: 32,
  maximumIssuePathLength: 256,
} as const);
export const AUTHORING_QUALITY_ISSUE_LIMITS = Object.freeze({
  maximumInputIssues: 128,
} as const);

export type CandidateDocumentIssueSource =
  "candidate-set" | "schema" | "template" | "quality";

export type CandidateDocumentIssue = {
  readonly code: AuthoringIssueCode;
  readonly severity: "warning" | "error";
  readonly source: CandidateDocumentIssueSource;
  readonly category: (typeof AUTHORING_ISSUE_REGISTRY)[AuthoringIssueCode]["category"];
  readonly action: (typeof AUTHORING_ISSUE_REGISTRY)[AuthoringIssueCode]["action"];
  readonly message: string;
  readonly path?: string;
  readonly pathTruncated?: true;
  readonly layerId?: string;
};

export type AuthoringQualityIssueMapping = {
  readonly version: typeof AUTHORING_QUALITY_ISSUE_MAPPING_VERSION;
  readonly valid: boolean;
  readonly totalIssues: number;
  readonly retainedIssues: number;
  readonly truncated: boolean;
  readonly issues: readonly CandidateDocumentIssue[];
};

type QualityIssueShape = Pick<QualityIssue, "code" | "severity"> & {
  readonly layerId?: string;
};

const QUALITY_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,79}$/;
const LAYER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function mapQualityIssuesToAuthoringIssues(
  input: unknown,
): AuthoringQualityIssueMapping {
  if (!Array.isArray(input)) {
    const issue = createCandidateDocumentIssue(
      "QUALITY_REVIEW_REQUIRED",
      "error",
      "quality",
    );
    return {
      version: AUTHORING_QUALITY_ISSUE_MAPPING_VERSION,
      valid: false,
      totalIssues: 0,
      retainedIssues: 1,
      truncated: false,
      issues: [issue],
    };
  }

  const retainedCount = Math.min(
    input.length,
    AUTHORING_QUALITY_ISSUE_LIMITS.maximumInputIssues,
  );
  const issues: CandidateDocumentIssue[] = [];
  let valid = true;
  for (let index = 0; index < retainedCount; index += 1) {
    const qualityIssue = readQualityIssue(input[index]);
    if (qualityIssue === undefined) {
      valid = false;
      issues.push(
        createCandidateDocumentIssue("QUALITY_REVIEW_REQUIRED", "error", "quality"),
      );
      continue;
    }
    issues.push(mapQualityIssueToAuthoringIssue(qualityIssue));
  }

  return {
    version: AUTHORING_QUALITY_ISSUE_MAPPING_VERSION,
    valid,
    totalIssues: input.length,
    retainedIssues: issues.length,
    truncated: input.length > retainedCount,
    issues,
  };
}

export function mapQualityIssueToAuthoringIssue(
  issue: QualityIssueShape,
): CandidateDocumentIssue {
  return createCandidateDocumentIssue(
    qualityCodeToAuthoringCode(issue.code),
    issue.severity,
    "quality",
    issue.layerId === undefined ? {} : { layerId: issue.layerId },
  );
}

export function createCandidateDocumentIssue(
  code: AuthoringIssueCode,
  severity: "warning" | "error",
  source: CandidateDocumentIssueSource,
  location: { path?: string; layerId?: string } = {},
): CandidateDocumentIssue {
  const metadata = AUTHORING_ISSUE_REGISTRY[code];
  const boundedPath =
    location.path === undefined ? undefined : boundPath(location.path);
  return {
    code,
    severity,
    source,
    category: metadata.category,
    action: metadata.action,
    message: metadata.guidance,
    ...(boundedPath ?? {}),
    ...(location.layerId === undefined ? {} : { layerId: location.layerId }),
  };
}

function readQualityIssue(value: unknown): QualityIssueShape | undefined {
  if (!isPlainRecord(value)) return undefined;
  const code = value["code"];
  const severity = value["severity"];
  const message = value["message"];
  const layerId = value["layerId"];
  if (
    typeof code !== "string" ||
    !QUALITY_CODE_PATTERN.test(code) ||
    (severity !== "warning" && severity !== "error") ||
    typeof message !== "string" ||
    (layerId !== undefined &&
      (typeof layerId !== "string" || !LAYER_ID_PATTERN.test(layerId)))
  ) {
    return undefined;
  }
  return { code, severity, ...(layerId === undefined ? {} : { layerId }) };
}

function qualityCodeToAuthoringCode(code: string): AuthoringIssueCode {
  switch (code) {
    case "REQUIRED_LAYER_MISSING":
      return "REQUIRED_ROLE_MISSING";
    case "UNSUPPORTED_VISIBLE_LAYER":
      return "UNSUPPORTED_ROLE";
    case "DUPLICATE_VISIBLE_LAYER":
      return "DUPLICATE_ROLE";
    case "CONFLICTING_VISIBLE_LAYERS":
      return "CONFLICTING_ROLES";
    case "ASSET_FIT_REQUIRED":
      return "ASSET_FIT_UNSUPPORTED";
    case "LOGO_ASPECT_RATIO":
      return "ASSET_SUITABILITY_RISK";
    case "INVALID_FOCAL_CROP_GEOMETRY":
      return "CROP_CONFIGURATION_INVALID";
    case "LOW_TEXT_CONTRAST":
      return "CONTRAST_INSUFFICIENT";
    case "TEXT_OUTSIDE_SAFE_AREA":
      return "SAFE_AREA_RISK";
    case "TEXT_OVERFLOW":
    case "LINGUISTIC_WORD_BROKEN":
      return "TEXT_OVERFLOW";
    case "ORPHAN_LINE":
      return "COPY_RHYTHM_REVIEW";
    case "BIDI_CONTROL_UNSUPPORTED":
    case "BIDI_LAYOUT_UNSUPPORTED":
    case "VERTICAL_LAYOUT_UNSUPPORTED":
      return "TEXT_LAYOUT_UNSUPPORTED";
    case "MISSING_GLYPH":
      return "MISSING_GLYPH";
    case "PROHIBITED_COLOR":
    case "PROHIBITED_STYLE":
      return "BRAND_POLICY_CONFLICT";
    case "NON_PREFERRED_PROCEDURAL_STYLE":
      return "BRAND_PREFERENCE_REVIEW";
    case "QUIET_REGION_MISALIGNED":
      return "QUIET_REGION_RISK";
    case "INVALID_DIMENSIONS":
      return "TEMPLATE_INCOMPATIBLE";
    default:
      return "QUALITY_REVIEW_REQUIRED";
  }
}

function boundPath(path: string): { path: string; pathTruncated?: true } {
  const maximum = CANDIDATE_DOCUMENT_LIMITS.maximumIssuePathLength;
  if (path.length <= maximum) return { path };
  return { path: path.slice(0, maximum), pathTruncated: true };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
