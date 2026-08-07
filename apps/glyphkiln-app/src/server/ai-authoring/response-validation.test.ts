import { describe, expect, it } from "vitest";

import type { DesignDocument } from "@glyphkiln/core";

import { createPreviewDesign } from "@/test/preview-design";

import {
  BRIEF_INTERPRETER_RESPONSE_CONTRACT_VERSION,
  BRIEF_INTERPRETER_RESPONSE_ISSUE_CODES,
  BRIEF_INTERPRETER_RESPONSE_LIMITS,
  BRIEF_INTERPRETER_RESPONSE_VALIDATION_VERSION,
  validateBriefInterpreterResponse,
} from "./index";

describe("BriefInterpreter response validation", () => {
  it("validates three ordered proposals and labels rationales as suggestions", () => {
    const documents = [
      candidateDocument(0),
      candidateDocument(1),
      candidateDocument(2),
    ];
    const input = response(
      documents.map((document, index) => ({
        document,
        rationale:
          index === 0
            ? "Use <script> as inert displayed text, never markup."
            : `Direction ${(index + 1).toString()} emphasizes a different seed.`,
      })),
    );
    const before = structuredClone(input);

    const result = validateBriefInterpreterResponse(input);

    expect(BRIEF_INTERPRETER_RESPONSE_CONTRACT_VERSION).toBe("1.0.0");
    expect(BRIEF_INTERPRETER_RESPONSE_VALIDATION_VERSION).toBe("1.0.0");
    expect(result).toMatchObject({
      version: "1.0.0",
      authority: "proposal-only",
      success: true,
      candidateCount: 3,
      issues: [],
      candidates: [
        {
          index: 0,
          status: "evaluated",
          rationale: {
            kind: "model-suggestion",
            text: "Use <script> as inert displayed text, never markup.",
          },
          validation: { index: 0, status: "valid" },
        },
        {
          index: 1,
          status: "evaluated",
          validation: { index: 1, status: "valid" },
        },
        {
          index: 2,
          status: "evaluated",
          validation: { index: 2, status: "valid" },
        },
      ],
    });
    expect(
      result.candidates.map((candidate) =>
        candidate.status === "evaluated" ? candidate.validation.index : -1,
      ),
    ).toEqual([0, 1, 2]);
    expect(input).toEqual(before);
  });

  it("returns invalid model documents only as bounded Core issues", () => {
    const hostile = {
      ...candidateDocument(0),
      url: "https://example.invalid/model-resource",
      path: "/tmp/model-resource",
      css: "body { display: none }",
      javascript: "alert(1)",
      svg: "<svg><script>alert(1)</script></svg>",
    };
    const result = validateBriefInterpreterResponse(
      response([
        { document: hostile, rationale: "A structurally invalid proposal." },
        { document: candidateDocument(1), rationale: "A valid second proposal." },
        { document: candidateDocument(2), rationale: "A valid third proposal." },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.candidates[0]).toMatchObject({
      index: 0,
      status: "evaluated",
      validation: {
        index: 0,
        status: "invalid",
        issues: [
          {
            code: "DOCUMENT_STRUCTURE_INVALID",
            source: "schema",
            action: "repair-document-structure",
          },
        ],
      },
    });
    const first = result.candidates[0];
    if (first.status !== "evaluated") return;
    expect(first.validation).not.toHaveProperty("document");
    expect(first.validation).not.toHaveProperty("canonicalDocument");
    expect(JSON.stringify(first.validation)).not.toContain("https");
    expect(JSON.stringify(first.validation)).not.toContain("javascript");
    expect(JSON.stringify(first.validation)).not.toContain("svg");
  });

  it("rejects extra response authority, unsupported versions, and invalid counts", () => {
    const proposals = validProposals(3);
    const extraAuthority = validateBriefInterpreterResponse({
      ...response(proposals),
      provider: "model-selected-provider",
      model: "model-selected-model",
    });
    const unsupported = validateBriefInterpreterResponse({
      ...response(proposals),
      contractVersion: "9.9.9",
    });
    const missingCandidates = validateBriefInterpreterResponse({
      contractVersion: BRIEF_INTERPRETER_RESPONSE_CONTRACT_VERSION,
      candidates: "not-an-array",
    });
    const tooFew = validateBriefInterpreterResponse(response(validProposals(2)));
    const tooMany = validateBriefInterpreterResponse(response(validProposals(5)));

    expect(extraAuthority).toMatchObject({
      authority: "proposal-only",
      success: false,
      candidateCount: 0,
      candidates: [],
      issues: [{ code: "RESPONSE_SHAPE_INVALID", source: "response" }],
    });
    expect(JSON.stringify(extraAuthority)).not.toContain("model-selected");
    expect(unsupported.issues).toMatchObject([
      { code: "RESPONSE_VERSION_UNSUPPORTED" },
    ]);
    expect(missingCandidates.issues).toMatchObject([
      { code: "RESPONSE_SHAPE_INVALID" },
    ]);
    expect(tooFew).toMatchObject({
      candidateCount: 2,
      issues: [{ code: "CANDIDATE_COUNT_INVALID" }],
    });
    expect(tooMany).toMatchObject({
      candidateCount: 5,
      issues: [{ code: "CANDIDATE_COUNT_INVALID" }],
    });
  });

  it("rejects malformed candidate envelopes and unsafe rationales without echoing them", () => {
    const oversized = `secret-${"x".repeat(
      BRIEF_INTERPRETER_RESPONSE_LIMITS.maximumRationaleCharacters,
    )}`;
    const result = validateBriefInterpreterResponse(
      response([
        {
          document: candidateDocument(0),
          rationale: "Model-selected resource path",
          url: "https://example.invalid/authority",
        },
        {
          document: candidateDocument(1),
          rationale: "first line\nsecond line",
        },
        {
          document: candidateDocument(2),
          rationale: "first paragraph\u2028second paragraph",
        },
        {
          document: candidateDocument(3),
          rationale: oversized,
        },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.candidates).toMatchObject([
      {
        index: 0,
        status: "rejected",
        issues: [{ code: "CANDIDATE_SHAPE_INVALID", candidateIndex: 0 }],
      },
      {
        index: 1,
        status: "rejected",
        issues: [{ code: "CANDIDATE_RATIONALE_INVALID", candidateIndex: 1 }],
      },
      {
        index: 2,
        status: "rejected",
        issues: [{ code: "CANDIDATE_RATIONALE_INVALID", candidateIndex: 2 }],
      },
      {
        index: 3,
        status: "rejected",
        issues: [{ code: "CANDIDATE_RATIONALE_INVALID", candidateIndex: 3 }],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("example.invalid");
    expect(JSON.stringify(result)).not.toContain("first line");
    expect(JSON.stringify(result)).not.toContain("first paragraph");
    expect(JSON.stringify(result)).not.toContain("secret-");
  });

  it("does not skip sparse candidate indices", () => {
    const candidates = Array<unknown>(3);
    candidates[2] = {
      document: candidateDocument(2),
      rationale: "The only well-shaped proposal.",
    };

    const result = validateBriefInterpreterResponse(response(candidates));

    expect(result.success).toBe(false);
    expect(result.candidates).toMatchObject([
      { index: 0, status: "rejected", issues: [{ candidateIndex: 0 }] },
      { index: 1, status: "rejected", issues: [{ candidateIndex: 1 }] },
      {
        index: 2,
        status: "evaluated",
        validation: { index: 2, status: "valid" },
      },
    ]);
  });

  it("flags exact duplicate normalized documents with bounded fixed issues", () => {
    const first = candidateDocument(0);
    const result = validateBriefInterpreterResponse(
      response([
        { document: first, rationale: "First rationale." },
        { document: structuredClone(first), rationale: "Different rationale." },
        { document: candidateDocument(2), rationale: "Distinct document." },
        { document: structuredClone(first), rationale: "Another rationale." },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.issues).toEqual([
      {
        code: "DUPLICATE_NORMALIZED_DOCUMENT",
        severity: "error",
        source: "candidate",
        message:
          "Revise this candidate so its normalized document differs from the earlier candidate.",
        candidateIndex: 1,
        relatedCandidateIndex: 0,
      },
      {
        code: "DUPLICATE_NORMALIZED_DOCUMENT",
        severity: "error",
        source: "candidate",
        message:
          "Revise this candidate so its normalized document differs from the earlier candidate.",
        candidateIndex: 3,
        relatedCandidateIndex: 0,
      },
    ]);
    expect(result.issues.length).toBeLessThanOrEqual(
      BRIEF_INTERPRETER_RESPONSE_LIMITS.maximumResponseIssues,
    );
  });

  it("publishes a frozen closed issue-code vocabulary", () => {
    expect(BRIEF_INTERPRETER_RESPONSE_ISSUE_CODES).toEqual([
      "RESPONSE_SHAPE_INVALID",
      "RESPONSE_VERSION_UNSUPPORTED",
      "CANDIDATE_COUNT_INVALID",
      "CANDIDATE_SHAPE_INVALID",
      "CANDIDATE_RATIONALE_INVALID",
      "DUPLICATE_NORMALIZED_DOCUMENT",
    ]);
    expect(Object.isFrozen(BRIEF_INTERPRETER_RESPONSE_ISSUE_CODES)).toBe(true);
    expect(Object.isFrozen(BRIEF_INTERPRETER_RESPONSE_LIMITS)).toBe(true);
  });
});

function response<Candidate>(candidates: Candidate[]) {
  return {
    contractVersion: BRIEF_INTERPRETER_RESPONSE_CONTRACT_VERSION,
    candidates,
  };
}

function validProposals(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    document: candidateDocument(index),
    rationale: `Direction ${(index + 1).toString()}.`,
  }));
}

function candidateDocument(index: number): DesignDocument {
  const document = createPreviewDesign();
  document.id = `candidate-${index.toString()}`;
  document.seed = `candidate-seed-${index.toString()}`;
  return document;
}
