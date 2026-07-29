import {
  addDecorativeBar,
  addQuietRegionIssue,
  addText,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
} from "./shared.js";
import type { TemplateDefinition } from "./types.js";

export const quoteCardTemplate: TemplateDefinition = {
  id: "quote-card",
  version: "1.0.0",
  requiredLayers: ["headline", "attribution"],
  supportedFormats: [
    "linkedin-landscape",
    "instagram-square",
    "instagram-portrait",
    "instagram-story",
    "x-landscape",
    "youtube-thumbnail",
  ],
  constraints: {
    headlineMaximumLines: 5,
    safeAreaBehavior: "Quote and attribution share a centered safe-area column.",
    layout: "Large quotation with restrained attribution and an accent mark.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    const safe = canvas.safeArea;
    const unit = Math.min(
      canvas.scene.dimensions.width / 1080,
      canvas.scene.dimensions.height / 1080,
    );
    const quote = findLayer(context.document.layers, "headline")!;
    const attribution = findLayer(context.document.layers, "attribution")!;
    addDecorativeBar(
      canvas,
      {
        x: safe.x + safe.width / 2 - 44 * unit,
        y: safe.y + safe.height * 0.12,
        width: 88 * unit,
        height: 9 * unit,
      },
      "quote-accent",
    );
    const quoteElement = addText(
      canvas,
      context,
      quote,
      {
        x: safe.x + safe.width * 0.08,
        y: safe.y + safe.height * 0.24,
        width: safe.width * 0.84,
        height: safe.height * 0.48,
      },
      {
        preferredFontSize: 66 * unit,
        minimumFontSize: 30,
        maximumLines: 5,
        weight: 700,
        lineHeight: 1.13,
        align: "center",
      },
    );
    addQuietRegionIssue(canvas, context, quoteElement.bounds);
    addText(
      canvas,
      context,
      attribution,
      {
        x: safe.x + safe.width * 0.15,
        y: safe.y + safe.height * 0.81,
        width: safe.width * 0.7,
        height: 50 * unit,
      },
      {
        preferredFontSize: 23 * unit,
        minimumFontSize: 16,
        maximumLines: 1,
        weight: 600,
        family: context.document.brand.typography.bodyFamily,
        color: canvas.mutedTextColor,
        lineHeight: 1,
        align: "center",
      },
    );
    return finishTemplate(canvas);
  },
};
