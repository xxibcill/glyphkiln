import {
  validateCandidateDocuments,
  type CandidateDocumentValidation,
} from "@glyphkiln/core";

import { containsControlCharacter } from "@/server/resources/inert-text";

import {
  readExactInertDataRecord,
  readInertArrayDataValue,
  readInertArrayLength,
} from "@glyphkiln/core/browser";

export const BRIEF_INTERPRETER_RESPONSE_CONTRACT_VERSION = "1.0.0" as const;
export const BRIEF_INTERPRETER_RESPONSE_VALIDATION_VERSION = "1.0.0" as const;
export const BRIEF_INTERPRETER_RESPONSE_LIMITS = Object.freeze({
  minimumCandidates: 3,
  maximumCandidates: 4,
  maximumRationaleCharacters: 800,
  maximumResponseIssues: 3,
  maximumEnvelopeIssuesPerCandidate: 1,
} as const);

export const BRIEF_INTERPRETER_RESPONSE_ISSUE_CODES = Object.freeze([
  "RESPONSE_SHAPE_INVALID",
  "RESPONSE_VERSION_UNSUPPORTED",
  "CANDIDATE_COUNT_INVALID",
  "CANDIDATE_SHAPE_INVALID",
  "CANDIDATE_RATIONALE_INVALID",
  "DUPLICATE_NORMALIZED_DOCUMENT",
] as const);
export type BriefInterpreterResponseIssueCode =
  (typeof BRIEF_INTERPRETER_RESPONSE_ISSUE_CODES)[number];

export type BriefInterpreterResponseIssue = {
  readonly code: BriefInterpreterResponseIssueCode;
  readonly severity: "error";
  readonly source: "response" | "candidate";
  readonly message: string;
  readonly candidateIndex?: number;
  readonly relatedCandidateIndex?: number;
};

export type ModelSuggestionRationale = {
  readonly kind: "model-suggestion";
  readonly text: string;
};

export type EvaluatedBriefInterpreterCandidate = {
  readonly index: number;
  readonly status: "evaluated";
  readonly rationale: ModelSuggestionRationale;
  readonly validation: CandidateDocumentValidation;
};

export type RejectedBriefInterpreterCandidate = {
  readonly index: number;
  readonly status: "rejected";
  readonly issues: readonly [BriefInterpreterResponseIssue];
};

export type BriefInterpreterCandidate =
  EvaluatedBriefInterpreterCandidate | RejectedBriefInterpreterCandidate;

export type BriefInterpreterResponseValidation = {
  readonly version: typeof BRIEF_INTERPRETER_RESPONSE_VALIDATION_VERSION;
  readonly authority: "proposal-only";
  readonly success: boolean;
  readonly candidateCount: number;
  readonly candidates: readonly BriefInterpreterCandidate[];
  readonly issues: readonly BriefInterpreterResponseIssue[];
};

type ParsedCandidate = {
  readonly index: number;
  readonly document: unknown;
  readonly rationale: string;
};

const RESPONSE_KEYS = new Set(["contractVersion", "candidates"]);
const CANDIDATE_KEYS = new Set(["document", "rationale"]);

const ISSUE_MESSAGES = Object.freeze({
  RESPONSE_SHAPE_INVALID:
    "Return a strict object containing only contractVersion and candidates.",
  RESPONSE_VERSION_UNSUPPORTED:
    "Use the supported BriefInterpreter response contract version.",
  CANDIDATE_COUNT_INVALID: "Return three or four candidate proposals.",
  CANDIDATE_SHAPE_INVALID:
    "Return each candidate as an object containing only document and rationale.",
  CANDIDATE_RATIONALE_INVALID:
    "Provide one non-empty single-paragraph rationale within the character limit.",
  DUPLICATE_NORMALIZED_DOCUMENT:
    "Revise this candidate so its normalized document differs from the earlier candidate.",
} as const satisfies Record<BriefInterpreterResponseIssueCode, string>);

export function validateBriefInterpreterResponse(
  input: unknown,
): BriefInterpreterResponseValidation {
  const response = readExactInertDataRecord(input, RESPONSE_KEYS);
  if (response === undefined) {
    return invalidResponse(0, "RESPONSE_SHAPE_INVALID");
  }
  if (response.contractVersion !== BRIEF_INTERPRETER_RESPONSE_CONTRACT_VERSION) {
    return invalidResponse(0, "RESPONSE_VERSION_UNSUPPORTED");
  }
  const rawCandidates = response.candidates;
  const candidateCount = readInertArrayLength(rawCandidates);
  if (candidateCount === undefined || !Array.isArray(rawCandidates)) {
    return invalidResponse(0, "RESPONSE_SHAPE_INVALID");
  }
  if (
    candidateCount < BRIEF_INTERPRETER_RESPONSE_LIMITS.minimumCandidates ||
    candidateCount > BRIEF_INTERPRETER_RESPONSE_LIMITS.maximumCandidates
  ) {
    return invalidResponse(candidateCount, "CANDIDATE_COUNT_INVALID");
  }

  const parsedCandidates: ParsedCandidate[] = [];
  const candidateByIndex = new Map<number, BriefInterpreterCandidate>();
  for (let index = 0; index < candidateCount; index += 1) {
    const parsed = readCandidate(readInertArrayDataValue(rawCandidates, index), index);
    if ("issue" in parsed) {
      candidateByIndex.set(index, {
        index,
        status: "rejected",
        issues: [parsed.issue],
      });
      continue;
    }
    parsedCandidates.push(parsed);
  }

  if (parsedCandidates.length > 0) {
    const documentValidation = validateCandidateDocuments(
      parsedCandidates.map((candidate) => candidate.document),
    );
    for (let index = 0; index < parsedCandidates.length; index += 1) {
      const parsed = parsedCandidates.at(index);
      const validation = documentValidation.candidates.at(index);
      if (parsed === undefined || validation === undefined) {
        throw new Error("Core candidate validation violated its order contract.");
      }
      candidateByIndex.set(parsed.index, {
        index: parsed.index,
        status: "evaluated",
        rationale: { kind: "model-suggestion", text: parsed.rationale },
        validation: withCandidateIndex(validation, parsed.index),
      });
    }
  }

  const candidates = Array.from({ length: candidateCount }, (_, index) => {
    const candidate = candidateByIndex.get(index);
    if (candidate === undefined) {
      throw new Error("BriefInterpreter candidate validation lost an input index.");
    }
    return candidate;
  });
  const issues = findDuplicateDocuments(candidates);
  return {
    version: BRIEF_INTERPRETER_RESPONSE_VALIDATION_VERSION,
    authority: "proposal-only",
    success:
      issues.length === 0 &&
      candidates.every(
        (candidate) =>
          candidate.status === "evaluated" && candidate.validation.status === "valid",
      ),
    candidateCount,
    candidates,
    issues,
  };
}

function readCandidate(
  input: unknown,
  index: number,
): ParsedCandidate | { readonly issue: BriefInterpreterResponseIssue } {
  const candidate = readExactInertDataRecord(input, CANDIDATE_KEYS);
  if (candidate === undefined) {
    return {
      issue: createIssue("CANDIDATE_SHAPE_INVALID", "candidate", {
        candidateIndex: index,
      }),
    };
  }
  const rationale = candidate.rationale;
  if (!isValidRationale(rationale)) {
    return {
      issue: createIssue("CANDIDATE_RATIONALE_INVALID", "candidate", {
        candidateIndex: index,
      }),
    };
  }
  return { index, document: candidate.document, rationale };
}

function isValidRationale(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input.length > 0 &&
    input.length <= BRIEF_INTERPRETER_RESPONSE_LIMITS.maximumRationaleCharacters &&
    input.trim().length > 0 &&
    !containsControlCharacter(input) &&
    !/[\u0080-\u009f\u2028\u2029]/u.test(input)
  );
}

function withCandidateIndex(
  validation: CandidateDocumentValidation,
  index: number,
): CandidateDocumentValidation {
  return { ...validation, index };
}

function findDuplicateDocuments(
  candidates: readonly BriefInterpreterCandidate[],
): BriefInterpreterResponseIssue[] {
  const firstIndexByDocument = new Map<string, number>();
  const issues: BriefInterpreterResponseIssue[] = [];
  for (const candidate of candidates) {
    if (candidate.status !== "evaluated" || candidate.validation.status !== "valid") {
      continue;
    }
    const canonicalDocument = candidate.validation.canonicalDocument;
    const firstIndex = firstIndexByDocument.get(canonicalDocument);
    if (firstIndex === undefined) {
      firstIndexByDocument.set(canonicalDocument, candidate.index);
      continue;
    }
    issues.push(
      createIssue("DUPLICATE_NORMALIZED_DOCUMENT", "candidate", {
        candidateIndex: candidate.index,
        relatedCandidateIndex: firstIndex,
      }),
    );
  }
  return issues;
}

function invalidResponse(
  candidateCount: number,
  code: Extract<
    BriefInterpreterResponseIssueCode,
    | "RESPONSE_SHAPE_INVALID"
    | "RESPONSE_VERSION_UNSUPPORTED"
    | "CANDIDATE_COUNT_INVALID"
  >,
): BriefInterpreterResponseValidation {
  return {
    version: BRIEF_INTERPRETER_RESPONSE_VALIDATION_VERSION,
    authority: "proposal-only",
    success: false,
    candidateCount,
    candidates: [],
    issues: [createIssue(code, "response")],
  };
}

function createIssue(
  code: BriefInterpreterResponseIssueCode,
  source: BriefInterpreterResponseIssue["source"],
  location: { candidateIndex?: number; relatedCandidateIndex?: number } = {},
): BriefInterpreterResponseIssue {
  return {
    code,
    severity: "error",
    source,
    message: ISSUE_MESSAGES[code],
    ...(location.candidateIndex === undefined
      ? {}
      : { candidateIndex: location.candidateIndex }),
    ...(location.relatedCandidateIndex === undefined
      ? {}
      : { relatedCandidateIndex: location.relatedCandidateIndex }),
  };
}
