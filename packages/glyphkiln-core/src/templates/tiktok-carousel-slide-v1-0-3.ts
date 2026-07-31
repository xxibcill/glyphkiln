import {
  addQuietRegionIssue,
  addText,
  bestContrastingColor,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
} from "./shared.js";
import type { TemplateCanvas } from "./shared.js";
import type { TemplateDefinition, TemplateRenderContext } from "./types.js";

const TIKTOK_PHOTO_SAFE_AREA_MINIMUM = {
  top: 0.06,
  right: 0.14,
  bottom: 0.08,
  left: 0.06,
} as const;

const PHOTO_LAYOUT = {
  fieldTopInset: 84,
  preferredFieldHeight: 720,
  minimumFieldHeight: 480,
  fieldToCtaGap: 52,
  ctaHeight: 70,
  ctaToFooterGap: 32,
  preferredFooterPosition: 0.91,
  footerHeight: 36,
} as const;

export const tiktokCarouselSlideV1_0_3Template: TemplateDefinition = {
  id: "tiktok-carousel-slide",
  version: "1.0.3",
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
  supportedFormats: ["tiktok-photo-carousel"],
  constraints: {
    headlineMaximumLines: 4,
    safeAreaBehavior:
      "Organic photo-carousel copy uses a compact 3:4 canvas with conservative top, right-side action, and bottom insets without reserving the oversized 9:16 caption region.",
    layout:
      "A typography-first 3:4 TikTok photo slide with a numbered header, oversized hook, one supporting benefit or metric, and an optional swipe or action cue; no generated illustration or SVG asset.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    canvas.scene.title = "TikTok photo carousel slide";
    canvas.scene.description =
      "A deterministic, typography-first 3:4 photo carousel slide with a balanced editorial composition.";

    canvas.safeArea = tiktokPhotoSafeArea(canvas);
    const safe = canvas.safeArea;
    const unit = canvas.scene.dimensions.height / 1440;
    const surfaceColor = context.document.brand.themes[context.document.mode].surface;
    const eyebrow = findLayer(context.document.layers, "eyebrow");
    const badge = findLayer(context.document.layers, "badge");
    const headline = findLayer(context.document.layers, "headline")!;
    const subtitle = findLayer(context.document.layers, "subtitle");
    const statistic = findLayer(context.document.layers, "statistic");
    const cta = findLayer(context.document.layers, "cta");
    const footer = findLayer(context.document.layers, "footer");

    const copyX = safe.x + 44 * unit;
    const copyWidth = Math.max(
      180 * unit,
      Math.min(safe.width - 84 * unit, 768 * unit),
    );
    const fieldX = safe.x + 16 * unit;
    const verticalLayout = tiktokPhotoVerticalLayout(safe, unit);
    const fieldY = verticalLayout.fieldY;
    const fieldWidth = Math.max(220 * unit, safe.width - 32 * unit);
    const fieldHeight = verticalLayout.fieldHeight;

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
          y: safe.y + 14 * unit,
          width: Math.max(80 * unit, copyWidth - 190 * unit),
          height: 34 * unit,
        },
        {
          preferredFontSize: 26 * unit,
          minimumFontSize: 18,
          maximumLines: 1,
          weight: 700,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.textColor,
          lineHeight: 1,
        },
      );
    }

    if (badge !== undefined) addSlideBadge(canvas, context, badge, safe, unit);

    const headlineElement = addText(
      canvas,
      context,
      headline,
      {
        x: copyX,
        y: fieldY + 52 * unit,
        width: copyWidth,
        height: Math.min(400 * unit, fieldHeight * 0.58),
      },
      {
        preferredFontSize: 88 * unit,
        minimumFontSize: 44,
        maximumLines: 4,
        weight: 800,
        color: canvas.textColor,
        contrastBackgroundColor: surfaceColor,
        lineHeight: 0.95,
      },
    );
    addQuietRegionIssue(canvas, context, headlineElement.bounds);

    const supportingY =
      headlineElement.bounds.y + headlineElement.bounds.height + 30 * unit;
    if (subtitle !== undefined) {
      addText(
        canvas,
        context,
        subtitle,
        {
          x: copyX,
          y: supportingY,
          width: copyWidth * 0.94,
          height: Math.max(90 * unit, fieldY + fieldHeight - supportingY - 44 * unit),
        },
        {
          preferredFontSize: 34 * unit,
          minimumFontSize: 23,
          maximumLines: 4,
          weight: 500,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.mutedTextColor,
          contrastBackgroundColor: surfaceColor,
          lineHeight: 1.17,
        },
      );
    } else if (statistic !== undefined) {
      addStatistic(canvas, context, statistic, {
        x: copyX,
        y: supportingY,
        width: copyWidth,
        height: fieldY + fieldHeight - supportingY - 38 * unit,
        surfaceColor,
        unit,
      });
    }

    if (cta !== undefined) {
      addCallToAction(canvas, context, cta, {
        x: copyX,
        y: verticalLayout.ctaY,
        width: copyWidth,
        height: PHOTO_LAYOUT.ctaHeight * unit,
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
          y: verticalLayout.footerY,
          width: copyWidth,
          height: PHOTO_LAYOUT.footerHeight * unit,
        },
        {
          preferredFontSize: 25 * unit,
          minimumFontSize: 18,
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

function tiktokPhotoVerticalLayout(
  safe: TemplateCanvas["safeArea"],
  unit: number,
): { fieldY: number; fieldHeight: number; ctaY: number; footerY: number } {
  const fieldY = safe.y + PHOTO_LAYOUT.fieldTopInset * unit;
  const preferredFooterY = safe.y + safe.height * PHOTO_LAYOUT.preferredFooterPosition;
  const reservedAfterField =
    (PHOTO_LAYOUT.fieldToCtaGap +
      PHOTO_LAYOUT.ctaHeight +
      PHOTO_LAYOUT.ctaToFooterGap) *
    unit;
  const availableFieldHeight = preferredFooterY - fieldY - reservedAfterField;
  const fieldHeight = Math.max(
    PHOTO_LAYOUT.minimumFieldHeight * unit,
    Math.min(PHOTO_LAYOUT.preferredFieldHeight * unit, availableFieldHeight),
  );
  const ctaY = fieldY + fieldHeight + PHOTO_LAYOUT.fieldToCtaGap * unit;
  const footerY = Math.max(
    preferredFooterY,
    ctaY + (PHOTO_LAYOUT.ctaHeight + PHOTO_LAYOUT.ctaToFooterGap) * unit,
  );
  return { fieldY, fieldHeight, ctaY, footerY };
}

function addTypographyFrame(canvas: TemplateCanvas, frame: TypographyFrame): void {
  const { safe, copyX, fieldX, fieldY, fieldWidth, fieldHeight, surfaceColor, unit } =
    frame;
  canvas.scene.elements.push(
    {
      id: "carousel-story-spine",
      type: "rect",
      x: safe.x,
      y: safe.y,
      width: 7 * unit,
      height: safe.height * 0.94,
      fill: canvas.accentColor,
    },
    {
      id: "carousel-header-rule",
      type: "rect",
      x: copyX,
      y: safe.y + 56 * unit,
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
      width: 14 * unit,
      height: 104 * unit,
      fill: canvas.accentColor,
    },
    {
      id: "carousel-field-index",
      type: "rect",
      x: fieldX + fieldWidth - 34 * unit,
      y: fieldY,
      width: 34 * unit,
      height: 34 * unit,
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
  const width = 154 * unit;
  const height = 50 * unit;
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
    { id: badge.id, type: "eyebrow", text: badge.text, visible: true },
    {
      x: x + 16 * unit,
      y: y + 13 * unit,
      width: width - 32 * unit,
      height: 26 * unit,
    },
    {
      preferredFontSize: 25 * unit,
      minimumFontSize: 18,
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
    { x: box.x, y: box.y, width: box.width, height: Math.min(box.height * 0.48, 150) },
    {
      preferredFontSize: 138 * box.unit,
      minimumFontSize: 64,
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
      y: value.bounds.y + value.bounds.height + 18 * box.unit,
      width: box.width * 0.94,
      height: 105 * box.unit,
    },
    {
      preferredFontSize: 30 * box.unit,
      minimumFontSize: 21,
      maximumLines: 3,
      weight: 500,
      family: context.document.brand.typography.bodyFamily,
      color: canvas.textColor,
      contrastBackgroundColor: box.surfaceColor,
      lineHeight: 1.15,
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
        y: box.y + box.height - 24 * box.unit,
        width: box.width,
        height: 24 * box.unit,
      },
      {
        preferredFontSize: 22 * box.unit,
        minimumFontSize: 17,
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
  box: { x: number; y: number; width: number; height: number; unit: number },
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
      y: box.y + 16 * box.unit,
      width: 11 * box.unit,
      height: 40 * box.unit,
      fill: canvas.accentColor,
    },
  );
  addText(
    canvas,
    context,
    cta,
    {
      x: box.x + 30 * box.unit,
      y: box.y + 19 * box.unit,
      width: box.width - 30 * box.unit,
      height: 34 * box.unit,
    },
    {
      preferredFontSize: 30 * box.unit,
      minimumFontSize: 21,
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

function tiktokPhotoSafeArea(canvas: TemplateCanvas): TemplateCanvas["safeArea"] {
  const requested = canvas.safeArea;
  const { width, height } = canvas.scene.dimensions;
  const x = Math.max(requested.x, width * TIKTOK_PHOTO_SAFE_AREA_MINIMUM.left);
  const y = Math.max(requested.y, height * TIKTOK_PHOTO_SAFE_AREA_MINIMUM.top);
  const right = Math.min(
    requested.x + requested.width,
    width * (1 - TIKTOK_PHOTO_SAFE_AREA_MINIMUM.right),
  );
  const bottom = Math.min(
    requested.y + requested.height,
    height * (1 - TIKTOK_PHOTO_SAFE_AREA_MINIMUM.bottom),
  );
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}
