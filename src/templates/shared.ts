import { assetDataUri } from "../assets/index.js";
import { createProceduralBackground } from "../backgrounds/index.js";
import type { Bounds, QualityIssue } from "../domain/types.js";
import { getFormatDimensions } from "../formats/index.js";
import {
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
      density: procedural.density,
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
  canvas.qualityIssues.push(...fitted.issues);
  appendIssue(
    canvas.qualityIssues,
    safeAreaIssue(canvas.safeArea, actualBounds, layer.id),
  );
  appendIssue(
    canvas.qualityIssues,
    contrastIssue(fill, canvas.backgroundColor, layer.id),
  );
  const element: TextElement = {
    id: layer.id,
    type: "text",
    x,
    y: box.y,
    lines: fitted.lines.slice(0, options.maximumLines),
    fill,
    fontFamily: family,
    fontWeight: weight,
    fontStyle: "normal",
    fontSize: fitted.fontSize,
    lineHeight: options.lineHeight ?? 1.08,
    align,
    bounds: actualBounds,
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
    radius: bounds.height / 2,
  };
  canvas.scene.elements.push(element);
  return element;
}

function appendIssue(issues: QualityIssue[], issue: QualityIssue | undefined): void {
  if (issue !== undefined) issues.push(issue);
}
