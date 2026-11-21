import type { Bounds } from "../domain/types.js";
import { pathDataBounds } from "../craft/geometry.js";
import { contrastRatio } from "../layout/index.js";
import {
  addQuietRegionIssue,
  addText,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
  measureText,
  type TemplateCanvas,
  type TextFitOptions,
  type TextLayer,
} from "./shared.js";
import { layoutText } from "../typography/layout-text.js";
import type { TemplateDefinition, TemplateRenderContext } from "./types.js";

/**
 * Editorial "fill the field" compositions (1.2.0). They respond to the amount
 * of copy instead of placing small text in a fixed panel: type is fitted to the
 * whole copy field, the content block is centered in it, and the accent is used
 * once, on the element that carries the idea.
 */

type CopyField = { bounds: Bounds; ground: string };

export const COMMON_FORMATS = [
  "linkedin-landscape",
  "instagram-square",
  "instagram-portrait",
  "instagram-story",
  "x-landscape",
  "youtube-thumbnail",
] as const;

/** The quiet panel when procedural decoration is declared, else the safe area. */
function copyField(canvas: TemplateCanvas, context: TemplateRenderContext): CopyField {
  const { document } = context;
  const { width, height } = canvas.scene.dimensions;
  const procedural = findLayer(document.layers, "procedural-decoration");
  const safe = canvas.safeArea;
  if (procedural === undefined)
    return { bounds: { ...safe }, ground: canvas.backgroundColor };
  const panel = {
    x: procedural.quietRegion.x * width,
    y: procedural.quietRegion.y * height,
    width: procedural.quietRegion.width * width,
    height: procedural.quietRegion.height * height,
  };
  const inset = Math.min(panel.width, panel.height) * 0.08;
  const x = Math.max(safe.x, panel.x + inset);
  const y = Math.max(safe.y, panel.y + inset);
  const right = Math.min(safe.x + safe.width, panel.x + panel.width - inset);
  const bottom = Math.min(safe.y + safe.height, panel.y + panel.height - inset);
  return {
    bounds: { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) },
    ground: document.brand.themes[document.mode].surface,
  };
}

/** Accent when it is legible as text on the ground, otherwise the text color. */
function signalColor(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  ground: string,
  minimum: number,
): string {
  for (const candidate of [
    canvas.accentColor,
    context.document.brand.palette.primary,
  ]) {
    if (contrastRatio(candidate, ground) >= minimum) return candidate;
  }
  return canvas.textColor;
}

export function unitFor(canvas: TemplateCanvas): number {
  return Math.min(
    canvas.scene.dimensions.width / 1080,
    canvas.scene.dimensions.height / 1080,
  );
}

/**
 * Display type should not end on an isolated word. Step the preferred size down
 * (to at most 80% of the first fit) until the fitted copy has no orphan line.
 */
function fitWithoutOrphan(
  context: TemplateRenderContext,
  layer: TextLayer,
  box: Bounds,
  options: TextFitOptions,
): { options: TextFitOptions; fitted: ReturnType<typeof measureText>["fitted"] } {
  let fitted = measureText(context, layer, box, options).fitted;
  const floor = Math.max(options.minimumFontSize, fitted.fontSize * 0.8);
  let current = options;
  let candidate = fitted;
  while (candidate.issues.some((issue) => issue.code === "ORPHAN_LINE")) {
    const next = candidate.fontSize - 1;
    if (next < floor) return { options, fitted };
    current = { ...options, preferredFontSize: next };
    candidate = measureText(context, layer, box, current).fitted;
  }
  fitted = candidate;
  return { options: current, fitted };
}

export function syntheticLayer(
  id: string,
  type: "headline" | "subtitle" | "footer",
  text: string,
) {
  return { id, type, visible: true, text } as TextLayer;
}

export const quoteCardTypographicTemplate: TemplateDefinition = {
  id: "quote-card",
  version: "1.2.0",
  requiredLayers: ["headline", "attribution"],
  supportedLayers: ["background", "procedural-decoration", "headline", "attribution"],
  supportedFormats: COMMON_FORMATS,
  constraints: {
    headlineMaximumLines: 6,
    safeAreaBehavior:
      "Quote, hanging mark, and attribution stay inside the copy field and the brand safe area.",
    layout:
      "Typographic quote: the quotation is fitted to fill its field under a hanging accent quotation mark, with a tracked attribution; the block is centered in the field.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    const unit = unitFor(canvas);
    const field = copyField(canvas, context);
    const inner = field.bounds;
    const quote = findLayer(context.document.layers, "headline")!;
    const attribution = findLayer(context.document.layers, "attribution")!;

    const markBand = Math.min(inner.height * 0.16, 190 * unit);
    const attributionOptions: TextFitOptions = {
      preferredFontSize: 34 * unit,
      minimumFontSize: 16,
      maximumLines: 2,
      weight: 600,
      family: context.document.brand.typography.bodyFamily,
      lineHeight: 1.2,
      tracking: 0.06,
    };
    const attributionBox = {
      x: inner.x,
      y: inner.y,
      width: inner.width,
      height: 90 * unit,
    };
    const attributionFit = measureText(
      context,
      attribution,
      attributionBox,
      attributionOptions,
    ).fitted;
    const gap = Math.max(36 * unit, inner.height * 0.04);
    const quoteBox = {
      x: inner.x,
      y: inner.y + markBand,
      width: inner.width,
      height: Math.max(1, inner.height - markBand - gap - attributionFit.height),
    };
    const quoteOptions: TextFitOptions = {
      preferredFontSize: 168 * unit,
      minimumFontSize: 30,
      maximumLines: 6,
      weight: 700,
      lineHeight: 1.06,
      tracking: -0.015,
    };
    const { options: fittedQuoteOptions, fitted: quoteFit } = fitWithoutOrphan(
      context,
      quote,
      quoteBox,
      quoteOptions,
    );
    const blockHeight = markBand + quoteFit.height + gap + attributionFit.height;
    const offset = Math.max(0, (inner.height - blockHeight) / 2);
    const top = inner.y + offset;

    const mark = signalColor(canvas, context, field.ground, 3);
    const markHeight = Math.min(markBand * 0.72, quoteFit.fontSize * 0.62);
    addHangingQuoteMark(canvas, context, {
      id: `${quote.id}-mark`,
      x: inner.x,
      bottom: top + markBand - Math.min(markBand * 0.18, quoteFit.fontSize * 0.2),
      inkHeight: markHeight,
      color: mark,
    });
    const quoteElement = addText(
      canvas,
      context,
      quote,
      { ...quoteBox, y: top + markBand },
      { ...fittedQuoteOptions, contrastBackgroundColor: field.ground },
    );
    addQuietRegionIssue(canvas, context, quoteElement.bounds);
    addText(
      canvas,
      context,
      attribution,
      {
        ...attributionBox,
        y: quoteElement.bounds.y + quoteElement.bounds.height + gap,
      },
      {
        ...attributionOptions,
        color: canvas.mutedTextColor,
        contrastBackgroundColor: field.ground,
      },
    );
    return finishTemplate(canvas);
  },
};

export function addHangingQuoteMark(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  input: { id: string; x: number; bottom: number; inkHeight: number; color: string },
): void {
  const family = context.document.brand.typography.headlineFamily;
  const outline = (fontSize: number, x: number, y: number): string =>
    layoutText({
      text: "“",
      registry: context.fonts,
      face: { family, weight: 700, style: "normal" },
      box: { x, y, width: 0, height: 0 },
      layerId: input.id,
      sizing: { mode: "fixed", fontSize },
      setting: { kind: "absolute", lineHeight: 1 },
      align: "left",
      detail: "glyphs",
    }).lines[0]!.set!.outline;
  const probe = pathDataBounds(outline(100, 0, 0));
  if (probe === null || probe.height <= 0) return;
  const fontSize = (100 * input.inkHeight) / probe.height;
  const scaled = pathDataBounds(outline(fontSize, 0, 0))!;
  canvas.scene.elements.push({
    id: input.id,
    type: "path",
    data: outline(
      fontSize,
      input.x - scaled.x,
      input.bottom - scaled.height - scaled.y,
    ),
    fill: input.color,
  });
}

export const statisticCardHeroTemplate: TemplateDefinition = {
  id: "statistic-card",
  version: "1.2.0",
  requiredLayers: ["statistic"],
  supportedLayers: ["background", "procedural-decoration", "headline", "statistic"],
  supportedFormats: COMMON_FORMATS,
  constraints: {
    headlineMaximumLines: 2,
    safeAreaBehavior:
      "Headline, value, label, and trend stay inside the copy field and the brand safe area.",
    layout:
      "Hero statistic: the value is fitted to fill the field between the headline and its label; only the value carries the accent.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    const unit = unitFor(canvas);
    const field = copyField(canvas, context);
    const inner = field.bounds;
    const headline = findLayer(context.document.layers, "headline");
    const statistic = findLayer(context.document.layers, "statistic")!;
    const gap = Math.max(28 * unit, inner.height * 0.035);

    let cursor = inner.y;
    if (headline !== undefined) {
      const headlineBox = {
        x: inner.x,
        y: cursor,
        width: inner.width,
        height: inner.height * 0.24,
      };
      const { options: headlineOptions } = fitWithoutOrphan(
        context,
        headline,
        headlineBox,
        {
          preferredFontSize: 64 * unit,
          minimumFontSize: 24,
          maximumLines: 2,
          weight: 700,
          lineHeight: 1.08,
          tracking: -0.01,
        },
      );
      const headlineElement = addText(canvas, context, headline, headlineBox, {
        ...headlineOptions,
        contrastBackgroundColor: field.ground,
      });
      cursor = headlineElement.bounds.y + headlineElement.bounds.height + gap * 1.5;
    }

    let bottom = inner.y + inner.height;
    if (statistic.trend !== undefined) {
      const trendLayer = syntheticLayer(
        `${statistic.id}-trend`,
        "footer",
        statistic.trend,
      );
      const trendOptions: TextFitOptions = {
        preferredFontSize: 36 * unit,
        minimumFontSize: 16,
        maximumLines: 1,
        weight: 600,
        family:
          context.document.brand.typography.monospaceFamily ??
          context.document.brand.typography.bodyFamily,
        lineHeight: 1,
        tracking: 0.06,
      };
      const trendBox = {
        x: inner.x,
        y: inner.y,
        width: inner.width,
        height: 60 * unit,
      };
      const trendFit = measureText(context, trendLayer, trendBox, trendOptions).fitted;
      bottom -= trendFit.height;
      addText(
        canvas,
        context,
        trendLayer,
        { ...trendBox, y: bottom },
        {
          ...trendOptions,
          color: canvas.mutedTextColor,
          contrastBackgroundColor: field.ground,
        },
      );
      bottom -= gap;
    }

    const labelLayer = syntheticLayer(
      `${statistic.id}-label`,
      "subtitle",
      statistic.label,
    );
    const labelOptions: TextFitOptions = {
      preferredFontSize: 54 * unit,
      minimumFontSize: 19,
      maximumLines: 2,
      weight: 500,
      family: context.document.brand.typography.bodyFamily,
      lineHeight: 1.15,
    };
    const labelBox = {
      x: inner.x,
      y: cursor,
      width: inner.width,
      height: inner.height * 0.2,
    };
    const labelFit = measureText(context, labelLayer, labelBox, labelOptions).fitted;

    const valueLayer = syntheticLayer(
      `${statistic.id}-value`,
      "headline",
      statistic.value,
    );
    const valueBox = {
      x: inner.x,
      y: cursor,
      width: inner.width,
      height: Math.max(1, bottom - cursor - gap - labelFit.height),
    };
    const value = addText(canvas, context, valueLayer, valueBox, {
      preferredFontSize: 720 * unit,
      minimumFontSize: 56,
      maximumLines: 1,
      weight: 800,
      lineHeight: 0.92,
      tracking: -0.04,
      color: signalColor(canvas, context, field.ground, 4.5),
      contrastBackgroundColor: field.ground,
    });
    addQuietRegionIssue(canvas, context, value.bounds);
    addText(
      canvas,
      context,
      labelLayer,
      { ...labelBox, y: value.bounds.y + value.bounds.height + gap },
      { ...labelOptions, contrastBackgroundColor: field.ground },
    );
    return finishTemplate(canvas);
  },
};
