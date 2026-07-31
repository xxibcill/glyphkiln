import { hashCanonical, sha256 } from "../cache/canonical.js";
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
import { validateDesignDocument, type DesignDocument } from "../schema/index.js";
import { TYPOGRAPHY_POLICY } from "../typography/policy.js";

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
  typographyPolicy: typeof TYPOGRAPHY_POLICY;
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
  compositionGenerativeImageModelUsed: false;
  includedGenerativeAssetUsed: boolean;
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
    typographyPolicy: { ...TYPOGRAPHY_POLICY },
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
    compositionGenerativeImageModelUsed: false,
    includedGenerativeAssetUsed: input.assets.some(
      (asset) => asset.origin.generativeImageModel !== undefined,
    ),
    renderingMethod: input.renderingMethod,
    qualityIssues: input.qualityIssues,
    productClaim: PRODUCT_CLAIM,
  };
}

export function verifyRenderReproduction(input: {
  document: DesignDocument;
  bytes: Uint8Array;
  manifest: RenderManifest;
}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const validation = validateDesignDocument(input.document);
  if (!validation.success) {
    return [
      {
        code: "INVALID_REPRODUCTION_DOCUMENT",
        severity: "error",
        message: "The reproduction document is not a valid design document.",
        details: { problems: validation.problems },
      },
    ];
  }
  const documentHash = hashCanonical(validation.data);
  if (documentHash !== input.manifest.designDocumentHash) {
    issues.push({
      code: "DESIGN_DOCUMENT_HASH_MISMATCH",
      severity: "error",
      message: "The design document does not match the render manifest.",
      details: {
        expected: input.manifest.designDocumentHash,
        actual: documentHash,
      },
    });
  }
  if (input.bytes.byteLength !== input.manifest.output.byteSize) {
    issues.push({
      code: "OUTPUT_SIZE_MISMATCH",
      severity: "error",
      message: "The reproduced output byte size does not match the manifest.",
      details: {
        expected: input.manifest.output.byteSize,
        actual: input.bytes.byteLength,
      },
    });
  }
  const outputHash = sha256(input.bytes);
  if (outputHash !== input.manifest.output.sha256) {
    issues.push({
      code: "OUTPUT_HASH_MISMATCH",
      severity: "error",
      message: "The reproduced output hash does not match the manifest.",
      details: {
        expected: input.manifest.output.sha256,
        actual: outputHash,
      },
    });
  }
  return issues;
}
