import type { DesignDocument, QualityIssue, RenderManifest } from "@glyphkiln/core";
import { canonicalJson, createRenderFingerprintPayload } from "@glyphkiln/core/browser";

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
  const proceduralLayer = response.document.layers.find(
    (
      layer,
    ): layer is Extract<
      PreviewSuccess["document"]["layers"][number],
      { type: "procedural-decoration" }
    > => layer.type === "procedural-decoration" && layer.visible,
  );
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
    manifest.fonts.every(
      (font) =>
        response.document.fonts.some(
          (declaration) =>
            declaration.family === font.family &&
            declaration.weight === font.weight &&
            declaration.style === font.style &&
            declaration.sha256 === font.sha256,
        ) &&
        font.family === "Inter" &&
        font.sha256 === catalog.developmentFontSha256,
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
    typeof input.base64 !== "string" ||
    input.base64.length === 0 ||
    !BASE64_PATTERN.test(input.base64) ||
    !isPositiveInteger(input.byteSize) ||
    decodedByteLength(input.base64) !== input.byteSize ||
    typeof input.fingerprint !== "string" ||
    !SHA256_PATTERN.test(input.fingerprint) ||
    typeof input.filename !== "string" ||
    input.filename.length === 0 ||
    !isRenderManifest(input.manifest)
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

function sharedManifestFields(manifest: RenderManifest): Record<string, unknown> {
  return {
    manifestVersion: manifest.manifestVersion,
    designDocumentId: manifest.designDocumentId,
    designDocumentHash: manifest.designDocumentHash,
    seed: manifest.seed,
    template: manifest.template,
    renderer: manifest.renderer,
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
