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
  /**
   * The template version's typography engine. `m1` (HarfBuzz, script runs,
   * cluster tracking, font model) is opted into by new exact versions only;
   * `m3` is `m1` plus the M3 line breaking (UAX #14 with tailorings, the
   * hybrid Thai segmenter with the document and brand lexicon, and
   * `preferBreakAfter`). Absent means the legacy fontkit path.
   */
  typography?: TemplateTypographyEngine;
};

export type TemplateTypographyEngine = "m1" | "m3";

/** True when a template version sets text with the M1 engine (`m1` or `m3`). */
export function usesM1Engine(engine: TemplateTypographyEngine | undefined): boolean {
  return engine !== undefined;
}

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
    | "1.3.0"
    | "1.4.0"
    | "1.5.0";
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
  /** Typography engine this exact version pins (see TemplateRenderContext). */
  typography?: TemplateTypographyEngine;
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
  /** DesignDocument 1.8.0 axes, named instance and optical sizing. */
  fontModel?: readonly TemplateTextLayerType[];
  /** DesignDocument 1.8.0 `keepTogether.preferBreakAfter` (M3). */
  preferredBreaks?: readonly TemplateTextLayerType[];
  localImageTreatments?: boolean;
  subjectRegion?: boolean;
};
