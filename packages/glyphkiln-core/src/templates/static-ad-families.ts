import type { Bounds } from "../domain/types.js";
import type { DesignLayer } from "../schema/index.js";
import {
  addAsset,
  addText,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
  type TemplateCanvas,
  type TextLayer,
} from "./shared.js";
import type { TemplateDefinition, TemplateRenderContext } from "./types.js";

type Frame = {
  canvas: TemplateCanvas;
  context: TemplateRenderContext;
  box: Bounds;
  unit: number;
  gap: number;
};
const formats = [
  "instagram-square",
  "instagram-portrait",
  "instagram-story",
  "linkedin-landscape",
] as const;
const commonLayers = [
  "background",
  "eyebrow",
  "headline",
  "logo",
  "cta",
  "footer",
] as const;
const containedAssets = [
  { layerType: "product-screenshot", fit: "contain" },
  { layerType: "logo", fit: "contain" },
] as const;
const constraints = (layout: string, headlineMaximumLines = 2) => ({
  headlineMaximumLines,
  safeAreaBehavior:
    "Keep claims, attribution, action and qualification inside the brand safe area.",
  layout,
});

export const testimonialEvidenceTemplate: TemplateDefinition = {
  id: "testimonial-evidence",
  version: "1.0.0",
  supportedFormats: formats,
  requiredLayers: ["headline", "attribution", "footer"],
  supportedLayers: [
    ...commonLayers,
    "subtitle",
    "attribution",
    "badge",
    "product-screenshot",
    "image",
  ],
  requiredAssetFits: [...containedAssets, { layerType: "image", fit: "contain" }],
  constraints: constraints(
    "A customer quote with attribution and source, optional rating, portrait and product.",
    4,
  ),
  render(context) {
    const frame = createFrame(context);
    const { canvas, box, gap, unit } = frame;
    const layers = context.document.layers;
    const product = findLayer(layers, "product-screenshot");
    const landscape = canvas.scene.dimensions.width > canvas.scene.dimensions.height;
    const copyWidth = product && landscape ? box.width * 0.51 : box.width;
    const copyHeight = product && !landscape ? box.height * 0.53 : box.height;
    const badge = findLayer(layers, "badge");
    if (badge)
      text(
        frame,
        { ...badge, type: "subtitle" },
        { ...box, width: copyWidth, height: copyHeight * 0.12 },
        27,
        1,
      );
    const quoteY = box.y + copyHeight * 0.16;
    text(
      frame,
      findLayer(layers, "headline")!,
      { x: box.x, y: quoteY, width: copyWidth, height: copyHeight * 0.55 },
      66,
      4,
      800,
    );
    const person = findLayer(layers, "image");
    const attributionY = box.y + copyHeight * 0.76;
    const portraitSize = Math.min(70 * unit, copyHeight * 0.23);
    if (person)
      addAsset(canvas, context, person, {
        x: box.x,
        y: attributionY,
        width: portraitSize,
        height: portraitSize,
      });
    const offset = person ? portraitSize + gap : 0;
    text(
      frame,
      findLayer(layers, "attribution")!,
      {
        x: box.x + offset,
        y: attributionY,
        width: copyWidth - offset,
        height: copyHeight * 0.11,
      },
      27,
      1,
    );
    const role = findLayer(layers, "subtitle");
    if (role)
      text(
        frame,
        role,
        {
          x: box.x + offset,
          y: attributionY + copyHeight * 0.12,
          width: copyWidth - offset,
          height: copyHeight * 0.12,
        },
        22,
        1,
        400,
      );
    if (product)
      asset(
        frame,
        product,
        landscape
          ? {
              x: box.x + box.width * 0.56,
              y: box.y,
              width: box.width * 0.44,
              height: box.height,
            }
          : {
              x: box.x,
              y: box.y + copyHeight + gap,
              width: box.width,
              height: box.height - copyHeight - gap,
            },
      );
    return finishTemplate(canvas);
  },
};

export const comparisonTemplate: TemplateDefinition = {
  id: "comparison",
  version: "1.0.0",
  supportedFormats: formats,
  requiredLayers: ["headline", "comparison-table", "footer"],
  supportedLayers: [...commonLayers, "comparison-table"],
  requiredAssetFits: [{ layerType: "logo", fit: "contain" }],
  constraints: constraints(
    "An aligned two-option comparison with one to three matched criteria and a visible source.",
  ),
  render(context) {
    const frame = createFrame(context);
    const { canvas, box, gap } = frame;
    text(
      frame,
      findLayer(context.document.layers, "headline")!,
      { ...box, height: box.height * 0.23 },
      68,
      2,
      800,
    );
    const table = findLayer(context.document.layers, "comparison-table")!;
    const top = box.y + box.height * 0.29;
    const labelWidth = box.width * 0.22;
    const valueWidth = (box.width - labelWidth - gap * 2) / 2;
    const leftX = box.x + labelWidth + gap;
    const rightX = leftX + valueWidth + gap;
    const headerHeight = box.height * 0.13;
    const rowsTop = top + headerHeight;
    const rowHeight = (box.y + box.height - rowsTop) / table.rows.length;
    text(
      frame,
      syntheticText(`${table.id}-leftLabel`, table.leftLabel),
      { x: leftX, y: top, width: valueWidth, height: headerHeight - gap / 2 },
      32,
      2,
    );
    text(
      frame,
      syntheticText(`${table.id}-rightLabel`, table.rightLabel),
      { x: rightX, y: top, width: valueWidth, height: headerHeight - gap / 2 },
      32,
      2,
    );
    for (const [index, row] of table.rows.entries()) {
      const y = rowsTop + index * rowHeight;
      canvas.scene.elements.push({
        id: `${table.id}-${index}-rule`,
        type: "rect",
        x: box.x,
        y,
        width: box.width,
        height: 2,
        fill: canvas.accentColor,
      });
      const height = rowHeight - gap;
      text(
        frame,
        syntheticText(`${table.id}-${index}-label`, row.label),
        { x: box.x, y: y + gap / 2, width: labelWidth, height },
        24,
        3,
      );
      text(
        frame,
        syntheticText(`${table.id}-${index}-left`, row.left),
        { x: leftX, y: y + gap / 2, width: valueWidth, height },
        29,
        3,
        400,
      );
      text(
        frame,
        syntheticText(`${table.id}-${index}-right`, row.right),
        { x: rightX, y: y + gap / 2, width: valueWidth, height },
        29,
        3,
        700,
      );
    }
    return finishTemplate(canvas);
  },
};

export const problemSolutionTemplate: TemplateDefinition = {
  id: "problem-solution",
  version: "1.0.0",
  supportedFormats: formats,
  requiredLayers: ["headline", "problem-solution"],
  supportedLayers: [...commonLayers, "problem-solution"],
  requiredAssetFits: [{ layerType: "logo", fit: "contain" }],
  constraints: constraints(
    "A clearly labeled problem and solution, side by side or stacked for tall canvases.",
  ),
  render(context) {
    const frame = createFrame(context);
    const { canvas, box, gap } = frame;
    text(
      frame,
      findLayer(context.document.layers, "headline")!,
      { ...box, height: box.height * 0.23 },
      76,
      2,
      800,
    );
    const layer = findLayer(context.document.layers, "problem-solution")!;
    const stacked =
      canvas.scene.dimensions.height / canvas.scene.dimensions.width > 1.5;
    const area = { ...box, y: box.y + box.height * 0.3, height: box.height * 0.7 };
    const width = stacked ? area.width : (area.width - gap) / 2;
    const height = stacked ? (area.height - gap) / 2 : area.height;
    for (const [index, content] of [
      { label: "PROBLEM", title: layer.problemTitle, body: layer.problem },
      { label: "SOLUTION", title: layer.solutionTitle, body: layer.solution },
    ].entries()) {
      const x = area.x + (stacked ? 0 : index * (width + gap));
      const y = area.y + (stacked ? index * (height + gap) : 0);
      const padding = gap;
      canvas.scene.elements.push({
        id: `${layer.id}-${index}-panel`,
        type: "rect",
        x,
        y,
        width,
        height,
        fill: context.document.brand.themes[context.document.mode].surface,
      });
      const inner = {
        x: x + padding,
        y: y + padding,
        width: width - padding * 2,
        height: height - padding * 2,
      };
      text(
        frame,
        syntheticText(`${layer.id}-${index}-label`, content.label),
        { ...inner, height: inner.height * 0.14 },
        20,
        1,
        700,
        true,
      );
      text(
        frame,
        syntheticText(`${layer.id}-${index}-title`, content.title),
        { ...inner, y: inner.y + inner.height * 0.23, height: inner.height * 0.3 },
        42,
        2,
        800,
        true,
      );
      text(
        frame,
        syntheticText(`${layer.id}-${index}-body`, content.body),
        { ...inner, y: inner.y + inner.height * 0.62, height: inner.height * 0.38 },
        27,
        3,
        400,
        true,
      );
    }
    return finishTemplate(canvas);
  },
};

export const offerUrgencyTemplate: TemplateDefinition = {
  id: "offer-urgency",
  version: "1.0.0",
  supportedFormats: formats,
  requiredLayers: ["headline", "badge", "footer"],
  supportedLayers: [...commonLayers, "subtitle", "badge", "product-screenshot"],
  requiredAssetFits: containedAssets,
  constraints: constraints(
    "A dominant offer, explicit deadline or scope, optional product and visible terms.",
  ),
  render(context) {
    const frame = createFrame(context);
    const { canvas, box, gap } = frame;
    const layers = context.document.layers;
    const product = findLayer(layers, "product-screenshot");
    const landscape = canvas.scene.dimensions.width > canvas.scene.dimensions.height;
    const width = product && landscape ? box.width * 0.51 : box.width;
    const height = product && !landscape ? box.height * 0.51 : box.height;
    text(
      frame,
      findLayer(layers, "headline")!,
      { ...box, width, height: height * 0.2 },
      38,
      2,
    );
    text(
      frame,
      { ...findLayer(layers, "badge")!, type: "subtitle" },
      { x: box.x, y: box.y + height * 0.26, width, height: height * 0.46 },
      134,
      2,
      800,
    );
    const subtitle = findLayer(layers, "subtitle");
    if (subtitle)
      text(
        frame,
        subtitle,
        { x: box.x, y: box.y + height * 0.8, width, height: height * 0.2 },
        28,
        2,
        400,
      );
    if (product)
      asset(
        frame,
        product,
        landscape
          ? {
              x: box.x + box.width * 0.56,
              y: box.y,
              width: box.width * 0.44,
              height: box.height,
            }
          : {
              x: box.x,
              y: box.y + height + gap,
              width: box.width,
              height: box.height - height - gap,
            },
      );
    return finishTemplate(canvas);
  },
};

function createFrame(context: TemplateRenderContext): Frame {
  const canvas = createTemplateCanvas(context);
  const safe = canvas.safeArea;
  const unit = Math.min(safe.width, safe.height) / 920;
  const gap = 28 * unit;
  const layers = context.document.layers;
  const logo = findLayer(layers, "logo");
  const eyebrow = findLayer(layers, "eyebrow");
  const cta = findLayer(layers, "cta");
  const footer = findLayer(layers, "footer");
  const header = logo || eyebrow ? 70 * unit : 0;
  const action = cta ? 64 * unit : 0;
  const source = footer ? 70 * unit : 0;
  const frame = {
    canvas,
    context,
    unit,
    gap,
    box: {
      ...safe,
      y: safe.y + header,
      height: safe.height - header - action - source - gap,
    },
  };
  if (logo) {
    const resource = context.assets.get(logo.assetId);
    const height = Math.min(
      40 * unit,
      (safe.width * 0.2 * resource.height) / resource.width,
    );
    addAsset(canvas, context, logo, {
      x: safe.x,
      y: safe.y,
      width: (height * resource.width) / resource.height,
      height,
    });
  }
  if (eyebrow)
    text(
      frame,
      eyebrow,
      {
        ...safe,
        x: safe.x + (logo ? safe.width * 0.25 : 0),
        width: safe.width * (logo ? 0.75 : 1),
        height: 44 * unit,
      },
      23,
      1,
    );
  if (cta)
    text(
      frame,
      cta,
      {
        x: safe.x,
        y: safe.y + safe.height - action - source,
        width: safe.width,
        height: action - gap / 2,
      },
      28,
      1,
    );
  if (footer)
    text(
      frame,
      footer,
      {
        x: safe.x,
        y: safe.y + safe.height - source,
        width: safe.width,
        height: source,
      },
      20,
      2,
      400,
    );
  return frame;
}

function text(
  frame: Frame,
  layer: TextLayer,
  box: Bounds,
  size: number,
  lines: number,
  weight = 700,
  onSurface = false,
): void {
  addText(frame.canvas, frame.context, layer, box, {
    preferredFontSize: Math.max(
      size >= 38 ? 28 : size >= 24 ? 22 : 16,
      size * frame.unit,
    ),
    minimumFontSize: size >= 38 ? 24 : size >= 24 ? 18 : 14,
    maximumLines: lines,
    weight,
    lineHeight: 1.15,
    family:
      size >= 38
        ? frame.context.document.brand.typography.headlineFamily
        : frame.context.document.brand.typography.bodyFamily,
    contrastBackgroundColor: onSurface
      ? frame.context.document.brand.themes[frame.context.document.mode].surface
      : frame.canvas.backgroundColor,
  });
}

function asset(
  frame: Frame,
  layer: Extract<DesignLayer, { type: "product-screenshot" }>,
  box: Bounds,
): void {
  addAsset(frame.canvas, frame.context, layer, box).clipRadius = 0;
}

function syntheticText(id: string, value: string): TextLayer {
  return { id, type: "subtitle", text: value, visible: true };
}
