import type { AssetRegistry } from "../assets/index.js";
import type { QualityIssue } from "../domain/types.js";
import type { FontRegistry } from "../fonts/index.js";
import type { FormatId } from "../formats/index.js";
import type { DesignDocument, DesignLayer, TemplateId } from "../schema/index.js";
import type { Scene } from "../renderer/scene.js";
import type { RenderEvidence } from "../renderer/evidence.js";

export type TemplateRenderContext = {
  document: DesignDocument;
  assets: AssetRegistry;
  fonts: FontRegistry;
};

export type TemplateRenderResult = {
  scene: Scene;
  qualityIssues: QualityIssue[];
  proceduralAlgorithmVersions: Record<string, string>;
  evidence: RenderEvidence;
};

export type TemplateDefinition = {
  id: TemplateId;
  version:
    | "1.0.0"
    | "1.0.1"
    | "1.0.2"
    | "1.0.3"
    | "1.0.4"
    | "1.1.0"
    | "1.1.1"
    | "1.2.0"
    | "1.3.0";
  requiredLayers: readonly DesignLayer["type"][];
  supportedLayers: readonly DesignLayer["type"][];
  mutuallyExclusiveLayers?: readonly (readonly DesignLayer["type"][])[];
  requiredAssetFits?: readonly {
    layerType: "logo" | "image" | "product-screenshot";
    fit: "contain" | "cover";
  }[];
  supportedFormats: readonly FormatId[];
  /**
   * DesignDocument 1.7.0 layer fields this exact version implements. A visible
   * layer that uses an unlisted field is rejected with
   * TEMPLATE_FEATURE_UNSUPPORTED instead of being silently ignored.
   */
  capabilities?: TemplateCapabilities;
  constraints: {
    headlineMaximumLines: number;
    safeAreaBehavior: string;
    layout: string;
  };
  render(context: TemplateRenderContext): TemplateRenderResult;
};

export type TemplateTextLayerType =
  "headline" | "subtitle" | "eyebrow" | "cta" | "footer" | "attribution";

export type TemplateCapabilities = {
  textEmphasis?: readonly TemplateTextLayerType[];
  openTypeFeatures?: readonly TemplateTextLayerType[];
  localImageTreatments?: boolean;
  subjectRegion?: boolean;
};
