export {
  DESIGN_DOCUMENT_VERSION,
  SUPPORTED_DESIGN_DOCUMENT_VERSIONS,
  MANIFEST_VERSION,
  PRODUCT_CLAIM,
  RENDERER_NAME,
  RENDERER_VERSION,
  GlyphkilnError,
} from "./domain/types.js";
export type {
  AssetOrigin,
  Bounds,
  Dimensions,
  NormalizedRect,
  OutputFormat,
  QualityIssue,
  RenderingMethod,
  ResolvedAsset,
  ResolvedFont,
} from "./domain/types.js";

export { FORMAT_IDS, FORMAT_REGISTRY, getFormatDimensions } from "./formats/index.js";
export type { FormatId } from "./formats/index.js";

export {
  DesignDocumentSchema,
  DESIGN_DOCUMENT_RUNTIME_REFINEMENTS,
  PROCEDURAL_STYLE_IDS,
  TEMPLATE_IDS,
  FocalPointSchema,
  IMAGE_TREATMENT_IDS,
  createDesignDocument,
  getDesignDocumentJsonSchema,
  validateDesignDocument,
} from "./schema/index.js";
export type {
  AssetDeclaration,
  BrandSnapshot,
  BrandTypographyRole,
  CreateDesignDocumentInput,
  DesignDocument,
  DesignLayer,
  FontDeclaration,
  FocalPoint,
  ImageTreatmentId,
  ProceduralStyleId,
  TemplateId,
  ValidationProblem,
  ValidationResult,
} from "./schema/index.js";

export { PRNG_ALGORITHM, createSeededRandom } from "./seed/index.js";
export type { SeededRandom } from "./seed/index.js";

export {
  CAMPAIGN_COMPOSITION_VARIANT_IDS,
  CAMPAIGN_FAMILY_IDS,
  CAMPAIGN_FAMILY_METADATA_VERSION,
  CAMPAIGN_FAMILY_REGISTRY,
  CAMPAIGN_SEED_DERIVATION_VERSION,
  createCampaignCanvasKey,
  createCampaignDirectionKey,
  deriveCampaignSeeds,
} from "./campaigns/index.js";

export {
  DELIVERY_PROFILE_IDS,
  DELIVERY_PROFILE_METADATA_VERSION,
  DELIVERY_PROFILE_REGISTRY,
  DELIVERY_SOURCES,
  defaultDeliveryProfileForFormat,
  deliveryProfilesForFormat,
} from "./delivery/index.js";
export type {
  DeliveryEvidenceLevel,
  DeliveryFact,
  DeliveryProfile,
  DeliveryProfileId,
  DeliverySource,
  DeliverySurfaceOverlay,
} from "./delivery/index.js";

export {
  CAROUSEL_DELIVERY_SIDECAR_VERSION,
  CAROUSEL_NARRATIVE_ROLE_IDS,
  CAROUSEL_REVIEW_ISSUE_CODES,
  CAROUSEL_SEQUENCE_VERSION,
  createCarouselDeliverySidecar,
  reviewCarouselSequence,
} from "./carousels/index.js";
export type {
  CarouselDeliverySidecar,
  CarouselNarrativeRole,
  CarouselReviewIssue,
  CarouselReviewIssueCode,
  CarouselSequence,
  CarouselSequenceReview,
  CarouselSlide,
  CarouselSourceNote,
} from "./carousels/index.js";
export type {
  CampaignAssetRole,
  CampaignCanvasKey,
  CampaignCompositionVariant,
  CampaignCompositionVariantId,
  CampaignContentRole,
  CampaignDirectionKey,
  CampaignFamilyDefinition,
  CampaignFamilyId,
  CampaignFamilyMember,
  CampaignSafeAreaPolicy,
  CampaignSeedDerivationInput,
  DerivedCampaignSeeds,
} from "./campaigns/index.js";

export {
  AUTHORING_CONTRACT_VERSION,
  AUTHORING_ISSUE_CODES,
  AUTHORING_ISSUE_METADATA_VERSION,
  AUTHORING_ISSUE_REGISTRY,
  AUTHORING_QUALITY_ISSUE_LIMITS,
  AUTHORING_QUALITY_ISSUE_MAPPING_VERSION,
  AUTHORING_TEMPLATE_KEYS,
  AUTHORING_TEMPLATE_REGISTRY,
  CANDIDATE_DOCUMENT_LIMITS,
  CANDIDATE_DOCUMENT_VALIDATION_VERSION,
  mapQualityIssuesToAuthoringIssues,
  readExactInertDataRecord,
  readInertArrayDataValue,
  readInertArrayLength,
  validateCandidateDocuments,
} from "./authoring/index.js";
export type {
  AuthoringAssetRole,
  AuthoringCompositionVariant,
  AuthoringContentField,
  AuthoringContentRole,
  AuthoringIssueAction,
  AuthoringIssueCategory,
  AuthoringIssueCode,
  AuthoringIssueMetadata,
  AuthoringQualityIssueMapping,
  AuthoringTemplateContract,
  AuthoringTemplateKey,
  CandidateDocumentIssue,
  CandidateDocumentIssueSource,
  CandidateDocumentSetValidation,
  CandidateDocumentValidation,
  InvalidCandidateDocument,
  ValidCandidateDocument,
} from "./authoring/index.js";

export { RENDER_RESOURCE_LIMITS, RENDER_WORKER_PROFILE } from "./resources/index.js";
export type {
  RenderResourceLimits,
  RenderWorkerProfile,
  ResourceProblem,
} from "./resources/index.js";

export { canonicalJson, hashCanonical, sha256 } from "./cache/canonical.js";
export {
  RENDER_CONFIGURATION,
  createRenderFingerprint,
  createRenderFingerprintPayload,
} from "./cache/fingerprint.js";
export type {
  RenderFingerprintFont,
  RenderFingerprintInput,
} from "./cache/fingerprint.js";

export {
  PROCEDURAL_ALGORITHM_VERSIONS,
  createProceduralBackground,
} from "./backgrounds/index.js";
export type {
  ProceduralBackgroundInput,
  ProceduralBackgroundResult,
} from "./backgrounds/index.js";

export {
  DEVELOPMENT_FONT_SHA256,
  FontRegistry,
  createDevelopmentFont,
} from "./fonts/index.js";
export { AssetRegistry } from "./assets/index.js";
export {
  COLOR_NORMALIZATION_IMPLEMENTATION,
  COLOR_NORMALIZATION_LIMITS,
  COLOR_NORMALIZATION_POLICY_VERSION,
  normalizeRasterColor,
} from "./assets/color-normalization.js";
export type {
  ColorNormalizationInput,
  ColorNormalizationProfile,
  ColorNormalizationReport,
  NormalizedRasterColor,
} from "./assets/color-normalization.js";
export { FOCAL_CROP_POLICY_VERSION, calculateFocalCrop } from "./assets/focal-crop.js";
export type { FocalCropGeometry } from "./assets/focal-crop.js";
export {
  IMAGE_CONTRAST_POLICY_VERSION,
  IMAGE_TREATMENTS,
  IMAGE_TREATMENT_POLICY_VERSION,
} from "./assets/image-policy.js";
export { contrastRatio, isInside, safeAreaBounds } from "./layout/index.js";
export {
  GRAPHEME_SEGMENTATION_POLICY_VERSION,
  LINE_BREAKING_POLICY_VERSION,
  THAI_SEGMENTATION_POLICY_VERSION,
  TEXT_LAYOUT_DIAGNOSTICS_VERSION,
  TYPOGRAPHY_ALGORITHM_VERSION,
  TYPOGRAPHY_POLICY,
  WHITESPACE_SEGMENTATION_POLICY_VERSION,
  analyzeTextLayoutSupport,
  fitText,
  segmentThaiText,
  wrapText,
} from "./typography/index.js";
export type {
  BrokenWord,
  DesignTextLayoutDiagnostic,
  DesignTextLayoutInspection,
  FitTextOptions,
  FittedText,
  OrphanLine,
  TextLayoutAnalysis,
  TextLayoutDiagnostic,
  TextLayoutDiagnosticCode,
  TextLayoutMatch,
  TextLayoutMatchProperty,
  TextMeasurer,
  TextStyle,
  WrapTextOptions,
  WrappedText,
} from "./typography/index.js";

export { TEMPLATE_REGISTRY } from "./templates/index.js";
export type { TemplateDefinition } from "./templates/index.js";

export { renderGraphic } from "./renderer/index.js";
export type {
  ContrastEvidence,
  ContrastSampleEvidence,
  ImageCropEvidence,
  RenderGraphicOptions,
  RenderGraphicResult,
  RenderEvidence,
  RenderedOutput,
  Scene,
  SceneElement,
  TextBoundsEvidence,
} from "./renderer/index.js";
export { RENDER_EVIDENCE_VERSION } from "./renderer/index.js";
export { renderGraphicIsolated } from "./isolation/index.js";
export type { IsolatedRenderOptions } from "./isolation/index.js";

export { inspectDesignDocument } from "./inspect.js";
export type { DesignInspection } from "./inspect.js";
export type { RenderManifest } from "./provenance/index.js";
export { verifyRenderReproduction } from "./provenance/index.js";
