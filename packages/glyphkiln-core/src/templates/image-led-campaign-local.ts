import {
  decodeRasterForContrast,
  inspectImageTextContrast,
  type ContrastRaster,
} from "../assets/image-contrast.js";
import {
  IMAGE_TREATMENTS,
  LOCAL_IMAGE_TREATMENTS,
  LOCAL_IMAGE_TREATMENT_POLICY_VERSION,
} from "../assets/image-policy.js";
import type { Bounds, QualityIssue } from "../domain/types.js";
import type { PathElement, RectElement, TextElement } from "../renderer/scene.js";
import type {
  BrandTypographyRole,
  ImageTreatmentId,
  LocalImageTreatmentId,
} from "../schema/index.js";
import type { AccentShape } from "./accent-budget.js";
import { IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT } from "./image-led-campaign-contract.js";
import {
  addAsset,
  addFocalImage,
  createTemplateCanvas,
  findLayer,
  finishTemplate,
  type TemplateCanvas,
  type TextLayer,
} from "./shared.js";
import {
  addTypesetText,
  enforceAccentBudget,
  resolveColorRoles,
  typesetWithoutOrphan,
  type TypesetOptions,
} from "./typeset.js";
import type { TemplateDefinition, TemplateRenderContext } from "./types.js";

/**
 * image-led-campaign@1.2.0: full-bleed photograph with copy set beside the
 * product instead of over it, and local rather than global darkening.
 *
 * - An optional `subjectRegion` (normalized, in source-image coordinates)
 *   marks the product. The copy column goes into the largest free side of the
 *   safe area that keeps a margin from the subject.
 * - `local-dark-scrim` / `local-light-scrim` composite a feathered field only
 *   behind the copy block. The feather stops short of the subject, and every
 *   scrim layer is masked out of the subject region, so product color is never
 *   darkened. Global `dark-scrim` / `light-scrim` keep their 1.0.x meaning.
 * - Copy uses brand color roles (figure headline, text subtitle, signal CTA,
 *   accent rule or emphasis within the accent budget) and size-dependent
 *   setting. Brand typography roles supply family and weight; their fixed
 *   leading and tracking are replaced by the size curve.
 */
export const imageLedCampaignLocalTemplate: TemplateDefinition = {
  id: "image-led-campaign",
  version: "1.2.0",
  requiredLayers: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.requiredLayers,
  supportedLayers: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.supportedLayers,
  supportedFormats: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.supportedFormats,
  requiredAssetFits: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.requiredAssetFits,
  capabilities: {
    textEmphasis: ["headline", "subtitle"],
    openTypeFeatures: ["headline", "subtitle", "eyebrow", "cta"],
    localImageTreatments: true,
    subjectRegion: true,
  },
  constraints: {
    headlineMaximumLines: 4,
    safeAreaBehavior:
      "Logo and copy stay inside the brand safe area and outside the declared subject region; the focal image is full bleed.",
    layout:
      "Full-bleed photograph with the copy column beside the declared subject and a local scrim behind copy only, so the product keeps its color.",
  },
  render(context) {
    const roles = resolveColorRoles(context);
    const canvas = createTemplateCanvas(context, {
      decoration: "declared-job",
      ground: roles.ground,
    });
    const { document } = context;
    const image = findLayer(document.layers, "image")!;
    const logo = findLayer(document.layers, "logo")!;
    const headline = findLayer(document.layers, "headline")!;
    const eyebrow = findLayer(document.layers, "eyebrow");
    const subtitle = findLayer(document.layers, "subtitle");
    const cta = findLayer(document.layers, "cta");
    const dimensions = canvas.scene.dimensions;
    const fullCanvas = { x: 0, y: 0, ...dimensions };
    const focal = addFocalImage(canvas, context, image, fullCanvas);
    const imageIndex = canvas.scene.elements.length;
    const raster = decodeRasterForContrast(context.assets.get(image.assetId));
    const treatment: ImageTreatmentId =
      "treatment" in image && image.treatment !== undefined ? image.treatment : "none";
    if (treatment === "dark-scrim" || treatment === "light-scrim") {
      const global = IMAGE_TREATMENTS[treatment];
      canvas.scene.elements.push({
        id: `${image.id}-treatment`,
        type: "rect",
        ...fullCanvas,
        fill: global.color,
        opacity: global.opacity,
      });
    }

    const safe = canvas.safeArea;
    const unit = Math.min(dimensions.width, dimensions.height) / 1_080;
    const landscape = dimensions.width / dimensions.height > 1.35;
    const subject = subjectBounds(image, focal.crop.renderedBounds, fullCanvas);
    const region = copyRegion(safe, subject, landscape, unit);
    if (region.overlapsSubject) {
      canvas.qualityIssues.push({
        code: "COPY_OVER_SUBJECT",
        severity: "warning",
        message:
          "No side of the safe area has room for the copy column outside the subject region.",
        layerId: image.id,
        details: { subject, copyRegion: region.bounds },
      });
    }
    const column = region.bounds;
    const accentEmphasis = hasAccentEmphasis(headline) || hasAccentEmphasis(subtitle);
    const roleSet = typographyRoles(context);
    const textOptions = (
      role: BrandTypographyRole | undefined,
      fallback: { family: string; weight: number },
      sizes: Pick<
        TypesetOptions,
        "preferredFontSize" | "minimumFontSize" | "maximumLines"
      >,
      setting: TypesetOptions["role"],
      color: string,
    ): TypesetOptions => ({
      ...sizes,
      family: role?.family ?? fallback.family,
      weight: role?.weight ?? fallback.weight,
      role: setting,
      color,
      palette: { accent: roles.accent, muted: roles.text },
      contrastBackgroundColor: canvas.backgroundColor,
      checkContrast: false,
    });
    const typography = document.brand.typography;
    const copyElements: Bounds[] = [];
    const texts: TextElement[] = [];
    const emphasis: PathElement[] = [];
    const accentShapes: AccentShape[] = [];

    const logoHeight = 70 * unit;
    const logoAsset = context.assets.get(logo.assetId);
    const logoWidth = Math.min(
      Math.min(column.width * 0.3, 112 * unit),
      logoHeight * (logoAsset.width / logoAsset.height),
    );
    const logoBox = { x: column.x, y: column.y, width: logoWidth, height: logoHeight };
    addAsset(canvas, context, logo, logoBox);
    copyElements.push(logoBox);
    let cursor = column.y + logoHeight + 28 * unit;
    if (!accentEmphasis) {
      const bar = { x: column.x, y: cursor, width: 64 * unit, height: 7 * unit };
      const rect: RectElement = {
        id: "image-led-accent",
        type: "rect",
        ...bar,
        fill: roles.accent,
        radius: Math.min(bar.height / 2, canvas.spacingUnit),
      };
      canvas.scene.elements.push(rect);
      accentShapes.push({ kind: "rect", bounds: bar });
      copyElements.push(bar);
    }
    cursor += 30 * unit;

    const ctaElements: Bounds[] = [];
    const place = (
      layer: TextLayer,
      box: Bounds,
      options: TypesetOptions,
      cluster: Bounds[] = copyElements,
    ): TextElement => {
      const result = addTypesetText(canvas, context, layer, box, options);
      texts.push(result.element);
      emphasis.push(...result.emphasis);
      cluster.push(result.element.bounds);
      return result.element;
    };

    const ctaHeight = cta === undefined ? 0 : 44 * unit;
    if (eyebrow !== undefined) {
      const element = place(
        eyebrow,
        { x: column.x, y: cursor, width: column.width, height: 42 * unit },
        textOptions(
          roleSet.label,
          { family: typography.bodyFamily, weight: 700 },
          { preferredFontSize: 22 * unit, minimumFontSize: 14, maximumLines: 1 },
          "label",
          roles.text,
        ),
      );
      cursor = element.bounds.y + element.bounds.height + 20 * unit;
    }
    const remaining = column.y + column.height - ctaHeight - cursor;
    const headlineBox = {
      x: column.x,
      y: cursor,
      width: column.width,
      height: Math.max(1, remaining * (subtitle === undefined ? 0.9 : 0.62)),
    };
    const headlineElement = place(
      headline,
      headlineBox,
      typesetWithoutOrphan(
        context,
        canvas,
        headline,
        headlineBox,
        textOptions(
          roleSet.display,
          { family: typography.headlineFamily, weight: 800 },
          {
            preferredFontSize: (landscape ? 140 : 150) * unit,
            minimumFontSize: 30,
            maximumLines: 4,
          },
          "text",
          roles.figure,
        ),
      ),
    );
    cursor = headlineElement.bounds.y + headlineElement.bounds.height + 26 * unit;
    if (subtitle !== undefined) {
      const subtitleBox = {
        x: column.x,
        y: cursor,
        width: column.width * 0.92,
        height: Math.max(1, column.y + column.height - ctaHeight - cursor),
      };
      place(
        subtitle,
        subtitleBox,
        typesetWithoutOrphan(
          context,
          canvas,
          subtitle,
          subtitleBox,
          textOptions(
            roleSet.body,
            { family: typography.bodyFamily, weight: 400 },
            { preferredFontSize: 30 * unit, minimumFontSize: 17, maximumLines: 3 },
            "text",
            roles.text,
          ),
        ),
      );
    }
    if (cta !== undefined) {
      place(
        cta,
        {
          x: column.x,
          y: column.y + column.height - 38 * unit,
          width: column.width,
          height: 38 * unit,
        },
        textOptions(
          roleSet.label,
          { family: typography.bodyFamily, weight: 700 },
          { preferredFontSize: 22 * unit, minimumFontSize: 14, maximumLines: 1 },
          "label",
          roles.signal,
        ),
        ctaElements,
      );
    }

    if (treatment === "local-dark-scrim" || treatment === "local-light-scrim") {
      // The copy stack and a distant CTA get separate scrims, so the area
      // between them is not darkened.
      const stack = union(copyElements);
      const clusters =
        ctaElements.length === 0
          ? [{ id: "", bounds: stack }]
          : separation(stack, union(ctaElements)) > 176 * unit
            ? [
                { id: "", bounds: stack },
                { id: "-cta", bounds: union(ctaElements) },
              ]
            : [{ id: "", bounds: union([...copyElements, ...ctaElements]) }];
      const scrim = clusters.flatMap((cluster) =>
        localScrim(
          `${image.id}-treatment${cluster.id}`,
          treatment,
          cluster.bounds,
          subject,
          fullCanvas,
          unit,
        ),
      );
      canvas.scene.elements.splice(imageIndex, 0, ...scrim);
    }
    for (const text of texts) {
      addCompositedContrast(canvas, raster, focal.crop, treatment, text);
    }
    for (const run of emphasis) {
      addCompositedContrast(canvas, raster, focal.crop, treatment, {
        id: run.id,
        fill: run.fill,
        bounds: run.glyphRun!.bounds,
      });
    }
    enforceAccentBudget(
      canvas,
      roles,
      accentShapes,
      emphasis.filter((element) => element.fill === roles.accent),
    );
    return finishTemplate(canvas);
  },
};

function hasAccentEmphasis(layer: TextLayer | undefined): boolean {
  if (layer === undefined || !("emphasis" in layer)) return false;
  return (layer.emphasis ?? []).some(
    (span) => span.style === "accent" || span.style === "strong-accent",
  );
}

function typographyRoles(context: TemplateRenderContext): {
  display: BrandTypographyRole | undefined;
  body: BrandTypographyRole | undefined;
  label: BrandTypographyRole | undefined;
} {
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

/** The subject region mapped from source-image space onto the canvas. */
export function subjectBounds(
  image: ReturnType<typeof findLayer<"image">>,
  rendered: Bounds,
  canvas: Bounds,
): Bounds | undefined {
  if (image === undefined || !("subjectRegion" in image)) return undefined;
  const region = image.subjectRegion;
  if (region === undefined) return undefined;
  const x0 = Math.max(canvas.x, rendered.x + region.x * rendered.width);
  const y0 = Math.max(canvas.y, rendered.y + region.y * rendered.height);
  const x1 = Math.min(
    canvas.x + canvas.width,
    rendered.x + (region.x + region.width) * rendered.width,
  );
  const y1 = Math.min(
    canvas.y + canvas.height,
    rendered.y + (region.y + region.height) * rendered.height,
  );
  if (x1 <= x0 || y1 <= y0) return undefined;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

type SideId = "left" | "right" | "top" | "bottom";

/**
 * Choose the copy column. Without a subject: the 1.0.x position (left column
 * in landscape, upper copy band otherwise). With one: the largest free side of
 * the safe area that keeps a 64-unit margin from it and is at least 34% of the
 * safe width and 28% of its height; ties keep the order left, right, top,
 * bottom.
 */
export function copyRegion(
  safe: Bounds,
  subject: Bounds | undefined,
  landscape: boolean,
  unit: number,
): { bounds: Bounds; side: SideId | "default"; overlapsSubject: boolean } {
  const maximumWidth = safe.width * (landscape ? 0.56 : 0.82);
  const fallback = {
    x: safe.x,
    y: safe.y,
    width: maximumWidth,
    height: safe.height,
  };
  if (subject === undefined) {
    return { bounds: fallback, side: "default", overlapsSubject: false };
  }
  const margin = 64 * unit;
  const right = safe.x + safe.width;
  const bottom = safe.y + safe.height;
  const sides: { side: SideId; bounds: Bounds }[] = [
    {
      side: "left",
      bounds: {
        x: safe.x,
        y: safe.y,
        width: subject.x - margin - safe.x,
        height: safe.height,
      },
    },
    {
      side: "right",
      bounds: {
        x: subject.x + subject.width + margin,
        y: safe.y,
        width: right - (subject.x + subject.width + margin),
        height: safe.height,
      },
    },
    {
      side: "top",
      bounds: {
        x: safe.x,
        y: safe.y,
        width: safe.width,
        height: subject.y - margin - safe.y,
      },
    },
    {
      side: "bottom",
      bounds: {
        x: safe.x,
        y: subject.y + subject.height + margin,
        width: safe.width,
        height: bottom - (subject.y + subject.height + margin),
      },
    },
  ];
  let best: { side: SideId; bounds: Bounds } | undefined;
  for (const candidate of sides) {
    const { width, height } = candidate.bounds;
    if (width < safe.width * 0.34 || height < safe.height * 0.28) continue;
    if (
      best === undefined ||
      width * height > best.bounds.width * best.bounds.height + 1e-9
    ) {
      best = candidate;
    }
  }
  if (best === undefined) {
    return {
      bounds: fallback,
      side: "default",
      overlapsSubject: intersects(fallback, subject),
    };
  }
  const width = Math.min(best.bounds.width, maximumWidth);
  const x = best.side === "right" ? right - width : best.bounds.x;
  return {
    bounds: { ...best.bounds, x, width },
    side: best.side,
    overlapsSubject: false,
  };
}

/**
 * Feathered local scrim: `steps` stacked rectangles composite to the
 * treatment opacity over the copy block and fade out beyond it. Each side
 * fades over its own reach: 176 units in open directions, and only up to a
 * 12-unit gap short of the subject on a side that faces it. Every layer is
 * also masked out of the subject, so product color is never darkened even
 * when copy has to overlap it.
 */
export function localScrim(
  id: string,
  treatmentId: LocalImageTreatmentId,
  copy: Bounds,
  subject: Bounds | undefined,
  canvas: Bounds,
  unit: number,
): RectElement[] {
  const treatment = LOCAL_IMAGE_TREATMENTS[treatmentId];
  const open = 176 * unit;
  const clearance = 12 * unit;
  const reach = { left: open, right: open, top: open, bottom: open };
  if (subject !== undefined && !intersects(copy, subject)) {
    const copyRight = copy.x + copy.width;
    const copyBottom = copy.y + copy.height;
    if (subject.x >= copyRight) reach.right = subject.x - copyRight - clearance;
    if (subject.x + subject.width <= copy.x)
      reach.left = copy.x - (subject.x + subject.width) - clearance;
    if (subject.y >= copyBottom) reach.bottom = subject.y - copyBottom - clearance;
    if (subject.y + subject.height <= copy.y)
      reach.top = copy.y - (subject.y + subject.height) - clearance;
  }
  for (const side of ["left", "right", "top", "bottom"] as const) {
    reach[side] = Math.max(0, Math.min(open, reach[side]));
  }
  // A third of each reach stays at full strength as padding around the copy.
  const core = {
    x: copy.x - reach.left / 3,
    y: copy.y - reach.top / 3,
    width: copy.width + (reach.left + reach.right) / 3,
    height: copy.height + (reach.top + reach.bottom) / 3,
  };
  const fade = {
    left: (reach.left * 2) / 3,
    right: (reach.right * 2) / 3,
    top: (reach.top * 2) / 3,
    bottom: (reach.bottom * 2) / 3,
  };
  const layerOpacity = 1 - Math.pow(1 - treatment.opacity, 1 / treatment.steps);
  const layers: RectElement[] = [];
  for (let step = treatment.steps - 1; step >= 0; step -= 1) {
    const t = step / (treatment.steps - 1);
    const bounds = clip(
      {
        x: core.x - fade.left * t,
        y: core.y - fade.top * t,
        width: core.width + (fade.left + fade.right) * t,
        height: core.height + (fade.top + fade.bottom) * t,
      },
      canvas,
    );
    layers.push({
      id: `${id}-${treatment.steps - 1 - step}`,
      type: "rect",
      ...bounds,
      fill: treatment.color,
      opacity: round(layerOpacity),
      radius: round(Math.min(fade.left, fade.right, fade.top, fade.bottom) * t),
      ...(subject === undefined
        ? {}
        : {
            exclusion: {
              canvas: { width: canvas.width, height: canvas.height },
              bounds: subject,
            },
          }),
    });
  }
  return layers;
}

/** Gap between two rectangles along the axis that separates them (0 if they touch). */
function separation(a: Bounds, b: Bounds): number {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.max(dx, dy);
}

function intersects(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function clip(bounds: Bounds, canvas: Bounds): Bounds {
  const x = Math.max(canvas.x, bounds.x);
  const y = Math.max(canvas.y, bounds.y);
  return {
    x,
    y,
    width: Math.min(canvas.x + canvas.width, bounds.x + bounds.width) - x,
    height: Math.min(canvas.y + canvas.height, bounds.y + bounds.height) - y,
  };
}

function union(boxes: readonly Bounds[]): Bounds {
  const x0 = Math.min(...boxes.map((box) => box.x));
  const y0 = Math.min(...boxes.map((box) => box.y));
  const x1 = Math.max(...boxes.map((box) => box.x + box.width));
  const y1 = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function addCompositedContrast(
  canvas: TemplateCanvas,
  raster: ContrastRaster,
  crop: ReturnType<typeof addFocalImage>["crop"],
  treatment: ImageTreatmentId,
  text: { id: string; fill: string; bounds: Bounds },
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
      treatmentPolicyVersion: LOCAL_IMAGE_TREATMENT_POLICY_VERSION,
      foreground: evidence.foreground,
      minimum: evidence.minimumRequired,
      minimumRatio: evidence.minimumRatio,
      maximumRatio: evidence.maximumRatio,
      sampleCount: evidence.samples.length,
    },
  };
  canvas.qualityIssues.push(issue);
}
