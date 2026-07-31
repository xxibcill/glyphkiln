import { assetDataUri } from "../assets/index.js";
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
import { fitText } from "../typography/index.js";
import type {
  ImageElement,
  Scene,
  SceneElement,
  TextElement,
} from "../renderer/scene.js";
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
};

export function createTemplateCanvas(context: TemplateRenderContext): TemplateCanvas {
  const { document } = context;
  const dimensions = getFormatDimensions(document.format);
  const theme = document.brand.themes[document.mode];
  const backgroundLayer = findLayer(document.layers, "background");
  const backgroundColor = backgroundLayer?.color ?? theme.background;
  const scene: Scene = {
    dimensions,
    title: `${document.template.id} graphic`,
    description: "A deterministic graphic rendered by Glyphkiln Core.",
    backgroundColor,
    elements: [],
  };
  const proceduralAlgorithmVersions: Record<string, string> = {};
  const procedural = findLayer(document.layers, "procedural-decoration");
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
  return {
    scene,
    safeArea: safeAreaBounds(dimensions, document.brand),
    backgroundColor,
    textColor: theme.text,
    mutedTextColor: theme.mutedText,
    accentColor: document.brand.palette.accent,
    spacingUnit: document.brand.spacingScale[0]!,
    qualityIssues: [],
    proceduralAlgorithmVersions,
  };
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
  },
): TextElement {
  const family =
    layer.fontFamily ??
    options.family ??
    context.document.brand.typography.headlineFamily;
  const weight = layer.fontWeight ?? options.weight;
  const align = layer.align ?? options.align ?? "left";
  const fitted = fitText({
    text: layer.text,
    registry: context.fonts,
    style: {
      family,
      weight,
      style: "normal",
      lineHeight: options.lineHeight ?? 1.08,
    },
    box,
    preferredFontSize: layer.fontSize ?? options.preferredFontSize,
    minimumFontSize: options.minimumFontSize,
    maximumLines: Math.min(
      layer.maxLines ?? options.maximumLines,
      options.maximumLines,
    ),
    layerId: layer.id,
    ...("keepTogether" in layer && layer.keepTogether !== undefined
      ? { keepTogether: layer.keepTogether }
      : {}),
  });
  const x =
    align === "center"
      ? box.x + box.width / 2
      : align === "right"
        ? box.x + box.width
        : box.x;
  const actualBounds = {
    ...fitted.bounds,
    x:
      align === "center"
        ? box.x + (box.width - fitted.width) / 2
        : align === "right"
          ? box.x + box.width - fitted.width
          : box.x,
  };
  const fill = layer.color ?? options.color ?? canvas.textColor;
  const lines = fitted.lines.slice(0, options.maximumLines);
  const missingCodePoints = context.fonts.missingCodePoints(
    lines.join(""),
    family,
    weight,
    "normal",
  );
  if (missingCodePoints.length > 0) {
    canvas.qualityIssues.push({
      code: "MISSING_GLYPH",
      severity: "error",
      message: `Font "${family}" does not cover all text in layer "${layer.id}".`,
      layerId: layer.id,
      details: {
        codePoints: missingCodePoints.map(
          (codePoint) => `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
        ),
      },
    });
  }
  canvas.qualityIssues.push(...fitted.issues);
  appendIssue(
    canvas.qualityIssues,
    safeAreaIssue(canvas.safeArea, actualBounds, layer.id),
  );
  appendIssue(
    canvas.qualityIssues,
    contrastIssue(
      fill,
      options.contrastBackgroundColor ?? canvas.backgroundColor,
      layer.id,
    ),
  );
  const element: TextElement = {
    id: layer.id,
    type: "text",
    x,
    y: box.y,
    lines,
    fill,
    fontFamily: family,
    fontWeight: weight,
    fontStyle: "normal",
    fontSize: fitted.fontSize,
    lineHeight: options.lineHeight ?? 1.08,
    align,
    bounds: actualBounds,
    outlines: context.fonts.outlineText({
      lines,
      family,
      weight,
      style: "normal",
      fontSize: fitted.fontSize,
      lineHeight: options.lineHeight ?? 1.08,
      x,
      y: box.y,
      align,
    }),
  };
  canvas.scene.elements.push(element);
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
  return {
    scene: canvas.scene,
    qualityIssues: canvas.qualityIssues,
    proceduralAlgorithmVersions: canvas.proceduralAlgorithmVersions,
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
