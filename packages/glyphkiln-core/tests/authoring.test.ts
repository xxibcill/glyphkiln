import { describe, expect, it } from "vitest";

import {
  AUTHORING_CONTRACT_VERSION,
  AUTHORING_ISSUE_CODES,
  AUTHORING_ISSUE_METADATA_VERSION,
  AUTHORING_ISSUE_REGISTRY,
  AUTHORING_QUALITY_ISSUE_LIMITS,
  AUTHORING_QUALITY_ISSUE_MAPPING_VERSION,
  AUTHORING_TEMPLATE_KEYS,
  AUTHORING_TEMPLATE_REGISTRY,
  CAMPAIGN_FAMILY_REGISTRY,
  CANDIDATE_DOCUMENT_LIMITS,
  CANDIDATE_DOCUMENT_VALIDATION_VERSION,
  canonicalJson,
  mapQualityIssuesToAuthoringIssues,
  validateCandidateDocuments,
  type DesignDocument,
  type DesignLayer,
} from "../src/index.js";
import {
  AUTHORING_CONTRACT_VERSION as BROWSER_AUTHORING_CONTRACT_VERSION,
  AUTHORING_ISSUE_REGISTRY as BROWSER_AUTHORING_ISSUE_REGISTRY,
  AUTHORING_QUALITY_ISSUE_MAPPING_VERSION as BROWSER_AUTHORING_QUALITY_ISSUE_MAPPING_VERSION,
  AUTHORING_TEMPLATE_REGISTRY as BROWSER_AUTHORING_TEMPLATE_REGISTRY,
  mapQualityIssuesToAuthoringIssues as mapBrowserQualityIssuesToAuthoringIssues,
} from "../src/browser.js";
import { getTemplate } from "../src/templates/index.js";
import { cloneDocument, loadExample } from "./helpers.js";

const contentLayerTypes = new Set<DesignLayer["type"]>([
  "eyebrow",
  "badge",
  "headline",
  "subtitle",
  "statistic",
  "cta",
  "footer",
  "attribution",
]);
const assetLayerTypes = new Set<DesignLayer["type"]>([
  "image",
  "logo",
  "product-screenshot",
]);

describe("AI-ready authoring metadata", () => {
  it("publishes every supported template version as immutable browser-safe data", () => {
    expect(AUTHORING_CONTRACT_VERSION).toBe("1.0.0");
    expect(AUTHORING_TEMPLATE_KEYS).toEqual([
      "product-announcement@1.1.1",
      "statistic-card@1.1.0",
      "quote-card@1.1.0",
      "article-cover@1.1.0",
      "tiktok-carousel-slide@1.0.1",
      "tiktok-carousel-slide@1.0.2",
      "tiktok-carousel-slide@1.0.3",
      "image-led-campaign@1.0.0",
    ]);
    expect(Object.keys(AUTHORING_TEMPLATE_REGISTRY)).toEqual(AUTHORING_TEMPLATE_KEYS);
    expect(Object.isFrozen(AUTHORING_TEMPLATE_REGISTRY)).toBe(true);
    expect(Object.isFrozen(AUTHORING_TEMPLATE_KEYS)).toBe(true);

    for (const contract of Object.values(AUTHORING_TEMPLATE_REGISTRY)) {
      expect(Object.isFrozen(contract)).toBe(true);
      expect(Object.isFrozen(contract.contentRoles)).toBe(true);
      expect(Object.isFrozen(contract.assetRoles)).toBe(true);
      expect(Object.isFrozen(contract.compositionVariant)).toBe(true);
      expect(Object.isFrozen(contract.hardBounds)).toBe(true);
      expect(contract.compositionVariant.selection).toBe("fixed-by-template-version");
      expect(contract.hardBounds).toMatchObject({
        maximumDocumentLayers: 100,
        maximumDocumentAssets: 100,
        maximumDocumentFonts: 32,
        maximumVisibleLayersPerRole: 1,
      });
    }

    expect(BROWSER_AUTHORING_CONTRACT_VERSION).toBe(AUTHORING_CONTRACT_VERSION);
    expect(BROWSER_AUTHORING_TEMPLATE_REGISTRY).toBe(AUTHORING_TEMPLATE_REGISTRY);
    expectDeepFrozen(AUTHORING_TEMPLATE_REGISTRY);
  });

  it("stays aligned with runtime template requirements and formats", () => {
    for (const contract of Object.values(AUTHORING_TEMPLATE_REGISTRY)) {
      const template = getTemplate({
        template: contract.template,
        format: contract.compatibleFormats[0],
      } as DesignDocument);
      const publishedLayerTypes = [
        ...contract.optionalDecorativeLayers,
        ...contract.contentRoles.map((role) => role.layerType),
        ...contract.assetRoles.map((role) => role.layerType),
      ].sort();
      const requiredLayerTypes = [
        ...contract.contentRoles
          .filter((role) => role.required)
          .map((role) => role.layerType),
        ...contract.assetRoles
          .filter((role) => role.required)
          .map((role) => role.layerType),
      ].sort();

      expect(template.supportedFormats).toEqual(contract.compatibleFormats);
      expect([...template.supportedLayers].sort()).toEqual(publishedLayerTypes);
      expect([...template.requiredLayers].sort()).toEqual(requiredLayerTypes);
      expect(template.constraints.headlineMaximumLines).toBe(
        contract.hardBounds.headlineMaximumLines,
      );
      expect(template.mutuallyExclusiveLayers ?? []).toEqual(
        contract.hardBounds.mutuallyExclusiveRoles,
      );
      expect(
        contract.contentRoles.every((role) => contentLayerTypes.has(role.layerType)),
      ).toBe(true);
      expect(
        contract.assetRoles.every((role) => assetLayerTypes.has(role.layerType)),
      ).toBe(true);
    }

    expect(
      AUTHORING_TEMPLATE_REGISTRY["image-led-campaign@1.0.0"].compositionVariant.id,
    ).toBe(
      CAMPAIGN_FAMILY_REGISTRY["image-led-campaign"].members[0].compositionVariants[0]
        .id,
    );
  });

  it("publishes bounded actionable metadata for existing proof categories", () => {
    expect(AUTHORING_ISSUE_METADATA_VERSION).toBe("1.0.0");
    expect(Object.keys(AUTHORING_ISSUE_REGISTRY)).toEqual(AUTHORING_ISSUE_CODES);
    expect(Object.isFrozen(AUTHORING_ISSUE_REGISTRY)).toBe(true);
    expect(BROWSER_AUTHORING_ISSUE_REGISTRY).toBe(AUTHORING_ISSUE_REGISTRY);
    expect(AUTHORING_ISSUE_REGISTRY.COPY_TOO_LONG).toMatchObject({
      category: "copy",
      action: "shorten-copy",
    });
    expect(AUTHORING_ISSUE_REGISTRY.ASSET_SUITABILITY_RISK.category).toBe("asset");
    expect(AUTHORING_ISSUE_REGISTRY.CROP_CONFIGURATION_INVALID.category).toBe("crop");
    expect(AUTHORING_ISSUE_REGISTRY.CONTRAST_INSUFFICIENT.category).toBe("contrast");
    expect(AUTHORING_ISSUE_REGISTRY.SAFE_AREA_RISK.category).toBe("safe-area");
  });
});

function expectDeepFrozen(value: unknown): void {
  const pending: unknown[] = [value];
  const visited = new WeakSet();
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== "object" || current === null || visited.has(current)) {
      continue;
    }
    visited.add(current);
    expect(Object.isFrozen(current)).toBe(true);
    for (const child of Object.values(current as Record<string, unknown>)) {
      pending.push(child);
    }
  }
}

describe("candidate document validation", () => {
  it("normalizes valid candidates, preserves order, and returns canonical JSON", async () => {
    const article = cloneDocument(await loadExample("article-cover"));
    const announcement = cloneDocument(await loadExample("product-announcement"));
    delete (announcement as Partial<DesignDocument>).mode;
    delete (announcement.layers[0] as Partial<DesignLayer>).visible;

    const result = validateCandidateDocuments([article, announcement]);
    const repeated = validateCandidateDocuments([article, announcement]);

    expect(CANDIDATE_DOCUMENT_VALIDATION_VERSION).toBe("1.0.0");
    expect(result.success).toBe(true);
    expect(result.candidateCount).toBe(2);
    expect(result.candidates.map((candidate) => candidate.index)).toEqual([0, 1]);
    expect(result).toEqual(repeated);
    expect(result.candidates[0]?.status).toBe("valid");
    expect(result.candidates[1]?.status).toBe("valid");
    const normalized = result.candidates[1];
    if (normalized?.status !== "valid") return;
    expect(normalized.document.id).toBe(announcement.id);
    expect(normalized.document.mode).toBe("light");
    expect(normalized.document.layers[0]?.visible).toBe(true);
    expect(normalized.canonicalDocument).toBe(canonicalJson(normalized.document));
    expect("mode" in announcement).toBe(false);
  });

  it("rejects generated active-field shapes as strict inert data", async () => {
    const document = {
      ...(await loadExample("product-announcement")),
      url: "https://example.invalid/asset.png",
      path: "/tmp/asset.png",
      css: "body { display: none }",
      javascript: "alert(1)",
      svg: "<svg><script>run()</script></svg>",
    };

    const result = validateCandidateDocuments([document]);

    expect(result.success).toBe(false);
    expect(result.candidates[0]).toMatchObject({
      status: "invalid",
      issues: [
        {
          code: "DOCUMENT_STRUCTURE_INVALID",
          source: "schema",
          action: "repair-document-structure",
        },
      ],
    });
    expect(result.candidates[0]).not.toHaveProperty("document");
    expect(result.candidates[0]).not.toHaveProperty("canonicalDocument");
  });

  it("maps strict schema copy bounds to stable designer actions", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    const headline = document.layers.find((layer) => layer.type === "headline");
    if (headline?.type !== "headline") throw new Error("Missing fixture headline.");
    headline.text = "x".repeat(2_001);

    const result = validateCandidateDocuments([document]);

    expect(result.candidates[0]).toMatchObject({
      status: "invalid",
      issues: [
        {
          code: "COPY_TOO_LONG",
          category: "copy",
          action: "shorten-copy",
        },
      ],
    });
    const candidate = result.candidates[0];
    expect(candidate?.issues[0]?.path).toMatch(/\.text$/);
  });

  it("reuses template and document quality checks without exposing invalid documents", async () => {
    const missingRole = cloneDocument(await loadExample("product-announcement"));
    missingRole.layers = missingRole.layers.filter(
      (layer) => layer.type !== "headline",
    );

    const unsupportedFit = cloneDocument(await loadExample("image-led-campaign"));
    const image = unsupportedFit.layers.find((layer) => layer.type === "image");
    if (image?.type !== "image") throw new Error("Missing fixture image.");
    image.fit = "contain";

    const brandConflict = cloneDocument(await loadExample("article-cover"));
    brandConflict.brand.prohibitedColors = [brandConflict.brand.palette.primary];

    const unsupportedText = cloneDocument(await loadExample("quote-card"));
    const quote = unsupportedText.layers.find((layer) => layer.type === "headline");
    if (quote?.type !== "headline") throw new Error("Missing fixture quote.");
    quote.text = "\u05d0";

    const result = validateCandidateDocuments([
      missingRole,
      unsupportedFit,
      brandConflict,
      unsupportedText,
    ]);

    expect(result.success).toBe(false);
    expect(result.candidates.map((candidate) => candidate.status)).toEqual([
      "invalid",
      "invalid",
      "invalid",
      "invalid",
    ]);
    expect(result.candidates[0]).toMatchObject({
      issues: [{ code: "REQUIRED_ROLE_MISSING", action: "add-required-role" }],
    });
    expect(result.candidates[1]).toMatchObject({
      issues: [
        {
          code: "ASSET_FIT_UNSUPPORTED",
          action: "choose-supported-asset-fit",
          layerId: image.id,
        },
      ],
    });
    expect(
      result.candidates[2]?.issues.some(
        (issue) =>
          issue.code === "BRAND_POLICY_CONFLICT" &&
          issue.action === "choose-brand-compliant-value",
      ),
    ).toBe(true);
    expect(result.candidates[3]).toMatchObject({
      issues: [
        {
          code: "TEXT_LAYOUT_UNSUPPORTED",
          action: "replace-unsupported-text",
          layerId: quote.id,
        },
      ],
    });
    for (const candidate of result.candidates) {
      expect(candidate).not.toHaveProperty("document");
      expect(candidate).not.toHaveProperty("canonicalDocument");
    }
  });

  it("retains quality warnings on otherwise valid candidates", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    const procedural = document.layers.find(
      (layer) => layer.type === "procedural-decoration",
    );
    if (procedural?.type !== "procedural-decoration") {
      throw new Error("Missing fixture procedural layer.");
    }
    document.brand.preferredProceduralStyles = [
      procedural.style === "flow-field" ? "layered-waves" : "flow-field",
    ];

    const result = validateCandidateDocuments([document]);

    expect(result.success).toBe(true);
    expect(result.candidates[0]).toMatchObject({
      status: "valid",
      issues: [
        {
          code: "BRAND_PREFERENCE_REVIEW",
          severity: "warning",
          action: "review-brand-preference",
          layerId: procedural.id,
        },
      ],
    });
  });

  it("bounds candidate sets and per-candidate issue output", async () => {
    expect(validateCandidateDocuments(null)).toMatchObject({
      success: false,
      candidateCount: 0,
      candidates: [],
      issues: [{ code: "DOCUMENT_SET_INVALID" }],
    });
    expect(validateCandidateDocuments([]).success).toBe(false);
    expect(
      validateCandidateDocuments(
        Array.from(
          { length: CANDIDATE_DOCUMENT_LIMITS.maximumCandidates + 1 },
          () => ({}),
        ),
      ),
    ).toMatchObject({
      success: false,
      candidateCount: CANDIDATE_DOCUMENT_LIMITS.maximumCandidates + 1,
      candidates: [],
    });

    const document = cloneDocument(await loadExample("product-announcement"));
    document.layers = Array.from({ length: 100 }, (_, index) => ({
      id: `headline-${index}`,
      type: "headline" as const,
      text: "",
      visible: true,
    }));
    const bounded = validateCandidateDocuments([document]);
    const candidate = bounded.candidates[0];
    expect(candidate?.status).toBe("invalid");
    expect(candidate?.issues).toHaveLength(
      CANDIDATE_DOCUMENT_LIMITS.maximumIssuesPerCandidate,
    );
    expect(candidate?.issuesTruncated).toBe(true);
    expect(candidate?.issues.every((issue) => issue.code === "COPY_REQUIRED")).toBe(
      true,
    );
  });

  it("does not skip sparse candidates and reports incompatible template versions", async () => {
    const sparse = Array<unknown>(2);
    sparse[1] = await loadExample("article-cover");
    const sparseResult = validateCandidateDocuments(sparse);
    expect(sparseResult.success).toBe(false);
    expect(sparseResult.candidates.map((candidate) => candidate.index)).toEqual([0, 1]);
    expect(sparseResult.candidates[0]).toMatchObject({
      status: "invalid",
      issues: [{ code: "DOCUMENT_STRUCTURE_INVALID", source: "schema" }],
    });

    const unsupported = cloneDocument(await loadExample("product-announcement"));
    unsupported.template.version = "9.9.9";
    const unsupportedResult = validateCandidateDocuments([unsupported]);
    expect(unsupportedResult.candidates[0]).toMatchObject({
      status: "invalid",
      issues: [
        {
          code: "TEMPLATE_INCOMPATIBLE",
          source: "template",
          action: "choose-compatible-template",
        },
      ],
    });
  });

  it("does not invoke accessor-backed candidate array entries", () => {
    let accessorReads = 0;
    const candidates = Array<unknown>(1);
    Object.defineProperty(candidates, "0", {
      get() {
        accessorReads += 1;
        throw new Error("Candidate accessor must not run.");
      },
    });

    const result = validateCandidateDocuments(candidates);

    expect(accessorReads).toBe(0);
    expect(result).toMatchObject({
      success: false,
      candidateCount: 1,
      candidates: [
        {
          index: 0,
          status: "invalid",
          issues: [{ code: "DOCUMENT_STRUCTURE_INVALID" }],
        },
      ],
    });
  });

  it("does not invoke accessor-backed candidate document fields", async () => {
    let accessorReads = 0;
    const document = cloneDocument(await loadExample("product-announcement"));
    Object.defineProperty(document, "mode", {
      configurable: true,
      enumerable: false,
      get() {
        accessorReads += 1;
        throw new Error("Candidate document accessor must not run.");
      },
    });

    const result = validateCandidateDocuments([document]);

    expect(accessorReads).toBe(0);
    expect(result).toMatchObject({
      success: false,
      candidateCount: 1,
      candidates: [
        {
          index: 0,
          status: "invalid",
          issues: [{ code: "DOCUMENT_STRUCTURE_INVALID", source: "schema" }],
        },
      ],
    });
  });

  it("caps deep validation paths without echoing unknown values", async () => {
    const document = cloneDocument(await loadExample("product-announcement"));
    let metadata: Record<string, unknown> = {};
    for (let index = 0; index < 14; index += 1) {
      metadata = { [`model_field_${index}_${"x".repeat(24)}`]: metadata };
    }
    document.metadata = metadata as DesignDocument["metadata"];

    const result = validateCandidateDocuments([document]);
    const candidate = result.candidates[0];
    expect(candidate?.status).toBe("invalid");
    expect(candidate?.issues[0]).toMatchObject({
      code: "DOCUMENT_STRUCTURE_INVALID",
      pathTruncated: true,
    });
    expect(candidate?.issues[0]?.path).toHaveLength(
      CANDIDATE_DOCUMENT_LIMITS.maximumIssuePathLength,
    );
    expect(candidate?.issues[0]?.message).not.toContain("model_field");
  });
});

describe("authoring quality issue mapping", () => {
  it("covers every current Core quality code with a closed action", () => {
    const mappings = [
      ["REQUIRED_LAYER_MISSING", "REQUIRED_ROLE_MISSING", "add-required-role"],
      ["UNSUPPORTED_VISIBLE_LAYER", "UNSUPPORTED_ROLE", "remove-unsupported-role"],
      ["DUPLICATE_VISIBLE_LAYER", "DUPLICATE_ROLE", "remove-duplicate-role"],
      ["CONFLICTING_VISIBLE_LAYERS", "CONFLICTING_ROLES", "choose-one-role"],
      ["ASSET_FIT_REQUIRED", "ASSET_FIT_UNSUPPORTED", "choose-supported-asset-fit"],
      ["LOGO_ASPECT_RATIO", "ASSET_SUITABILITY_RISK", "replace-unsuitable-asset"],
      [
        "INVALID_FOCAL_CROP_GEOMETRY",
        "CROP_CONFIGURATION_INVALID",
        "adjust-focal-point",
      ],
      ["LOW_TEXT_CONTRAST", "CONTRAST_INSUFFICIENT", "improve-contrast"],
      ["TEXT_OUTSIDE_SAFE_AREA", "SAFE_AREA_RISK", "move-content-inside-safe-area"],
      ["TEXT_OVERFLOW", "TEXT_OVERFLOW", "resolve-text-overflow"],
      ["LINGUISTIC_WORD_BROKEN", "TEXT_OVERFLOW", "resolve-text-overflow"],
      ["ORPHAN_LINE", "COPY_RHYTHM_REVIEW", "review-copy-rhythm"],
      [
        "BIDI_CONTROL_UNSUPPORTED",
        "TEXT_LAYOUT_UNSUPPORTED",
        "replace-unsupported-text",
      ],
      [
        "BIDI_LAYOUT_UNSUPPORTED",
        "TEXT_LAYOUT_UNSUPPORTED",
        "replace-unsupported-text",
      ],
      [
        "VERTICAL_LAYOUT_UNSUPPORTED",
        "TEXT_LAYOUT_UNSUPPORTED",
        "replace-unsupported-text",
      ],
      ["MISSING_GLYPH", "MISSING_GLYPH", "supply-font-coverage"],
      ["PROHIBITED_COLOR", "BRAND_POLICY_CONFLICT", "choose-brand-compliant-value"],
      ["PROHIBITED_STYLE", "BRAND_POLICY_CONFLICT", "choose-brand-compliant-value"],
      [
        "NON_PREFERRED_PROCEDURAL_STYLE",
        "BRAND_PREFERENCE_REVIEW",
        "review-brand-preference",
      ],
      [
        "QUIET_REGION_MISALIGNED",
        "QUIET_REGION_RISK",
        "move-decoration-outside-quiet-region",
      ],
      ["INVALID_DIMENSIONS", "TEMPLATE_INCOMPATIBLE", "choose-compatible-template"],
    ] as const;

    const result = mapQualityIssuesToAuthoringIssues(
      mappings.map(([code]) => ({
        code,
        severity: "warning",
        message: "Runtime evidence",
      })),
    );

    expect(result.valid).toBe(true);
    expect(result.issues.map(({ code, action }) => [code, action])).toEqual(
      mappings.map(([, code, action]) => [code, action]),
    );
  });

  it("maps Core proof issues to fixed designer actions in supplied order", () => {
    const result = mapQualityIssuesToAuthoringIssues([
      {
        code: "LOW_TEXT_CONTRAST",
        severity: "error",
        message: "Dynamic contrast details",
        layerId: "headline",
        details: { ratio: 1.25 },
      },
      {
        code: "TEXT_OUTSIDE_SAFE_AREA",
        severity: "warning",
        message: "Dynamic safe-area details",
      },
      {
        code: "LOGO_ASPECT_RATIO",
        severity: "warning",
        message: "Dynamic logo details",
        layerId: "logo",
      },
      {
        code: "INVALID_FOCAL_CROP_GEOMETRY",
        severity: "error",
        message: "Dynamic crop details",
        layerId: "hero",
      },
      {
        code: "ORPHAN_LINE",
        severity: "warning",
        message: "Dynamic line details",
        layerId: "headline",
      },
    ]);

    expect(AUTHORING_QUALITY_ISSUE_MAPPING_VERSION).toBe("1.0.0");
    expect(result).toMatchObject({
      version: "1.0.0",
      valid: true,
      totalIssues: 5,
      retainedIssues: 5,
      truncated: false,
      issues: [
        {
          code: "CONTRAST_INSUFFICIENT",
          action: "improve-contrast",
          layerId: "headline",
        },
        {
          code: "SAFE_AREA_RISK",
          action: "move-content-inside-safe-area",
        },
        {
          code: "ASSET_SUITABILITY_RISK",
          action: "replace-unsuitable-asset",
          layerId: "logo",
        },
        {
          code: "CROP_CONFIGURATION_INVALID",
          action: "adjust-focal-point",
          layerId: "hero",
        },
        {
          code: "COPY_RHYTHM_REVIEW",
          action: "review-copy-rhythm",
          layerId: "headline",
        },
      ],
    });
    expect(result.issues.map((issue) => issue.severity)).toEqual([
      "error",
      "warning",
      "warning",
      "error",
      "warning",
    ]);
    expect(JSON.stringify(result.issues)).not.toContain("Dynamic");
    expect(JSON.stringify(result.issues)).not.toContain("ratio");
  });

  it("uses a fixed review action for unknown future quality codes", () => {
    const result = mapQualityIssuesToAuthoringIssues([
      {
        code: "FUTURE_PROOF_RULE",
        severity: "warning",
        message: "Untrusted model explanation",
        layerId: "future-layer",
      },
    ]);

    expect(result).toMatchObject({
      valid: true,
      issues: [
        {
          code: "QUALITY_REVIEW_REQUIRED",
          severity: "warning",
          source: "quality",
          action: "review-quality-evidence",
          layerId: "future-layer",
        },
      ],
    });
    expect(result.issues[0]?.message).not.toContain("Untrusted");
  });

  it("rejects malformed issue data without echoing it", () => {
    const result = mapQualityIssuesToAuthoringIssues([
      {
        code: "LOW_TEXT_CONTRAST",
        severity: "catastrophic",
        message: "javascript:alert(1)",
      },
      {
        code: "LOW_TEXT_CONTRAST",
        severity: "error",
        message: "valid shape",
        layerId: "https://example.invalid/model-selected-layer",
      },
    ]);
    const nonArray = mapQualityIssuesToAuthoringIssues({
      code: "LOW_TEXT_CONTRAST",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(
      result.issues.every((issue) => issue.code === "QUALITY_REVIEW_REQUIRED"),
    ).toBe(true);
    expect(JSON.stringify(result.issues)).not.toContain("javascript");
    expect(JSON.stringify(result.issues)).not.toContain("https");
    expect(nonArray).toMatchObject({
      valid: false,
      totalIssues: 0,
      retainedIssues: 1,
      truncated: false,
      issues: [{ code: "QUALITY_REVIEW_REQUIRED", severity: "error" }],
    });
  });

  it("does not invoke accessor-backed quality issue entries or fields", () => {
    let accessorReads = 0;
    const accessorIssue: Record<string, unknown> = {
      severity: "warning",
      message: "runtime evidence",
    };
    Object.defineProperty(accessorIssue, "code", {
      get() {
        accessorReads += 1;
        throw new Error("Quality issue accessor must not run.");
      },
    });
    const optionalAccessorIssue: Record<string, unknown> = {
      code: "LOW_TEXT_CONTRAST",
      severity: "warning",
      message: "runtime evidence",
    };
    Object.defineProperty(optionalAccessorIssue, "layerId", {
      get() {
        accessorReads += 1;
        throw new Error("Optional quality issue accessor must not run.");
      },
    });
    const input = Array<unknown>(3);
    Object.defineProperty(input, "0", {
      get() {
        accessorReads += 1;
        throw new Error("Quality issue array accessor must not run.");
      },
    });
    input[1] = accessorIssue;
    input[2] = optionalAccessorIssue;

    const result = mapQualityIssuesToAuthoringIssues(input);

    expect(accessorReads).toBe(0);
    expect(result).toMatchObject({
      valid: false,
      totalIssues: 3,
      retainedIssues: 3,
      issues: [
        { code: "QUALITY_REVIEW_REQUIRED", severity: "error" },
        { code: "QUALITY_REVIEW_REQUIRED", severity: "error" },
        { code: "QUALITY_REVIEW_REQUIRED", severity: "error" },
      ],
    });
  });

  it("bounds large and sparse issue arrays without skipping indices", () => {
    const input = Array.from(
      { length: AUTHORING_QUALITY_ISSUE_LIMITS.maximumInputIssues + 1 },
      () => ({
        code: "TEXT_OVERFLOW",
        severity: "warning" as const,
        message: "fixed input shape",
      }),
    );
    const bounded = mapQualityIssuesToAuthoringIssues(input);
    const malformedTail = mapQualityIssuesToAuthoringIssues([
      ...input.slice(0, AUTHORING_QUALITY_ISSUE_LIMITS.maximumInputIssues),
      null,
    ]);
    const sparse = Array<unknown>(2);
    sparse[1] = input[0];
    const sparseResult = mapQualityIssuesToAuthoringIssues(sparse);

    expect(bounded).toMatchObject({
      valid: false,
      totalIssues: AUTHORING_QUALITY_ISSUE_LIMITS.maximumInputIssues + 1,
      retainedIssues: AUTHORING_QUALITY_ISSUE_LIMITS.maximumInputIssues,
      truncated: true,
    });
    expect(bounded.issues).toHaveLength(
      AUTHORING_QUALITY_ISSUE_LIMITS.maximumInputIssues,
    );
    expect(malformedTail).toMatchObject({
      valid: false,
      totalIssues: AUTHORING_QUALITY_ISSUE_LIMITS.maximumInputIssues + 1,
      retainedIssues: AUTHORING_QUALITY_ISSUE_LIMITS.maximumInputIssues,
      truncated: true,
    });
    expect(sparseResult).toMatchObject({
      valid: false,
      totalIssues: 2,
      retainedIssues: 2,
      issues: [
        { code: "QUALITY_REVIEW_REQUIRED", severity: "error" },
        { code: "TEXT_OVERFLOW", severity: "warning" },
      ],
    });
  });

  it("publishes the same mapper from the browser-safe entry point", () => {
    const input = [
      {
        code: "MISSING_GLYPH",
        severity: "error",
        message: "fixed input shape",
        layerId: "headline",
      },
    ];

    expect(BROWSER_AUTHORING_QUALITY_ISSUE_MAPPING_VERSION).toBe(
      AUTHORING_QUALITY_ISSUE_MAPPING_VERSION,
    );
    expect(mapBrowserQualityIssuesToAuthoringIssues(input)).toEqual(
      mapQualityIssuesToAuthoringIssues(input),
    );
  });
});
