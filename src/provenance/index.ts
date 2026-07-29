import { hashCanonical } from "../cache/canonical.js";
import {
  MANIFEST_VERSION,
  PRODUCT_CLAIM,
  RENDERER_NAME,
  RENDERER_VERSION,
  type AssetOrigin,
  type Dimensions,
  type OutputFormat,
  type QualityIssue,
  type RenderingMethod,
} from "../domain/types.js";
import type { DesignDocument } from "../schema/index.js";

export type ManifestAsset = {
  id: string;
  sha256: string;
  origin: AssetOrigin;
};

export type ManifestFont = {
  family: string;
  weight: number;
  style: string;
  sha256: string;
};

export type RenderManifest = {
  manifestVersion: typeof MANIFEST_VERSION;
  renderId: string;
  renderFingerprint: string;
  designDocumentId: string;
  designDocumentHash: string;
  seed: string;
  template: { id: string; version: string };
  renderer: { name: typeof RENDERER_NAME; version: typeof RENDERER_VERSION };
  proceduralAlgorithmVersions: Record<string, string>;
  assets: ManifestAsset[];
  fonts: ManifestFont[];
  dimensions: Dimensions;
  output: {
    format: OutputFormat;
    sha256: string;
    byteSize: number;
  };
  creationTimestamp: string;
  generativeImageModelUsed: boolean;
  renderingMethod: RenderingMethod;
  qualityIssues: QualityIssue[];
  productClaim: typeof PRODUCT_CLAIM;
};

export type CreateManifestInput = {
  document: DesignDocument;
  fingerprint: string;
  proceduralAlgorithmVersions: Record<string, string>;
  assets: ManifestAsset[];
  fonts: ManifestFont[];
  dimensions: Dimensions;
  outputFormat: OutputFormat;
  outputHash: string;
  outputByteSize: number;
  creationTimestamp: string;
  renderingMethod: RenderingMethod;
  qualityIssues: QualityIssue[];
};

export function createRenderManifest(input: CreateManifestInput): RenderManifest {
  return {
    manifestVersion: MANIFEST_VERSION,
    renderId: `render_${input.fingerprint.slice(0, 24)}`,
    renderFingerprint: input.fingerprint,
    designDocumentId: input.document.id,
    designDocumentHash: hashCanonical(input.document),
    seed: input.document.seed,
    template: { ...input.document.template },
    renderer: { name: RENDERER_NAME, version: RENDERER_VERSION },
    proceduralAlgorithmVersions: {
      ...input.proceduralAlgorithmVersions,
    },
    assets: input.assets,
    fonts: input.fonts,
    dimensions: input.dimensions,
    output: {
      format: input.outputFormat,
      sha256: input.outputHash,
      byteSize: input.outputByteSize,
    },
    creationTimestamp: input.creationTimestamp,
    generativeImageModelUsed: input.assets.some(
      (asset) => asset.origin.generativeImageModel !== undefined,
    ),
    renderingMethod: input.renderingMethod,
    qualityIssues: input.qualityIssues,
    productClaim: PRODUCT_CLAIM,
  };
}
