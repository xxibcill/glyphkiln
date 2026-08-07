import { describe, expect, it } from "vitest";

import {
  AUTHORING_CONTRACT_VERSION,
  AUTHORING_ISSUE_CODES,
  AUTHORING_ISSUE_METADATA_VERSION,
  AUTHORING_ISSUE_REGISTRY,
  AUTHORING_TEMPLATE_KEYS,
  AUTHORING_TEMPLATE_REGISTRY,
  CAMPAIGN_FAMILY_REGISTRY,
  CANDIDATE_DOCUMENT_LIMITS,
  CANDIDATE_DOCUMENT_VALIDATION_VERSION,
  canonicalJson,
  validateCandidateDocuments,
  type DesignDocument,
  type DesignLayer,
} from "../src/index.js";
import {
  AUTHORING_CONTRACT_VERSION as BROWSER_AUTHORING_CONTRACT_VERSION,
  AUTHORING_ISSUE_REGISTRY as BROWSER_AUTHORING_ISSUE_REGISTRY,
  AUTHORING_TEMPLATE_REGISTRY as BROWSER_AUTHORING_TEMPLATE_REGISTRY,
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
