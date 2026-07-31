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

export const tiktokCarouselSlideV1_0_1Template: TemplateDefinition = {
  id: "tiktok-carousel-slide",
  version: "1.0.1",
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
      "Narrative copy stays in a conservative left column above the interface-heavy lower edge.",
    layout:
      "A vertical proof sheet with a numbered header, oversized hook, optional metric, and swipe cue.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    canvas.scene.title = "TikTok carousel slide";
    canvas.scene.description =
      "A deterministic vertical carousel slide with an editorial proof-sheet composition.";

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
    const copyWidth = Math.min(safe.width * 0.77, 730 * unit);
    const sheetX = safe.x + 18 * unit;
    const sheetY = safe.y + 96 * unit;
    const sheetWidth = Math.min(safe.width * 0.86, 800 * unit);
    const sheetHeight = 930 * unit;

    addRegistrationFrame(canvas, {
      copyX,
      copyWidth,
      sheetX,
      sheetY,
      sheetWidth,
      sheetHeight,
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
          y: safe.y + 16 * unit,
          width: Math.max(80 * unit, copyWidth - 180 * unit),
          height: 34 * unit,
        },
        {
          preferredFontSize: 22 * unit,
          minimumFontSize: 15,
          maximumLines: 1,
          weight: 700,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.textColor,
          lineHeight: 1,
        },
      );
    }

    if (badge !== undefined) {
      addSlideBadge(canvas, context, badge, unit);
    }

    const headlineElement = addText(
      canvas,
      context,
      headline,
      {
        x: copyX,
        y: sheetY + 74 * unit,
        width: copyWidth,
        height: 520 * unit,
      },
      {
        preferredFontSize: 96 * unit,
        minimumFontSize: 46,
        maximumLines: 4,
        weight: 800,
        color: canvas.textColor,
        contrastBackgroundColor: surfaceColor,
        lineHeight: 0.98,
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
          height: 210 * unit,
        },
        {
          preferredFontSize: 38 * unit,
          minimumFontSize: 23,
          maximumLines: 4,
          weight: 500,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.mutedTextColor,
          contrastBackgroundColor: surfaceColor,
          lineHeight: 1.22,
        },
      );
    } else if (statistic !== undefined) {
      addStatistic(canvas, context, statistic, {
        x: copyX,
        y: supportingY,
        width: copyWidth,
        height: sheetY + sheetHeight - supportingY - 54 * unit,
        surfaceColor,
        unit,
      });
    }

    if (cta !== undefined) {
      addCallToAction(canvas, context, cta, {
        x: copyX,
        y: safe.y + safe.height * 0.77,
        width: copyWidth,
        height: 76 * unit,
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
          height: 36 * unit,
        },
        {
          preferredFontSize: 20 * unit,
          minimumFontSize: 14,
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

type RegistrationFrame = {
  copyX: number;
  copyWidth: number;
  sheetX: number;
  sheetY: number;
  sheetWidth: number;
  sheetHeight: number;
  surfaceColor: string;
  unit: number;
};

function addRegistrationFrame(canvas: TemplateCanvas, frame: RegistrationFrame): void {
  const safe = canvas.safeArea;
  const { copyX, sheetX, sheetY, sheetWidth, sheetHeight, surfaceColor, unit } = frame;

  canvas.scene.elements.push(
    {
      id: "carousel-registration-spine",
      type: "rect",
      x: safe.x,
      y: safe.y,
      width: 7 * unit,
      height: safe.height * 0.91,
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
      id: "carousel-sheet-register",
      type: "rect",
      x: sheetX + 14 * unit,
      y: sheetY + 14 * unit,
      width: sheetWidth,
      height: sheetHeight,
      fill: canvas.accentColor,
    },
    {
      id: "carousel-proof-sheet",
      type: "rect",
      x: sheetX,
      y: sheetY,
      width: sheetWidth,
      height: sheetHeight,
      fill: surfaceColor,
      stroke: canvas.textColor,
      strokeWidth: 2 * unit,
    },
    {
      id: "carousel-sheet-index",
      type: "rect",
      x: sheetX + sheetWidth - 34 * unit,
      y: sheetY,
      width: 34 * unit,
      height: 34 * unit,
      fill: canvas.accentColor,
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
  unit: number,
): void {
  const safe = canvas.safeArea;
  const width = 150 * unit;
  const height = 52 * unit;
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
      y: y + 15 * unit,
      width: width - 36 * unit,
      height: 24 * unit,
    },
    {
      preferredFontSize: 20 * unit,
      minimumFontSize: 14,
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
    {
      x: box.x,
      y: box.y,
      width: box.width,
      height: Math.min(box.height * 0.48, 210 * box.unit),
    },
    {
      preferredFontSize: 176 * box.unit,
      minimumFontSize: 62,
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
      preferredFontSize: 32 * box.unit,
      minimumFontSize: 21,
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
        preferredFontSize: 19 * box.unit,
        minimumFontSize: 13,
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
  canvas.scene.elements.push({
    id: `${cta.id}-background`,
    type: "rect",
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    fill: canvas.accentColor,
  });
  addText(
    canvas,
    context,
    cta,
    {
      x: box.x + 26 * box.unit,
      y: box.y + 23 * box.unit,
      width: box.width - 52 * box.unit,
      height: 30 * box.unit,
    },
    {
      preferredFontSize: 22 * box.unit,
      minimumFontSize: 14,
      maximumLines: 1,
      weight: 700,
      family:
        context.document.brand.typography.monospaceFamily ??
        context.document.brand.typography.bodyFamily,
      color: bestContrastingColor(canvas.accentColor, [
        canvas.textColor,
        canvas.backgroundColor,
      ]),
      contrastBackgroundColor: canvas.accentColor,
      lineHeight: 1,
    },
  );
}
