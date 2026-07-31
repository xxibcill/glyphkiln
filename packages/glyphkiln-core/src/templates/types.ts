import type { AssetRegistry } from "../assets/index.js";
import type { QualityIssue } from "../domain/types.js";
import type { FontRegistry } from "../fonts/index.js";
import type { FormatId } from "../formats/index.js";
import type { DesignDocument, DesignLayer, TemplateId } from "../schema/index.js";
import type { Scene } from "../renderer/scene.js";

export type TemplateRenderContext = {
  document: DesignDocument;
  assets: AssetRegistry;
  fonts: FontRegistry;
};

export type TemplateRenderResult = {
  scene: Scene;
  qualityIssues: QualityIssue[];
  proceduralAlgorithmVersions: Record<string, string>;
};

export type TemplateDefinition = {
  id: TemplateId;
  version: "1.0.0" | "1.0.1" | "1.0.2" | "1.0.3" | "1.1.0" | "1.1.1";
  requiredLayers: readonly DesignLayer["type"][];
  supportedLayers: readonly DesignLayer["type"][];
  mutuallyExclusiveLayers?: readonly (readonly DesignLayer["type"][])[];
  supportedFormats: readonly FormatId[];
  constraints: {
    headlineMaximumLines: number;
    safeAreaBehavior: string;
    layout: string;
  };
  render(context: TemplateRenderContext): TemplateRenderResult;
};
