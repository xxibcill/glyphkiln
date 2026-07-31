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
  createDesignDocument,
  getDesignDocumentJsonSchema,
  validateDesignDocument,
} from "./schema/index.js";
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
} from "./schema/index.js";

export { PRNG_ALGORITHM, createSeededRandom } from "./seed/index.js";
export type { SeededRandom } from "./seed/index.js";

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
  RenderGraphicOptions,
  RenderGraphicResult,
  RenderedOutput,
  Scene,
  SceneElement,
} from "./renderer/index.js";
export { renderGraphicIsolated } from "./isolation/index.js";
export type { IsolatedRenderOptions } from "./isolation/index.js";

export { inspectDesignDocument } from "./inspect.js";
export type { DesignInspection } from "./inspect.js";
export type { RenderManifest } from "./provenance/index.js";
export { verifyRenderReproduction } from "./provenance/index.js";
