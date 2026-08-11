import {
  decodeRasterForContrast,
  inspectImageTextContrast,
  type ContrastRaster,
} from "../assets/image-contrast.js";
import { IMAGE_TREATMENTS } from "../assets/image-policy.js";
import type { Bounds, QualityIssue } from "../domain/types.js";
import type { BrandTypographyRole, ImageTreatmentId } from "../schema/index.js";
import {
  addAsset,
  addDecorativeBar,
  addFocalImage,
  addText,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
  type TemplateCanvas,
  type TextLayer,
} from "./shared.js";
import { IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT } from "./image-led-campaign-contract.js";
import type { TemplateRenderContext, TemplateDefinition } from "./types.js";

export const imageLedCampaignTemplate: TemplateDefinition = {
  id: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.id,
  version: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.version,
  requiredLayers: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.requiredLayers,
  supportedLayers: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.supportedLayers,
  supportedFormats: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.supportedFormats,
  requiredAssetFits: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.requiredAssetFits,
  constraints: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.constraints,
  render(context) {
    const canvas = createTemplateCanvas(context);
    const image = findLayer(context.document.layers, "image")!;
    const logo = findLayer(context.document.layers, "logo")!;
    const headline = findLayer(context.document.layers, "headline")!;
    const eyebrow = findLayer(context.document.layers, "eyebrow");
    const subtitle = findLayer(context.document.layers, "subtitle");
    const cta = findLayer(context.document.layers, "cta");
    const dimensions = canvas.scene.dimensions;
    const fullCanvas = { x: 0, y: 0, ...dimensions };
    const focal = addFocalImage(canvas, context, image, fullCanvas);
    const contrastRaster = decodeRasterForContrast(context.assets.get(image.assetId));
    const treatment = imageTreatment(image);
    addTreatment(canvas, image.id, treatment, fullCanvas);

    const safe = canvas.safeArea;
    const landscape = dimensions.width / dimensions.height > 1.35;
    const unit = Math.min(dimensions.width, dimensions.height) / 1_080;
    const copyWidth = landscape ? safe.width * 0.56 : safe.width * 0.82;
    const logoHeight = 70 * unit;
    addAsset(canvas, context, logo, {
      x: safe.x,
      y: safe.y,
      width: Math.min(copyWidth * 0.3, 112 * unit),
      height: logoHeight,
    });
    addDecorativeBar(
      canvas,
      {
        x: safe.x,
        y: safe.y + logoHeight + 28 * unit,
        width: 64 * unit,
        height: 7 * unit,
      },
      "image-led-accent",
    );

    const roles = typographyRoles(context);
    let copyY = safe.y + logoHeight + 58 * unit;
    if (eyebrow !== undefined) {
      const element = addRoleText(
        canvas,
        context,
        eyebrow,
        {
          x: safe.x,
          y: copyY,
          width: copyWidth,
          height: 42 * unit,
        },
        roles.label,
        {
          preferredFontSize: 22 * unit,
          minimumFontSize: 14,
          maximumLines: 1,
          fallbackFamily: context.document.brand.typography.bodyFamily,
          fallbackWeight: 700,
          fallbackLineHeight: 1,
        },
      );
      addCompositedContrast(canvas, contrastRaster, focal.crop, treatment, element);
      copyY += 62 * unit;
    }

    const headlineElement = addRoleText(
      canvas,
      context,
      headline,
      {
        x: safe.x,
        y: copyY,
        width: copyWidth,
        height: landscape ? safe.height * 0.47 : safe.height * 0.43,
      },
      roles.display,
      {
        preferredFontSize: landscape ? 72 * unit : 82 * unit,
        minimumFontSize: 30,
        maximumLines: 4,
        fallbackFamily: context.document.brand.typography.headlineFamily,
        fallbackWeight: 800,
        fallbackLineHeight: 0.98,
      },
    );
    addCompositedContrast(
      canvas,
      contrastRaster,
      focal.crop,
      treatment,
      headlineElement,
    );

    if (subtitle !== undefined) {
      const element = addRoleText(
        canvas,
        context,
        subtitle,
        {
          x: safe.x,
          y: copyY + headlineElement.bounds.height + 26 * unit,
          width: copyWidth * 0.92,
          height: 110 * unit,
        },
        roles.body,
        {
          preferredFontSize: 27 * unit,
          minimumFontSize: 17,
          maximumLines: 3,
          fallbackFamily: context.document.brand.typography.bodyFamily,
          fallbackWeight: 400,
          fallbackLineHeight: 1.24,
        },
      );
      addCompositedContrast(canvas, contrastRaster, focal.crop, treatment, element);
    }

    if (cta !== undefined) {
      const element = addRoleText(
        canvas,
        context,
        cta,
        {
          x: safe.x,
          y: safe.y + safe.height - 44 * unit,
          width: copyWidth,
          height: 38 * unit,
        },
        roles.label,
        {
          preferredFontSize: 20 * unit,
          minimumFontSize: 14,
          maximumLines: 1,
          fallbackFamily: context.document.brand.typography.bodyFamily,
          fallbackWeight: 700,
          fallbackLineHeight: 1,
        },
      );
      addCompositedContrast(canvas, contrastRaster, focal.crop, treatment, element);
    }

    return finishTemplate(canvas);
  },
};

type RoleSet = {
  display: BrandTypographyRole | undefined;
  body: BrandTypographyRole | undefined;
  label: BrandTypographyRole | undefined;
};

function typographyRoles(context: TemplateRenderContext): RoleSet {
  const typography = context.document.brand.typography;
  if (!("roles" in typography) || typography.roles === undefined) {
    return { display: undefined, body: undefined, label: undefined };
  }
  return {
    display: typography.roles.display,
    body: typography.roles.body,
    label: typography.roles.label,
  };
}

function addRoleText(
  canvas: TemplateCanvas,
  context: TemplateRenderContext,
  layer: TextLayer,
  box: Bounds,
  role: BrandTypographyRole | undefined,
  fallback: {
    preferredFontSize: number;
    minimumFontSize: number;
    maximumLines: number;
    fallbackFamily: string;
    fallbackWeight: number;
    fallbackLineHeight: number;
  },
) {
  return addText(canvas, context, layer, box, {
    preferredFontSize: fallback.preferredFontSize,
    minimumFontSize: fallback.minimumFontSize,
    maximumLines: fallback.maximumLines,
    family: role?.family ?? fallback.fallbackFamily,
    weight: role?.weight ?? fallback.fallbackWeight,
    lineHeight: role?.lineHeight ?? fallback.fallbackLineHeight,
    ...(role === undefined ? {} : { tracking: role.tracking }),
    checkContrast: false,
  });
}

function imageTreatment(
  layer: ReturnType<typeof findLayer<"image">>,
): ImageTreatmentId {
  if (layer === undefined || !("treatment" in layer)) return "none";
  return layer.treatment ?? "none";
}

function addTreatment(
  canvas: TemplateCanvas,
  imageLayerId: string,
  treatmentId: ImageTreatmentId,
  bounds: Bounds,
): void {
  const treatment = IMAGE_TREATMENTS[treatmentId];
  if (treatment.opacity === 0) return;
  canvas.scene.elements.push({
    id: `${imageLayerId}-treatment`,
    type: "rect",
    ...bounds,
    fill: treatment.color,
    opacity: treatment.opacity,
  });
}

function addCompositedContrast(
  canvas: TemplateCanvas,
  raster: ContrastRaster,
  crop: ReturnType<typeof addFocalImage>["crop"],
  treatment: ImageTreatmentId,
  text: ReturnType<typeof addText>,
): void {
  const evidence = inspectImageTextContrast({
    layerId: text.id,
    raster,
    crop,
    textBounds: text.bounds,
    foreground: text.fill,
    sceneBackground: canvas.backgroundColor,
    treatment,
  });
  canvas.evidence.contrast.push(evidence);
  if (evidence.minimumRatio >= evidence.minimumRequired) return;
  const issue: QualityIssue = {
    code: "LOW_TEXT_CONTRAST",
    severity: "error",
    message: `Composited image contrast ratio ${evidence.minimumRatio.toFixed(2)} is below ${evidence.minimumRequired.toFixed(1)}.`,
    layerId: text.id,
    details: {
      policyVersion: evidence.policyVersion,
      foreground: evidence.foreground,
      minimum: evidence.minimumRequired,
      minimumRatio: evidence.minimumRatio,
      maximumRatio: evidence.maximumRatio,
      sampleCount: evidence.samples.length,
    },
  };
  canvas.qualityIssues.push(issue);
}
