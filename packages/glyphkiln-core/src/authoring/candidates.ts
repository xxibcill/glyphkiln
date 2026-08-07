import { canonicalJson } from "../cache/canonical.js";
import { GlyphkilnError, type QualityIssue } from "../domain/types.js";
import { runDocumentQualityChecks } from "../renderer/quality.js";
import {
  validateDesignDocument,
  type DesignDocument,
  type ValidationProblem,
} from "../schema/index.js";
import { checkTemplateRequirements, getTemplate } from "../templates/index.js";

import {
  CANDIDATE_DOCUMENT_LIMITS,
  createCandidateDocumentIssue,
  mapQualityIssueToAuthoringIssue,
  type CandidateDocumentIssue,
} from "./issues.js";

export const CANDIDATE_DOCUMENT_VALIDATION_VERSION = "1.0.0" as const;
export { CANDIDATE_DOCUMENT_LIMITS } from "./issues.js";
export type { CandidateDocumentIssue, CandidateDocumentIssueSource } from "./issues.js";

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
    issues: [
      createCandidateDocumentIssue("DOCUMENT_SET_INVALID", "error", "candidate-set"),
    ],
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
        issues: [
          createCandidateDocumentIssue("TEMPLATE_INCOMPATIBLE", "error", "template"),
        ],
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
  return createCandidateDocumentIssue(code, "error", "schema", {
    path: problem.path,
  });
}

function mapQualityIssue(issue: QualityIssue): CandidateDocumentIssue {
  return mapQualityIssueToAuthoringIssue(issue);
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
