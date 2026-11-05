import { AssetRegistry, validateAssetReferences } from "../assets/index.js";
import { sha256 } from "../cache/canonical.js";
import {
  createRenderFingerprint,
  type RenderFingerprintInput,
} from "../cache/fingerprint.js";
import { RENDER_CONFIGURATION } from "../cache/fingerprint-contract.js";
import {
  GlyphkilnError,
  RENDERER_VERSION,
  type OutputFormat,
  type QualityIssue,
  type ResolvedAsset,
  type ResolvedFont,
} from "../domain/types.js";
import { FontRegistry } from "../fonts/index.js";
import { fontReferenceKey } from "../fonts/key.js";
import { getFormatDimensions } from "../formats/index.js";
import {
  createRenderManifest,
  type ManifestAsset,
  type ManifestFont,
  type ManifestFontV2,
  type ManifestTextStack,
  type RenderManifest,
} from "../provenance/index.js";
import { collectFontIdentityV2 } from "../provenance/font-identity.js";
import { loadTypographyEngine } from "../typography/engine.js";
import { M1_TYPOGRAPHY_POLICY } from "../typography/typesetter.js";
import { validateDesignDocument, type DesignDocument } from "../schema/index.js";
import { checkTemplateRequirements, getTemplate } from "../templates/index.js";
import type { TemplateRenderResult } from "../templates/types.js";
import { rasterizeSvg } from "./png.js";
import { validateCreationTimestamp, validateOutputFormats } from "./options.js";
import {
  assertOutputValidity,
  runDocumentQualityChecks,
  type TextLayoutQualitySummary,
} from "./quality.js";
import { flattenSceneElements, type Scene } from "./scene.js";
import type { RenderEvidence } from "./evidence.js";
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
  evidence: RenderEvidence;
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
  if (getTemplate(document).typography === "m1") await loadTypographyEngine();
  const { templateResult, fonts, manifestFonts, m1, qualityIssues } =
    prepareGraphicScene(document, options);

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
      fonts: m1 === undefined ? manifestFonts : m1.fonts,
      proceduralAlgorithmVersions: templateResult.proceduralAlgorithmVersions,
      ...(m1 === undefined
        ? {}
        : {
            rendererVersion: RENDERER_VERSION,
            rendererConfiguration: {
              ...RENDER_CONFIGURATION,
              typographyPolicy: {
                ...RENDER_CONFIGURATION.typographyPolicy,
                m1: M1_TYPOGRAPHY_POLICY,
              },
            },
          }),
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
      ...(m1 === undefined ? {} : { m1 }),
    });
    outputs.push({
      format,
      mimeType: format === "svg" ? "image/svg+xml" : "image/png",
      bytes,
      fingerprint,
      manifest,
    });
  }
  return { document, outputs, qualityIssues, evidence: templateResult.evidence };
}

export type PreparedGraphicScene = {
  templateResult: TemplateRenderResult;
  fonts: FontRegistry;
  manifestFonts: ManifestFont[];
  /** Font identity v2 for templates on the M1 typography. */
  m1: { fonts: ManifestFontV2[]; textStacks: ManifestTextStack[] } | undefined;
  qualityIssues: QualityIssue[];
};

/**
 * Resolve a validated document to its renderer-neutral scene through exactly
 * the checks renderGraphic applies. Quality errors throw before any output.
 */
export function prepareGraphicScene(
  document: DesignDocument,
  options: Pick<RenderGraphicOptions, "assets" | "fonts">,
): PreparedGraphicScene {
  const template = getTemplate(document);
  const requirementIssues = checkTemplateRequirements(document, template);
  const documentQuality = runDocumentQualityChecks(document);
  blockOnQualityErrors(
    [...requirementIssues, ...documentQuality.issues],
    documentQuality.textLayout,
  );
  const assets = new AssetRegistry(document.assets, options.assets ?? []);
  validateAssetReferences(document, assets);
  const fonts = new FontRegistry(options.fonts ?? []);
  fonts.validateDeclarations(document.fonts);
  const templateResult = template.render({
    document,
    assets,
    fonts,
    ...(template.typography === undefined ? {} : { typography: template.typography }),
  });
  const manifestFonts = collectManifestFonts(document, templateResult.scene, fonts);
  const m1 =
    template.typography === "m1"
      ? collectFontIdentityV2(document.fonts, templateResult.scene)
      : undefined;
  const qualityIssues = [
    ...requirementIssues,
    ...documentQuality.issues,
    ...templateResult.qualityIssues,
  ];
  blockOnQualityErrors(qualityIssues, documentQuality.textLayout);
  return { templateResult, fonts, manifestFonts, m1, qualityIssues };
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
  for (const sceneElement of flattenSceneElements(scene.elements)) {
    const element =
      sceneElement.type === "text"
        ? sceneElement
        : sceneElement.type === "path" && sceneElement.glyphRun !== undefined
          ? { id: sceneElement.id, ...sceneElement.glyphRun }
          : undefined;
    if (element === undefined) continue;
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

function blockOnQualityErrors(
  issues: QualityIssue[],
  textLayout: TextLayoutQualitySummary,
): void {
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new GlyphkilnError(
      qualityFailureMessage(errors.length, textLayout),
      "QUALITY_VALIDATION_FAILED",
      { issues, textLayout },
    );
  }
}

function qualityFailureMessage(
  retainedErrorCount: number,
  textLayout: TextLayoutQualitySummary,
): string {
  const base = `Render blocked by ${retainedErrorCount} quality error${
    retainedErrorCount === 1 ? "" : "s"
  }.`;
  if (!textLayout.truncated) return base;
  const omittedDiagnostics =
    textLayout.totalDiagnostics - textLayout.retainedDiagnostics;
  return `${base} ${omittedDiagnostics} additional text-layout diagnostics were omitted by the retained-record limit.`;
}

export { assertSafeGeneratedSvg, renderSceneToSvg } from "./svg.js";
export type { Scene, SceneElement } from "./scene.js";
export { RENDER_EVIDENCE_VERSION, createRenderEvidence } from "./evidence.js";
export type {
  ContrastEvidence,
  ContrastSampleEvidence,
  ImageCropEvidence,
  RenderEvidence,
  TextBoundsEvidence,
} from "./evidence.js";
