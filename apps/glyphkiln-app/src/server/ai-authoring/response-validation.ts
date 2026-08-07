import {
  validateCandidateDocuments,
  type CandidateDocumentValidation,
} from "@glyphkiln/core";

import { containsControlCharacter } from "@/server/resources/inert-text";

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

const RESPONSE_KEYS = new Set<PropertyKey>(["contractVersion", "candidates"]);
const CANDIDATE_KEYS = new Set<PropertyKey>(["document", "rationale"]);

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
  if (!isPlainRecord(input) || !hasExactKeys(input, RESPONSE_KEYS)) {
    return invalidResponse(0, "RESPONSE_SHAPE_INVALID");
  }
  if (input.contractVersion !== BRIEF_INTERPRETER_RESPONSE_CONTRACT_VERSION) {
    return invalidResponse(0, "RESPONSE_VERSION_UNSUPPORTED");
  }
  const rawCandidates = input.candidates;
  if (!Array.isArray(rawCandidates)) {
    return invalidResponse(0, "RESPONSE_SHAPE_INVALID");
  }
  if (
    rawCandidates.length < BRIEF_INTERPRETER_RESPONSE_LIMITS.minimumCandidates ||
    rawCandidates.length > BRIEF_INTERPRETER_RESPONSE_LIMITS.maximumCandidates
  ) {
    return invalidResponse(rawCandidates.length, "CANDIDATE_COUNT_INVALID");
  }

  const parsedCandidates: ParsedCandidate[] = [];
  const candidateByIndex = new Map<number, BriefInterpreterCandidate>();
  for (let index = 0; index < rawCandidates.length; index += 1) {
    const parsed = readCandidate(rawCandidates[index], index);
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

  const candidates = Array.from({ length: rawCandidates.length }, (_, index) => {
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
    candidateCount: rawCandidates.length,
    candidates,
    issues,
  };
}

function readCandidate(
  input: unknown,
  index: number,
): ParsedCandidate | { readonly issue: BriefInterpreterResponseIssue } {
  if (!isPlainRecord(input) || !hasExactKeys(input, CANDIDATE_KEYS)) {
    return {
      issue: createIssue("CANDIDATE_SHAPE_INVALID", "candidate", {
        candidateIndex: index,
      }),
    };
  }
  const rationale = input.rationale;
  if (!isValidRationale(rationale)) {
    return {
      issue: createIssue("CANDIDATE_RATIONALE_INVALID", "candidate", {
        candidateIndex: index,
      }),
    };
  }
  return { index, document: input.document, rationale };
}

function isValidRationale(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input.length > 0 &&
    input.length <= BRIEF_INTERPRETER_RESPONSE_LIMITS.maximumRationaleCharacters &&
    input.trim().length > 0 &&
    !containsControlCharacter(input) &&
    !/[\u0085\u2028\u2029]/u.test(input)
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

function hasExactKeys(
  input: Record<string, unknown>,
  expectedKeys: ReadonlySet<PropertyKey>,
): boolean {
  const keys = Reflect.ownKeys(input);
  return (
    keys.length === expectedKeys.size && keys.every((key) => expectedKeys.has(key))
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
