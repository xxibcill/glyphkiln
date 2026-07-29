export {
  AssetDeclarationSchema,
  BrandSnapshotSchema,
  DesignDocumentSchema,
  FontDeclarationSchema,
  LayerSchema,
  PROCEDURAL_STYLE_IDS,
  QuietRegionSchema,
  TEMPLATE_IDS,
  createDesignDocument,
  validateDesignDocument,
} from "./design-document.js";
export type {
  AssetDeclaration,
  BrandSnapshot,
  CreateDesignDocumentInput,
  DesignDocument,
  DesignLayer,
  FontDeclaration,
  ProceduralStyleId,
  TemplateId,
  ValidationProblem,
  ValidationResult,
} from "./design-document.js";
export { getDesignDocumentJsonSchema } from "./json-schema.js";
