import type {
  Bounds,
  ContrastEvidence,
  DesignDocument,
  ImageCropEvidence,
  QualityIssue,
  RenderEvidence,
  RenderManifest,
  TextBoundsEvidence,
} from "@glyphkiln/core";
import {
  RENDER_EVIDENCE_VERSION,
  canonicalJson,
  createRenderFingerprintPayload,
} from "@glyphkiln/core/browser";

import type {
  PreviewCatalog,
  PreviewFailure,
  PreviewOutput,
  PreviewProblem,
  PreviewResponse,
  PreviewSuccess,
} from "./types";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const MAXIMUM_BROWSER_RENDER_PROOF_BYTES = 64 * 1024 * 1024;

export type RenderProofProjection = {
  qualityIssues: QualityIssue[];
  evidence: CompatibleRenderEvidence;
  outputs: (Omit<PreviewOutput, "base64"> & { base64?: string })[];
};

export type CompatibleRenderEvidence =
  | RenderEvidence
  | {
      version: "1.0.0";
      safeArea: Bounds;
      text: Omit<TextBoundsEvidence, "fontSize">[];
      crops: ImageCropEvidence[];
      contrast: ContrastEvidence[];
    };

export function parsePreviewResponse(
  input: unknown,
  httpStatus: number,
): PreviewResponse {
  if (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599) {
    return malformedResponse(httpStatus);
  }

  if (isSuccessfulStatus(httpStatus) && isPreviewSuccess(input)) {
    return input;
  }
  if (!isSuccessfulStatus(httpStatus) && isPreviewFailure(input, httpStatus)) {
    return input;
  }
  return malformedResponse(httpStatus);
}

export function previewIntegrityPrerequisiteFailure(): PreviewFailure | null {
  if (readSubtleCrypto() !== undefined) return null;
  return {
    ok: false,
    status: 0,
    title: "Secure browser context required",
    code: "PREVIEW_SECURE_CONTEXT_REQUIRED",
    detail:
      "Open the remote workshop over HTTPS, or use localhost on this machine, before rendering a proof.",
  };
}

export function isRenderProofProjection(
  input: unknown,
  document: DesignDocument,
  expectedDocumentHash?: string,
): input is RenderProofProjection {
  if (
    !isRecord(input) ||
    !isQualityIssueArray(input.qualityIssues) ||
    !isCompatibleRenderEvidence(input.evidence) ||
    !Array.isArray(input.outputs) ||
    input.outputs.length !== 2 ||
    !input.outputs.every(isPreviewProofOutput) ||
    input.outputs.reduce((total, output) => total + output.byteSize, 0) >
      MAXIMUM_BROWSER_RENDER_PROOF_BYTES
  ) {
    return false;
  }
  const formats = new Set(input.outputs.map((output) => output.format));
  const byteModes = new Set(
    input.outputs.map((output) => (output.base64 === undefined ? "metadata" : "bytes")),
  );
  return (
    formats.size === 2 &&
    formats.has("svg") &&
    formats.has("png") &&
    byteModes.size === 1 &&
    input.outputs.every(
      (output) =>
        output.manifest.designDocumentId === document.id &&
        (expectedDocumentHash === undefined ||
          output.manifest.designDocumentHash === expectedDocumentHash) &&
        output.manifest.renderFingerprint === output.fingerprint,
    )
  );
}

export async function verifyPreviewIntegrity(
  response: PreviewSuccess,
  catalog: PreviewCatalog,
  submittedDocument: DesignDocument,
): Promise<PreviewFailure | null> {
  const prerequisiteFailure = previewIntegrityPrerequisiteFailure();
  if (prerequisiteFailure !== null) return prerequisiteFailure;

  try {
    const documentHash = await sha256(
      new TextEncoder().encode(canonicalJson(response.document)),
    );
    const submittedDocumentHash = await sha256(
      new TextEncoder().encode(canonicalJson(submittedDocument)),
    );
    if (documentHash !== submittedDocumentHash) {
      return integrityFailure(
        "The returned proof does not match the submitted design document.",
      );
    }
    const firstManifest = response.outputs[0].manifest;
    if (documentHash !== firstManifest.designDocumentHash) {
      return integrityFailure(
        "The returned design document does not match the output manifest.",
      );
    }
    if (
      firstManifest.seed !== response.document.seed ||
      firstManifest.template.id !== response.document.template.id ||
      firstManifest.template.version !== response.document.template.version ||
      canonicalJson(firstManifest.assets) !==
        canonicalJson(
          response.document.assets.map((asset) => ({
            id: asset.id,
            sha256: asset.sha256,
            origin: asset.origin,
          })),
        ) ||
      canonicalJson(firstManifest.qualityIssues) !==
        canonicalJson(response.qualityIssues)
    ) {
      return integrityFailure(
        "The returned document and manifest do not describe the same provenance.",
      );
    }
    const trustedManifestFailure = inspectTrustedManifest(
      response,
      firstManifest,
      catalog,
    );
    if (trustedManifestFailure !== null) {
      return integrityFailure(trustedManifestFailure);
    }

    const sharedProvenance = canonicalJson(sharedManifestFields(firstManifest));
    for (const output of response.outputs) {
      const bytes = decodeBase64(output.base64);
      if (!hasExpectedSignature(output.format, bytes)) {
        return integrityFailure(
          `The ${output.format.toUpperCase()} output does not match its declared format.`,
        );
      }
      if ((await sha256(bytes)) !== output.manifest.output.sha256) {
        return integrityFailure(
          `The ${output.format.toUpperCase()} bytes do not match the output manifest.`,
        );
      }
      if (!hasExpectedDimensions(output.format, bytes, firstManifest.dimensions)) {
        return integrityFailure(
          `The ${output.format.toUpperCase()} artifact dimensions do not match the trusted Core format.`,
        );
      }
      if (output.manifest.designDocumentHash !== documentHash) {
        return integrityFailure(
          `The ${output.format.toUpperCase()} manifest refers to a different design document.`,
        );
      }
      const expectedRenderingMethod =
        output.format === "svg"
          ? "deterministic-code-rendering/direct-svg"
          : "deterministic-code-rendering/resvg";
      if (output.manifest.renderingMethod !== expectedRenderingMethod) {
        return integrityFailure(
          `The ${output.format.toUpperCase()} manifest reports the wrong rendering method.`,
        );
      }
      if (canonicalJson(sharedManifestFields(output.manifest)) !== sharedProvenance) {
        return integrityFailure(
          "The SVG and PNG manifests do not share the same render provenance.",
        );
      }
      const expectedFingerprint = await renderFingerprint(response, output, catalog);
      if (
        output.fingerprint !== expectedFingerprint ||
        output.manifest.renderId !== `render_${expectedFingerprint.slice(0, 24)}`
      ) {
        return integrityFailure(
          `The ${output.format.toUpperCase()} render fingerprint is not reproducible from the trusted contract.`,
        );
      }
    }
    return null;
  } catch {
    return integrityFailure(
      "The preview artifacts could not be checked against their manifests.",
    );
  }
}

function inspectTrustedManifest(
  response: PreviewSuccess,
  manifest: RenderManifest,
  catalog: PreviewCatalog,
): string | null {
  const format = catalog.formats.find(
    (candidate) => candidate.id === response.document.format,
  );
  const template = catalog.templates.find(
    (candidate) => candidate.id === response.document.template.id,
  );
  const selectedProceduralLayer = response.document.layers.find(
    (layer) => layer.type === "procedural-decoration" && layer.visible,
  );
  const proceduralLayer =
    selectedProceduralLayer?.type === "procedural-decoration"
      ? selectedProceduralLayer
      : undefined;
  const proceduralStyle =
    proceduralLayer === undefined
      ? undefined
      : catalog.proceduralStyles.find(
          (candidate) => candidate.id === proceduralLayer.style,
        );
  const expectedProceduralVersions =
    proceduralStyle === undefined
      ? {}
      : { [proceduralStyle.id]: proceduralStyle.version };
  const expectedGenerativeAssetUse = response.document.assets.some(
    (asset) => asset.origin.generativeImageModel !== undefined,
  );
  const fontsMatchDocument =
    manifest.fonts.length > 0 &&
    manifest.fonts.every((font) =>
      response.document.fonts.some(
        (declaration) =>
          declaration.family === font.family &&
          declaration.weight === font.weight &&
          declaration.style === font.style &&
          declaration.sha256 === font.sha256,
      ),
    );

  if (
    format === undefined ||
    template === undefined ||
    (proceduralLayer !== undefined && proceduralStyle === undefined) ||
    response.document.schemaVersion !== catalog.schemaVersion ||
    response.document.template.version !== template.version ||
    manifest.manifestVersion !== catalog.manifestVersion ||
    manifest.renderer.name !== catalog.renderer.name ||
    manifest.renderer.version !== catalog.renderer.version ||
    canonicalJson(manifest.typographyPolicy) !==
      canonicalJson(catalog.rendererConfiguration.typographyPolicy) ||
    manifest.productClaim !== catalog.productClaim ||
    manifest.dimensions.width !== format.width ||
    manifest.dimensions.height !== format.height ||
    manifest.includedGenerativeAssetUsed !== expectedGenerativeAssetUse ||
    canonicalJson(manifest.proceduralAlgorithmVersions) !==
      canonicalJson(expectedProceduralVersions) ||
    !fontsMatchDocument
  ) {
    return "The manifest does not match the trusted Core catalog and declared resources.";
  }
  return null;
}

async function renderFingerprint(
  response: PreviewSuccess,
  output: PreviewOutput,
  catalog: PreviewCatalog,
): Promise<string> {
  return sha256(
    new TextEncoder().encode(
      canonicalJson(
        createRenderFingerprintPayload({
          document: response.document,
          outputFormat: output.format,
          assetHashes: response.document.assets.map((asset) => asset.sha256),
          fonts: output.manifest.fonts,
          proceduralAlgorithmVersions: output.manifest.proceduralAlgorithmVersions,
          rendererConfiguration: catalog.rendererConfiguration,
        }),
      ),
    ),
  );
}

function isPreviewSuccess(input: unknown): input is PreviewSuccess {
  if (!isRecord(input) || input.ok !== true) return false;
  const document = input.document;
  if (!isDesignDocument(document)) return false;
  if (!isQualityIssueArray(input.qualityIssues)) return false;
  if (!isCurrentRenderEvidence(input.evidence)) return false;
  if (!Array.isArray(input.outputs) || input.outputs.length !== 2) return false;
  if (!input.outputs.every(isPreviewOutput)) return false;

  const formats = new Set(input.outputs.map((output) => output.format));
  if (formats.size !== 2 || !formats.has("svg") || !formats.has("png")) return false;

  return input.outputs.every(
    (output) =>
      output.manifest.designDocumentId === document.id &&
      output.manifest.renderFingerprint === output.fingerprint,
  );
}

function isCompatibleRenderEvidence(input: unknown): input is CompatibleRenderEvidence {
  if (!hasRenderEvidenceCollections(input)) return false;
  if (input.version === RENDER_EVIDENCE_VERSION) {
    return input.text.every(isCurrentTextBoundsEvidence);
  }
  return input.version === "1.0.0" && input.text.every(isLegacyTextBoundsEvidence);
}

function isCurrentRenderEvidence(input: unknown): input is RenderEvidence {
  return (
    hasRenderEvidenceCollections(input) &&
    input.version === RENDER_EVIDENCE_VERSION &&
    input.text.every(isCurrentTextBoundsEvidence)
  );
}

function hasRenderEvidenceCollections(
  input: unknown,
): input is Record<string, unknown> & { text: unknown[] } {
  if (
    !isRecord(input) ||
    !isBounds(input.safeArea) ||
    !Array.isArray(input.text) ||
    input.text.length > 100 ||
    !Array.isArray(input.crops) ||
    input.crops.length > 100 ||
    !input.crops.every(isImageCropEvidence) ||
    !Array.isArray(input.contrast) ||
    input.contrast.length > 100 ||
    !input.contrast.every(isContrastEvidence)
  ) {
    return false;
  }
  return true;
}

function isCurrentTextBoundsEvidence(input: unknown): boolean {
  return (
    isLegacyTextBoundsEvidence(input) &&
    isRecord(input) &&
    isFinitePositiveNumber(input.fontSize)
  );
}

function isLegacyTextBoundsEvidence(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.layerId === "string" &&
    input.layerId.length > 0 &&
    isBounds(input.bounds) &&
    isNonNegativeInteger(input.lineCount) &&
    isPositiveInteger(input.maximumLines) &&
    typeof input.overflow === "boolean"
  );
}

function isFinitePositiveNumber(input: unknown): input is number {
  return typeof input === "number" && Number.isFinite(input) && input > 0;
}

function isImageCropEvidence(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.layerId === "string" &&
    input.layerId.length > 0 &&
    typeof input.assetId === "string" &&
    input.assetId.length > 0 &&
    (input.treatment === "none" ||
      input.treatment === "dark-scrim" ||
      input.treatment === "light-scrim") &&
    isNormalizedPoint(input.focalPoint) &&
    typeof input.policyVersion === "string" &&
    input.policyVersion.length > 0 &&
    isBounds(input.destinationBounds) &&
    isBounds(input.sourceBounds) &&
    isBounds(input.renderedBounds)
  );
}

function isContrastEvidence(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.layerId === "string" &&
    input.layerId.length > 0 &&
    typeof input.policyVersion === "string" &&
    input.policyVersion.length > 0 &&
    typeof input.foreground === "string" &&
    input.foreground.length > 0 &&
    isFiniteNonNegativeNumber(input.minimumRequired) &&
    isFiniteNonNegativeNumber(input.minimumRatio) &&
    isFiniteNonNegativeNumber(input.maximumRatio) &&
    Array.isArray(input.samples) &&
    input.samples.length <= 25 &&
    input.samples.every(isContrastSampleEvidence)
  );
}

function isContrastSampleEvidence(input: unknown): boolean {
  return (
    isRecord(input) &&
    isFinitePoint(input.canvasPoint) &&
    isFinitePoint(input.sourcePixel) &&
    typeof input.background === "string" &&
    input.background.length > 0 &&
    isFiniteNonNegativeNumber(input.ratio)
  );
}

function isBounds(input: unknown): input is Bounds {
  return (
    isRecord(input) &&
    isFiniteCoordinate(input.x) &&
    isFiniteCoordinate(input.y) &&
    isFiniteNonNegativeNumber(input.width) &&
    isFiniteNonNegativeNumber(input.height)
  );
}

function isNormalizedPoint(input: unknown): boolean {
  return (
    isRecord(input) &&
    isFiniteNonNegativeNumber(input.x) &&
    input.x <= 1 &&
    isFiniteNonNegativeNumber(input.y) &&
    input.y <= 1
  );
}

function isFinitePoint(input: unknown): boolean {
  return isRecord(input) && isFiniteCoordinate(input.x) && isFiniteCoordinate(input.y);
}

function isFiniteCoordinate(input: unknown): input is number {
  return typeof input === "number" && Number.isFinite(input) && Math.abs(input) <= 1e9;
}

function isFiniteNonNegativeNumber(input: unknown): input is number {
  return isFiniteCoordinate(input) && input >= 0;
}

function isNonNegativeInteger(input: unknown): input is number {
  return Number.isSafeInteger(input) && typeof input === "number" && input >= 0;
}

function isPreviewFailure(input: unknown, httpStatus: number): input is PreviewFailure {
  if (!isRecord(input) || input.ok !== false) return false;
  if (
    input.status !== httpStatus ||
    typeof input.title !== "string" ||
    input.title.length === 0 ||
    typeof input.code !== "string" ||
    input.code.length === 0 ||
    typeof input.detail !== "string" ||
    input.detail.length === 0
  ) {
    return false;
  }
  if (
    input.problems !== undefined &&
    (!Array.isArray(input.problems) || !input.problems.every(isPreviewProblem))
  ) {
    return false;
  }
  return input.qualityIssues === undefined || isQualityIssueArray(input.qualityIssues);
}

function isPreviewOutput(input: unknown): input is PreviewOutput {
  return isPreviewProofOutput(input) && input.base64 !== undefined;
}

function isPreviewProofOutput(
  input: unknown,
): input is Omit<PreviewOutput, "base64"> & { base64?: string } {
  if (!isRecord(input)) return false;
  const expectedMimeType =
    input.format === "svg"
      ? "image/svg+xml"
      : input.format === "png"
        ? "image/png"
        : undefined;
  if (
    expectedMimeType === undefined ||
    input.mimeType !== expectedMimeType ||
    !isPositiveInteger(input.byteSize) ||
    input.byteSize > MAXIMUM_BROWSER_RENDER_PROOF_BYTES ||
    typeof input.fingerprint !== "string" ||
    !SHA256_PATTERN.test(input.fingerprint) ||
    typeof input.filename !== "string" ||
    input.filename.length === 0 ||
    !isRenderManifest(input.manifest)
  ) {
    return false;
  }
  if (
    input.base64 !== undefined &&
    (typeof input.base64 !== "string" ||
      input.base64.length === 0 ||
      input.base64.length > Math.ceil(input.byteSize / 3) * 4 ||
      !BASE64_PATTERN.test(input.base64) ||
      decodedByteLength(input.base64) !== input.byteSize)
  ) {
    return false;
  }
  return (
    input.manifest.output.format === input.format &&
    input.manifest.output.byteSize === input.byteSize &&
    input.manifest.output.sha256.length === 64
  );
}

function isRenderManifest(input: unknown): input is RenderManifest {
  if (!isRecord(input)) return false;
  return (
    typeof input.manifestVersion === "string" &&
    typeof input.renderId === "string" &&
    typeof input.renderFingerprint === "string" &&
    SHA256_PATTERN.test(input.renderFingerprint) &&
    typeof input.designDocumentId === "string" &&
    typeof input.designDocumentHash === "string" &&
    SHA256_PATTERN.test(input.designDocumentHash) &&
    typeof input.seed === "string" &&
    isTemplateIdentity(input.template) &&
    isRendererIdentity(input.renderer) &&
    isTypographyPolicy(input.typographyPolicy) &&
    isRecord(input.proceduralAlgorithmVersions) &&
    Object.values(input.proceduralAlgorithmVersions).every(
      (value) => typeof value === "string",
    ) &&
    Array.isArray(input.assets) &&
    input.assets.every(isManifestAsset) &&
    Array.isArray(input.fonts) &&
    input.fonts.every(isManifestFont) &&
    isDimensions(input.dimensions) &&
    isManifestOutput(input.output) &&
    typeof input.creationTimestamp === "string" &&
    input.compositionGenerativeImageModelUsed === false &&
    typeof input.includedGenerativeAssetUsed === "boolean" &&
    (input.renderingMethod === "deterministic-code-rendering/direct-svg" ||
      input.renderingMethod === "deterministic-code-rendering/resvg") &&
    isQualityIssueArray(input.qualityIssues) &&
    typeof input.productClaim === "string" &&
    input.productClaim.length > 0
  );
}

function isDesignDocument(input: unknown): input is PreviewSuccess["document"] {
  return (
    isRecord(input) &&
    typeof input.schemaVersion === "string" &&
    typeof input.id === "string" &&
    input.id.length > 0 &&
    isRecord(input.template) &&
    typeof input.template.id === "string" &&
    typeof input.template.version === "string" &&
    typeof input.format === "string" &&
    typeof input.seed === "string" &&
    isRecord(input.brand) &&
    typeof input.brand.name === "string" &&
    isRecord(input.brand.palette) &&
    isRecord(input.brand.themes) &&
    Array.isArray(input.assets) &&
    input.assets.every(isDocumentAsset) &&
    Array.isArray(input.fonts) &&
    input.fonts.every(isDocumentFont) &&
    Array.isArray(input.layers) &&
    input.layers.every(isDocumentLayer)
  );
}

function isDocumentAsset(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.sha256 === "string" &&
    SHA256_PATTERN.test(input.sha256) &&
    isRecord(input.origin) &&
    typeof input.origin.kind === "string"
  );
}

function isDocumentFont(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.family === "string" &&
    isPositiveInteger(input.weight) &&
    (input.style === "normal" || input.style === "italic")
  );
}

function isDocumentLayer(input: unknown): boolean {
  return (
    isRecord(input) && typeof input.id === "string" && typeof input.type === "string"
  );
}

function isTemplateIdentity(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    input.id.length > 0 &&
    typeof input.version === "string" &&
    input.version.length > 0
  );
}

function isRendererIdentity(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.name === "string" &&
    input.name.length > 0 &&
    typeof input.version === "string" &&
    input.version.length > 0
  );
}

function isTypographyPolicy(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.algorithmVersion === "string" &&
    typeof input.thaiSegmentationPolicyVersion === "string" &&
    typeof input.whitespaceSegmentationPolicyVersion === "string" &&
    typeof input.graphemeSegmentationPolicyVersion === "string" &&
    typeof input.lineBreakingPolicyVersion === "string"
  );
}

function isManifestAsset(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.sha256 === "string" &&
    SHA256_PATTERN.test(input.sha256) &&
    isRecord(input.origin) &&
    (input.origin.kind === "user-upload" ||
      input.origin.kind === "licensed-library" ||
      input.origin.kind === "generated" ||
      input.origin.kind === "unknown") &&
    optionalString(input.origin.sourceName) &&
    optionalString(input.origin.sourceReference) &&
    optionalString(input.origin.generativeImageModel)
  );
}

function isManifestFont(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.family === "string" &&
    isPositiveInteger(input.weight) &&
    (input.style === "normal" || input.style === "italic") &&
    typeof input.sha256 === "string" &&
    SHA256_PATTERN.test(input.sha256)
  );
}

function isDimensions(input: unknown): boolean {
  return (
    isRecord(input) && isPositiveInteger(input.width) && isPositiveInteger(input.height)
  );
}

function isManifestOutput(input: unknown): boolean {
  return (
    isRecord(input) &&
    (input.format === "svg" || input.format === "png") &&
    typeof input.sha256 === "string" &&
    SHA256_PATTERN.test(input.sha256) &&
    isPositiveInteger(input.byteSize)
  );
}

function isPreviewProblem(input: unknown): input is PreviewProblem {
  return (
    isRecord(input) &&
    typeof input.path === "string" &&
    typeof input.code === "string" &&
    typeof input.message === "string"
  );
}

function isQualityIssueArray(input: unknown): input is QualityIssue[] {
  return Array.isArray(input) && input.every(isQualityIssue);
}

function isQualityIssue(input: unknown): input is QualityIssue {
  return (
    isRecord(input) &&
    typeof input.code === "string" &&
    (input.severity === "warning" || input.severity === "error") &&
    typeof input.message === "string" &&
    (input.layerId === undefined || typeof input.layerId === "string")
  );
}

function isPositiveInteger(input: unknown): input is number {
  return Number.isInteger(input) && typeof input === "number" && input > 0;
}

function optionalString(input: unknown): boolean {
  return input === undefined || typeof input === "string";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isSuccessfulStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function decodedByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function hasExpectedSignature(
  format: PreviewOutput["format"],
  bytes: Uint8Array,
): boolean {
  if (format === "svg") {
    return new TextDecoder().decode(bytes.subarray(0, 5)) === "<svg ";
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return pngSignature.every((byte, index) => bytes[index] === byte);
}

function hasExpectedDimensions(
  format: PreviewOutput["format"],
  bytes: Uint8Array,
  expected: RenderManifest["dimensions"],
): boolean {
  const dimensions =
    format === "svg" ? readSvgDimensions(bytes) : readPngDimensions(bytes);
  return dimensions?.width === expected.width && dimensions.height === expected.height;
}

function readPngDimensions(
  bytes: Uint8Array,
): RenderManifest["dimensions"] | undefined {
  if (
    bytes.byteLength < 24 ||
    readUint32(bytes, 8) !== 13 ||
    new TextDecoder().decode(bytes.subarray(12, 16)) !== "IHDR"
  ) {
    return undefined;
  }
  const width = readUint32(bytes, 16);
  const height = readUint32(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset + offset,
    Uint32Array.BYTES_PER_ELEMENT,
  ).getUint32(0);
}

function readSvgDimensions(
  bytes: Uint8Array,
): RenderManifest["dimensions"] | undefined {
  const rootEnd = bytes.indexOf(0x3e);
  if (rootEnd < 0 || rootEnd > 4_096) return undefined;
  const root = new TextDecoder("utf-8", { fatal: true }).decode(
    bytes.subarray(0, rootEnd + 1),
  );
  const width = readPositiveIntegerAttribute(root, "width");
  const height = readPositiveIntegerAttribute(root, "height");
  const viewBox = readSvgAttribute(root, "viewBox")?.trim().split(/\s+/).map(Number);
  if (
    width === undefined ||
    height === undefined ||
    viewBox?.length !== 4 ||
    viewBox.some((value) => !Number.isFinite(value)) ||
    viewBox[0] !== 0 ||
    viewBox[1] !== 0 ||
    viewBox[2] !== width ||
    viewBox[3] !== height
  ) {
    return undefined;
  }
  return { width, height };
}

function readPositiveIntegerAttribute(
  root: string,
  name: "width" | "height",
): number | undefined {
  const value = readSvgAttribute(root, name);
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

function readSvgAttribute(
  root: string,
  name: "width" | "height" | "viewBox",
): string | undefined {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(["'])([^"']*)\\1`, "g");
  const matches = [...root.matchAll(pattern)];
  return matches.length === 1 ? matches[0]?.[2] : undefined;
}

function sharedManifestFields(manifest: RenderManifest): Record<string, unknown> {
  return {
    manifestVersion: manifest.manifestVersion,
    designDocumentId: manifest.designDocumentId,
    designDocumentHash: manifest.designDocumentHash,
    seed: manifest.seed,
    template: manifest.template,
    renderer: manifest.renderer,
    typographyPolicy: manifest.typographyPolicy,
    proceduralAlgorithmVersions: manifest.proceduralAlgorithmVersions,
    assets: manifest.assets,
    fonts: manifest.fonts,
    dimensions: manifest.dimensions,
    creationTimestamp: manifest.creationTimestamp,
    compositionGenerativeImageModelUsed: manifest.compositionGenerativeImageModelUsed,
    includedGenerativeAssetUsed: manifest.includedGenerativeAssetUsed,
    qualityIssues: manifest.qualityIssues,
    productClaim: manifest.productClaim,
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = readSubtleCrypto();
  if (subtle === undefined) {
    throw new Error("SubtleCrypto is unavailable outside a secure browser context.");
  }
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const digest = await subtle.digest("SHA-256", ownedBytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function readSubtleCrypto(): SubtleCrypto | undefined {
  const runtime = globalThis as unknown as {
    crypto?: { subtle?: SubtleCrypto };
  };
  return runtime.crypto?.subtle;
}

function integrityFailure(detail: string): PreviewFailure {
  return {
    ok: false,
    status: 502,
    title: "Preview integrity check failed",
    code: "PREVIEW_INTEGRITY_FAILED",
    detail,
  };
}

function malformedResponse(httpStatus: number): PreviewFailure {
  return {
    ok: false,
    status: httpStatus,
    title: "Preview response was incomplete",
    code: "INVALID_PREVIEW_RESPONSE",
    detail:
      "The preview service returned data the editor could not inspect. Restart the local service and render again.",
  };
}
