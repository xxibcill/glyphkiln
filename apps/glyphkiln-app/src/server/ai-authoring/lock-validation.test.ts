import { describe, expect, it } from "vitest";

import type { DesignDocument, DesignLayer } from "@glyphkiln/core";

import { createPreviewDesign } from "@/test/preview-design";

import {
  AUTHORING_LOCK_CONTRACT_VERSION,
  AUTHORING_LOCK_IDS,
  AUTHORING_LOCK_ISSUE_CODES,
  AUTHORING_LOCK_ISSUE_REGISTRY,
  AUTHORING_LOCK_LIMITS,
  AUTHORING_LOCK_VALIDATION_VERSION,
  validateAuthoringLocks,
  type AuthoringLockId,
  type AuthoringLockIssueCode,
} from "./index";

describe("server-owned authoring lock validation", () => {
  it("accepts normalized locked choices while ignoring revision identity and metadata", () => {
    const base = authoringDocument();
    const candidate = structuredClone(base);
    candidate.id = "new-proposal-revision";
    candidate.metadata = {
      rationaleLabel: "inert App metadata is outside creative locks",
    };
    const candidateHeadline = semanticLayer(candidate, "headline");
    const candidateImage = semanticLayer(candidate, "product-screenshot");
    if (candidateHeadline.type !== "headline") throw new Error("Missing headline.");
    if (candidateImage.type !== "product-screenshot") {
      throw new Error("Missing product screenshot.");
    }
    delete (candidateHeadline as Partial<typeof candidateHeadline>).visible;
    delete (candidateImage as Partial<typeof candidateImage>).visible;
    delete (candidateImage as Partial<typeof candidateImage>).fit;
    const before = structuredClone(candidate);

    const result = validateAuthoringLocks(base, candidate, [
      "composition",
      "copy",
      "palette",
      "image",
      "crop",
      "typography",
    ]);

    expect(AUTHORING_LOCK_CONTRACT_VERSION).toBe("1.0.0");
    expect(AUTHORING_LOCK_VALIDATION_VERSION).toBe("1.0.0");
    expect(result).toMatchObject({
      version: "1.0.0",
      authority: "proposal-only",
      success: true,
      locks: ["copy", "image", "crop", "typography", "palette", "composition"],
      baseValidation: { index: 0, status: "valid" },
      candidateValidation: { index: 1, status: "valid" },
      issues: [],
    });
    expect(candidate).toEqual(before);
  });

  it.each([
    ["copy", "COPY_LOCK_VIOLATED", changeCopy],
    ["image", "IMAGE_LOCK_VIOLATED", changeImage],
    ["crop", "CROP_LOCK_VIOLATED", changeCrop],
    ["typography", "TYPOGRAPHY_LOCK_VIOLATED", changeTypography],
    ["palette", "PALETTE_LOCK_VIOLATED", changePalette],
    ["composition", "COMPOSITION_LOCK_VIOLATED", changeComposition],
  ] as const)(
    "rejects a changed %s projection with a fixed actionable issue",
    (lock, code, change) => {
      const base = authoringDocument();
      const candidate = structuredClone(base);
      change(candidate);

      const result = validateAuthoringLocks(base, candidate, [lock]);

      expect(result.success).toBe(false);
      expect(result.issues).toEqual([
        {
          code,
          severity: "error",
          ...AUTHORING_LOCK_ISSUE_REGISTRY[code],
        },
      ]);
      expect(result.baseValidation.status).toBe("valid");
      expect(result.candidateValidation.status).toBe("valid");
    },
  );

  it("allows changes outside the selected locks and accepts an empty selection", () => {
    const base = authoringDocument();
    const candidate = structuredClone(base);
    candidate.seed = "unlocked-composition-seed";

    expect(validateAuthoringLocks(base, candidate, ["copy"])).toMatchObject({
      success: true,
      locks: ["copy"],
      issues: [],
    });
    expect(validateAuthoringLocks(base, candidate, [])).toMatchObject({
      success: true,
      locks: [],
      issues: [],
    });
  });

  it("keeps layer ordering exclusive to the composition lock", () => {
    const base = authoringDocument();
    const candidate = structuredClone(base);
    candidate.layers.reverse();

    for (const lock of ["copy", "image", "crop", "typography", "palette"] as const) {
      expect(validateAuthoringLocks(base, candidate, [lock])).toMatchObject({
        success: true,
        locks: [lock],
        issues: [],
      });
    }
    expect(validateAuthoringLocks(base, candidate, ["composition"]).issues).toEqual([
      expect.objectContaining({
        code: "COMPOSITION_LOCK_VIOLATED",
        lock: "composition",
      }),
    ]);
  });

  it("treats set-like declarations and brand preferences as order-independent", () => {
    const base = authoringDocument();
    base.assets.push({
      id: "alternate-product-preview",
      mimeType: "image/png",
      sha256: "b".repeat(64),
      width: 800,
      height: 800,
      origin: { kind: "unknown" },
    });
    base.brand.prohibitedColors = ["#123456", "#654321"];
    base.brand.preferredProceduralStyles = ["layered-waves", "flow-field"];
    base.brand.prohibitedStyles = ["photorealistic-ai", "generic-stock"];
    const candidate = structuredClone(base);
    candidate.assets.reverse();
    candidate.fonts.reverse();
    candidate.brand.prohibitedColors.reverse();
    candidate.brand.preferredProceduralStyles.reverse();
    candidate.brand.prohibitedStyles.reverse();
    const before = structuredClone(candidate);

    const result = validateAuthoringLocks(base, candidate, AUTHORING_LOCK_IDS);

    expect(result).toMatchObject({
      success: true,
      baseValidation: { status: "valid" },
      candidateValidation: { status: "valid" },
      issues: [],
    });
    expect(candidate).toEqual(before);
  });

  it("reports every changed lock once in canonical bounded order", () => {
    const base = authoringDocument();
    const candidate = structuredClone(base);
    for (const change of [
      changeCopy,
      changeImage,
      changeCrop,
      changeTypography,
      changePalette,
      changeComposition,
    ]) {
      change(candidate);
    }

    const result = validateAuthoringLocks(base, candidate, [
      "composition",
      "palette",
      "typography",
      "crop",
      "image",
      "copy",
    ]);

    expect(result.issues.map(({ code }) => code)).toEqual([
      "COPY_LOCK_VIOLATED",
      "IMAGE_LOCK_VIOLATED",
      "CROP_LOCK_VIOLATED",
      "TYPOGRAPHY_LOCK_VIOLATED",
      "PALETTE_LOCK_VIOLATED",
      "COMPOSITION_LOCK_VIOLATED",
    ]);
    expect(result.issues).toHaveLength(AUTHORING_LOCK_LIMITS.maximumIssues);
  });

  it("does not let an unlocked composition hide locked copy or imagery", () => {
    const base = authoringDocument();
    const hiddenCopy = structuredClone(base);
    semanticLayer(hiddenCopy, "subtitle").visible = false;
    const hiddenImage = structuredClone(base);
    semanticLayer(hiddenImage, "product-screenshot").visible = false;

    expect(validateAuthoringLocks(base, hiddenCopy, ["copy"]).issues).toMatchObject([
      { code: "COPY_LOCK_VIOLATED", lock: "copy" },
    ]);
    expect(validateAuthoringLocks(base, hiddenImage, ["image"]).issues).toMatchObject([
      { code: "IMAGE_LOCK_VIOLATED", lock: "image" },
    ]);
  });

  it.each([
    "copy",
    ["model-selected-lock"],
    ["copy", "copy"],
    ["copy", "image", "crop", "typography", "palette", "composition", "copy"],
  ])(
    "rejects malformed or duplicated server lock selection without echoing %j",
    (locks) => {
      const base = authoringDocument();
      const result = validateAuthoringLocks(base, structuredClone(base), locks);

      expect(result).toMatchObject({
        authority: "proposal-only",
        success: false,
        locks: [],
        issues: [
          {
            code: "LOCK_SELECTION_INVALID",
            source: "selection",
            action: "select-server-locks",
          },
        ],
      });
      expect(JSON.stringify(result)).not.toContain("model-selected-lock");
    },
  );

  it("rejects sparse server lock selection", () => {
    const locks = Array<AuthoringLockId>(2);
    locks[1] = "copy";

    expect(
      validateAuthoringLocks(authoringDocument(), authoringDocument(), locks).issues,
    ).toMatchObject([{ code: "LOCK_SELECTION_INVALID" }]);
  });

  it("does not invoke accessor-backed server lock entries", () => {
    let accessorReads = 0;
    const locks = Array<AuthoringLockId>(1);
    Object.defineProperty(locks, "0", {
      get() {
        accessorReads += 1;
        throw new Error("Lock accessor must not run.");
      },
    });

    const result = validateAuthoringLocks(
      authoringDocument(),
      authoringDocument(),
      locks,
    );

    expect(accessorReads).toBe(0);
    expect(result).toMatchObject({
      success: false,
      locks: [],
      issues: [{ code: "LOCK_SELECTION_INVALID" }],
    });
  });

  it("returns invalid documents only through bounded Core reports and fixed lock issues", () => {
    const base = { ...authoringDocument(), path: "/trusted/base" };
    const candidate = {
      ...authoringDocument(),
      url: "https://example.invalid/model-resource",
      css: "body { display: none }",
      javascript: "alert(1)",
      svg: "<svg><script>alert(1)</script></svg>",
    };

    const result = validateAuthoringLocks(base, candidate, ["copy"]);

    expect(result.success).toBe(false);
    expect(result.issues).toMatchObject([
      {
        code: "BASE_DOCUMENT_INVALID",
        source: "base",
        action: "repair-base-document",
      },
      {
        code: "CANDIDATE_DOCUMENT_INVALID",
        source: "candidate",
        action: "repair-candidate-document",
      },
    ]);
    expect(result.baseValidation).toMatchObject({ index: 0, status: "invalid" });
    expect(result.candidateValidation).toMatchObject({ index: 1, status: "invalid" });
    expect(result.baseValidation).not.toHaveProperty("document");
    expect(result.candidateValidation).not.toHaveProperty("canonicalDocument");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("/trusted/base");
    expect(serialized).not.toContain("example.invalid");
    expect(serialized).not.toContain("javascript");
    expect(serialized).not.toContain("<svg>");
  });

  it("publishes frozen bounded lock and issue vocabularies", () => {
    expect(AUTHORING_LOCK_IDS).toEqual([
      "copy",
      "image",
      "crop",
      "typography",
      "palette",
      "composition",
    ]);
    expect(AUTHORING_LOCK_ISSUE_CODES).toEqual([
      "LOCK_SELECTION_INVALID",
      "BASE_DOCUMENT_INVALID",
      "CANDIDATE_DOCUMENT_INVALID",
      "COPY_LOCK_VIOLATED",
      "IMAGE_LOCK_VIOLATED",
      "CROP_LOCK_VIOLATED",
      "TYPOGRAPHY_LOCK_VIOLATED",
      "PALETTE_LOCK_VIOLATED",
      "COMPOSITION_LOCK_VIOLATED",
    ] satisfies AuthoringLockIssueCode[]);
    expect(AUTHORING_LOCK_LIMITS).toEqual({ maximumLocks: 6, maximumIssues: 6 });
    expect(Object.isFrozen(AUTHORING_LOCK_IDS)).toBe(true);
    expect(Object.isFrozen(AUTHORING_LOCK_ISSUE_CODES)).toBe(true);
    expect(Object.isFrozen(AUTHORING_LOCK_ISSUE_REGISTRY)).toBe(true);
    expect(
      Object.values(AUTHORING_LOCK_ISSUE_REGISTRY).every((entry) =>
        Object.isFrozen(entry),
      ),
    ).toBe(true);
    expect(Object.isFrozen(AUTHORING_LOCK_LIMITS)).toBe(true);
  });
});

function authoringDocument(): DesignDocument {
  const document = createPreviewDesign();
  document.assets = [
    {
      id: "product-preview",
      mimeType: "image/png",
      sha256: "a".repeat(64),
      width: 1_200,
      height: 800,
      origin: { kind: "unknown" },
    },
  ];
  document.layers.push({
    id: "product-preview-layer",
    type: "product-screenshot",
    assetId: "product-preview",
    alt: "A deterministic product preview.",
    fit: "contain",
    visible: true,
  });
  return document;
}

function changeCopy(document: DesignDocument): void {
  const layer = semanticLayer(document, "headline");
  if (layer.type !== "headline") throw new Error("Missing headline fixture.");
  layer.text = "Different proposed copy";
}

function changeImage(document: DesignDocument): void {
  const asset = document.assets.at(0);
  if (asset === undefined) throw new Error("Missing asset fixture.");
  asset.sha256 = "b".repeat(64);
}

function changeCrop(document: DesignDocument): void {
  const layer = semanticLayer(document, "product-screenshot");
  if (layer.type !== "product-screenshot") throw new Error("Missing image fixture.");
  layer.fit = "cover";
}

function changeTypography(document: DesignDocument): void {
  const layer = semanticLayer(document, "headline");
  if (layer.type !== "headline") throw new Error("Missing headline fixture.");
  layer.fontSize = 48;
}

function changePalette(document: DesignDocument): void {
  document.brand.palette.primary = "#123456";
}

function changeComposition(document: DesignDocument): void {
  document.seed = "different-composition-seed";
}

function semanticLayer(
  document: DesignDocument,
  type: DesignLayer["type"],
): DesignLayer {
  const layer = document.layers.find((candidate) => candidate.type === type);
  if (layer === undefined) throw new Error(`Missing ${type} fixture layer.`);
  return layer;
}
