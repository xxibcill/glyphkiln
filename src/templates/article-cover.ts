import {
  addDecorativeBar,
  addQuietRegionIssue,
  addText,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
} from "./shared.js";
import type { TemplateDefinition } from "./types.js";

export const articleCoverTemplate: TemplateDefinition = {
  id: "article-cover",
  version: "1.0.0",
  requiredLayers: ["headline"],
  supportedLayers: [
    "background",
    "procedural-decoration",
    "eyebrow",
    "headline",
    "attribution",
  ],
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
    safeAreaBehavior: "Editorial copy is anchored to the lower safe-area grid.",
    layout:
      "Editorial eyebrow, strong title, and optional byline in a lower-third column.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    const safe = canvas.safeArea;
    const unit = canvas.scene.dimensions.height / 720;
    const eyebrow = findLayer(context.document.layers, "eyebrow");
    const headline = findLayer(context.document.layers, "headline")!;
    const attribution = findLayer(context.document.layers, "attribution");
    const columnWidth = safe.width * 0.76;
    const startY = safe.y + safe.height * 0.35;
    addDecorativeBar(
      canvas,
      { x: safe.x, y: startY, width: 68 * unit, height: 8 * unit },
      "article-accent",
    );
    if (eyebrow !== undefined) {
      addText(
        canvas,
        context,
        eyebrow,
        {
          x: safe.x,
          y: startY + 28 * unit,
          width: columnWidth,
          height: 38 * unit,
        },
        {
          preferredFontSize: 20 * unit,
          minimumFontSize: 14,
          maximumLines: 1,
          weight: 700,
          color: canvas.accentColor,
          lineHeight: 1,
        },
      );
    }
    const headlineElement = addText(
      canvas,
      context,
      headline,
      {
        x: safe.x,
        y: startY + 78 * unit,
        width: columnWidth,
        height: safe.height * 0.38,
      },
      {
        preferredFontSize: 62 * unit,
        minimumFontSize: 28,
        maximumLines: 3,
        weight: 800,
        lineHeight: 1.04,
      },
    );
    addQuietRegionIssue(canvas, context, headlineElement.bounds);
    if (attribution !== undefined) {
      addText(
        canvas,
        context,
        attribution,
        {
          x: safe.x,
          y: safe.y + safe.height - 34 * unit,
          width: columnWidth,
          height: 32 * unit,
        },
        {
          preferredFontSize: 18 * unit,
          minimumFontSize: 13,
          maximumLines: 1,
          weight: 500,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.mutedTextColor,
          lineHeight: 1,
        },
      );
    }
    return finishTemplate(canvas);
  },
};
