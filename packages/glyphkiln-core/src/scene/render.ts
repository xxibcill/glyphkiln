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
import type { ManifestAsset, ManifestFont } from "../provenance/index.js";
import { RENDER_RESOURCE_LIMITS, SCENE_RESOURCE_LIMITS } from "../resources/index.js";
import { rasterizeSvg } from "../renderer/png.js";
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
import { analyzeTextLayoutSupport, fitText } from "../typography/index.js";
import { createSceneFingerprint, type SceneFingerprintInput } from "./fingerprint.js";
import { createSceneRenderManifest, type SceneRenderManifest } from "./provenance.js";
import { validateSceneDocument } from "./schema.js";
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
};

type ResolvedScene = {
  scene: RenderScene;
  qualityIssues: QualityIssue[];
  assetIds: Set<string>;
  fontKeys: Set<string>;
  selectableText: boolean;
};

type ResolveContext = {
  assets: AssetRegistry;
  fonts: FontRegistry;
  declaredFonts: Set<string>;
  qualityIssues: QualityIssue[];
  assetIds: Set<string>;
  fontKeys: Set<string>;
  selectableText: boolean;
  embeddedRasterBytes: number;
};

export async function renderScene(
  input: unknown,
  options: RenderSceneOptions = {},
): Promise<RenderSceneResult> {
  const validation = validateSceneDocument(input);
  if (!validation.success) {
    throw new GlyphkilnError(
      "Scene document validation failed.",
      "INVALID_SCENE_DOCUMENT",
      { problems: validation.problems },
    );
  }
  const document = validation.data;
  blockOnSceneTextLayoutErrors(collectSceneTextLayoutDiagnostics(document.elements));
  const formats = validateOutputFormats(options.formats ?? ["svg"]);
  const creationTimestamp = validateCreationTimestamp(
    options.creationTimestamp ?? new Date().toISOString(),
  );
  const assets = new AssetRegistry(document.assets, options.assets ?? []);
  const fonts = new FontRegistry(options.fonts ?? []);
  fonts.validateDeclarations(document.fonts);
  const resolved = resolveScene(document, assets, fonts);
  blockOnSceneQualityErrors(resolved.qualityIssues);

  const svg = renderSceneToSvg(resolved.scene);
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
    });
    outputs.push({
      format,
      mimeType: format === "svg" ? "image/svg+xml" : "image/png",
      bytes,
      fingerprint,
      manifest,
    });
  }
  return { document, outputs, qualityIssues: resolved.qualityIssues };
}

function resolveScene(
  document: SceneDocument,
  assets: AssetRegistry,
  fonts: FontRegistry,
): ResolvedScene {
  const context: ResolveContext = {
    assets,
    fonts,
    declaredFonts: new Set(
      document.fonts.map((font) => fontKey(font.family, font.weight, font.style)),
    ),
    qualityIssues: [],
    assetIds: new Set(),
    fontKeys: new Set(),
    selectableText: false,
    embeddedRasterBytes: 0,
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
  const key = fontKey(element.font.family, element.font.weight, element.font.style);
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
  const font = context.fonts.get(
    element.font.family,
    element.font.weight,
    element.font.style,
  );
  context.fontKeys.add(key);
  const missingCodePoints = context.fonts.missingCodePoints(
    element.text,
    element.font.family,
    element.font.weight,
    element.font.style,
  );
  if (missingCodePoints.length > 0) {
    context.qualityIssues.push({
      code: "MISSING_GLYPH",
      severity: "error",
      message: `Font "${element.font.family}" does not cover all text in scene element "${element.id}".`,
      layerId: element.id,
      details: {
        codePoints: missingCodePoints.map(
          (codePoint) => `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
        ),
      },
    });
  }
  const fitted = fitText({
    text: element.text,
    registry: context.fonts,
    style: {
      family: element.font.family,
      weight: element.font.weight,
      style: element.font.style,
      lineHeight: element.fit.lineHeight,
      ...(element.fit.letterSpacing === undefined
        ? {}
        : { letterSpacing: element.fit.letterSpacing }),
    },
    box: element.box,
    preferredFontSize: element.fit.preferredFontSize,
    minimumFontSize: element.fit.minimumFontSize,
    maximumLines: element.fit.maximumLines,
    layerId: element.id,
    ...(element.fit.keepTogether === undefined
      ? {}
      : { keepTogether: element.fit.keepTogether }),
  });
  context.qualityIssues.push(...fitted.issues);
  const y = verticallyAlignedY(element, fitted.height);
  const x = horizontallyAlignedX(element);
  const lines = fitted.lines.slice(0, element.fit.maximumLines);
  const outlines = context.fonts.outlineText({
    lines,
    family: element.font.family,
    weight: element.font.weight,
    style: element.font.style,
    fontSize: fitted.fontSize,
    lineHeight: element.fit.lineHeight,
    x,
    y,
    align: element.fit.align,
    ...(element.fit.letterSpacing === undefined
      ? {}
      : { letterSpacing: element.fit.letterSpacing }),
  });
  context.selectableText ||= element.textMode === "outline-with-selectable-text";
  return {
    id: element.id,
    type: "text",
    x,
    y,
    lines,
    fill: element.fill,
    // Keep SVG metadata canonical to the scene document. The registry key is
    // case-insensitive, so a caller may resolve the same bytes under a
    // different family spelling; that spelling must not change the output.
    fontFamily: element.font.family,
    fontWeight: element.font.weight,
    fontStyle: element.font.style,
    fontSize: fitted.fontSize,
    lineHeight: element.fit.lineHeight,
    align: element.fit.align,
    ...(element.fit.letterSpacing === undefined
      ? {}
      : { letterSpacing: element.fit.letterSpacing }),
    bounds: {
      x: alignedBoundsX(element, fitted.width),
      y,
      width: fitted.width,
      height: fitted.height,
    },
    outlines,
    textMode: element.textMode,
    ...(element.opacity === undefined ? {} : { opacity: element.opacity }),
    ...(element.semantic === undefined ? {} : { semantic: element.semantic }),
  };
}

function horizontallyAlignedX(element: SceneTextElement): number {
  switch (element.fit.align) {
    case "left":
      return element.box.x;
    case "center":
      return element.box.x + element.box.width / 2;
    case "right":
      return element.box.x + element.box.width;
  }
}

function alignedBoundsX(element: SceneTextElement, width: number): number {
  switch (element.fit.align) {
    case "left":
      return element.box.x;
    case "center":
      return element.box.x + (element.box.width - width) / 2;
    case "right":
      return element.box.x + element.box.width - width;
  }
}

function verticallyAlignedY(element: SceneTextElement, height: number): number {
  switch (element.fit.verticalAlign ?? "top") {
    case "top":
      return element.box.y;
    case "middle":
      return element.box.y + Math.max(0, (element.box.height - height) / 2);
    case "bottom":
      return element.box.y + Math.max(0, element.box.height - height);
  }
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
    .filter((font) => usedKeys.has(fontKey(font.family, font.weight, font.style)))
    .map((font) => ({
      family: font.family,
      weight: font.weight,
      style: font.style,
      sha256: registry.get(font.family, font.weight, font.style).sha256!,
    }));
}

function fontKey(family: string, weight: number, style: string): string {
  return `${family.toLocaleLowerCase("en-US")}\u0000${weight}\u0000${style}`;
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
