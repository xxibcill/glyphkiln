import { IMAGE_TREATMENTS } from "../assets/image-policy.js";
import type { Bounds } from "../domain/types.js";
import type { BrandTypographyRole } from "../schema/index.js";
import {
  addAsset,
  addFocalImage,
  addText,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
  type TemplateCanvas,
  type TextLayer,
} from "./shared.js";
import { tiktokCarouselSlideV1_0_4Template } from "./tiktok-carousel-slide-v1-0-4.js";
import type { TemplateDefinition, TemplateRenderContext } from "./types.js";

export const splitEditorialCampaignTemplate: TemplateDefinition = {
  id: "image-led-campaign",
  version: "1.1.0",
  requiredLayers: ["image", "logo", "headline"],
  supportedLayers: [
    "background",
    "image",
    "logo",
    "eyebrow",
    "headline",
    "subtitle",
    "cta",
  ],
  supportedFormats: ["linkedin-landscape", "instagram-square", "instagram-portrait"],
  requiredAssetFits: [
    { layerType: "image", fit: "cover" },
    { layerType: "logo", fit: "contain" },
  ],
  constraints: {
    headlineMaximumLines: 4,
    safeAreaBehavior:
      "Image, logo, and copy stay inside the brand safe area, with separate image and text regions.",
    layout:
      "Landscape and square pair a left editorial column with a right image; portrait stacks an image above copy. Typography honors brand roles with a 1.08 leading floor.",
  },
  render: renderImageEditorial,
};

export const imageCarouselTemplate: TemplateDefinition = {
  ...tiktokCarouselSlideV1_0_4Template,
  version: "1.1.0",
  supportedLayers: [...tiktokCarouselSlideV1_0_4Template.supportedLayers, "image"],
  requiredAssetFits: [{ layerType: "image", fit: "cover" }],
  constraints: {
    headlineMaximumLines: 4,
    safeAreaBehavior:
      "Images and semantic content honor the brand safe area plus organic carousel interface insets.",
    layout:
      "An optional focal image anchors a numbered editorial slide with separate caption and action regions. Slides without images retain the 1.0.4 typography composition.",
  },
  render(context) {
    return findLayer(context.document.layers, "image") === undefined
      ? tiktokCarouselSlideV1_0_4Template.render(context)
      : renderImageEditorial(context);
  },
};

export const balancedEditorialCampaignTemplate: TemplateDefinition = {
  ...splitEditorialCampaignTemplate,
  version: "1.1.1",
  constraints: {
    ...splitEditorialCampaignTemplate.constraints,
    layout:
      "Square gives the subject a wider image column; portrait pairs a taller image with larger display typography. Copy stays separate from photography.",
  },
  render: (context) => renderImageEditorial(context, true),
};

export const balancedImageCarouselTemplate: TemplateDefinition = {
  ...imageCarouselTemplate,
  version: "1.1.1",
  constraints: {
    ...imageCarouselTemplate.constraints,
    layout:
      "Image and typography slides share header, numbering, and action alignment. Image-free slides use a large display statement in an open editorial field.",
  },
  render: (context) => renderImageEditorial(context, true),
};

function renderImageEditorial(context: TemplateRenderContext, balanced = false) {
  const canvas = createTemplateCanvas(context);
  const carousel = context.document.template.id === "tiktok-carousel-slide";
  const { width, height } = canvas.scene.dimensions;
  if (carousel) {
    const requested = canvas.safeArea;
    const x = Math.max(requested.x, width * 0.06);
    const y = Math.max(requested.y, height * 0.06);
    canvas.safeArea = {
      x,
      y,
      width: Math.max(0, Math.min(requested.x + requested.width, width * 0.86) - x),
      height: Math.max(0, Math.min(requested.y + requested.height, height * 0.92) - y),
    };
  }
  const safe = canvas.safeArea;
  const unit = (balanced ? width : Math.min(width, height)) / 1080;
  const gap = 28 * unit;
  const headerHeight = 64 * unit;
  const landscape = width >= height;
  const copyFraction = balanced && width === height ? 0.44 : 0.5;
  const image = findLayer(context.document.layers, "image");
  const headline = findLayer(context.document.layers, "headline")!;
  const subtitle = findLayer(context.document.layers, "subtitle");
  const statistic = findLayer(context.document.layers, "statistic");
  const cta = findLayer(context.document.layers, "cta");
  const footer = findLayer(context.document.layers, "footer");
  const eyebrow = findLayer(context.document.layers, "eyebrow");
  const contentTop = safe.y + headerHeight + gap;
  const bottomReserved = (cta ? 58 * unit : 0) + (footer ? 42 * unit : 0);
  const contentHeight = Math.max(
    unit,
    safe.height - headerHeight - gap - bottomReserved,
  );
  const imageBox: Bounds = landscape
    ? {
        x: safe.x + safe.width * copyFraction + gap / 2,
        y: safe.y,
        width: Math.max(unit, safe.width * (1 - copyFraction) - gap / 2),
        height: safe.height,
      }
    : {
        x: safe.x,
        y: contentTop,
        width: safe.width,
        height: contentHeight * (statistic ? 0.42 : balanced ? 0.6 : 0.52),
      };
  const copyBox: Bounds =
    image === undefined
      ? {
          x: safe.x,
          y: contentTop + contentHeight * 0.2,
          width: safe.width,
          height: contentHeight * 0.8,
        }
      : landscape
        ? {
            x: safe.x,
            y: contentTop,
            width: Math.max(unit, safe.width * copyFraction - gap / 2),
            height: contentHeight,
          }
        : {
            x: safe.x,
            y: imageBox.y + imageBox.height + gap,
            width: safe.width,
            height: Math.max(unit, contentHeight - imageBox.height - gap),
          };

  // An opaque field keeps procedural borders from interfering with editorial copy.
  canvas.scene.elements.push({
    id: "editorial-paper",
    type: "rect",
    ...safe,
    fill: canvas.backgroundColor,
  });
  if (image !== undefined) {
    addFocalImage(canvas, context, image, imageBox);
    const treatment =
      IMAGE_TREATMENTS["treatment" in image ? (image.treatment ?? "none") : "none"];
    if (treatment.opacity > 0) {
      canvas.scene.elements.push({
        id: `${image.id}-treatment`,
        type: "rect",
        ...imageBox,
        fill: treatment.color,
        opacity: treatment.opacity,
      });
    }
  }

  const headerWidth = landscape ? copyBox.width : safe.width;
  const logo = findLayer(context.document.layers, "logo");
  let labelX = safe.x;
  if (logo !== undefined) {
    const asset = context.assets.get(logo.assetId);
    const logoWidth = Math.min(
      headerWidth * 0.22,
      (headerHeight * asset.width) / asset.height,
    );
    addAsset(canvas, context, logo, {
      x: safe.x,
      y: safe.y,
      width: logoWidth,
      height: headerHeight,
    });
    labelX += logoWidth + gap;
  }
  const badge = findLayer(context.document.layers, "badge");
  const badgeWidth = badge ? Math.min(headerWidth * 0.28, 154 * unit) : 0;
  if (badge !== undefined) {
    editorialText(
      canvas,
      context,
      { ...badge, type: "eyebrow" },
      {
        x: safe.x + headerWidth - badgeWidth,
        y: safe.y + 16 * unit,
        width: badgeWidth,
        height: 34 * unit,
      },
      "label",
      23 * unit,
      1,
    );
  }
  if (eyebrow !== undefined) {
    editorialText(
      canvas,
      context,
      eyebrow,
      {
        x: labelX,
        y: safe.y + 16 * unit,
        width: Math.max(
          unit,
          safe.x + headerWidth - labelX - badgeWidth - (badge ? gap : 0),
        ),
        height: 34 * unit,
      },
      "label",
      22 * unit,
      1,
    );
  }

  const hasSupport = subtitle !== undefined || statistic !== undefined;
  const title = editorialText(
    canvas,
    context,
    headline,
    {
      ...copyBox,
      height:
        copyBox.height * (statistic ? 0.38 : hasSupport ? (balanced ? 0.67 : 0.57) : 1),
    },
    "display",
    (image === undefined
      ? 148
      : landscape
        ? 108
        : balanced
          ? 104
          : carousel
            ? 74
            : 70) * unit,
    4,
  );
  const supportingY = title.bounds.y + title.bounds.height + 22 * unit;
  const supportingBox = {
    x: copyBox.x,
    y: supportingY,
    width: copyBox.width,
    height: Math.max(unit, copyBox.y + copyBox.height - supportingY),
  };
  if (subtitle !== undefined) {
    editorialText(
      canvas,
      context,
      subtitle,
      supportingBox,
      "body",
      (balanced ? 34 : 29) * unit,
      3,
    );
  }
  if (statistic !== undefined) {
    const value = editorialText(
      canvas,
      context,
      {
        id: `${statistic.id}-value`,
        type: "headline",
        text: statistic.value,
        visible: true,
      },
      { ...supportingBox, height: supportingBox.height * 0.45 },
      "display",
      76 * unit,
      1,
    );
    const labelY = value.bounds.y + value.bounds.height + 12 * unit;
    editorialText(
      canvas,
      context,
      {
        id: `${statistic.id}-label`,
        type: "subtitle",
        text: statistic.label,
        visible: true,
      },
      {
        x: copyBox.x,
        y: labelY,
        width: copyBox.width,
        height: Math.max(
          unit,
          copyBox.y + copyBox.height - labelY - (statistic.trend ? 32 * unit : 0),
        ),
      },
      "body",
      27 * unit,
      2,
    );
    if (statistic.trend !== undefined) {
      editorialText(
        canvas,
        context,
        {
          id: `${statistic.id}-trend`,
          type: "footer",
          text: statistic.trend,
          visible: true,
        },
        {
          x: copyBox.x,
          y: copyBox.y + copyBox.height - 26 * unit,
          width: copyBox.width,
          height: 26 * unit,
        },
        "label",
        20 * unit,
        1,
      );
    }
  }
  const endY = safe.y + safe.height;
  if (cta !== undefined) {
    const ctaY = endY - bottomReserved + 14 * unit;
    canvas.scene.elements.push({
      id: `${cta.id}-rule`,
      type: "rect",
      x: copyBox.x,
      y: ctaY - 12 * unit,
      width: copyBox.width,
      height: 2 * unit,
      fill: canvas.textColor,
    });
    editorialText(
      canvas,
      context,
      cta,
      { x: copyBox.x, y: ctaY, width: copyBox.width, height: 34 * unit },
      "label",
      23 * unit,
      1,
    );
  }
  if (footer !== undefined) {
    editorialText(
      canvas,
      context,
      footer,
      { x: copyBox.x, y: endY - 30 * unit, width: copyBox.width, height: 30 * unit },
      "label",
      20 * unit,
      1,
    );
  }
  return finishTemplate(canvas);
}

function editorialText(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  layer: TextLayer,
  box: Bounds,
  roleName: "display" | "body" | "label",
  size: number,
  maximumLines: number,
) {
  const typography = context.document.brand.typography;
  const role: BrandTypographyRole | undefined =
    "roles" in typography ? typography.roles?.[roleName] : undefined;
  return addText(canvas, context, layer, box, {
    preferredFontSize: size,
    minimumFontSize: roleName === "display" ? 30 : 16,
    maximumLines,
    family:
      role?.family ??
      (roleName === "display" ? typography.headlineFamily : typography.bodyFamily),
    weight:
      role?.weight ?? (roleName === "display" ? 800 : roleName === "label" ? 700 : 400),
    lineHeight: Math.max(1.08, role?.lineHeight ?? (roleName === "body" ? 1.25 : 1.08)),
    ...(role === undefined ? {} : { tracking: role.tracking }),
    color: roleName === "body" ? canvas.mutedTextColor : canvas.textColor,
  });
}
