export { canonicalJson } from "./cache/canonical-json.js";
export {
  RENDER_CONFIGURATION,
  createRenderFingerprintPayload,
} from "./cache/fingerprint-contract.js";
export type {
  RenderFingerprintFont,
  RenderFingerprintInput,
} from "./cache/fingerprint-contract.js";
export { FOCAL_CROP_POLICY_VERSION, calculateFocalCrop } from "./assets/focal-crop.js";
export type { FocalCropGeometry } from "./assets/focal-crop.js";
export {
  CAMPAIGN_COMPOSITION_VARIANT_IDS,
  CAMPAIGN_FAMILY_IDS,
  CAMPAIGN_FAMILY_METADATA_VERSION,
  CAMPAIGN_FAMILY_REGISTRY,
} from "./campaigns/metadata.js";
export type {
  CampaignAssetRole,
  CampaignCompositionVariant,
  CampaignCompositionVariantId,
  CampaignContentRole,
  CampaignFamilyDefinition,
  CampaignFamilyId,
  CampaignFamilyMember,
  CampaignSafeAreaPolicy,
} from "./campaigns/metadata.js";
export {
  AUTHORING_CONTRACT_VERSION,
  AUTHORING_ISSUE_CODES,
  AUTHORING_ISSUE_METADATA_VERSION,
  AUTHORING_ISSUE_REGISTRY,
  AUTHORING_TEMPLATE_KEYS,
  AUTHORING_TEMPLATE_REGISTRY,
} from "./authoring/metadata.js";
export type {
  AuthoringAssetRole,
  AuthoringCompositionVariant,
  AuthoringContentField,
  AuthoringContentRole,
  AuthoringIssueAction,
  AuthoringIssueCategory,
  AuthoringIssueCode,
  AuthoringIssueMetadata,
  AuthoringTemplateContract,
  AuthoringTemplateKey,
} from "./authoring/metadata.js";
export {
  AUTHORING_QUALITY_ISSUE_LIMITS,
  AUTHORING_QUALITY_ISSUE_MAPPING_VERSION,
  mapQualityIssuesToAuthoringIssues,
} from "./authoring/issues.js";
export type {
  AuthoringQualityIssueMapping,
  CandidateDocumentIssue,
  CandidateDocumentIssueSource,
} from "./authoring/issues.js";
export {
  readArrayDataValue as readInertArrayDataValue,
  readArrayLength as readInertArrayLength,
  readExactDataRecord as readExactInertDataRecord,
} from "./authoring/inert-data.js";
