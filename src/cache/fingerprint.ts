import type { OutputFormat } from "../domain/types.js";
import { RENDERER_NAME, RENDERER_VERSION } from "../domain/types.js";
import type { DesignDocument } from "../schema/index.js";
import { getFormatDimensions } from "../formats/index.js";
import { hashCanonical } from "./canonical.js";

export const RENDER_CONFIGURATION = Object.freeze({
  svgNumericPrecision: 3,
  rasterizer: "@resvg/resvg-js@2.6.2",
  loadSystemFonts: false,
  textRendering: "geometricPrecision",
  imageRendering: "optimizeQuality",
});

export type RenderFingerprintInput = {
  document: DesignDocument;
  outputFormat: OutputFormat;
  assetHashes: readonly string[];
  fontHashes: readonly string[];
  proceduralAlgorithmVersions: Readonly<Record<string, string>>;
  rendererConfiguration?: Readonly<Record<string, unknown>>;
};

export function createRenderFingerprint(input: RenderFingerprintInput): string {
  const pixelDocument = Object.fromEntries(
    Object.entries(input.document).filter(
      ([key]) => key !== "id" && key !== "metadata",
    ),
  );
  return hashCanonical({
    designDocument: pixelDocument,
    dimensions: getFormatDimensions(input.document.format),
    template: input.document.template,
    renderer: {
      name: RENDERER_NAME,
      version: RENDERER_VERSION,
    },
    proceduralAlgorithmVersions: input.proceduralAlgorithmVersions,
    assetHashes: [...input.assetHashes].sort(),
    fontHashes: [...input.fontHashes].sort(),
    outputFormat: input.outputFormat,
    rendererConfiguration: input.rendererConfiguration ?? RENDER_CONFIGURATION,
  });
}
