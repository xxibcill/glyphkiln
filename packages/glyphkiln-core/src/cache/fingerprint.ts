import type { OutputFormat } from "../domain/types.js";
import { RENDERER_NAME, RENDERER_VERSION } from "../domain/types.js";
import type { DesignDocument } from "../schema/index.js";
import { getFormatDimensions } from "../formats/index.js";
import { canonicalJson, hashCanonical } from "./canonical.js";

export const RENDER_CONFIGURATION = Object.freeze({
  svgNumericPrecision: 3,
  rasterizer: "@resvg/resvg-js@2.6.2",
  loadSystemFonts: false,
  textRendering: "geometricPrecision",
  imageRendering: "optimizeQuality",
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
    fonts:
      input.fonts === undefined
        ? [...input.fontHashes].sort()
        : [...input.fonts].sort(compareCanonical),
    outputFormat: input.outputFormat,
    rendererConfiguration: input.rendererConfiguration ?? RENDER_CONFIGURATION,
  });
}

function compareCanonical(
  left: RenderFingerprintFont,
  right: RenderFingerprintFont,
): number {
  const leftJson = canonicalJson(left);
  const rightJson = canonicalJson(right);
  return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
}
