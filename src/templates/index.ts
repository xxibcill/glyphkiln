import { GlyphkilnError, type QualityIssue } from "../domain/types.js";
import type { DesignDocument, TemplateId } from "../schema/index.js";
import { articleCoverTemplate } from "./article-cover.js";
import { productAnnouncementTemplate } from "./product-announcement.js";
import { quoteCardTemplate } from "./quote-card.js";
import { statisticCardTemplate } from "./statistic-card.js";
import type { TemplateDefinition } from "./types.js";

export const TEMPLATE_REGISTRY: Readonly<Record<TemplateId, TemplateDefinition>> =
  Object.freeze({
    "product-announcement": productAnnouncementTemplate,
    "statistic-card": statisticCardTemplate,
    "quote-card": quoteCardTemplate,
    "article-cover": articleCoverTemplate,
  });

export function getTemplate(document: DesignDocument): TemplateDefinition {
  const template = TEMPLATE_REGISTRY[document.template.id];
  if (document.template.version !== template.version) {
    throw new GlyphkilnError(
      `Unsupported template version ${document.template.id}@${document.template.version}.`,
      "UNSUPPORTED_TEMPLATE_VERSION",
      { supportedVersion: template.version },
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
  const visibleTypes = new Set(
    document.layers.filter((layer) => layer.visible).map((layer) => layer.type),
  );
  return template.requiredLayers
    .filter((type) => !visibleTypes.has(type))
    .map((type) => ({
      code: "REQUIRED_LAYER_MISSING",
      severity: "error",
      message: `Template "${template.id}" requires a visible "${type}" layer.`,
      details: { templateId: template.id, layerType: type },
    }));
}

export type {
  TemplateDefinition,
  TemplateRenderContext,
  TemplateRenderResult,
} from "./types.js";
