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

export const TIKTOK_ORGANIC_HEADLINE_LINE_HEIGHT_MINIMUM = 1.08;

const PHOTO_LAYOUT = {
  fieldTopWithHeader: 84,
  fieldTopWithoutHeader: 70,
  fieldHeightPoster: 510,
  fieldHeightEditorial: 600,
  fieldHeightReflection: 560,
  fieldHeightEvidence: 720,
  fieldToCtaGap: 38,
  ctaHeight: 70,
  footerHeight: 36,
  footerBottomInset: 18,
} as const;

type ProceduralLayer = Extract<
  TemplateRenderContext["document"]["layers"][number],
  { type: "procedural-decoration" }
>;

type FieldLayout = {
  safe: TemplateCanvas["safeArea"];
  side: "full" | "left" | "right";
  copyX: number;
  copyWidth: number;
  fieldX: number;
  fieldY: number;
  fieldWidth: number;
  fieldHeight: number;
  ctaY: number;
  footerY: number;
  unit: number;
};

export const tiktokCarouselSlideV1_0_4Template: TemplateDefinition = {
  id: "tiktok-carousel-slide",
  version: "1.0.4",
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
      "Organic photo-carousel copy uses compact 3:4 insets, optional sequence chrome, and a 1.08 headline-leading floor that separates adjacent glyph outlines.",
    layout:
      "A typography-first 3:4 organic slide with content-responsive field height, optional header and footer, and deterministic pattern rails with no generated illustration or SVG asset when a procedural layer is present.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    canvas.scene.title = "TikTok organic photo carousel slide";
    canvas.scene.description =
      "A deterministic 3:4 editorial slide with content-responsive spacing and optional pattern interruption.";

    canvas.safeArea = tiktokPhotoSafeArea(canvas);
    const unit = canvas.scene.dimensions.height / 1440;
    const surfaceColor = context.document.brand.themes[context.document.mode].surface;
    const eyebrow = findLayer(context.document.layers, "eyebrow");
    const badge = findLayer(context.document.layers, "badge")!;
    const headline = findLayer(context.document.layers, "headline")!;
    const subtitle = findLayer(context.document.layers, "subtitle");
    const statistic = findLayer(context.document.layers, "statistic");
    const cta = findLayer(context.document.layers, "cta");
    const footer = findLayer(context.document.layers, "footer");
    const procedural = findLayer(context.document.layers, "procedural-decoration");
    const layout = photoFieldLayout(canvas.safeArea, {
      unit,
      hasHeader: eyebrow !== undefined,
      hasSubtitle: subtitle !== undefined,
      hasStatistic: statistic !== undefined,
      hasCta: cta !== undefined,
      hasFooter: footer !== undefined,
      procedural,
    });

    addTypographyFrame(canvas, layout, surfaceColor, eyebrow !== undefined, procedural);
    if (procedural !== undefined) addPatternRail(canvas, layout, procedural);

    if (eyebrow !== undefined) {
      addText(
        canvas,
        context,
        eyebrow,
        {
          x: layout.copyX,
          y: layout.safe.y + 14 * unit,
          width: Math.max(80 * unit, layout.copyWidth - 190 * unit),
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

    addSlideBadge(canvas, context, badge, layout.safe, unit);

    const hasSupportingCopy = subtitle !== undefined || statistic !== undefined;
    const preferredHeadlineSize =
      layout.side === "full"
        ? hasSupportingCopy
          ? 88
          : 102
        : hasSupportingCopy
          ? 70
          : 88;
    const headlineElement = addText(
      canvas,
      context,
      headline,
      {
        x: layout.copyX,
        y: layout.fieldY + 52 * unit,
        width: layout.copyWidth,
        height: Math.min(
          (hasSupportingCopy ? 390 : 430) * unit,
          layout.fieldHeight * (hasSupportingCopy ? 0.58 : 0.78),
        ),
      },
      {
        preferredFontSize: preferredHeadlineSize * unit,
        minimumFontSize: 44,
        maximumLines: 4,
        weight: 800,
        color: canvas.textColor,
        contrastBackgroundColor: surfaceColor,
        lineHeight: TIKTOK_ORGANIC_HEADLINE_LINE_HEIGHT_MINIMUM,
      },
    );
    addQuietRegionIssue(canvas, context, headlineElement.bounds);

    const supportingY =
      headlineElement.bounds.y + headlineElement.bounds.height + 28 * unit;
    if (subtitle !== undefined) {
      addText(
        canvas,
        context,
        subtitle,
        {
          x: layout.copyX,
          y: supportingY,
          width: layout.copyWidth * 0.96,
          height: Math.max(
            90 * unit,
            layout.fieldY + layout.fieldHeight - supportingY - 38 * unit,
          ),
        },
        {
          preferredFontSize: 34 * unit,
          minimumFontSize: 23,
          maximumLines: 5,
          weight: 500,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.mutedTextColor,
          contrastBackgroundColor: surfaceColor,
          lineHeight: context.document.mode === "dark" ? 1.24 : 1.2,
        },
      );
    } else if (statistic !== undefined) {
      addStatistic(canvas, context, statistic, {
        x: layout.copyX,
        y: supportingY,
        width: layout.copyWidth,
        height: layout.fieldY + layout.fieldHeight - supportingY - 34 * unit,
        surfaceColor,
        unit,
      });
    }

    if (cta !== undefined) {
      addCallToAction(canvas, context, cta, {
        x: layout.copyX,
        y: layout.ctaY,
        width: layout.copyWidth,
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
          x: layout.copyX,
          y: layout.footerY,
          width: layout.copyWidth,
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

function photoFieldLayout(
  safe: TemplateCanvas["safeArea"],
  input: {
    unit: number;
    hasHeader: boolean;
    hasSubtitle: boolean;
    hasStatistic: boolean;
    hasCta: boolean;
    hasFooter: boolean;
    procedural: ProceduralLayer | undefined;
  },
): FieldLayout {
  const { unit, procedural } = input;
  const side = fieldSide(procedural);
  const fullWidth = safe.width - 32 * unit;
  const fieldWidth =
    side === "full" ? fullWidth : Math.max(560 * unit, safe.width * 0.8);
  const fieldX =
    side === "right"
      ? safe.x + safe.width - fieldWidth - 16 * unit
      : safe.x + 16 * unit;
  const copyX = fieldX + 44 * unit;
  const copyWidth = Math.max(360 * unit, fieldWidth - 88 * unit);
  const fieldY =
    safe.y +
    (input.hasHeader
      ? PHOTO_LAYOUT.fieldTopWithHeader
      : PHOTO_LAYOUT.fieldTopWithoutHeader) *
      unit;
  const preferredFieldHeight = input.hasStatistic
    ? PHOTO_LAYOUT.fieldHeightEvidence
    : input.hasSubtitle && input.hasCta
      ? PHOTO_LAYOUT.fieldHeightEditorial
      : input.hasSubtitle
        ? PHOTO_LAYOUT.fieldHeightReflection
        : PHOTO_LAYOUT.fieldHeightPoster;
  const reservedAfterField =
    (input.hasCta ? PHOTO_LAYOUT.fieldToCtaGap + PHOTO_LAYOUT.ctaHeight : 0) * unit;
  const footerTop =
    safe.y +
    safe.height -
    (PHOTO_LAYOUT.footerBottomInset + PHOTO_LAYOUT.footerHeight) * unit;
  const maximumFieldBottom =
    (input.hasFooter ? footerTop - 34 * unit : safe.y + safe.height) -
    reservedAfterField;
  const fieldHeight = Math.max(
    430 * unit,
    Math.min(preferredFieldHeight * unit, maximumFieldBottom - fieldY),
  );
  const ctaY = fieldY + fieldHeight + PHOTO_LAYOUT.fieldToCtaGap * unit;
  return {
    safe,
    side,
    copyX,
    copyWidth,
    fieldX,
    fieldY,
    fieldWidth,
    fieldHeight,
    ctaY,
    footerY: footerTop,
    unit,
  };
}

function fieldSide(procedural?: ProceduralLayer): FieldLayout["side"] {
  if (procedural === undefined) return "full";
  return procedural.style === "layered-waves" || procedural.style === "flow-field"
    ? "right"
    : "left";
}

function addTypographyFrame(
  canvas: TemplateCanvas,
  layout: FieldLayout,
  surfaceColor: string,
  hasHeader: boolean,
  procedural?: ProceduralLayer,
): void {
  const { safe, copyX, fieldX, fieldY, fieldWidth, fieldHeight, side, unit } = layout;
  canvas.scene.elements.push({
    id: "carousel-story-spine",
    type: "rect",
    x: side === "right" ? safe.x + safe.width - 7 * unit : safe.x,
    y: safe.y,
    width: 7 * unit,
    height: safe.height * 0.94,
    fill: canvas.accentColor,
  });
  if (hasHeader) {
    canvas.scene.elements.push({
      id: "carousel-header-rule",
      type: "rect",
      x: copyX,
      y: safe.y + 56 * unit,
      width: safe.x + safe.width - copyX,
      height: 2 * unit,
      fill: canvas.textColor,
    });
  }
  canvas.scene.elements.push(
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
      x: side === "right" ? fieldX + fieldWidth - 14 * unit : fieldX,
      y: fieldY,
      width: 14 * unit,
      height: 104 * unit,
      fill: canvas.accentColor,
    },
    {
      id: "carousel-field-index",
      type: "rect",
      x: side === "right" ? fieldX : fieldX + fieldWidth - 34 * unit,
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
  if (procedural !== undefined) {
    canvas.scene.elements.push({
      id: "carousel-pattern-divider",
      type: "rect",
      x: side === "right" ? fieldX - 18 * unit : fieldX + fieldWidth + 12 * unit,
      y: fieldY + 30 * unit,
      width: 6 * unit,
      height: Math.max(80 * unit, fieldHeight - 60 * unit),
      fill: canvas.accentColor,
      opacity: 0.82,
    });
  }
}

function addPatternRail(
  canvas: TemplateCanvas,
  layout: FieldLayout,
  procedural: ProceduralLayer,
): void {
  const { safe, side, fieldX, fieldWidth, fieldY, fieldHeight, unit } = layout;
  const railStart =
    side === "right" ? safe.x + 28 * unit : fieldX + fieldWidth + 34 * unit;
  const railWidth = Math.max(
    56 * unit,
    side === "right"
      ? fieldX - safe.x - 64 * unit
      : safe.x + safe.width - railStart - 20 * unit,
  );
  const centerX = railStart + railWidth / 2;
  const centerY = fieldY + fieldHeight / 2;
  const colors: readonly [string, string, string] = [
    canvas.accentColor,
    procedural.style === "topographic-contours"
      ? canvas.textColor
      : canvas.mutedTextColor,
    canvas.textColor,
  ];

  if (procedural.style === "topographic-contours") {
    for (let index = 0; index < 4; index += 1) {
      canvas.scene.elements.push({
        id: `carousel-pattern-ring-${index.toString()}`,
        type: "circle",
        cx: centerX,
        cy: centerY,
        radius: (34 + index * 30) * unit,
        fill: canvas.backgroundColor,
        stroke: colors[index % colors.length]!,
        strokeWidth: (index === 0 ? 8 : 4) * unit,
        opacity: 0.88,
      });
    }
    return;
  }

  const barCount = procedural.style === "recursive-subdivision" ? 4 : 6;
  for (let index = 0; index < barCount; index += 1) {
    const progress = index / Math.max(1, barCount - 1);
    const widthScale =
      procedural.style === "layered-waves"
        ? 0.35 + 0.65 * (index % 2 === 0 ? 1 : 0.58)
        : procedural.style === "flow-field"
          ? 0.28 + progress * 0.72
          : 0.45 + (index % 3) * 0.22;
    canvas.scene.elements.push({
      id: `carousel-pattern-bar-${index.toString()}`,
      type: "rect",
      x: side === "right" ? railStart : railStart + railWidth * (1 - widthScale),
      y: fieldY + 54 * unit + (index * (fieldHeight - 108 * unit)) / barCount,
      width: railWidth * widthScale,
      height: (procedural.style === "recursive-subdivision" ? 42 : 18) * unit,
      fill: colors[index % colors.length]!,
      opacity: 0.74,
    });
  }
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
    { x: box.x, y: box.y, width: box.width, height: Math.min(box.height * 0.5, 170) },
    {
      preferredFontSize: 152 * box.unit,
      minimumFontSize: 68,
      maximumLines: 1,
      weight: 800,
      color: canvas.accentColor,
      contrastBackgroundColor: box.surfaceColor,
      lineHeight: 1,
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
      height: 112 * box.unit,
    },
    {
      preferredFontSize: 31 * box.unit,
      minimumFontSize: 21,
      maximumLines: 3,
      weight: 500,
      family: context.document.brand.typography.bodyFamily,
      color: canvas.textColor,
      contrastBackgroundColor: box.surfaceColor,
      lineHeight: 1.2,
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
