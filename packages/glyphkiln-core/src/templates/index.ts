import { GlyphkilnError, type QualityIssue } from "../domain/types.js";
import type { DesignDocument, TemplateId } from "../schema/index.js";
import { articleCoverTemplate } from "./article-cover.js";
import { productAnnouncementTemplate } from "./product-announcement.js";
import { quoteCardTemplate } from "./quote-card.js";
import { statisticCardTemplate } from "./statistic-card.js";
import { tiktokCarouselSlideTemplate } from "./tiktok-carousel-slide.js";
import { tiktokCarouselSlideV1_0_1Template } from "./tiktok-carousel-slide-v1-0-1.js";
import { tiktokCarouselSlideV1_0_3Template } from "./tiktok-carousel-slide-v1-0-3.js";
import type { TemplateDefinition } from "./types.js";

export const TEMPLATE_REGISTRY: Readonly<Record<TemplateId, TemplateDefinition>> =
  Object.freeze({
    "product-announcement": productAnnouncementTemplate,
    "statistic-card": statisticCardTemplate,
    "quote-card": quoteCardTemplate,
    "article-cover": articleCoverTemplate,
    "tiktok-carousel-slide": tiktokCarouselSlideV1_0_3Template,
  });

const TEMPLATE_VERSION_REGISTRY: Readonly<
  Record<TemplateId, readonly TemplateDefinition[]>
> = Object.freeze({
  "product-announcement": Object.freeze([productAnnouncementTemplate]),
  "statistic-card": Object.freeze([statisticCardTemplate]),
  "quote-card": Object.freeze([quoteCardTemplate]),
  "article-cover": Object.freeze([articleCoverTemplate]),
  "tiktok-carousel-slide": Object.freeze([
    tiktokCarouselSlideV1_0_1Template,
    tiktokCarouselSlideTemplate,
    tiktokCarouselSlideV1_0_3Template,
  ]),
});

export function getTemplate(document: DesignDocument): TemplateDefinition {
  const template = TEMPLATE_VERSION_REGISTRY[document.template.id].find(
    (candidate) => candidate.version === document.template.version,
  );
  if (template === undefined) {
    const currentTemplate = TEMPLATE_REGISTRY[document.template.id];
    throw new GlyphkilnError(
      `Unsupported template version ${document.template.id}@${document.template.version}.`,
      "UNSUPPORTED_TEMPLATE_VERSION",
      { supportedVersion: currentTemplate.version },
    );
  }
  if (!template.supportedFormats.includes(document.format)) {
    throw new GlyphkilnError(
      `Template "${template.id}" does not support format "${document.format}".`,
      "UNSUPPORTED_TEMPLATE_FORMAT",
    );
  }
  return template;
}

export function checkTemplateRequirements(
  document: DesignDocument,
  template: TemplateDefinition,
): QualityIssue[] {
  const visibleLayers = document.layers.filter((layer) => layer.visible);
  const visibleTypes = new Set(visibleLayers.map((layer) => layer.type));
  const issues: QualityIssue[] = template.requiredLayers
    .filter((type) => !visibleTypes.has(type))
    .map((type) => ({
      code: "REQUIRED_LAYER_MISSING",
      severity: "error",
      message: `Template "${template.id}" requires a visible "${type}" layer.`,
      details: { templateId: template.id, layerType: type },
    }));
  const supportedTypes = new Set(template.supportedLayers);
  for (const layer of visibleLayers) {
    if (!supportedTypes.has(layer.type)) {
      issues.push({
        code: "UNSUPPORTED_VISIBLE_LAYER",
        severity: "error",
        message: `Template "${template.id}" does not implement visible "${layer.type}" layers.`,
        layerId: layer.id,
        details: { templateId: template.id, layerType: layer.type },
      });
    }
  }
  const firstLayerByType = new Map<DesignDocument["layers"][number]["type"], string>();
  for (const layer of visibleLayers) {
    const firstLayerId = firstLayerByType.get(layer.type);
    if (firstLayerId === undefined) {
      firstLayerByType.set(layer.type, layer.id);
      continue;
    }
    issues.push({
      code: "DUPLICATE_VISIBLE_LAYER",
      severity: "error",
      message: `Template "${template.id}" accepts only one visible "${layer.type}" layer.`,
      layerId: layer.id,
      details: { templateId: template.id, layerType: layer.type, firstLayerId },
    });
  }
  for (const group of template.mutuallyExclusiveLayers ?? []) {
    const present = visibleLayers.filter((layer) => group.includes(layer.type));
    for (const layer of present.slice(1)) {
      issues.push({
        code: "CONFLICTING_VISIBLE_LAYERS",
        severity: "error",
        message: `Template "${template.id}" does not accept "${layer.type}" with "${present[0]!.type}".`,
        layerId: layer.id,
        details: {
          templateId: template.id,
          layerTypes: present.map((item) => item.type),
        },
      });
    }
  }
  return issues;
}

export type {
  TemplateDefinition,
  TemplateRenderContext,
  TemplateRenderResult,
} from "./types.js";
