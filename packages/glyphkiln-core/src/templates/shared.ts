import { keepTogetherPhrasesOf } from "../schema/design-document.js";
import { assetDataUri } from "../assets/index.js";
import { calculateFocalCrop } from "../assets/focal-crop.js";
import { createProceduralBackground } from "../backgrounds/index.js";
import type { Bounds, QualityIssue } from "../domain/types.js";
import { getFormatDimensions } from "../formats/index.js";
import {
  contrastRatio,
  contrastIssue,
  isInside,
  safeAreaBounds,
  safeAreaIssue,
} from "../layout/index.js";
import type { DesignLayer } from "../schema/index.js";
import type { FittedText } from "../typography/index.js";
import {
  layoutText,
  missingGlyphIssue,
  type TextLayout,
} from "../typography/layout-text.js";
import type {
  ImageElement,
  Scene,
  SceneElement,
  TextElement,
} from "../renderer/scene.js";
import { createRenderEvidence, type RenderEvidence } from "../renderer/evidence.js";
import type { TemplateRenderContext, TemplateRenderResult } from "./types.js";

export type TextLayer = Extract<
  DesignLayer,
  {
    type: "headline" | "subtitle" | "eyebrow" | "cta" | "footer" | "attribution";
  }
>;

export type TemplateCanvas = {
  scene: Scene;
  safeArea: Bounds;
  backgroundColor: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  spacingUnit: number;
  qualityIssues: QualityIssue[];
  proceduralAlgorithmVersions: Record<string, string>;
  evidence: RenderEvidence;
};

export type TemplateCanvasOptions = {
  /**
   * "always" (every version before the 1.7.0-era templates) draws any visible
   * procedural layer; "declared-job" draws it only when it declares a job.
   */
  decoration?: "always" | "declared-job";
  /** Ground color when no background layer overrides it. */
  ground?: string;
};

export function createTemplateCanvas(
  context: TemplateRenderContext,
  options: TemplateCanvasOptions = {},
): TemplateCanvas {
  const { document } = context;
  const dimensions = getFormatDimensions(document.format);
  const theme = document.brand.themes[document.mode];
  const backgroundLayer = findLayer(document.layers, "background");
  const backgroundColor = backgroundLayer?.color ?? options.ground ?? theme.background;
  const scene: Scene = {
    dimensions,
    title: `${document.template.id} graphic`,
    description: "A deterministic graphic rendered by Glyphkiln Core.",
    backgroundColor,
    elements: [],
  };
  const proceduralAlgorithmVersions: Record<string, string> = {};
  const declaredProcedural = findLayer(document.layers, "procedural-decoration");
  const procedural =
    options.decoration === "declared-job" &&
    (declaredProcedural === undefined ||
      !("job" in declaredProcedural) ||
      declaredProcedural.job === undefined)
      ? undefined
      : declaredProcedural;
  if (procedural !== undefined) {
    const quietRegion = {
      x: procedural.quietRegion.x * dimensions.width,
      y: procedural.quietRegion.y * dimensions.height,
      width: procedural.quietRegion.width * dimensions.width,
      height: procedural.quietRegion.height * dimensions.height,
    };
    scene.elements.push({
      id: "brand-surface",
      type: "rect",
      ...quietRegion,
      fill: theme.surface,
    });
    const densityMultiplier = {
      quiet: 0.7,
      balanced: 1,
      dense: 1.3,
    }[document.brand.visualDensity];
    const result = createProceduralBackground(procedural.style, {
      ...dimensions,
      seed: document.seed,
      palette: [
        document.brand.palette.primary,
        document.brand.palette.secondary,
        document.brand.palette.accent,
      ],
      backgroundColor,
      intensity: procedural.intensity,
      density: Math.min(1, procedural.density * densityMultiplier),
      complexity: procedural.complexity,
      contrast: procedural.contrast,
      quietRegion: procedural.quietRegion,
      mode: document.mode,
    });
    scene.elements.push(...result.elements);
    proceduralAlgorithmVersions[result.style] = result.version;
  }
  const safeArea = safeAreaBounds(dimensions, document.brand);
  return {
    scene,
    safeArea,
    backgroundColor,
    textColor: theme.text,
    mutedTextColor: theme.mutedText,
    accentColor: document.brand.palette.accent,
    spacingUnit: document.brand.spacingScale[0]!,
    qualityIssues: [],
    proceduralAlgorithmVersions,
    evidence: createRenderEvidence(safeArea),
  };
}

export type TextFitOptions = {
  preferredFontSize: number;
  minimumFontSize: number;
  maximumLines: number;
  weight: number;
  lineHeight?: number;
  family?: string;
  tracking?: number;
};

/** Fit text exactly as addText does, without adding it to the scene. */
export function measureText(
  context: TemplateRenderContext,
  layer: TextLayer,
  box: Bounds,
  options: TextFitOptions,
): { family: string; weight: number; lineHeight: number; fitted: FittedText } {
  const layout = layoutTemplateText(context, layer, box, options, "measure", "left");
  return {
    family: layout.face.family,
    weight: layout.face.weight,
    lineHeight: layout.lineHeight,
    fitted: layout.fitted!,
  };
}

function layoutTemplateText(
  context: TemplateRenderContext,
  layer: TextLayer,
  box: Bounds,
  options: TextFitOptions,
  detail: "measure" | "glyphs",
  align: "left" | "center" | "right",
): TextLayout {
  const family =
    layer.fontFamily ??
    options.family ??
    context.document.brand.typography.headlineFamily;
  const weight = layer.fontWeight ?? options.weight;
  return layoutText({
    text: layer.text,
    registry: context.fonts,
    face: { family, weight, style: "normal" },
    box,
    layerId: layer.id,
    sizing: {
      mode: "fit",
      preferredFontSize: layer.fontSize ?? options.preferredFontSize,
      minimumFontSize: options.minimumFontSize,
      maximumLines: Math.min(
        layer.maxLines ?? options.maximumLines,
        options.maximumLines,
      ),
      ...("keepTogether" in layer && layer.keepTogether !== undefined
        ? { keepTogether: keepTogetherPhrasesOf(layer.keepTogether) }
        : {}),
    },
    setting: {
      kind: "em",
      lineHeight: options.lineHeight ?? 1.08,
      ...(options.tracking === undefined ? {} : { letterSpacingEm: options.tracking }),
    },
    align,
    detail,
    renderedLineLimit: options.maximumLines,
    coverage: "rendered-lines",
  });
}

export function addText(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  layer: TextLayer,
  box: Bounds,
  options: {
    preferredFontSize: number;
    minimumFontSize: number;
    maximumLines: number;
    weight: number;
    color?: string;
    lineHeight?: number;
    align?: "left" | "center" | "right";
    family?: string;
    contrastBackgroundColor?: string;
    tracking?: number;
    checkContrast?: boolean;
  },
): TextElement {
  const align = layer.align ?? options.align ?? "left";
  const layout = layoutTemplateText(context, layer, box, options, "glyphs", align);
  const { family, weight } = layout.face;
  const fitted = layout.fitted!;
  const actualBounds = layout.bounds;
  const fill = layer.color ?? options.color ?? canvas.textColor;
  const lines = layout.lines.map((line) => line.text);
  if (layout.missingCodePoints.length > 0) {
    canvas.qualityIssues.push(
      missingGlyphIssue(
        layer.id,
        `Font "${family}" does not cover all text in layer "${layer.id}".`,
        layout.missingCodePoints,
      ),
    );
  }
  canvas.qualityIssues.push(...layout.issues);
  appendIssue(
    canvas.qualityIssues,
    safeAreaIssue(canvas.safeArea, actualBounds, layer.id),
  );
  if (options.checkContrast !== false) {
    appendIssue(
      canvas.qualityIssues,
      contrastIssue(
        fill,
        options.contrastBackgroundColor ?? canvas.backgroundColor,
        layer.id,
      ),
    );
  }
  const letterSpacing = layout.letterSpacing;
  const element: TextElement = {
    id: layer.id,
    type: "text",
    x: layout.anchor.x,
    y: layout.anchor.y,
    lines,
    fill,
    fontFamily: family,
    fontWeight: weight,
    fontStyle: "normal",
    fontSize: layout.fontSize,
    lineHeight: layout.lineHeight,
    align,
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    bounds: actualBounds,
    outlines: layout.lines.map((line) => line.set!.outline),
  };
  canvas.scene.elements.push(element);
  canvas.evidence.text.push({
    layerId: layer.id,
    bounds: { ...actualBounds },
    lineCount: lines.length,
    maximumLines: options.maximumLines,
    fontSize: layout.fontSize,
    overflow: fitted.issues.some((issue) => issue.code === "TEXT_OVERFLOW"),
  });
  return element;
}

export function addAsset(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  layer: Extract<DesignLayer, { type: "logo" | "image" | "product-screenshot" }>,
  box: Bounds,
): ImageElement {
  const asset = context.assets.get(layer.assetId);
  const element: ImageElement = {
    id: layer.id,
    type: "image",
    ...box,
    href: assetDataUri(asset),
    fit: layer.fit,
    ...(layer.type === "logo"
      ? { clipRadius: 0 }
      : {
          clipRadius:
            context.document.brand.borderRadii[1] ??
            context.document.brand.borderRadii[0]!,
        }),
  };
  if (layer.type === "logo" && layer.fit !== "contain") {
    canvas.qualityIssues.push({
      code: "LOGO_ASPECT_RATIO",
      severity: "error",
      message: "Logo layers must use contain fitting to preserve aspect ratio.",
      layerId: layer.id,
    });
  }
  canvas.scene.elements.push(element);
  return element;
}

export function addFocalImage(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  layer: Extract<DesignLayer, { type: "image" }>,
  box: Bounds,
): { element: ImageElement; crop: ReturnType<typeof calculateFocalCrop> } {
  const asset = context.assets.get(layer.assetId);
  const focalPoint =
    "focalPoint" in layer && layer.focalPoint !== undefined
      ? layer.focalPoint
      : { x: 0.5, y: 0.5 };
  const treatment =
    "treatment" in layer && layer.treatment !== undefined ? layer.treatment : "none";
  const crop = calculateFocalCrop({
    source: { width: asset.width, height: asset.height },
    destination: box,
    focalPoint,
  });
  const element: ImageElement = {
    id: layer.id,
    type: "image",
    ...crop.renderedBounds,
    href: assetDataUri(asset),
    fit: "contain",
    clipBounds: crop.destinationBounds,
    clipRadius: 0,
  };
  canvas.scene.elements.push(element);
  canvas.evidence.crops.push({
    layerId: layer.id,
    assetId: layer.assetId,
    treatment,
    focalPoint: { ...focalPoint },
    policyVersion: crop.policyVersion,
    destinationBounds: { ...crop.destinationBounds },
    sourceBounds: { ...crop.sourceBounds },
    renderedBounds: { ...crop.renderedBounds },
  });
  return { element, crop };
}

export function addQuietRegionIssue(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  primaryTextBounds: Bounds,
): void {
  const layer = findLayer(context.document.layers, "procedural-decoration");
  if (layer === undefined) return;
  const dimensions = canvas.scene.dimensions;
  const quiet = {
    x: layer.quietRegion.x * dimensions.width,
    y: layer.quietRegion.y * dimensions.height,
    width: layer.quietRegion.width * dimensions.width,
    height: layer.quietRegion.height * dimensions.height,
  };
  if (!isInside(quiet, primaryTextBounds)) {
    canvas.qualityIssues.push({
      code: "QUIET_REGION_MISALIGNED",
      severity: "warning",
      message: "The procedural quiet region does not fully cover primary text.",
      details: { quietRegion: quiet, primaryTextBounds },
    });
  }
}

export function findLayer<T extends DesignLayer["type"]>(
  layers: readonly DesignLayer[],
  type: T,
): Extract<DesignLayer, { type: T }> | undefined {
  return layers.find(
    (layer): layer is Extract<DesignLayer, { type: T }> =>
      layer.type === type && layer.visible,
  );
}

export function finishTemplate(canvas: TemplateCanvas): TemplateRenderResult {
  canvas.evidence.safeArea = { ...canvas.safeArea };
  return {
    scene: canvas.scene,
    qualityIssues: canvas.qualityIssues,
    proceduralAlgorithmVersions: canvas.proceduralAlgorithmVersions,
    evidence: canvas.evidence,
  };
}

export function addDecorativeBar(
  canvas: TemplateCanvas,
  bounds: Bounds,
  id: string,
): SceneElement {
  const element: SceneElement = {
    id,
    type: "rect",
    ...bounds,
    fill: canvas.accentColor,
    radius: Math.min(bounds.height / 2, canvas.spacingUnit),
  };
  canvas.scene.elements.push(element);
  return element;
}

export function bestContrastingColor(
  background: string,
  candidates: readonly [string, ...string[]],
): string {
  const [first, ...remaining] = candidates;
  return remaining.reduce(
    (best, candidate) =>
      contrastRatio(candidate, background) > contrastRatio(best, background)
        ? candidate
        : best,
    first,
  );
}

function appendIssue(issues: QualityIssue[], issue: QualityIssue | undefined): void {
  if (issue !== undefined) issues.push(issue);
}
