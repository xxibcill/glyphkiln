import { hashCanonical, sha256 } from "../cache/canonical.js";
import {
  LEGACY_MANIFEST_VERSION,
  LEGACY_RENDERER_VERSION,
  M3_MANIFEST_VERSION,
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
import type { M3TypographyPolicy } from "../typography/m3-policy.js";
import { M1_TYPOGRAPHY_POLICY } from "../typography/typesetter.js";

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

/**
 * Font identity v2 (manifest 1.3.0): one entry per face actually drawn, with
 * its variation coordinates, named instance, role in the stack, script
 * matching and the scripts it set, plus the stack each text element tried.
 */
export type ManifestFontV2 = ManifestFont & {
  coordinates: Readonly<Record<string, number>>;
  namedInstance?: string;
  role: string;
  scale: number;
  baselineShift: number;
  scripts: readonly string[];
};

export type ManifestTextStack = {
  layerId: string;
  stack: readonly string[];
  faces: readonly { family: string; weight: number; style: string; role: string }[];
};

type ManifestCommon = {
  renderId: string;
  renderFingerprint: string;
  designDocumentId: string;
  designDocumentHash: string;
  seed: string;
  template: { id: string; version: string };
  proceduralAlgorithmVersions: Record<string, string>;
  assets: ManifestAsset[];
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

/** Manifest 1.2.0: every render on the legacy fontkit typography. */
export type LegacyRenderManifest = ManifestCommon & {
  manifestVersion: typeof LEGACY_MANIFEST_VERSION;
  renderer: { name: typeof RENDERER_NAME; version: typeof LEGACY_RENDERER_VERSION };
  typographyPolicy: typeof TYPOGRAPHY_POLICY;
  fonts: ManifestFont[];
};

/** Manifest 1.3.0: renders on the M1 typography (renderer 0.6.0). */
export type M1RenderManifest = ManifestCommon & {
  manifestVersion: typeof MANIFEST_VERSION;
  renderer: { name: typeof RENDERER_NAME; version: typeof RENDERER_VERSION };
  typographyPolicy: typeof TYPOGRAPHY_POLICY & { m1: typeof M1_TYPOGRAPHY_POLICY };
  fonts: ManifestFontV2[];
  textStacks: ManifestTextStack[];
};

/** Manifest 1.4.0: renders on the M3 typography (M1 plus M3 line breaking). */
export type M3RenderManifest = Omit<
  M1RenderManifest,
  "manifestVersion" | "typographyPolicy"
> & {
  manifestVersion: typeof M3_MANIFEST_VERSION;
  typographyPolicy: M1RenderManifest["typographyPolicy"] & { m3: M3TypographyPolicy };
};

export type RenderManifest = LegacyRenderManifest | M1RenderManifest | M3RenderManifest;

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
  /** Present for M1 renders: font identity v2 and the stacks tried. */
  m1?: { fonts: ManifestFontV2[]; textStacks: ManifestTextStack[] };
  /** Present for M3 renders (which are also M1 renders). */
  m3?: M3TypographyPolicy;
};

export function createRenderManifest(input: CreateManifestInput): RenderManifest {
  const common = {
    renderId: `render_${input.fingerprint.slice(0, 24)}`,
    renderFingerprint: input.fingerprint,
    designDocumentId: input.document.id,
    designDocumentHash: hashCanonical(input.document),
    seed: input.document.seed,
    template: { ...input.document.template },
    proceduralAlgorithmVersions: {
      ...input.proceduralAlgorithmVersions,
    },
    assets: input.assets,
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
  if (input.m1 === undefined) {
    // Key order is the 1.2.0 manifest's, so legacy manifest bytes are exact.
    const {
      renderId,
      renderFingerprint,
      designDocumentId,
      designDocumentHash,
      seed,
      template,
    } = common;
    return {
      manifestVersion: LEGACY_MANIFEST_VERSION,
      renderId,
      renderFingerprint,
      designDocumentId,
      designDocumentHash,
      seed,
      template,
      renderer: { name: RENDERER_NAME, version: LEGACY_RENDERER_VERSION },
      typographyPolicy: { ...TYPOGRAPHY_POLICY },
      proceduralAlgorithmVersions: common.proceduralAlgorithmVersions,
      assets: common.assets,
      fonts: input.fonts,
      dimensions: common.dimensions,
      output: common.output,
      creationTimestamp: common.creationTimestamp,
      compositionGenerativeImageModelUsed: false,
      includedGenerativeAssetUsed: common.includedGenerativeAssetUsed,
      renderingMethod: common.renderingMethod,
      qualityIssues: common.qualityIssues,
      productClaim: PRODUCT_CLAIM,
    };
  }
  const {
    renderId,
    renderFingerprint,
    designDocumentId,
    designDocumentHash,
    seed,
    template,
  } = common;
  const m1Fields = {
    renderId,
    renderFingerprint,
    designDocumentId,
    designDocumentHash,
    seed,
    template,
    renderer: { name: RENDERER_NAME, version: RENDERER_VERSION },
  } as const;
  if (input.m3 !== undefined) {
    return {
      manifestVersion: M3_MANIFEST_VERSION,
      ...m1Fields,
      typographyPolicy: {
        ...TYPOGRAPHY_POLICY,
        m1: M1_TYPOGRAPHY_POLICY,
        m3: input.m3,
      },
      proceduralAlgorithmVersions: common.proceduralAlgorithmVersions,
      assets: common.assets,
      fonts: input.m1.fonts,
      textStacks: input.m1.textStacks,
      dimensions: common.dimensions,
      output: common.output,
      creationTimestamp: common.creationTimestamp,
      compositionGenerativeImageModelUsed: false,
      includedGenerativeAssetUsed: common.includedGenerativeAssetUsed,
      renderingMethod: common.renderingMethod,
      qualityIssues: common.qualityIssues,
      productClaim: PRODUCT_CLAIM,
    };
  }
  return {
    manifestVersion: MANIFEST_VERSION,
    ...m1Fields,
    typographyPolicy: { ...TYPOGRAPHY_POLICY, m1: M1_TYPOGRAPHY_POLICY },
    proceduralAlgorithmVersions: common.proceduralAlgorithmVersions,
    assets: common.assets,
    fonts: input.m1.fonts,
    textStacks: input.m1.textStacks,
    dimensions: common.dimensions,
    output: common.output,
    creationTimestamp: common.creationTimestamp,
    compositionGenerativeImageModelUsed: false,
    includedGenerativeAssetUsed: common.includedGenerativeAssetUsed,
    renderingMethod: common.renderingMethod,
    qualityIssues: common.qualityIssues,
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
