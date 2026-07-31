import type { OutputFormat } from "../domain/types.js";
import { RENDERER_NAME, RENDERER_VERSION } from "../domain/types.js";
import type { DesignDocument } from "../schema/index.js";
import { getFormatDimensions } from "../formats/index.js";
import { TYPOGRAPHY_POLICY } from "../typography/policy.js";
import { FOCAL_CROP_POLICY_VERSION } from "../assets/focal-crop.js";
import {
  IMAGE_CONTRAST_POLICY_VERSION,
  IMAGE_TREATMENT_POLICY_VERSION,
} from "../assets/image-policy.js";
import { canonicalJson } from "./canonical-json.js";

export const RENDER_CONFIGURATION = Object.freeze({
  svgNumericPrecision: 3,
  rasterizer: "@resvg/resvg-js@2.6.2",
  loadSystemFonts: false,
  textRendering: "geometricPrecision",
  imageRendering: "optimizeQuality",
  typographyPolicy: TYPOGRAPHY_POLICY,
  focalCropPolicy: FOCAL_CROP_POLICY_VERSION,
  imageTreatmentPolicy: IMAGE_TREATMENT_POLICY_VERSION,
  imageContrastPolicy: IMAGE_CONTRAST_POLICY_VERSION,
});

export type RenderFingerprintFont = {
  family: string;
  weight: number;
  style: string;
  sha256: string;
};

type RenderFingerprintBaseInput = {
  document: DesignDocument;
  outputFormat: OutputFormat;
  assetHashes: readonly string[];
  proceduralAlgorithmVersions: Readonly<Record<string, string>>;
  rendererConfiguration?: Readonly<Record<string, unknown>>;
};

export type RenderFingerprintInput = RenderFingerprintBaseInput &
  (
    | {
        fonts: readonly RenderFingerprintFont[];
        fontHashes?: never;
      }
    | {
        fontHashes: readonly string[];
        fonts?: never;
      }
  );

export function createRenderFingerprintPayload(input: RenderFingerprintInput) {
  const pixelDocument = Object.fromEntries(
    Object.entries(input.document).filter(
      ([key]) => key !== "id" && key !== "metadata",
    ),
  );
  return {
    designDocument: pixelDocument,
    dimensions: getFormatDimensions(input.document.format),
    template: input.document.template,
    renderer: {
      name: RENDERER_NAME,
      version: RENDERER_VERSION,
    },
    proceduralAlgorithmVersions: input.proceduralAlgorithmVersions,
    assetHashes: [...input.assetHashes].sort(),
    fonts:
      input.fonts === undefined
        ? [...input.fontHashes].sort()
        : [...input.fonts].sort(compareCanonical),
    outputFormat: input.outputFormat,
    rendererConfiguration: input.rendererConfiguration ?? RENDER_CONFIGURATION,
  };
}

function compareCanonical(
  left: RenderFingerprintFont,
  right: RenderFingerprintFont,
): number {
  const leftJson = canonicalJson(left);
  const rightJson = canonicalJson(right);
  return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
}
