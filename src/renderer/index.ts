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
import { RENDER_RESOURCE_LIMITS } from "../resources/index.js";
import { validateDesignDocument, type DesignDocument } from "../schema/index.js";
import { checkTemplateRequirements, getTemplate } from "../templates/index.js";
import { rasterizeSvg } from "./png.js";
import { assertOutputValidity, runDocumentQualityChecks } from "./quality.js";
import type { Scene } from "./scene.js";
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

export function assertRenderGraphicOptionsResources(
  options: RenderGraphicOptions,
): void {
  validateOutputFormats(options.formats ?? ["svg"]);
  if (options.creationTimestamp !== undefined) {
    validateCreationTimestamp(options.creationTimestamp);
  }
}

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
  const createdAt = validateCreationTimestamp(
    options.creationTimestamp ?? new Date().toISOString(),
  );
  const template = getTemplate(document);
  const requirementIssues = checkTemplateRequirements(document, template);
  const documentIssues = runDocumentQualityChecks(document);
  blockOnQualityErrors([...requirementIssues, ...documentIssues]);
  const assets = new AssetRegistry(document.assets, options.assets ?? []);
  validateAssetReferences(document, assets);
  const fonts = new FontRegistry(options.fonts ?? []);
  fonts.validateDeclarations(document.fonts);
  const templateResult = template.render({ document, assets, fonts });
  const manifestFonts = collectManifestFonts(document, templateResult.scene, fonts);
  const qualityIssues = [
    ...requirementIssues,
    ...documentIssues,
    ...templateResult.qualityIssues,
  ];
  blockOnQualityErrors(qualityIssues);

  const svg = renderSceneToSvg(templateResult.scene);
  const manifestAssets = collectManifestAssets(document);
  const assetHashes = manifestAssets.map((asset) => asset.sha256);
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
      fonts: manifestFonts,
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
  scene: Scene,
  registry: FontRegistry,
): ManifestFont[] {
  const declarations = new Set(
    document.fonts.map((declaration) =>
      fontReferenceKey(declaration.family, declaration.weight, declaration.style),
    ),
  );
  const used = new Map<string, ManifestFont>();
  for (const element of scene.elements) {
    if (element.type !== "text") continue;
    const key = fontReferenceKey(
      element.fontFamily,
      element.fontWeight,
      element.fontStyle,
    );
    if (!declarations.has(key)) {
      throw new GlyphkilnError(
        `Scene text uses undeclared font "${element.fontFamily}" (${element.fontWeight} ${element.fontStyle}).`,
        "UNDECLARED_FONT_REFERENCE",
        {
          layerId: element.id,
          family: element.fontFamily,
          weight: element.fontWeight,
          style: element.fontStyle,
        },
      );
    }
    if (used.has(key)) continue;
    const font = registry.get(
      element.fontFamily,
      element.fontWeight,
      element.fontStyle,
    );
    used.set(key, {
      family: element.fontFamily,
      weight: element.fontWeight,
      style: element.fontStyle,
      sha256: font.sha256!,
    });
  }
  return [...used.values()];
}

function fontReferenceKey(family: string, weight: number, style: string): string {
  return `${family.toLocaleLowerCase("en-US")}\u0000${weight}\u0000${style}`;
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

function validateOutputFormats(formats: readonly unknown[]): readonly OutputFormat[] {
  if (formats.length > RENDER_RESOURCE_LIMITS.maxOutputFormats) {
    throw new GlyphkilnError(
      `At most ${RENDER_RESOURCE_LIMITS.maxOutputFormats} output formats may be requested.`,
      "OUTPUT_FORMAT_LIMIT_EXCEEDED",
      {
        maximum: RENDER_RESOURCE_LIMITS.maxOutputFormats,
        actual: formats.length,
      },
    );
  }
  const validated: OutputFormat[] = [];
  for (const format of formats) {
    if (format !== "svg" && format !== "png") {
      throw new GlyphkilnError(
        `Unsupported output format "${String(format)}".`,
        "UNSUPPORTED_OUTPUT_FORMAT",
        { supportedFormats: ["svg", "png"] },
      );
    }
    validated.push(format);
  }
  const unique = [...new Set(validated)];
  if (unique.length === 0) {
    throw new GlyphkilnError(
      "At least one output format is required.",
      "OUTPUT_FORMAT_REQUIRED",
    );
  }
  return unique;
}

function validateCreationTimestamp(timestamp: unknown): string {
  if (
    typeof timestamp !== "string" ||
    Buffer.byteLength(timestamp) > RENDER_RESOURCE_LIMITS.maxCreationTimestampBytes
  ) {
    throw new GlyphkilnError(
      "Manifest creation timestamp exceeds the renderer resource boundary.",
      "CREATION_TIMESTAMP_LIMIT_EXCEEDED",
      { maximum: RENDER_RESOURCE_LIMITS.maxCreationTimestampBytes },
    );
  }
  return timestamp;
}

export { assertSafeGeneratedSvg, renderSceneToSvg } from "./svg.js";
export type { Scene, SceneElement } from "./scene.js";
