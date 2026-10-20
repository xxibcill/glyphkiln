import type { Bounds } from "../domain/types.js";
import type { DesignLayer } from "../schema/index.js";
import {
  addAsset,
  addText,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
  type TemplateCanvas,
} from "./shared.js";
import type { TemplateDefinition, TemplateRenderContext } from "./types.js";

export const benefitProofTemplate: TemplateDefinition = {
  id: "benefit-proof",
  version: "1.0.0",
  requiredLayers: ["headline", "benefit-list"],
  supportedLayers: [
    "background",
    "eyebrow",
    "headline",
    "benefit-list",
    "product-screenshot",
    "logo",
    "cta",
    "footer",
  ],
  requiredAssetFits: [
    { layerType: "product-screenshot", fit: "contain" },
    { layerType: "logo", fit: "contain" },
  ],
  supportedFormats: [
    "instagram-square",
    "instagram-portrait",
    "instagram-story",
    "linkedin-landscape",
  ],
  constraints: {
    headlineMaximumLines: 3,
    safeAreaBehavior:
      "Keep the product, supporting facts and source inside the brand safe area.",
    layout:
      "Benefit headline and optional product above a strip of supporting facts; tall and image-free compositions use stacked facts.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    const safe = canvas.safeArea;
    const layers = context.document.layers;
    const product = findLayer(layers, "product-screenshot");
    const headline = findLayer(layers, "headline")!;
    const benefits = findLayer(layers, "benefit-list")!;
    const cta = findLayer(layers, "cta");
    const footer = findLayer(layers, "footer");
    const unit = Math.min(safe.width, safe.height) / 920;
    const gap = 28 * unit;
    const headerBottom = renderHeader(canvas, context, unit);
    const bottomHeight = (cta ? 58 * unit : 0) + (footer ? 58 * unit : 0);
    const contentBottom = safe.y + safe.height - bottomHeight - gap;
    const contentHeight = contentBottom - headerBottom;
    const landscape = canvas.scene.dimensions.width > canvas.scene.dimensions.height;
    const tall = canvas.scene.dimensions.height / canvas.scene.dimensions.width > 1.5;
    const stacked = tall || product === undefined;
    const factsHeight =
      contentHeight * (product === undefined ? 0.6 : tall ? 0.32 : 0.28);
    const factsY = contentBottom - factsHeight;
    const heroHeight = factsY - gap - headerBottom;
    const headlineBox: Bounds = {
      x: safe.x,
      y: headerBottom,
      width: product && landscape ? safe.width * 0.47 : safe.width,
      height: product && !landscape ? heroHeight * 0.35 : heroHeight,
    };
    const title = addText(canvas, context, headline, headlineBox, {
      preferredFontSize: 86 * unit,
      minimumFontSize: 24,
      maximumLines: 3,
      weight: 800,
    });
    if (product) {
      const imageTop = landscape
        ? headerBottom
        : title.bounds.y + title.bounds.height + gap;
      const box = {
        x: landscape ? safe.x + safe.width * 0.53 : safe.x,
        y: imageTop,
        width: landscape ? safe.width * 0.47 : safe.width,
        height: factsY - gap - imageTop,
      };
      const image = addAsset(canvas, context, product, box);
      image.clipRadius = 0;
    }
    renderBenefits(
      canvas,
      context,
      benefits,
      { x: safe.x, y: factsY, width: safe.width, height: factsHeight },
      { unit, gap, stacked },
    );
    let bottomY = contentBottom + gap;
    if (cta) {
      addText(
        canvas,
        context,
        cta,
        { x: safe.x, y: bottomY, width: safe.width, height: 42 * unit },
        {
          preferredFontSize: Math.max(24, 29 * unit),
          minimumFontSize: 16,
          maximumLines: 1,
          weight: 700,
        },
      );
      bottomY += 58 * unit;
    }
    if (footer) {
      addText(
        canvas,
        context,
        footer,
        { x: safe.x, y: bottomY, width: safe.width, height: 58 * unit },
        {
          preferredFontSize: Math.max(16, 22 * unit),
          minimumFontSize: 14,
          maximumLines: 2,
          weight: 400,
          color: canvas.mutedTextColor,
          family: context.document.brand.typography.bodyFamily,
        },
      );
    }
    return finishTemplate(canvas);
  },
};

function renderHeader(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  unit: number,
): number {
  const safe = canvas.safeArea;
  const logo = findLayer(context.document.layers, "logo");
  const eyebrow = findLayer(context.document.layers, "eyebrow");
  if (!logo && !eyebrow) return safe.y;
  if (logo) {
    const asset = context.assets.get(logo.assetId);
    const height = Math.min(44 * unit, (safe.width * 0.2 * asset.height) / asset.width);
    addAsset(canvas, context, logo, {
      x: safe.x,
      y: safe.y,
      width: (height * asset.width) / asset.height,
      height,
    });
  }
  if (eyebrow) {
    const offset = logo ? safe.width * 0.25 : 0;
    addText(
      canvas,
      context,
      eyebrow,
      { x: safe.x + offset, y: safe.y, width: safe.width - offset, height: 44 * unit },
      {
        preferredFontSize: 24 * unit,
        minimumFontSize: 14,
        maximumLines: 1,
        weight: 700,
      },
    );
  }
  return safe.y + 76 * unit;
}

function renderBenefits(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  layer: Extract<DesignLayer, { type: "benefit-list" }>,
  box: Bounds,
  layout: { unit: number; gap: number; stacked: boolean },
): void {
  const { unit, gap, stacked } = layout;
  const count = layer.items.length;
  const width = stacked ? box.width : (box.width - gap * (count - 1)) / count;
  const height = stacked ? (box.height - gap * (count - 1)) / count : box.height;
  for (const [index, item] of layer.items.entries()) {
    const x = box.x + (stacked ? 0 : index * (width + gap));
    const y = box.y + (stacked ? index * (height + gap) : 0);
    canvas.scene.elements.push({
      id: `${layer.id}-${index}-rule`,
      type: "rect",
      x,
      y,
      width: stacked ? 48 * unit : width,
      height: 3 * unit,
      fill: canvas.accentColor,
    });
    const title = addText(
      canvas,
      context,
      {
        id: `${layer.id}-${index}-title`,
        type: "subtitle",
        text: item.title,
        visible: true,
      },
      {
        x,
        y: y + 14 * unit,
        width,
        height: item.description ? height * 0.47 - 14 * unit : height - 14 * unit,
      },
      {
        preferredFontSize: Math.max(28, 35 * unit),
        minimumFontSize: 20,
        maximumLines: 2,
        weight: 700,
      },
    );
    if (item.description !== undefined) {
      const descriptionY = title.bounds.y + title.bounds.height + 9 * unit;
      addText(
        canvas,
        context,
        {
          id: `${layer.id}-${index}-description`,
          type: "subtitle",
          text: item.description,
          visible: true,
        },
        {
          x,
          y: descriptionY,
          width,
          height: y + height - descriptionY,
        },
        {
          preferredFontSize: Math.max(22, 26 * unit),
          minimumFontSize: 16,
          maximumLines: 3,
          weight: 400,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.mutedTextColor,
          lineHeight: 1.2,
        },
      );
    }
  }
}
