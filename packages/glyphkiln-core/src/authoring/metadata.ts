import type { FormatId } from "../formats/index.js";
import type { DesignLayer, ImageTreatmentId, TemplateId } from "../schema/index.js";
import type { TemplateDefinition } from "../templates/types.js";

export const AUTHORING_CONTRACT_VERSION = "1.0.0" as const;
export const AUTHORING_ISSUE_METADATA_VERSION = "1.0.0" as const;

export const AUTHORING_TEMPLATE_KEYS = Object.freeze([
  "product-announcement@1.1.1",
  "statistic-card@1.1.0",
  "quote-card@1.1.0",
  "article-cover@1.1.0",
  "tiktok-carousel-slide@1.0.1",
  "tiktok-carousel-slide@1.0.2",
  "tiktok-carousel-slide@1.0.3",
  "image-led-campaign@1.0.0",
] as const);
export type AuthoringTemplateKey = (typeof AUTHORING_TEMPLATE_KEYS)[number];

type DesignSchemaVersion = "1.0.0" | "1.1.0" | "1.2.0" | "1.3.0" | "1.4.0";
type ContentLayerType = Extract<
  DesignLayer["type"],
  | "eyebrow"
  | "badge"
  | "headline"
  | "subtitle"
  | "statistic"
  | "cta"
  | "footer"
  | "attribution"
>;
type AssetLayerType = Extract<
  DesignLayer["type"],
  "image" | "logo" | "product-screenshot"
>;
type ContentFieldName = "text" | "value" | "label" | "trend";

export type AuthoringContentField = {
  readonly name: ContentFieldName;
  readonly required: boolean;
  readonly minimumCharacters: number;
  readonly maximumCharacters: number;
};

export type AuthoringContentRole = {
  readonly layerType: ContentLayerType;
  readonly required: boolean;
  readonly fields: readonly AuthoringContentField[];
  readonly guidance: string;
};

export type AuthoringAssetRole = {
  readonly layerType: AssetLayerType;
  readonly required: boolean;
  readonly acceptedMimeTypes: readonly ("image/png" | "image/jpeg")[];
  readonly supportedFits: readonly ("contain" | "cover")[];
  readonly supportsFocalPoint: boolean;
  readonly supportedTreatments: readonly ImageTreatmentId[];
  readonly guidance: string;
};

export type AuthoringCompositionVariant = {
  readonly id: string;
  readonly label: string;
  readonly selection: "fixed-by-template-version";
  readonly guidance: string;
};

export type AuthoringTemplateContract = {
  readonly key: AuthoringTemplateKey;
  readonly template: {
    readonly id: TemplateId;
    readonly version: TemplateDefinition["version"];
  };
  readonly compatibleSchemaVersions: readonly DesignSchemaVersion[];
  readonly compatibleFormats: readonly FormatId[];
  readonly compositionVariant: AuthoringCompositionVariant;
  readonly contentRoles: readonly AuthoringContentRole[];
  readonly assetRoles: readonly AuthoringAssetRole[];
  readonly optionalDecorativeLayers: readonly DesignLayer["type"][];
  readonly hardBounds: {
    readonly maximumDocumentLayers: 100;
    readonly maximumDocumentAssets: 100;
    readonly maximumDocumentFonts: 32;
    readonly maximumVisibleLayersPerRole: 1;
    readonly headlineMaximumLines: number;
    readonly mutuallyExclusiveRoles: readonly (readonly ContentLayerType[])[];
  };
  readonly safeAreaGuidance: string;
  readonly authoringGuidance: readonly string[];
};

export type AuthoringIssueCategory =
  | "document"
  | "copy"
  | "template"
  | "role"
  | "asset"
  | "crop"
  | "contrast"
  | "safe-area"
  | "text-layout"
  | "brand";

export type AuthoringIssueAction =
  | "repair-document-structure"
  | "add-required-copy"
  | "shorten-copy"
  | "choose-compatible-template"
  | "add-required-role"
  | "remove-unsupported-role"
  | "remove-duplicate-role"
  | "choose-one-role"
  | "choose-supported-asset-fit"
  | "replace-unsuitable-asset"
  | "adjust-focal-point"
  | "improve-contrast"
  | "move-content-inside-safe-area"
  | "resolve-text-overflow"
  | "review-copy-rhythm"
  | "replace-unsupported-text"
  | "supply-font-coverage"
  | "choose-brand-compliant-value"
  | "review-brand-preference"
  | "move-decoration-outside-quiet-region"
  | "review-quality-evidence";

export const AUTHORING_ISSUE_CODES = Object.freeze([
  "DOCUMENT_SET_INVALID",
  "DOCUMENT_STRUCTURE_INVALID",
  "COPY_REQUIRED",
  "COPY_TOO_LONG",
  "TEMPLATE_INCOMPATIBLE",
  "REQUIRED_ROLE_MISSING",
  "UNSUPPORTED_ROLE",
  "DUPLICATE_ROLE",
  "CONFLICTING_ROLES",
  "ASSET_FIT_UNSUPPORTED",
  "ASSET_SUITABILITY_RISK",
  "CROP_CONFIGURATION_INVALID",
  "CONTRAST_INSUFFICIENT",
  "SAFE_AREA_RISK",
  "TEXT_OVERFLOW",
  "COPY_RHYTHM_REVIEW",
  "TEXT_LAYOUT_UNSUPPORTED",
  "MISSING_GLYPH",
  "BRAND_POLICY_CONFLICT",
  "BRAND_PREFERENCE_REVIEW",
  "QUIET_REGION_RISK",
  "QUALITY_REVIEW_REQUIRED",
] as const);
export type AuthoringIssueCode = (typeof AUTHORING_ISSUE_CODES)[number];

export type AuthoringIssueMetadata = {
  readonly code: AuthoringIssueCode;
  readonly category: AuthoringIssueCategory;
  readonly action: AuthoringIssueAction;
  readonly guidance: string;
};

const textField = Object.freeze([
  { name: "text", required: true, minimumCharacters: 1, maximumCharacters: 2_000 },
] as const);
const badgeField = Object.freeze([
  { name: "text", required: true, minimumCharacters: 1, maximumCharacters: 80 },
] as const);
const statisticFields = Object.freeze([
  { name: "value", required: true, minimumCharacters: 1, maximumCharacters: 80 },
  { name: "label", required: true, minimumCharacters: 1, maximumCharacters: 240 },
  { name: "trend", required: false, minimumCharacters: 1, maximumCharacters: 80 },
] as const);
const commonFormats = Object.freeze([
  "linkedin-landscape",
  "instagram-square",
  "instagram-portrait",
  "instagram-story",
  "x-landscape",
  "youtube-thumbnail",
] as const satisfies readonly FormatId[]);
const allSchemaVersions = Object.freeze([
  "1.0.0",
  "1.1.0",
  "1.2.0",
  "1.3.0",
  "1.4.0",
] as const satisfies readonly DesignSchemaVersion[]);
const tiktokSchemaVersions = Object.freeze([
  "1.1.0",
  "1.2.0",
  "1.3.0",
  "1.4.0",
] as const satisfies readonly DesignSchemaVersion[]);
const currentSchemaVersions = Object.freeze([
  "1.4.0",
] as const satisfies readonly DesignSchemaVersion[]);
const acceptedRasterMimeTypes = Object.freeze(["image/png", "image/jpeg"] as const);
const supportedAssetFits = Object.freeze(["contain", "cover"] as const);

function contentRole(
  layerType: ContentLayerType,
  required: boolean,
  guidance: string,
  fields: readonly AuthoringContentField[] = textField,
): AuthoringContentRole {
  return { layerType, required, fields, guidance };
}

function assetRole(
  layerType: AssetLayerType,
  required: boolean,
  guidance: string,
  options: {
    supportedFits?: readonly ("contain" | "cover")[];
    supportsFocalPoint?: boolean;
    supportedTreatments?: readonly ImageTreatmentId[];
  } = {},
): AuthoringAssetRole {
  return {
    layerType,
    required,
    acceptedMimeTypes: acceptedRasterMimeTypes,
    supportedFits: options.supportedFits ?? supportedAssetFits,
    supportsFocalPoint: options.supportsFocalPoint ?? false,
    supportedTreatments: options.supportedTreatments ?? [],
    guidance,
  };
}

function templateContract(
  input: Omit<AuthoringTemplateContract, "hardBounds"> & {
    headlineMaximumLines: number;
    mutuallyExclusiveRoles?: readonly (readonly ContentLayerType[])[];
  },
): AuthoringTemplateContract {
  const { headlineMaximumLines, mutuallyExclusiveRoles = [], ...contract } = input;
  return {
    ...contract,
    hardBounds: {
      maximumDocumentLayers: 100,
      maximumDocumentAssets: 100,
      maximumDocumentFonts: 32,
      maximumVisibleLayersPerRole: 1,
      headlineMaximumLines,
      mutuallyExclusiveRoles,
    },
  };
}

const tiktokContentRoles = Object.freeze([
  contentRole("badge", true, "Use a short slide number or sequence label.", badgeField),
  contentRole("eyebrow", false, "Use only for a compact series or category cue."),
  contentRole("headline", true, "Write one clear hook that can fit in four lines."),
  contentRole(
    "subtitle",
    false,
    "Use one supporting benefit; do not pair with a statistic.",
  ),
  contentRole(
    "statistic",
    false,
    "Use one structured metric; do not pair with a subtitle.",
    statisticFields,
  ),
  contentRole("cta", false, "Reserve for a short action or swipe cue."),
  contentRole("footer", false, "Use for restrained supporting context."),
]);

const authoringTemplateRegistry = {
  "product-announcement@1.1.1": templateContract({
    key: "product-announcement@1.1.1",
    template: { id: "product-announcement", version: "1.1.1" },
    compatibleSchemaVersions: allSchemaVersions,
    compatibleFormats: commonFormats,
    compositionVariant: {
      id: "split-announcement",
      label: "Split announcement",
      selection: "fixed-by-template-version",
      guidance: "Left-weighted announcement copy with optional product imagery.",
    },
    contentRoles: [
      contentRole(
        "eyebrow",
        false,
        "Use a compact category cue; do not pair with a badge.",
      ),
      contentRole(
        "badge",
        false,
        "Use a short emphasis label; do not pair with an eyebrow.",
        badgeField,
      ),
      contentRole(
        "headline",
        true,
        "State the announcement in no more than three lines.",
      ),
      contentRole("subtitle", false, "Add one concise supporting explanation."),
      contentRole("cta", false, "Use a short action phrase."),
    ],
    assetRoles: [
      assetRole(
        "product-screenshot",
        false,
        "Use an admitted raster product view when it supports the announcement.",
      ),
    ],
    optionalDecorativeLayers: ["background", "procedural-decoration"],
    headlineMaximumLines: 3,
    mutuallyExclusiveRoles: [["eyebrow", "badge"]],
    safeAreaGuidance: "Keep all semantic copy inside the brand safe area.",
    authoringGuidance: [
      "Lead with the product change, not a generic campaign slogan.",
      "Treat asset declarations as server-resolved references, never URLs or paths.",
    ],
  }),
  "statistic-card@1.1.0": templateContract({
    key: "statistic-card@1.1.0",
    template: { id: "statistic-card", version: "1.1.0" },
    compatibleSchemaVersions: allSchemaVersions,
    compatibleFormats: commonFormats,
    compositionVariant: {
      id: "hero-statistic",
      label: "Hero statistic",
      selection: "fixed-by-template-version",
      guidance: "One oversized metric with a compact label and optional headline.",
    },
    contentRoles: [
      contentRole(
        "headline",
        false,
        "Use a short framing statement of at most two lines.",
      ),
      contentRole(
        "statistic",
        true,
        "Supply one value and its exact supporting label.",
        statisticFields,
      ),
    ],
    assetRoles: [],
    optionalDecorativeLayers: ["background", "procedural-decoration"],
    headlineMaximumLines: 2,
    safeAreaGuidance: "Keep the complete statistic block inside all safe-area edges.",
    authoringGuidance: [
      "Preserve the meaning and units of the supplied metric.",
      "Do not invent chart data or additional metrics.",
    ],
  }),
  "quote-card@1.1.0": templateContract({
    key: "quote-card@1.1.0",
    template: { id: "quote-card", version: "1.1.0" },
    compatibleSchemaVersions: allSchemaVersions,
    compatibleFormats: commonFormats,
    compositionVariant: {
      id: "centered-quote",
      label: "Centered quote",
      selection: "fixed-by-template-version",
      guidance: "A large quotation with restrained attribution and an accent mark.",
    },
    contentRoles: [
      contentRole(
        "headline",
        true,
        "Keep the quotation focused enough to fit in five lines.",
      ),
      contentRole(
        "attribution",
        true,
        "Name the supplied source accurately and concisely.",
      ),
    ],
    assetRoles: [],
    optionalDecorativeLayers: ["background", "procedural-decoration"],
    headlineMaximumLines: 5,
    safeAreaGuidance:
      "Keep the quote and attribution in the centered safe-area column.",
    authoringGuidance: [
      "Do not fabricate or paraphrase a quotation without explicit brief authority.",
      "Keep attribution as content data, not provenance evidence.",
    ],
  }),
  "article-cover@1.1.0": templateContract({
    key: "article-cover@1.1.0",
    template: { id: "article-cover", version: "1.1.0" },
    compatibleSchemaVersions: allSchemaVersions,
    compatibleFormats: commonFormats,
    compositionVariant: {
      id: "lower-third-editorial",
      label: "Lower-third editorial",
      selection: "fixed-by-template-version",
      guidance:
        "Editorial eyebrow, title, and optional byline in a lower-third column.",
    },
    contentRoles: [
      contentRole("eyebrow", false, "Use for a compact topic or publication cue."),
      contentRole(
        "headline",
        true,
        "Write a strong editorial title of at most three lines.",
      ),
      contentRole("attribution", false, "Use for an accurate author or source byline."),
    ],
    assetRoles: [],
    optionalDecorativeLayers: ["background", "procedural-decoration"],
    headlineMaximumLines: 3,
    safeAreaGuidance: "Anchor all editorial copy to the lower safe-area grid.",
    authoringGuidance: [
      "Prefer a specific editorial promise over generic promotional copy.",
      "Keep byline and source claims human-verifiable.",
    ],
  }),
  "tiktok-carousel-slide@1.0.1": templateContract({
    key: "tiktok-carousel-slide@1.0.1",
    template: { id: "tiktok-carousel-slide", version: "1.0.1" },
    compatibleSchemaVersions: tiktokSchemaVersions,
    compatibleFormats: ["tiktok-carousel"],
    compositionVariant: {
      id: "proof-sheet",
      label: "Proof sheet",
      selection: "fixed-by-template-version",
      guidance: "A 9:16 numbered proof-sheet slide with an oversized hook.",
    },
    contentRoles: tiktokContentRoles,
    assetRoles: [],
    optionalDecorativeLayers: ["background", "procedural-decoration"],
    headlineMaximumLines: 4,
    mutuallyExclusiveRoles: [["subtitle", "statistic"]],
    safeAreaGuidance: "Keep narrative copy above the interface-heavy lower edge.",
    authoringGuidance: [
      "Make each slide understandable as one step in a sequence.",
      "Use either one benefit or one metric, never both.",
    ],
  }),
  "tiktok-carousel-slide@1.0.2": templateContract({
    key: "tiktok-carousel-slide@1.0.2",
    template: { id: "tiktok-carousel-slide", version: "1.0.2" },
    compatibleSchemaVersions: tiktokSchemaVersions,
    compatibleFormats: ["tiktok-carousel"],
    compositionVariant: {
      id: "safe-editorial",
      label: "Safe editorial",
      selection: "fixed-by-template-version",
      guidance: "A 9:16 typography-first slide with conservative interface insets.",
    },
    contentRoles: tiktokContentRoles,
    assetRoles: [],
    optionalDecorativeLayers: ["background", "procedural-decoration"],
    headlineMaximumLines: 4,
    mutuallyExclusiveRoles: [["subtitle", "statistic"]],
    safeAreaGuidance: "Honor the conservative top, right, caption, and bottom insets.",
    authoringGuidance: [
      "Write one hook and one supporting idea per slide.",
      "Use either one benefit or one metric, never both.",
    ],
  }),
  "tiktok-carousel-slide@1.0.3": templateContract({
    key: "tiktok-carousel-slide@1.0.3",
    template: { id: "tiktok-carousel-slide", version: "1.0.3" },
    compatibleSchemaVersions: ["1.3.0", "1.4.0"],
    compatibleFormats: ["tiktok-photo-carousel"],
    compositionVariant: {
      id: "organic-photo-editorial",
      label: "Organic photo editorial",
      selection: "fixed-by-template-version",
      guidance: "A compact 3:4 typography-first organic photo-carousel slide.",
    },
    contentRoles: tiktokContentRoles,
    assetRoles: [],
    optionalDecorativeLayers: ["background", "procedural-decoration"],
    headlineMaximumLines: 4,
    mutuallyExclusiveRoles: [["subtitle", "statistic"]],
    safeAreaGuidance: "Honor compact top, action-side, and bottom interface insets.",
    authoringGuidance: [
      "Write one hook and one supporting idea per slide.",
      "Use either one benefit or one metric, never both.",
    ],
  }),
  "image-led-campaign@1.0.0": templateContract({
    key: "image-led-campaign@1.0.0",
    template: { id: "image-led-campaign", version: "1.0.0" },
    compatibleSchemaVersions: currentSchemaVersions,
    compatibleFormats: ["linkedin-landscape", "instagram-square", "instagram-portrait"],
    compositionVariant: {
      id: "focal-editorial",
      label: "Focal editorial",
      selection: "fixed-by-template-version",
      guidance:
        "Full-bleed focal imagery with safe-area editorial copy and a compact brand mark.",
    },
    contentRoles: [
      contentRole("eyebrow", false, "Use a compact category or campaign cue."),
      contentRole("headline", true, "Write the primary message to fit in four lines."),
      contentRole("subtitle", false, "Add one concise supporting statement."),
      contentRole("cta", false, "Use a short action phrase."),
    ],
    assetRoles: [
      assetRole(
        "image",
        true,
        "Use an admitted full-bleed raster with an explicit focal point.",
        {
          supportedFits: ["cover"],
          supportsFocalPoint: true,
          supportedTreatments: ["none", "dark-scrim", "light-scrim"],
        },
      ),
      assetRole(
        "logo",
        true,
        "Use an admitted raster brand mark with sufficient quiet space.",
        {
          supportedFits: ["contain"],
        },
      ),
    ],
    optionalDecorativeLayers: ["background"],
    headlineMaximumLines: 4,
    safeAreaGuidance:
      "Keep logo and copy inside the safe area; only the focal image is full bleed.",
    authoringGuidance: [
      "Choose crop intent explicitly and review the returned crop evidence.",
      "Choose a closed treatment and review composited contrast evidence.",
      "Treat asset declarations as server-resolved references, never URLs or paths.",
    ],
  }),
} as const satisfies Record<AuthoringTemplateKey, AuthoringTemplateContract>;

export const AUTHORING_TEMPLATE_REGISTRY = deepFreeze(authoringTemplateRegistry);

function issue(
  code: AuthoringIssueCode,
  category: AuthoringIssueCategory,
  action: AuthoringIssueAction,
  guidance: string,
): AuthoringIssueMetadata {
  return { code, category, action, guidance };
}

export const AUTHORING_ISSUE_REGISTRY = deepFreeze({
  DOCUMENT_SET_INVALID: issue(
    "DOCUMENT_SET_INVALID",
    "document",
    "repair-document-structure",
    "Supply between one and eight candidate design documents.",
  ),
  DOCUMENT_STRUCTURE_INVALID: issue(
    "DOCUMENT_STRUCTURE_INVALID",
    "document",
    "repair-document-structure",
    "Repair the candidate to match the strict DesignDocument schema.",
  ),
  COPY_REQUIRED: issue(
    "COPY_REQUIRED",
    "copy",
    "add-required-copy",
    "Supply non-empty copy for the referenced content field.",
  ),
  COPY_TOO_LONG: issue(
    "COPY_TOO_LONG",
    "copy",
    "shorten-copy",
    "Shorten the referenced copy to its published hard bound.",
  ),
  TEMPLATE_INCOMPATIBLE: issue(
    "TEMPLATE_INCOMPATIBLE",
    "template",
    "choose-compatible-template",
    "Choose an exact template version and format published by the authoring contract.",
  ),
  REQUIRED_ROLE_MISSING: issue(
    "REQUIRED_ROLE_MISSING",
    "role",
    "add-required-role",
    "Add the required visible semantic role.",
  ),
  UNSUPPORTED_ROLE: issue(
    "UNSUPPORTED_ROLE",
    "role",
    "remove-unsupported-role",
    "Remove the visible role or choose a template version that supports it.",
  ),
  DUPLICATE_ROLE: issue(
    "DUPLICATE_ROLE",
    "role",
    "remove-duplicate-role",
    "Keep at most one visible layer for this semantic role.",
  ),
  CONFLICTING_ROLES: issue(
    "CONFLICTING_ROLES",
    "role",
    "choose-one-role",
    "Keep only one of the mutually exclusive semantic roles.",
  ),
  ASSET_FIT_UNSUPPORTED: issue(
    "ASSET_FIT_UNSUPPORTED",
    "asset",
    "choose-supported-asset-fit",
    "Use the asset fit required by the selected template version.",
  ),
  ASSET_SUITABILITY_RISK: issue(
    "ASSET_SUITABILITY_RISK",
    "asset",
    "replace-unsuitable-asset",
    "Review or replace the asset using the renderer's suitability evidence.",
  ),
  CROP_CONFIGURATION_INVALID: issue(
    "CROP_CONFIGURATION_INVALID",
    "crop",
    "adjust-focal-point",
    "Use a normalized focal point and review the deterministic crop evidence.",
  ),
  CONTRAST_INSUFFICIENT: issue(
    "CONTRAST_INSUFFICIENT",
    "contrast",
    "improve-contrast",
    "Adjust brand colors, imagery, or the closed treatment and review contrast evidence.",
  ),
  SAFE_AREA_RISK: issue(
    "SAFE_AREA_RISK",
    "safe-area",
    "move-content-inside-safe-area",
    "Revise the content or safe-area-compatible composition until all semantic content fits.",
  ),
  TEXT_OVERFLOW: issue(
    "TEXT_OVERFLOW",
    "copy",
    "resolve-text-overflow",
    "Shorten the copy or choose a compatible template without silently deleting text.",
  ),
  COPY_RHYTHM_REVIEW: issue(
    "COPY_RHYTHM_REVIEW",
    "copy",
    "review-copy-rhythm",
    "Review the final line and revise the copy rhythm if the orphan is distracting.",
  ),
  TEXT_LAYOUT_UNSUPPORTED: issue(
    "TEXT_LAYOUT_UNSUPPORTED",
    "text-layout",
    "replace-unsupported-text",
    "Use text supported by the pinned layout policy for this release.",
  ),
  MISSING_GLYPH: issue(
    "MISSING_GLYPH",
    "text-layout",
    "supply-font-coverage",
    "Select an admitted font that covers every required glyph.",
  ),
  BRAND_POLICY_CONFLICT: issue(
    "BRAND_POLICY_CONFLICT",
    "brand",
    "choose-brand-compliant-value",
    "Choose a value allowed by the immutable brand snapshot.",
  ),
  BRAND_PREFERENCE_REVIEW: issue(
    "BRAND_PREFERENCE_REVIEW",
    "brand",
    "review-brand-preference",
    "Review the non-preferred style before accepting the direction.",
  ),
  QUIET_REGION_RISK: issue(
    "QUIET_REGION_RISK",
    "safe-area",
    "move-decoration-outside-quiet-region",
    "Move procedural detail away from the semantic quiet region.",
  ),
  QUALITY_REVIEW_REQUIRED: issue(
    "QUALITY_REVIEW_REQUIRED",
    "document",
    "review-quality-evidence",
    "Review the bounded Core quality evidence before accepting the candidate.",
  ),
} as const satisfies Record<AuthoringIssueCode, AuthoringIssueMetadata>);

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
