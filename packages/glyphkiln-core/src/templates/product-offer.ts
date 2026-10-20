import type { Bounds } from "../domain/types.js";
import {
  addAsset,
  addQuietRegionIssue,
  addText,
  bestContrastingColor,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
} from "./shared.js";
import { productAnnouncementTemplate } from "./product-announcement.js";
import type { TemplateDefinition } from "./types.js";

export const productOfferTemplate: TemplateDefinition = {
  ...productAnnouncementTemplate,
  version: "1.2.0",
  supportedLayers: [...productAnnouncementTemplate.supportedLayers, "logo", "footer"],
  mutuallyExclusiveLayers: [],
  requiredAssetFits: [
    { layerType: "product-screenshot", fit: "contain" },
    { layerType: "logo", fit: "contain" },
  ],
  constraints: {
    headlineMaximumLines: 3,
    safeAreaBehavior:
      "Keep product, logo, offer, action, and terms inside the brand safe area.",
    layout:
      "Product and offer: columns in landscape, stacked copy and contained product in square or portrait.",
  },
  render(context) {
    const canvas = createTemplateCanvas(context);
    const safe = canvas.safeArea;
    const layers = context.document.layers;
    const product = findLayer(layers, "product-screenshot");
    const logo = findLayer(layers, "logo");
    const eyebrow = findLayer(layers, "eyebrow");
    const badge = findLayer(layers, "badge");
    const headline = findLayer(layers, "headline")!;
    const subtitle = findLayer(layers, "subtitle");
    const cta = findLayer(layers, "cta");
    const footer = findLayer(layers, "footer");
    const landscape = canvas.scene.dimensions.width > canvas.scene.dimensions.height;
    const unit = Math.min(safe.width / 920, safe.height / 920);
    const gap = 24 * unit;
    const headerHeight = 54 * unit;
    const footerHeight = footer === undefined ? 0 : 50 * unit;
    const actionHeight = cta === undefined ? 0 : 76 * unit;
    const actionY = safe.y + safe.height - footerHeight - actionHeight;
    const contentY =
      safe.y + (logo !== undefined || eyebrow !== undefined ? headerHeight + gap : 0);
    const contentHeight = actionY - gap - contentY;
    const copy: Bounds = {
      x: safe.x,
      y: contentY,
      width: product !== undefined && landscape ? safe.width * 0.48 : safe.width,
      height:
        product !== undefined && !landscape ? contentHeight * 0.49 : contentHeight,
    };
    if (logo !== undefined) {
      const asset = context.assets.get(logo.assetId);
      const height = Math.min(
        headerHeight,
        (safe.width * 0.23 * asset.height) / asset.width,
      );
      addAsset(canvas, context, logo, {
        x: safe.x,
        y: safe.y,
        width: (height * asset.width) / asset.height,
        height,
      });
    }
    if (eyebrow !== undefined) {
      addText(
        canvas,
        context,
        eyebrow,
        {
          x: logo === undefined ? safe.x : safe.x + safe.width * 0.28,
          y: safe.y + 12 * unit,
          width: logo === undefined ? safe.width : safe.width * 0.72,
          height: 34 * unit,
        },
        {
          preferredFontSize: 23 * unit,
          minimumFontSize: 14,
          maximumLines: 1,
          weight: 700,
          lineHeight: 1,
        },
      );
    }
    let titleY = copy.y;
    if (badge !== undefined) {
      const fill = badge.color ?? canvas.accentColor;
      const text = addText(
        canvas,
        context,
        {
          id: badge.id,
          type: "eyebrow",
          visible: true,
          text: badge.text,
        },
        {
          x: copy.x + 18 * unit,
          y: copy.y + 12 * unit,
          width: copy.width - 36 * unit,
          height: 30 * unit,
        },
        {
          preferredFontSize: 23 * unit,
          minimumFontSize: 14,
          maximumLines: 1,
          weight: 700,
          color: bestContrastingColor(fill, [canvas.textColor, canvas.backgroundColor]),
          contrastBackgroundColor: fill,
          lineHeight: 1,
        },
      );
      canvas.scene.elements.splice(canvas.scene.elements.length - 1, 0, {
        id: `${badge.id}-background`,
        type: "rect",
        x: copy.x,
        y: copy.y,
        width: text.bounds.width + 36 * unit,
        height: 54 * unit,
        fill,
        radius: 4 * unit,
      });
      titleY += 54 * unit + gap;
    }
    const subtitleHeight = subtitle === undefined ? 0 : 88 * unit + gap;
    const title = addText(
      canvas,
      context,
      headline,
      {
        x: copy.x,
        y: titleY,
        width: copy.width,
        height: copy.y + copy.height - titleY - subtitleHeight,
      },
      {
        preferredFontSize: (landscape ? 112 : 78) * unit,
        minimumFontSize: 28,
        maximumLines: 3,
        weight: 800,
        lineHeight: 1.06,
      },
    );
    addQuietRegionIssue(canvas, context, title.bounds);
    let copyBottom = title.bounds.y + title.bounds.height;
    if (subtitle !== undefined) {
      const support = addText(
        canvas,
        context,
        subtitle,
        {
          x: copy.x,
          y: title.bounds.y + title.bounds.height + gap,
          width: copy.width,
          height: 88 * unit,
        },
        {
          preferredFontSize: 28 * unit,
          minimumFontSize: 16,
          maximumLines: 2,
          weight: 400,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.mutedTextColor,
          lineHeight: 1.2,
        },
      );
      copyBottom = support.bounds.y + support.bounds.height;
    }
    if (product !== undefined) {
      const box: Bounds = landscape
        ? {
            x: safe.x + safe.width * 0.54,
            y: contentY,
            width: safe.width * 0.46,
            height: contentHeight,
          }
        : {
            x: safe.x,
            y: copyBottom + gap,
            width: safe.width,
            height: contentY + contentHeight - copyBottom - gap,
          };
      canvas.scene.elements.push({
        id: "product-stage",
        type: "rect",
        ...box,
        fill: context.document.brand.themes[context.document.mode].surface,
        radius: context.document.brand.borderRadii[1] ?? 0,
      });
      const image = addAsset(canvas, context, product, {
        x: box.x + gap,
        y: box.y + gap,
        width: box.width - gap * 2,
        height: box.height - gap * 2,
      });
      image.clipRadius = 0;
    }
    if (cta !== undefined) {
      const fill = canvas.accentColor;
      const width = landscape ? copy.width : safe.width;
      canvas.scene.elements.push({
        id: `${cta.id}-background`,
        type: "rect",
        x: safe.x,
        y: actionY,
        width,
        height: actionHeight,
        fill,
        radius: context.document.brand.borderRadii[0]!,
      });
      addText(
        canvas,
        context,
        cta,
        {
          x: safe.x + gap,
          y: actionY + 22 * unit,
          width: width - gap * 2,
          height: 34 * unit,
        },
        {
          preferredFontSize: 27 * unit,
          minimumFontSize: 16,
          maximumLines: 1,
          weight: 700,
          align: "center",
          lineHeight: 1,
          family: context.document.brand.typography.bodyFamily,
          color: bestContrastingColor(fill, [canvas.textColor, canvas.backgroundColor]),
          contrastBackgroundColor: fill,
        },
      );
    }
    if (footer !== undefined) {
      addText(
        canvas,
        context,
        footer,
        {
          x: safe.x,
          y: safe.y + safe.height - footerHeight + 14 * unit,
          width: safe.width,
          height: footerHeight - 14 * unit,
        },
        {
          preferredFontSize: 18 * unit,
          minimumFontSize: 12,
          maximumLines: 2,
          weight: 400,
          lineHeight: 1.15,
          family: context.document.brand.typography.bodyFamily,
          color: canvas.mutedTextColor,
        },
      );
    }
    return finishTemplate(canvas);
  },
};
