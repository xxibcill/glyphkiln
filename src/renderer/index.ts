import { AssetRegistry, validateAssetReferences } from "../assets/index.js";
import { sha256 } from "../cache/canonical.js";
import {
  createRenderFingerprint,
  type RenderFingerprintInput,
} from "../cache/fingerprint.js";
import {
  GlyphkilnError,
  type OutputFormat,
  type QualityIssue,
  type ResolvedAsset,
  type ResolvedFont,
} from "../domain/types.js";
import { FontRegistry } from "../fonts/index.js";
import { getFormatDimensions } from "../formats/index.js";
import {
  createRenderManifest,
  type ManifestAsset,
  type ManifestFont,
  type RenderManifest,
} from "../provenance/index.js";
import { validateDesignDocument, type DesignDocument } from "../schema/index.js";
import { checkTemplateRequirements, getTemplate } from "../templates/index.js";
import { rasterizeSvg } from "./png.js";
import { assertOutputValidity, runDocumentQualityChecks } from "./quality.js";
import { renderSceneToSvg } from "./svg.js";

export type RenderGraphicOptions = {
  formats?: readonly OutputFormat[];
  assets?: readonly ResolvedAsset[];
  fonts?: readonly ResolvedFont[];
  creationTimestamp?: string;
};

export type RenderedOutput = {
  format: OutputFormat;
  mimeType: "image/svg+xml" | "image/png";
  bytes: Uint8Array;
  fingerprint: string;
  manifest: RenderManifest;
};

export type RenderGraphicResult = {
  document: DesignDocument;
  outputs: RenderedOutput[];
  qualityIssues: QualityIssue[];
};

export async function renderGraphic(
  input: unknown,
  options: RenderGraphicOptions = {},
): Promise<RenderGraphicResult> {
  const validation = validateDesignDocument(input);
  if (!validation.success) {
    throw new GlyphkilnError(
      "Design document validation failed.",
      "INVALID_DESIGN_DOCUMENT",
      { problems: validation.problems },
    );
  }
  const document = validation.data;
  const formats = validateOutputFormats(options.formats ?? ["svg"]);
  const assets = new AssetRegistry(document.assets, options.assets ?? []);
  validateAssetReferences(document, assets);
  const fonts = new FontRegistry(options.fonts ?? []);
  fonts.validateDeclarations(document.fonts);
  const template = getTemplate(document);
  const requirementIssues = checkTemplateRequirements(document, template);
  const documentIssues = runDocumentQualityChecks(document);
  blockOnQualityErrors([...requirementIssues, ...documentIssues]);
  const templateResult = template.render({ document, assets, fonts });
  const qualityIssues = [
    ...requirementIssues,
    ...documentIssues,
    ...templateResult.qualityIssues,
  ];
  blockOnQualityErrors(qualityIssues);

  const svg = renderSceneToSvg(templateResult.scene);
  const manifestAssets = collectManifestAssets(document);
  const manifestFonts = collectManifestFonts(document, fonts);
  const assetHashes = manifestAssets.map((asset) => asset.sha256);
  const fontHashes = manifestFonts.map((font) => font.sha256);
  const createdAt = options.creationTimestamp ?? new Date().toISOString();
  const outputs: RenderedOutput[] = [];

  for (const format of formats) {
    const bytes =
      format === "svg"
        ? new TextEncoder().encode(svg)
        : await rasterizeSvg(svg, fonts.list());
    assertOutputValidity(format, bytes);
    const fingerprintInput: RenderFingerprintInput = {
      document,
      outputFormat: format,
      assetHashes,
      fontHashes,
      proceduralAlgorithmVersions: templateResult.proceduralAlgorithmVersions,
    };
    const fingerprint = createRenderFingerprint(fingerprintInput);
    const outputHash = sha256(bytes);
    const manifest = createRenderManifest({
      document,
      fingerprint,
      proceduralAlgorithmVersions: templateResult.proceduralAlgorithmVersions,
      assets: manifestAssets,
      fonts: manifestFonts,
      dimensions: getFormatDimensions(document.format),
      outputFormat: format,
      outputHash,
      outputByteSize: bytes.byteLength,
      creationTimestamp: createdAt,
      renderingMethod:
        format === "svg"
          ? "deterministic-code-rendering/direct-svg"
          : "deterministic-code-rendering/resvg",
      qualityIssues,
    });
    outputs.push({
      format,
      mimeType: format === "svg" ? "image/svg+xml" : "image/png",
      bytes,
      fingerprint,
      manifest,
    });
  }
  return { document, outputs, qualityIssues };
}

function collectManifestAssets(document: DesignDocument): ManifestAsset[] {
  return document.assets.map((asset) => ({
    id: asset.id,
    sha256: asset.sha256,
    origin: asset.origin,
  }));
}

function collectManifestFonts(
  document: DesignDocument,
  registry: FontRegistry,
): ManifestFont[] {
  return document.fonts.map((declaration) => {
    const font = registry.get(
      declaration.family,
      declaration.weight,
      declaration.style,
    );
    return {
      family: declaration.family,
      weight: declaration.weight,
      style: declaration.style,
      sha256: font.sha256!,
    };
  });
}

function blockOnQualityErrors(issues: QualityIssue[]): void {
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new GlyphkilnError(
      `Render blocked by ${errors.length} quality error${errors.length === 1 ? "" : "s"}.`,
      "QUALITY_VALIDATION_FAILED",
      { issues },
    );
  }
}

function validateOutputFormats(
  formats: readonly OutputFormat[],
): readonly OutputFormat[] {
  const unique = [...new Set(formats)];
  if (unique.length === 0) {
    throw new GlyphkilnError(
      "At least one output format is required.",
      "OUTPUT_FORMAT_REQUIRED",
    );
  }
  return unique;
}

export { assertSafeGeneratedSvg, renderSceneToSvg } from "./svg.js";
export type { Scene, SceneElement } from "./scene.js";
