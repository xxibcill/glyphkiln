export {
  AUTHORING_CONTRACT_VERSION,
  AUTHORING_ISSUE_CODES,
  AUTHORING_ISSUE_METADATA_VERSION,
  AUTHORING_ISSUE_REGISTRY,
  AUTHORING_TEMPLATE_KEYS,
  AUTHORING_TEMPLATE_REGISTRY,
} from "./metadata.js";
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
} from "./metadata.js";

export {
  CAROUSEL_COPY_ADVISORY,
  CAROUSEL_COPY_ADVISORY_VERSION,
} from "./carousel-copy-policy.js";
export type { CarouselCopyAdvisoryRange } from "./carousel-copy-policy.js";

export {
  CANDIDATE_DOCUMENT_LIMITS,
  CANDIDATE_DOCUMENT_VALIDATION_VERSION,
  validateCandidateDocuments,
} from "./candidates.js";
export type {
  CandidateDocumentIssue,
  CandidateDocumentIssueSource,
  CandidateDocumentSetValidation,
  CandidateDocumentValidation,
  InvalidCandidateDocument,
  ValidCandidateDocument,
} from "./candidates.js";

export {
  AUTHORING_QUALITY_ISSUE_LIMITS,
  AUTHORING_QUALITY_ISSUE_MAPPING_VERSION,
  mapQualityIssuesToAuthoringIssues,
} from "./issues.js";
export type { AuthoringQualityIssueMapping } from "./issues.js";

export {
  readArrayDataValue as readInertArrayDataValue,
  readArrayLength as readInertArrayLength,
  readExactDataRecord as readExactInertDataRecord,
} from "./inert-data.js";
