import { AssetRegistry, assetDataUri } from "../assets/index.js";
import { sha256 } from "../cache/canonical.js";
import {
  GlyphkilnError,
  type OutputFormat,
  type QualityIssue,
  type ResolvedAsset,
  type ResolvedFont,
} from "../domain/types.js";
import { FontRegistry } from "../fonts/index.js";
import { fontReferenceKey } from "../fonts/key.js";
import type { ManifestAsset, ManifestFont } from "../provenance/index.js";
import { SCENE_RESOURCE_LIMITS } from "../resources/index.js";
import { rasterizeSvg } from "../renderer/png.js";
import {
  validateCreationTimestamp,
  validateOutputFormats,
} from "../renderer/options.js";
import { assertOutputValidity } from "../renderer/quality.js";
import type {
  ConnectorElement,
  GroupElement,
  ImageElement,
  SceneKernel as RenderScene,
  SceneClip,
  SceneKernelElement as RenderSceneElement,
  SceneTransform as RenderSceneTransform,
  TextElement,
} from "../renderer/scene.js";
import { renderSceneToSvg } from "../renderer/svg.js";
import { analyzeTextLayoutSupport } from "../typography/index.js";
import { layoutText, missingGlyphIssue } from "../typography/layout-text.js";
import { createTypesetter, loadTypographyEngine } from "../typography/engine.js";
import type { FontModel } from "../typography/font-model.js";
import { createSceneFingerprint, type SceneFingerprintInput } from "./fingerprint.js";
import {
  createSceneEvidence,
  type SceneEvidence,
  type SceneImageResource,
  type TextWrapFacts,
} from "./evidence.js";
import { createSceneRenderManifest, type SceneRenderManifest } from "./provenance.js";
import { reviewSceneReadingOrder } from "./reading-order.js";
import { validateSceneDocument } from "./schema.js";
import { reviewSceneTextOcclusion } from "./text-occlusion.js";
import { LEGACY_SCENE_DOCUMENT_VERSION } from "./types.js";
import { collectFontIdentityV2 } from "../provenance/font-identity.js";
import type {
  SceneDocument,
  SceneElement,
  SceneGroupElement,
  SceneTextElement,
  SceneTransform,
} from "./types.js";

export type RenderSceneOptions = {
  formats?: readonly OutputFormat[];
  assets?: readonly ResolvedAsset[];
  fonts?: readonly ResolvedFont[];
  creationTimestamp?: string;
  reviewReadingOrder?: boolean;
  /** IDs of deliberate later-painted overlays exempt from text-occlusion review. */
  intentionalTextOverlayIds?: readonly string[];
};

export type RenderedSceneOutput = {
  format: OutputFormat;
  mimeType: "image/svg+xml" | "image/png";
  bytes: Uint8Array;
  fingerprint: string;
  manifest: SceneRenderManifest;
};

export type RenderSceneResult = {
  document: SceneDocument;
  outputs: RenderedSceneOutput[];
  qualityIssues: QualityIssue[];
  evidence: SceneEvidence;
};

export type SceneInspection = {
  document: SceneDocument;
  fingerprint: string | null;
  qualityIssues: QualityIssue[];
  evidence: SceneEvidence | null;
};

type ResolvedScene = {
  scene: RenderScene;
  qualityIssues: QualityIssue[];
  assetIds: Set<string>;
  fontKeys: Set<string>;
  selectableText: boolean;
  textWraps: Map<string, TextWrapFacts>;
  imageResources: Map<string, SceneImageResource>;
};

type ResolveContext = {
  /** Scene 1.1.0 sets text on the M1 typography. */
  m1: { shortSidePx: number } | undefined;
  assets: AssetRegistry;
  fonts: FontRegistry;
  declaredFonts: Set<string>;
  qualityIssues: QualityIssue[];
  assetIds: Set<string>;
  fontKeys: Set<string>;
  selectableText: boolean;
  embeddedRasterBytes: number;
  textWraps: Map<string, TextWrapFacts>;
  imageResources: Map<string, SceneImageResource>;
};

export async function renderScene(
  input: unknown,
  options: RenderSceneOptions = {},
): Promise<RenderSceneResult> {
  const document = requireSceneDocument(input);
  blockOnSceneTextLayoutErrors(collectSceneTextLayoutDiagnostics(document.elements));
  if (document.schemaVersion !== LEGACY_SCENE_DOCUMENT_VERSION)
    await loadTypographyEngine();
  const formats = validateOutputFormats(options.formats ?? ["svg"]);
  const creationTimestamp = validateCreationTimestamp(
    options.creationTimestamp ?? new Date().toISOString(),
  );
  const { resolved, fonts, assets } = resolveSceneResources(document, options);
  blockOnSceneQualityErrors(resolved.qualityIssues);
  const evidence = createSceneEvidence(
    resolved.scene,
    resolved.textWraps,
    resolved.imageResources,
  );
  resolved.qualityIssues.push(
    ...reviewSceneTextOcclusion(
      document,
      evidence,
      assets,
      validateIntentionalOverlayIds(document, options.intentionalTextOverlayIds),
    ),
  );

  const svg = renderSceneToSvg(resolved.scene);
  const m1 =
    document.schemaVersion === LEGACY_SCENE_DOCUMENT_VERSION
      ? undefined
      : collectFontIdentityV2(document.fonts, resolved.scene);
  const manifestAssets = collectManifestAssets(document, resolved.assetIds);
  const manifestFonts = collectManifestFonts(document, resolved.fontKeys, fonts);
  const rasterFonts = manifestFonts.map((font) =>
    fonts.get(font.family, font.weight, font.style as "normal" | "italic"),
  );
  const outputs: RenderedSceneOutput[] = [];
  for (const format of formats) {
    const bytes =
      format === "svg"
        ? new TextEncoder().encode(svg)
        : await rasterizeSvg(svg, rasterFonts);
    assertOutputValidity(format, bytes);
    const fingerprintInput: SceneFingerprintInput = {
      document,
      outputFormat: format,
      assets: manifestAssets,
      fonts: manifestFonts,
    };
    const fingerprint = createSceneFingerprint(fingerprintInput);
    const outputHash = sha256(bytes);
    const manifest = createSceneRenderManifest({
      document,
      fingerprint,
      assets: manifestAssets,
      fonts: manifestFonts,
      outputFormat: format,
      outputHash,
      outputByteSize: bytes.byteLength,
      creationTimestamp,
      renderingMethod:
        format === "svg"
          ? "deterministic-code-rendering/direct-svg"
          : "deterministic-code-rendering/resvg",
      qualityIssues: resolved.qualityIssues,
      selectableText: resolved.selectableText,
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
  return { document, outputs, qualityIssues: resolved.qualityIssues, evidence };
}

/**
 * Resolve a scene exactly as renderScene does before serialization, for
 * read-only craft review. Blocking text-layout and quality errors still throw.
 */
export function prepareSceneForReview(
  input: unknown,
  options: Pick<RenderSceneOptions, "assets" | "fonts"> = {},
): { scene: RenderScene; fonts: FontRegistry; rasterFonts: ResolvedFont[] } {
  const document = requireSceneDocument(input);
  blockOnSceneTextLayoutErrors(collectSceneTextLayoutDiagnostics(document.elements));
  const { resolved, fonts } = resolveSceneResources(document, options);
  blockOnSceneQualityErrors(resolved.qualityIssues);
  const rasterFonts = collectManifestFonts(document, resolved.fontKeys, fonts).map(
    (font) => fonts.get(font.family, font.weight, font.style as "normal" | "italic"),
  );
  return { scene: resolved.scene, fonts, rasterFonts };
}

/** CLI-only review path. Quality errors remain blocked from rendering. */
export function inspectScene(
  input: unknown,
  options: Pick<
    RenderSceneOptions,
    "assets" | "fonts" | "reviewReadingOrder" | "intentionalTextOverlayIds"
  > = {},
): SceneInspection {
  const { document, earlyResult } = preflightSceneInspection(
    input,
    options.reviewReadingOrder,
  );
  if (earlyResult !== null) return earlyResult;
  const { resolved, fonts, assets } = resolveSceneResources(document, options);
  const evidence = createSceneEvidence(
    resolved.scene,
    resolved.textWraps,
    resolved.imageResources,
  );
  resolved.qualityIssues.push(
    ...reviewSceneTextOcclusion(
      document,
      evidence,
      assets,
      validateIntentionalOverlayIds(document, options.intentionalTextOverlayIds),
    ),
  );
  const hasErrors = resolved.qualityIssues.some((issue) => issue.severity === "error");
  const fingerprint = hasErrors
    ? null
    : createSceneFingerprint({
        document,
        outputFormat: "svg",
        assets: collectManifestAssets(document, resolved.assetIds),
        fonts: collectManifestFonts(document, resolved.fontKeys, fonts),
      });
  return {
    document,
    fingerprint,
    qualityIssues: resolved.qualityIssues,
    evidence,
  };
}

/** Validate text layout before the CLI loads optional resource-bundle bytes. */
export function preflightSceneInspection(
  input: unknown,
  reviewReadingOrder = false,
): { document: SceneDocument; earlyResult: SceneInspection | null } {
  const document = requireSceneDocument(input);
  const textLayout = collectSceneTextLayoutDiagnostics(document.elements);
  if (textLayout.issues.length > 0) {
    return {
      document,
      earlyResult: {
        document,
        fingerprint: null,
        qualityIssues: reviewReadingOrder
          ? [...textLayout.issues, ...reviewSceneReadingOrder(document)]
          : textLayout.issues,
        evidence: null,
      },
    };
  }
  return { document, earlyResult: null };
}

function requireSceneDocument(input: unknown): SceneDocument {
  const validation = validateSceneDocument(input);
  if (!validation.success) {
    throw new GlyphkilnError(
      "Scene document validation failed.",
      "INVALID_SCENE_DOCUMENT",
      { problems: validation.problems },
    );
  }
  return validation.data;
}

function resolveSceneResources(
  document: SceneDocument,
  options: Pick<RenderSceneOptions, "assets" | "fonts" | "reviewReadingOrder">,
): { resolved: ResolvedScene; fonts: FontRegistry; assets: AssetRegistry } {
  const assets = new AssetRegistry(document.assets, options.assets ?? []);
  const fonts = new FontRegistry(options.fonts ?? []);
  fonts.validateDeclarations(document.fonts);
  const resolved = resolveScene(document, assets, fonts);
  if (options.reviewReadingOrder === true) {
    resolved.qualityIssues.push(...reviewSceneReadingOrder(document));
  }
  return { resolved, fonts, assets };
}

function validateIntentionalOverlayIds(
  document: SceneDocument,
  ids: readonly string[] | undefined,
): ReadonlySet<string> {
  if (ids === undefined) return new Set();
  if (!Array.isArray(ids) || ids.length > SCENE_RESOURCE_LIMITS.maxElements) {
    throw new GlyphkilnError(
      "Intentional text overlay IDs must be a bounded array.",
      "INVALID_INTENTIONAL_TEXT_OVERLAYS",
    );
  }
  const known = new Set<string>();
  const pending = [...document.elements];
  while (pending.length > 0) {
    const element = pending.pop()!;
    known.add(element.id);
    if (element.type === "group") pending.push(...element.elements);
  }
  if (ids.some((id) => typeof id !== "string" || !known.has(id))) {
    throw new GlyphkilnError(
      "Intentional text overlay IDs must refer to scene elements.",
      "INVALID_INTENTIONAL_TEXT_OVERLAYS",
    );
  }
  return new Set(ids);
}

function resolveScene(
  document: SceneDocument,
  assets: AssetRegistry,
  fonts: FontRegistry,
): ResolvedScene {
  const context: ResolveContext = {
    m1:
      document.schemaVersion === LEGACY_SCENE_DOCUMENT_VERSION
        ? undefined
        : {
            shortSidePx: Math.min(
              document.dimensions.width,
              document.dimensions.height,
            ),
          },
    assets,
    fonts,
    declaredFonts: new Set(
      document.fonts.map((font) =>
        fontReferenceKey(font.family, font.weight, font.style),
      ),
    ),
    qualityIssues: [],
    assetIds: new Set(),
    fontKeys: new Set(),
    selectableText: false,
    embeddedRasterBytes: 0,
    textWraps: new Map(),
    imageResources: new Map(),
  };
  const elements = document.elements.map((element) => resolveElement(element, context));
  applyReadingOrder(elements, document.readingOrder);
  return {
    scene: {
      dimensions: { ...document.dimensions },
      title: document.title,
      description: document.description,
      backgroundColor: document.backgroundColor,
      elements,
    },
    qualityIssues: context.qualityIssues,
    assetIds: context.assetIds,
    fontKeys: context.fontKeys,
    selectableText: context.selectableText,
    textWraps: context.textWraps,
    imageResources: context.imageResources,
  };
}

function applyReadingOrder(
  elements: readonly RenderSceneElement[],
  readingOrder: readonly string[],
): void {
  const positions = new Map(readingOrder.map((id, index) => [id, index + 1] as const));
  const pending = [...elements];
  while (pending.length > 0) {
    const element = pending.pop()!;
    const position = positions.get(element.id);
    if (position !== undefined) {
      element.semantic = {
        ...(element.semantic ?? { role: "content" }),
        readingOrder: position,
      };
    }
    if (element.type === "group") pending.push(...element.elements);
  }
}

function resolveElement(
  element: SceneElement,
  context: ResolveContext,
): RenderSceneElement {
  switch (element.type) {
    case "rect":
    case "circle":
    case "path":
      return { ...element };
    case "image":
      return resolveImage(element, context);
    case "text":
      return resolveText(element, context);
    case "connector":
      return resolveConnector(element);
    case "group":
      return resolveGroup(element, context);
  }
}

function resolveImage(
  element: Extract<SceneElement, { type: "image" }>,
  context: ResolveContext,
): ImageElement {
  const asset = context.assets.get(element.assetId);
  const embeddedBytes = assetDataUriByteLength(asset);
  const nextEmbeddedBytes = context.embeddedRasterBytes + embeddedBytes;
  if (nextEmbeddedBytes > SCENE_RESOURCE_LIMITS.maxEmbeddedRasterBytes) {
    throw new GlyphkilnError(
      "Scene image references exceed the embedded raster byte limit.",
      "SCENE_EMBEDDED_RASTER_BYTES_LIMIT_EXCEEDED",
      {
        maximum: SCENE_RESOURCE_LIMITS.maxEmbeddedRasterBytes,
        actual: nextEmbeddedBytes,
        elementId: element.id,
      },
    );
  }
  context.embeddedRasterBytes = nextEmbeddedBytes;
  context.assetIds.add(element.assetId);
  context.imageResources.set(element.id, {
    id: asset.id,
    width: asset.width,
    height: asset.height,
  });
  return {
    id: element.id,
    type: "image",
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    fit: element.fit,
    href: assetDataUri(asset),
    ...(element.opacity === undefined ? {} : { opacity: element.opacity }),
    ...(element.semantic === undefined ? {} : { semantic: element.semantic }),
  };
}

function assetDataUriByteLength(asset: ResolvedAsset): number {
  const prefixBytes = Buffer.byteLength(`data:${asset.mimeType};base64,`);
  const encodedBytes = Math.ceil(asset.bytes.byteLength / 3) * 4;
  return prefixBytes + encodedBytes;
}

function resolveText(element: SceneTextElement, context: ResolveContext): TextElement {
  const key = fontReferenceKey(
    element.font.family,
    element.font.weight,
    element.font.style,
  );
  if (!context.declaredFonts.has(key)) {
    throw new GlyphkilnError(
      `Scene text uses undeclared font "${element.font.family}" (${element.font.weight} ${element.font.style}).`,
      "UNDECLARED_FONT_REFERENCE",
      {
        elementId: element.id,
        family: element.font.family,
        weight: element.font.weight,
        style: element.font.style,
      },
    );
  }
  context.fonts.get(element.font.family, element.font.weight, element.font.style);
  context.fontKeys.add(key);
  const engine =
    context.m1 === undefined
      ? undefined
      : createTypesetter({
          registry: context.fonts,
          model: sceneFontModel(element.font),
          shortSidePx: context.m1.shortSidePx,
          layerId: element.id,
        });
  for (const face of sceneStackFaces(element.font)) {
    context.fontKeys.add(
      fontReferenceKey(face, element.font.weight, element.font.style),
    );
  }
  const layout = layoutText({
    text: element.text,
    registry: context.fonts,
    ...(engine === undefined ? {} : { engine }),
    face: {
      family: element.font.family,
      weight: element.font.weight,
      style: element.font.style,
    },
    box: element.box,
    layerId: element.id,
    sizing: {
      mode: "fit",
      preferredFontSize: element.fit.preferredFontSize,
      minimumFontSize: element.fit.minimumFontSize,
      maximumLines: element.fit.maximumLines,
      ...(element.fit.keepTogether === undefined
        ? {}
        : { keepTogether: element.fit.keepTogether }),
    },
    setting: {
      kind: "absolute",
      lineHeight: element.fit.lineHeight,
      ...(element.fit.letterSpacing === undefined
        ? {}
        : { letterSpacing: element.fit.letterSpacing }),
    },
    align: element.fit.align,
    verticalAlign: element.fit.verticalAlign ?? "top",
    detail: "glyphs",
    renderedLineLimit: element.fit.maximumLines,
    coverage: "source-text",
  });
  if (layout.missingCodePoints.length > 0) {
    context.qualityIssues.push(
      missingGlyphIssue(
        element.id,
        engine === undefined
          ? `Font "${element.font.family}" does not cover all text in scene element "${element.id}".`
          : `No face in the stack ${engine
              .stackFamilies()
              .map((name) => `"${name}"`)
              .join(", ")} covers all text in scene element "${element.id}".`,
        layout.missingCodePoints,
        engine?.stackFamilies(),
      ),
    );
  }
  if (engine !== undefined) context.qualityIssues.push(...engine.issues);
  context.qualityIssues.push(...layout.issues);
  const lines = layout.lines.map((line) => line.text);
  context.textWraps.set(element.id, {
    lineWidths: layout.metrics.lineWidths,
    brokeLongWord: layout.evidence.brokeLongWord,
    orphanLineCount: layout.evidence.orphanLineCount,
    usesBalancedLineBreaking: layout.evidence.usesBalancedLineBreaking,
    segmentationPolicy: layout.evidence.segmentationPolicy!,
    segmentationPolicyVersion: layout.evidence.segmentationPolicyVersion!,
  });
  context.selectableText ||= element.textMode === "outline-with-selectable-text";
  return {
    id: element.id,
    type: "text",
    x: layout.anchor.x,
    y: layout.anchor.y,
    lines,
    fill: element.fill,
    // Keep SVG metadata canonical to the scene document. The registry key is
    // case-insensitive, so a caller may resolve the same bytes under a
    // different family spelling; that spelling must not change the output.
    fontFamily: element.font.family,
    fontWeight: element.font.weight,
    fontStyle: element.font.style,
    fontSize: layout.fontSize,
    lineHeight: element.fit.lineHeight,
    align: element.fit.align,
    ...(element.fit.letterSpacing === undefined
      ? {}
      : { letterSpacing: element.fit.letterSpacing }),
    bounds: layout.bounds,
    outlines: layout.lines.map((line) => line.set!.outline),
    textMode: element.textMode,
    ...(engine === undefined
      ? {}
      : { faces: engine.usedFaces(), fontStack: engine.stackFamilies() }),
    ...(element.opacity === undefined ? {} : { opacity: element.opacity }),
    ...(element.semantic === undefined ? {} : { semantic: element.semantic }),
  };
}

function resolveConnector(
  element: Extract<SceneElement, { type: "connector" }>,
): ConnectorElement {
  const { markers, ...connector } = element;
  return {
    ...connector,
    startMarker: markers.start,
    endMarker: markers.end,
  };
}

function resolveGroup(
  element: SceneGroupElement,
  context: ResolveContext,
): GroupElement {
  return {
    id: element.id,
    type: "group",
    elements: element.elements.map((child) => resolveElement(child, context)),
    ...(element.transforms === undefined
      ? {}
      : { transforms: element.transforms.map(resolveTransform) }),
    ...(element.clip === undefined ? {} : { clip: resolveClip(element.clip) }),
    ...(element.opacity === undefined ? {} : { opacity: element.opacity }),
    ...(element.semantic === undefined ? {} : { semantic: element.semantic }),
  };
}

function resolveTransform(transform: SceneTransform): RenderSceneTransform {
  if (transform.type !== "rotate") return { ...transform };
  return {
    ...transform,
    cx: transform.cx ?? 0,
    cy: transform.cy ?? 0,
  };
}

function resolveClip(clip: NonNullable<SceneGroupElement["clip"]>): SceneClip {
  return { ...clip };
}

function collectManifestAssets(
  document: SceneDocument,
  usedIds: ReadonlySet<string>,
): ManifestAsset[] {
  return document.assets
    .filter((asset) => usedIds.has(asset.id))
    .map((asset) => ({
      id: asset.id,
      sha256: asset.sha256,
      origin: asset.origin,
    }));
}

function collectManifestFonts(
  document: SceneDocument,
  usedKeys: ReadonlySet<string>,
  registry: FontRegistry,
): ManifestFont[] {
  return document.fonts
    .filter((font) =>
      usedKeys.has(fontReferenceKey(font.family, font.weight, font.style)),
    )
    .map((font) => ({
      family: font.family,
      weight: font.weight,
      style: font.style,
      sha256: registry.get(font.family, font.weight, font.style).sha256!,
    }));
}

function blockOnSceneQualityErrors(issues: readonly QualityIssue[]): void {
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length === 0) return;
  throw new GlyphkilnError(
    `Scene render blocked by ${errors.length} quality error${errors.length === 1 ? "" : "s"}.`,
    "SCENE_QUALITY_VALIDATION_FAILED",
    { issues },
  );
}

type SceneTextLayoutCollection = {
  totalDiagnostics: number;
  issues: QualityIssue[];
  truncated: boolean;
};

const MAX_SCENE_TEXT_LAYOUT_DIAGNOSTICS = 128;

function collectSceneTextLayoutDiagnostics(
  elements: readonly SceneElement[],
): SceneTextLayoutCollection {
  const issues: QualityIssue[] = [];
  let totalDiagnostics = 0;
  for (const reference of collectSceneTextReferences(elements, "$.elements")) {
    const analysis = analyzeTextLayoutSupport(reference.text);
    for (const diagnostic of analysis.diagnostics) {
      totalDiagnostics += 1;
      if (issues.length >= MAX_SCENE_TEXT_LAYOUT_DIAGNOSTICS) continue;
      issues.push({
        code: diagnostic.code,
        severity: "error",
        message: diagnostic.message,
        layerId: reference.elementId,
        details: {
          diagnosticsVersion: analysis.version,
          fieldPath: reference.fieldPath,
          totalMatches: diagnostic.totalMatches,
          matches: diagnostic.matches,
          truncated: diagnostic.truncated,
        },
      });
    }
  }
  return {
    totalDiagnostics,
    issues,
    truncated: totalDiagnostics > issues.length,
  };
}

type SceneTextReference = {
  elementId: string;
  text: string;
  fieldPath: string;
};

function collectSceneTextReferences(
  elements: readonly SceneElement[],
  path: string,
): SceneTextReference[] {
  const references: SceneTextReference[] = [];
  for (const [index, element] of elements.entries()) {
    const elementPath = `${path}[${index.toString()}]`;
    if (element.type === "text") {
      references.push({
        elementId: element.id,
        text: element.text,
        fieldPath: `${elementPath}.text`,
      });
    }
    if (element.type === "group") {
      references.push(
        ...collectSceneTextReferences(element.elements, `${elementPath}.elements`),
      );
    }
  }
  return references;
}

function blockOnSceneTextLayoutErrors(collection: SceneTextLayoutCollection): void {
  if (collection.issues.length === 0) return;
  const omittedDiagnostics = collection.totalDiagnostics - collection.issues.length;
  const suffix = collection.truncated
    ? ` ${omittedDiagnostics.toString()} additional text-layout diagnostics were omitted by the retained-record limit.`
    : "";
  throw new GlyphkilnError(
    `Scene render blocked by ${collection.issues.length.toString()} quality error${
      collection.issues.length === 1 ? "" : "s"
    }.${suffix}`,
    "SCENE_QUALITY_VALIDATION_FAILED",
    {
      issues: collection.issues,
      textLayout: {
        totalDiagnostics: collection.totalDiagnostics,
        retainedDiagnostics: collection.issues.length,
        truncated: collection.truncated,
      },
    },
  );
}

function sceneFontModel(font: SceneTextElement["font"]): FontModel {
  return {
    family: font.family,
    weight: font.weight,
    style: font.style,
    ...(font.axes === undefined ? {} : { axes: font.axes }),
    ...(font.namedInstance === undefined ? {} : { namedInstance: font.namedInstance }),
    ...(font.opticalSizing === undefined ? {} : { opticalSizing: font.opticalSizing }),
    ...(font.opsz === undefined ? {} : { opsz: font.opsz }),
    ...(font.fallback === undefined ? {} : { fallback: font.fallback }),
    ...(font.scriptFaces === undefined ? {} : { scriptFaces: font.scriptFaces }),
  };
}

/** Fallback and script-face families an element names (Scene 1.1.0). */
export function sceneStackFaces(font: SceneTextElement["font"]): string[] {
  return [
    ...(font.fallback ?? []).map((face) => face.family),
    ...(font.scriptFaces?.latn === undefined ? [] : [font.scriptFaces.latn.family]),
    ...(font.scriptFaces?.thai === undefined ? [] : [font.scriptFaces.thai.family]),
  ];
}
