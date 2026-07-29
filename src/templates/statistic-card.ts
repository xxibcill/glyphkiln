import {
  addDecorativeBar,
  addQuietRegionIssue,
  addText,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
} from "./shared.js";
import type { TemplateDefinition } from "./types.js";

export const statisticCardTemplate: TemplateDefinition = {
  id: "statistic-card",
  version: "1.0.0",
  requiredLayers: ["statistic"],
  supportedLayers: ["background", "procedural-decoration", "headline", "statistic"],
  supportedFormats: [
    "linkedin-landscape",
    "instagram-square",
    "instagram-portrait",
    "instagram-story",
    "x-landscape",
    "youtube-thumbnail",
  ],
  constraints: {
    headlineMaximumLines: 2,
    safeAreaBehavior: "The statistic block is inset from all brand safe-area edges.",
    layout:
      "Oversized statistic with a compact supporting label and optional headline.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    const safe = canvas.safeArea;
    const unit = Math.min(
      canvas.scene.dimensions.width / 1080,
      canvas.scene.dimensions.height / 1080,
    );
    const headline = findLayer(context.document.layers, "headline");
    const statistic = findLayer(context.document.layers, "statistic")!;
    if (headline !== undefined) {
      addText(
        canvas,
        context,
        headline,
        { x: safe.x, y: safe.y, width: safe.width * 0.78, height: 110 * unit },
        {
          preferredFontSize: 42 * unit,
          minimumFontSize: 24,
          maximumLines: 2,
          weight: 700,
          lineHeight: 1.08,
        },
      );
    }
    addDecorativeBar(
      canvas,
      {
        x: safe.x,
        y: safe.y + safe.height * 0.31,
        width: 84 * unit,
        height: 10 * unit,
      },
      "statistic-accent",
    );
    const valueLayer = {
      id: `${statistic.id}-value`,
      type: "headline" as const,
      visible: true,
      text: statistic.value,
    };
    const value = addText(
      canvas,
      context,
      valueLayer,
      {
        x: safe.x,
        y: safe.y + safe.height * 0.36,
        width: safe.width,
        height: safe.height * 0.3,
      },
      {
        preferredFontSize: 176 * unit,
        minimumFontSize: 56,
        maximumLines: 1,
        weight: 800,
        color: canvas.accentColor,
        lineHeight: 0.95,
      },
    );
    addQuietRegionIssue(canvas, context, value.bounds);
    const labelLayer = {
      id: `${statistic.id}-label`,
      type: "subtitle" as const,
      visible: true,
      text: statistic.label,
    };
    addText(
      canvas,
      context,
      labelLayer,
      {
        x: safe.x,
        y: value.bounds.y + value.bounds.height + 22 * unit,
        width: safe.width * 0.76,
        height: 100 * unit,
      },
      {
        preferredFontSize: 35 * unit,
        minimumFontSize: 19,
        maximumLines: 2,
        weight: 500,
        family: context.document.brand.typography.bodyFamily,
        lineHeight: 1.18,
      },
    );
    if (statistic.trend !== undefined) {
      addText(
        canvas,
        context,
        {
          id: `${statistic.id}-trend`,
          type: "footer",
          visible: true,
          text: statistic.trend,
        },
        {
          x: safe.x,
          y: safe.y + safe.height - 45 * unit,
          width: safe.width,
          height: 40 * unit,
        },
        {
          preferredFontSize: 20 * unit,
          minimumFontSize: 14,
          maximumLines: 1,
          weight: 600,
          color: canvas.mutedTextColor,
          lineHeight: 1,
        },
      );
    }
    return finishTemplate(canvas);
  },
};
