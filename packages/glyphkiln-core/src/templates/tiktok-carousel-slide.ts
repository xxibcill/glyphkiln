import {
  addQuietRegionIssue,
  addText,
  bestContrastingColor,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
} from "./shared.js";
import type { TemplateCanvas } from "./shared.js";
import type { TemplateRenderContext } from "./types.js";
import type { TemplateDefinition } from "./types.js";

const TIKTOK_CAROUSEL_SAFE_AREA_MINIMUM = {
  top: 0.07,
  right: 0.16,
  bottom: 0.18,
  left: 0.07,
} as const;

export const tiktokCarouselSlideTemplate: TemplateDefinition = {
  id: "tiktok-carousel-slide",
  version: "1.0.2",
  requiredLayers: ["badge", "headline"],
  supportedLayers: [
    "background",
    "procedural-decoration",
    "badge",
    "eyebrow",
    "headline",
    "subtitle",
    "statistic",
    "cta",
    "footer",
  ],
  mutuallyExclusiveLayers: [["subtitle", "statistic"]],
  supportedFormats: ["tiktok-carousel"],
  constraints: {
    headlineMaximumLines: 4,
    safeAreaBehavior:
      "Copy, numbering, and actions honor the configured safe area plus conservative template minimums for TikTok's top, right, caption, and bottom interface regions.",
    layout:
      "A typography-first 9:16 sequence slide with a numbered header, oversized hook, one supporting benefit or metric, and an optional late swipe or action cue; no generated illustration or SVG asset.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    canvas.scene.title = "TikTok carousel slide";
    canvas.scene.description =
      "A deterministic, typography-first vertical carousel slide with an editorial composition.";

    canvas.safeArea = tiktokCarouselSafeArea(canvas);
    const safe = canvas.safeArea;
    const unit = canvas.scene.dimensions.height / 1920;
    const surfaceColor = context.document.brand.themes[context.document.mode].surface;
    const eyebrow = findLayer(context.document.layers, "eyebrow");
    const badge = findLayer(context.document.layers, "badge");
    const headline = findLayer(context.document.layers, "headline")!;
    const subtitle = findLayer(context.document.layers, "subtitle");
    const statistic = findLayer(context.document.layers, "statistic");
    const cta = findLayer(context.document.layers, "cta");
    const footer = findLayer(context.document.layers, "footer");

    const copyX = safe.x + 50 * unit;
    const copyWidth = Math.max(
      180 * unit,
      Math.min(safe.width - 96 * unit, 740 * unit),
    );
    const fieldX = safe.x + 18 * unit;
    const fieldY = safe.y + 112 * unit;
    const fieldWidth = Math.max(220 * unit, safe.width - 36 * unit);
    const fieldHeight = 900 * unit;

    addTypographyFrame(canvas, {
      safe,
      copyX,
      fieldX,
      fieldY,
      fieldWidth,
      fieldHeight,
      surfaceColor,
      unit,
    });

    if (eyebrow !== undefined) {
      addText(
        canvas,
        context,
        eyebrow,
        {
          x: copyX,
          y: safe.y + 18 * unit,
          width: Math.max(80 * unit, copyWidth - 200 * unit),
          height: 40 * unit,
        },
        {
          preferredFontSize: 32 * unit,
          minimumFontSize: 22,
          maximumLines: 1,
          weight: 700,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.textColor,
          lineHeight: 1,
        },
      );
    }

    if (badge !== undefined) {
      addSlideBadge(canvas, context, badge, safe, unit);
    }

    const headlineElement = addText(
      canvas,
      context,
      headline,
      {
        x: copyX,
        y: fieldY + 68 * unit,
        width: copyWidth,
        height: 520 * unit,
      },
      {
        preferredFontSize: 108 * unit,
        minimumFontSize: 52,
        maximumLines: 4,
        weight: 800,
        color: canvas.textColor,
        contrastBackgroundColor: surfaceColor,
        lineHeight: 0.94,
      },
    );
    addQuietRegionIssue(canvas, context, headlineElement.bounds);

    const supportingY =
      headlineElement.bounds.y + headlineElement.bounds.height + 42 * unit;
    if (subtitle !== undefined) {
      addText(
        canvas,
        context,
        subtitle,
        {
          x: copyX,
          y: supportingY,
          width: copyWidth * 0.92,
          height: 230 * unit,
        },
        {
          preferredFontSize: 42 * unit,
          minimumFontSize: 26,
          maximumLines: 4,
          weight: 500,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.mutedTextColor,
          contrastBackgroundColor: surfaceColor,
          lineHeight: 1.18,
        },
      );
    } else if (statistic !== undefined) {
      addStatistic(canvas, context, statistic, {
        x: copyX,
        y: supportingY,
        width: copyWidth,
        height: fieldY + fieldHeight - supportingY - 54 * unit,
        surfaceColor,
        unit,
      });
    }

    if (cta !== undefined) {
      addCallToAction(canvas, context, cta, {
        x: copyX,
        y: Math.max(fieldY + fieldHeight + 72 * unit, safe.y + safe.height * 0.74),
        width: copyWidth,
        height: 86 * unit,
        unit,
      });
    }

    if (footer !== undefined) {
      addText(
        canvas,
        context,
        footer,
        {
          x: copyX,
          y: safe.y + safe.height * 0.88,
          width: copyWidth,
          height: 42 * unit,
        },
        {
          preferredFontSize: 30 * unit,
          minimumFontSize: 20,
          maximumLines: 1,
          weight: 600,
          family:
            context.document.brand.typography.monospaceFamily ??
            context.document.brand.typography.bodyFamily,
          color: canvas.mutedTextColor,
          lineHeight: 1,
        },
      );
    }

    return finishTemplate(canvas);
  },
};

type TypographyFrame = {
  safe: TemplateCanvas["safeArea"];
  copyX: number;
  fieldX: number;
  fieldY: number;
  fieldWidth: number;
  fieldHeight: number;
  surfaceColor: string;
  unit: number;
};

function addTypographyFrame(canvas: TemplateCanvas, frame: TypographyFrame): void {
  const { safe, copyX, fieldX, fieldY, fieldWidth, fieldHeight, surfaceColor, unit } =
    frame;

  canvas.scene.elements.push(
    {
      id: "carousel-story-spine",
      type: "rect",
      x: safe.x,
      y: safe.y,
      width: 8 * unit,
      height: safe.height * 0.9,
      fill: canvas.accentColor,
    },
    {
      id: "carousel-header-rule",
      type: "rect",
      x: copyX,
      y: safe.y + 66 * unit,
      width: safe.x + safe.width - copyX,
      height: 2 * unit,
      fill: canvas.textColor,
    },
    {
      id: "carousel-type-field",
      type: "rect",
      x: fieldX,
      y: fieldY,
      width: fieldWidth,
      height: fieldHeight,
      fill: surfaceColor,
    },
    {
      id: "carousel-type-field-accent",
      type: "rect",
      x: fieldX,
      y: fieldY,
      width: 16 * unit,
      height: 120 * unit,
      fill: canvas.accentColor,
    },
    {
      id: "carousel-field-index",
      type: "rect",
      x: fieldX + fieldWidth - 38 * unit,
      y: fieldY,
      width: 38 * unit,
      height: 38 * unit,
      fill: canvas.accentColor,
    },
    {
      id: "carousel-field-rule",
      type: "rect",
      x: fieldX,
      y: fieldY + fieldHeight,
      width: fieldWidth,
      height: 3 * unit,
      fill: canvas.textColor,
    },
  );
}

function addSlideBadge(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  badge: Extract<
    TemplateRenderContext["document"]["layers"][number],
    { type: "badge" }
  >,
  safe: TemplateCanvas["safeArea"],
  unit: number,
): void {
  const width = 168 * unit;
  const height = 58 * unit;
  const x = safe.x + safe.width - width;
  const y = safe.y;
  const fill = badge.color ?? canvas.accentColor;

  canvas.scene.elements.push({
    id: `${badge.id}-background`,
    type: "rect",
    x,
    y,
    width,
    height,
    fill,
  });
  addText(
    canvas,
    context,
    {
      id: badge.id,
      type: "eyebrow",
      text: badge.text,
      visible: true,
    },
    {
      x: x + 18 * unit,
      y: y + 16 * unit,
      width: width - 36 * unit,
      height: 30 * unit,
    },
    {
      preferredFontSize: 30 * unit,
      minimumFontSize: 20,
      maximumLines: 1,
      weight: 700,
      family:
        context.document.brand.typography.monospaceFamily ??
        context.document.brand.typography.bodyFamily,
      color: bestContrastingColor(fill, [canvas.textColor, canvas.backgroundColor]),
      contrastBackgroundColor: fill,
      lineHeight: 1,
      align: "center",
    },
  );
}

function tiktokCarouselSafeArea(canvas: TemplateCanvas): TemplateCanvas["safeArea"] {
  const requested = canvas.safeArea;
  const { width, height } = canvas.scene.dimensions;
  const x = Math.max(requested.x, width * TIKTOK_CAROUSEL_SAFE_AREA_MINIMUM.left);
  const y = Math.max(requested.y, height * TIKTOK_CAROUSEL_SAFE_AREA_MINIMUM.top);
  const right = Math.min(
    requested.x + requested.width,
    width * (1 - TIKTOK_CAROUSEL_SAFE_AREA_MINIMUM.right),
  );
  const bottom = Math.min(
    requested.y + requested.height,
    height * (1 - TIKTOK_CAROUSEL_SAFE_AREA_MINIMUM.bottom),
  );

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

function addStatistic(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  statistic: Extract<
    TemplateRenderContext["document"]["layers"][number],
    { type: "statistic" }
  >,
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
    surfaceColor: string;
    unit: number;
  },
): void {
  const value = addText(
    canvas,
    context,
    {
      id: `${statistic.id}-value`,
      type: "headline",
      text: statistic.value,
      visible: true,
    },
    {
      x: box.x,
      y: box.y,
      width: box.width,
      height: Math.min(box.height * 0.48, 210 * box.unit),
    },
    {
      preferredFontSize: 184 * box.unit,
      minimumFontSize: 72,
      maximumLines: 1,
      weight: 800,
      color: canvas.accentColor,
      contrastBackgroundColor: box.surfaceColor,
      lineHeight: 0.92,
    },
  );

  addText(
    canvas,
    context,
    {
      id: `${statistic.id}-label`,
      type: "subtitle",
      text: statistic.label,
      visible: true,
    },
    {
      x: box.x,
      y: value.bounds.y + value.bounds.height + 26 * box.unit,
      width: box.width * 0.94,
      height: 145 * box.unit,
    },
    {
      preferredFontSize: 38 * box.unit,
      minimumFontSize: 24,
      maximumLines: 3,
      weight: 500,
      family: context.document.brand.typography.bodyFamily,
      color: canvas.textColor,
      contrastBackgroundColor: box.surfaceColor,
      lineHeight: 1.16,
    },
  );

  if (statistic.trend !== undefined) {
    addText(
      canvas,
      context,
      {
        id: `${statistic.id}-trend`,
        type: "footer",
        text: statistic.trend,
        visible: true,
      },
      {
        x: box.x,
        y: box.y + box.height - 30 * box.unit,
        width: box.width,
        height: 28 * box.unit,
      },
      {
        preferredFontSize: 28 * box.unit,
        minimumFontSize: 19,
        maximumLines: 1,
        weight: 700,
        family:
          context.document.brand.typography.monospaceFamily ??
          context.document.brand.typography.bodyFamily,
        color: canvas.mutedTextColor,
        contrastBackgroundColor: box.surfaceColor,
        lineHeight: 1,
      },
    );
  }
}

function addCallToAction(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  cta: Extract<TemplateRenderContext["document"]["layers"][number], { type: "cta" }>,
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
    unit: number;
  },
): void {
  canvas.scene.elements.push(
    {
      id: `${cta.id}-rule`,
      type: "rect",
      x: box.x,
      y: box.y,
      width: box.width,
      height: 3 * box.unit,
      fill: canvas.textColor,
    },
    {
      id: `${cta.id}-marker`,
      type: "rect",
      x: box.x,
      y: box.y + 20 * box.unit,
      width: 12 * box.unit,
      height: 48 * box.unit,
      fill: canvas.accentColor,
    },
  );
  addText(
    canvas,
    context,
    cta,
    {
      x: box.x + 34 * box.unit,
      y: box.y + 24 * box.unit,
      width: box.width - 34 * box.unit,
      height: 40 * box.unit,
    },
    {
      preferredFontSize: 36 * box.unit,
      minimumFontSize: 24,
      maximumLines: 1,
      weight: 700,
      family:
        context.document.brand.typography.monospaceFamily ??
        context.document.brand.typography.bodyFamily,
      color: canvas.textColor,
      contrastBackgroundColor: canvas.backgroundColor,
      lineHeight: 1,
    },
  );
}
