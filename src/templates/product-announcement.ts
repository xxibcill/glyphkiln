import {
  addAsset,
  addDecorativeBar,
  addQuietRegionIssue,
  addText,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
} from "./shared.js";
import type { TemplateDefinition } from "./types.js";

export const productAnnouncementTemplate: TemplateDefinition = {
  id: "product-announcement",
  version: "1.0.0",
  requiredLayers: ["headline"],
  supportedFormats: [
    "linkedin-landscape",
    "instagram-square",
    "instagram-portrait",
    "instagram-story",
    "x-landscape",
    "youtube-thumbnail",
  ],
  constraints: {
    headlineMaximumLines: 3,
    safeAreaBehavior: "All semantic text remains within the brand snapshot safe area.",
    layout:
      "Left-weighted announcement copy with an optional right-hand product image.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    const safe = canvas.safeArea;
    const screenshot = findLayer(context.document.layers, "product-screenshot");
    const copyWidth = screenshot === undefined ? safe.width * 0.78 : safe.width * 0.52;
    const eyebrow = findLayer(context.document.layers, "eyebrow");
    const badge = findLayer(context.document.layers, "badge");
    const headline = findLayer(context.document.layers, "headline")!;
    const subtitle = findLayer(context.document.layers, "subtitle");
    const cta = findLayer(context.document.layers, "cta");
    const unit = canvas.scene.dimensions.height / 627;
    addDecorativeBar(
      canvas,
      { x: safe.x, y: safe.y, width: 72 * unit, height: 8 * unit },
      "announcement-accent",
    );
    if (eyebrow !== undefined) {
      addText(
        canvas,
        context,
        eyebrow,
        { x: safe.x, y: safe.y + 28 * unit, width: copyWidth, height: 44 * unit },
        {
          preferredFontSize: 22 * unit,
          minimumFontSize: 15,
          maximumLines: 1,
          weight: 700,
          color: canvas.accentColor,
          lineHeight: 1,
        },
      );
    } else if (badge !== undefined) {
      canvas.scene.elements.push({
        id: badge.id,
        type: "rect",
        x: safe.x,
        y: safe.y + 24 * unit,
        width: Math.min(copyWidth, badge.text.length * 13 * unit + 40 * unit),
        height: 38 * unit,
        fill: badge.color ?? canvas.accentColor,
        radius: 19 * unit,
        opacity: 0.92,
      });
    }
    const headlineBox = {
      x: safe.x,
      y: safe.y + 86 * unit,
      width: copyWidth,
      height: Math.min(safe.height * 0.45, 230 * unit),
    };
    const headlineElement = addText(canvas, context, headline, headlineBox, {
      preferredFontSize: 66 * unit,
      minimumFontSize: 28,
      maximumLines: 3,
      weight: 800,
      lineHeight: 1.02,
    });
    addQuietRegionIssue(canvas, context, headlineElement.bounds);
    if (subtitle !== undefined) {
      addText(
        canvas,
        context,
        subtitle,
        {
          x: safe.x,
          y: headlineBox.y + headlineElement.bounds.height + 24 * unit,
          width: copyWidth,
          height: 86 * unit,
        },
        {
          preferredFontSize: 25 * unit,
          minimumFontSize: 16,
          maximumLines: 3,
          weight: 400,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.mutedTextColor,
          lineHeight: 1.28,
        },
      );
    }
    if (cta !== undefined) {
      addText(
        canvas,
        context,
        cta,
        {
          x: safe.x,
          y: safe.y + safe.height - 48 * unit,
          width: copyWidth,
          height: 42 * unit,
        },
        {
          preferredFontSize: 21 * unit,
          minimumFontSize: 15,
          maximumLines: 1,
          weight: 700,
          color: canvas.accentColor,
          lineHeight: 1,
        },
      );
    }
    if (screenshot !== undefined) {
      addAsset(canvas, context, screenshot, {
        x: safe.x + safe.width * 0.59,
        y: safe.y + safe.height * 0.12,
        width: safe.width * 0.41,
        height: safe.height * 0.76,
      });
    }
    return finishTemplate(canvas);
  },
};
