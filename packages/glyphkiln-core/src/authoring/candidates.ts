import { canonicalJson } from "../cache/canonical.js";
import { GlyphkilnError, type QualityIssue } from "../domain/types.js";
import { runDocumentQualityChecks } from "../renderer/quality.js";
import {
  validateDesignDocument,
  type DesignDocument,
  type ValidationProblem,
} from "../schema/index.js";
import { checkTemplateRequirements, getTemplate } from "../templates/index.js";

import { AUTHORING_ISSUE_REGISTRY, type AuthoringIssueCode } from "./metadata.js";

export const CANDIDATE_DOCUMENT_VALIDATION_VERSION = "1.0.0" as const;
export const CANDIDATE_DOCUMENT_LIMITS = Object.freeze({
  maximumCandidates: 8,
  maximumIssuesPerCandidate: 32,
  maximumIssuePathLength: 256,
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

export type ValidCandidateDocument = {
  readonly index: number;
  readonly status: "valid";
  readonly document: DesignDocument;
  readonly canonicalDocument: string;
  readonly issues: readonly CandidateDocumentIssue[];
  readonly issuesTruncated: boolean;
};

export type InvalidCandidateDocument = {
  readonly index: number;
  readonly status: "invalid";
  readonly issues: readonly CandidateDocumentIssue[];
  readonly issuesTruncated: boolean;
};

export type CandidateDocumentValidation =
  ValidCandidateDocument | InvalidCandidateDocument;

export type CandidateDocumentSetValidation = {
  readonly version: typeof CANDIDATE_DOCUMENT_VALIDATION_VERSION;
  readonly success: boolean;
  readonly candidateCount: number;
  readonly candidates: readonly CandidateDocumentValidation[];
  readonly issues: readonly CandidateDocumentIssue[];
};

export function validateCandidateDocuments(
  input: unknown,
): CandidateDocumentSetValidation {
  if (!Array.isArray(input)) {
    return invalidCandidateSet(0);
  }
  if (
    input.length === 0 ||
    input.length > CANDIDATE_DOCUMENT_LIMITS.maximumCandidates
  ) {
    return invalidCandidateSet(input.length);
  }

  const candidates: CandidateDocumentValidation[] = [];
  for (let index = 0; index < input.length; index += 1) {
    candidates.push(validateCandidateDocument(input[index], index));
  }
  return {
    version: CANDIDATE_DOCUMENT_VALIDATION_VERSION,
    success: candidates.every((candidate) => candidate.status === "valid"),
    candidateCount: candidates.length,
    candidates,
    issues: [],
  };
}

function invalidCandidateSet(candidateCount: number): CandidateDocumentSetValidation {
  return {
    version: CANDIDATE_DOCUMENT_VALIDATION_VERSION,
    success: false,
    candidateCount,
    candidates: [],
    issues: [createIssue("DOCUMENT_SET_INVALID", "error", "candidate-set")],
  };
}

function validateCandidateDocument(
  input: unknown,
  index: number,
): CandidateDocumentValidation {
  const validation = validateDesignDocument(input);
  if (!validation.success) {
    const mapped = validation.problems.map(mapValidationProblem);
    const retained = retainIssues(mapped);
    return {
      index,
      status: "invalid",
      issues: retained,
      issuesTruncated: mapped.length > retained.length,
    };
  }

  const document = validation.data;
  let requirementIssues: QualityIssue[];
  try {
    const template = getTemplate(document);
    requirementIssues = checkTemplateRequirements(document, template);
  } catch (error) {
    if (
      error instanceof GlyphkilnError &&
      (error.code === "UNSUPPORTED_TEMPLATE_VERSION" ||
        error.code === "UNSUPPORTED_TEMPLATE_FORMAT")
    ) {
      return {
        index,
        status: "invalid",
        issues: [createIssue("TEMPLATE_INCOMPATIBLE", "error", "template")],
        issuesTruncated: false,
      };
    }
    throw error;
  }

  const documentQuality = runDocumentQualityChecks(document);
  const qualityIssues = [...requirementIssues, ...documentQuality.issues];
  const mapped = qualityIssues.map(mapQualityIssue);
  const retained = retainIssues(mapped);
  const hasErrors = qualityIssues.some((issue) => issue.severity === "error");
  if (hasErrors) {
    return {
      index,
      status: "invalid",
      issues: retainAtLeastOneError(retained, mapped),
      issuesTruncated: mapped.length > retained.length,
    };
  }

  return {
    index,
    status: "valid",
    document,
    canonicalDocument: canonicalJson(document),
    issues: retained,
    issuesTruncated: mapped.length > retained.length,
  };
}

function mapValidationProblem(problem: ValidationProblem): CandidateDocumentIssue {
  const contentField = /(?:^|\.)(?:text|value|label|trend)$/.test(problem.path);
  const code =
    contentField && problem.code === "too_small"
      ? "COPY_REQUIRED"
      : contentField && problem.code === "too_big"
        ? "COPY_TOO_LONG"
        : "DOCUMENT_STRUCTURE_INVALID";
  return createIssue(code, "error", "schema", { path: problem.path });
}

function mapQualityIssue(issue: QualityIssue): CandidateDocumentIssue {
  const code = qualityCodeToAuthoringCode(issue.code);
  return createIssue(code, issue.severity, "quality", {
    ...(issue.layerId === undefined ? {} : { layerId: issue.layerId }),
  });
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
    case "LOW_TEXT_CONTRAST":
      return "CONTRAST_INSUFFICIENT";
    case "TEXT_OUTSIDE_SAFE_AREA":
      return "SAFE_AREA_RISK";
    case "TEXT_OVERFLOW":
    case "LINGUISTIC_WORD_BROKEN":
    case "ORPHAN_LINE":
      return "TEXT_OVERFLOW";
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

function createIssue(
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

function boundPath(path: string): { path: string; pathTruncated?: true } {
  const maximum = CANDIDATE_DOCUMENT_LIMITS.maximumIssuePathLength;
  if (path.length <= maximum) return { path };
  return { path: path.slice(0, maximum), pathTruncated: true };
}

function retainIssues(
  issues: readonly CandidateDocumentIssue[],
): CandidateDocumentIssue[] {
  return issues.slice(0, CANDIDATE_DOCUMENT_LIMITS.maximumIssuesPerCandidate);
}

function retainAtLeastOneError(
  retained: CandidateDocumentIssue[],
  allIssues: readonly CandidateDocumentIssue[],
): CandidateDocumentIssue[] {
  if (retained.some((issue) => issue.severity === "error")) return retained;
  const firstError = allIssues.find((issue) => issue.severity === "error");
  if (firstError === undefined) return retained;
  if (retained.length === 0) return [firstError];
  return [...retained.slice(0, -1), firstError];
}
