import corePackage from "@glyphkiln/core/package.json";
import {
  DESIGN_DOCUMENT_VERSION,
  DEVELOPMENT_FONT_SHA256,
  FORMAT_IDS,
  FORMAT_REGISTRY,
  MANIFEST_VERSION,
  PROCEDURAL_ALGORITHM_VERSIONS,
  PROCEDURAL_STYLE_IDS,
  PRODUCT_CLAIM,
  RENDERER_NAME,
  RENDERER_VERSION,
  RENDER_CONFIGURATION,
  TEMPLATE_REGISTRY,
} from "@glyphkiln/core";
import type { ProceduralStyleId } from "@glyphkiln/core";

import type { PreviewCatalog, PreviewTemplateId } from "@/features/project-preview";

export const PREVIEW_TEMPLATE_IDS = [
  "product-announcement",
  "statistic-card",
  "quote-card",
  "article-cover",
  "tiktok-carousel-slide",
] as const satisfies readonly PreviewTemplateId[];

const RESOURCE_BACKED_TEMPLATE_IDS = [
  "image-led-campaign",
] as const satisfies readonly PreviewTemplateId[];

const TEMPLATE_LABELS = {
  "product-announcement": "Product announcement",
  "statistic-card": "Statistic card",
  "quote-card": "Quote card",
  "article-cover": "Article cover",
  "tiktok-carousel-slide": "TikTok carousel slide",
  "image-led-campaign": "Image-led campaign",
} satisfies Record<PreviewTemplateId, string>;

const PROCEDURAL_STYLE_LABELS = {
  "flow-field": "Flow field",
  "layered-waves": "Layered waves",
  "topographic-contours": "Topographic contours",
  "recursive-subdivision": "Recursive subdivision",
} satisfies Record<ProceduralStyleId, string>;

export function createPreviewCatalog(
  options: { resourceBacked?: boolean } = {},
): PreviewCatalog {
  const templateIds: readonly PreviewTemplateId[] =
    options.resourceBacked === true
      ? [...PREVIEW_TEMPLATE_IDS, ...RESOURCE_BACKED_TEMPLATE_IDS]
      : PREVIEW_TEMPLATE_IDS;
  return {
    schemaVersion: DESIGN_DOCUMENT_VERSION,
    manifestVersion: MANIFEST_VERSION,
    coreVersion: corePackage.version,
    renderer: {
      name: RENDERER_NAME,
      version: RENDERER_VERSION,
    },
    productClaim: PRODUCT_CLAIM,
    rendererConfiguration: { ...RENDER_CONFIGURATION },
    developmentFontSha256: DEVELOPMENT_FONT_SHA256,
    formats: FORMAT_IDS.map((id) => ({
      id,
      ...FORMAT_REGISTRY[id],
    })),
    templates: templateIds.map((id) => {
      const template = TEMPLATE_REGISTRY[id];
      return {
        id,
        label: TEMPLATE_LABELS[id],
        version: template.version,
        supportedFormats: template.supportedFormats,
        requiredLayers: template.requiredLayers,
        description: template.constraints.layout,
      };
    }),
    proceduralStyles: PROCEDURAL_STYLE_IDS.map((id) => ({
      id,
      label: PROCEDURAL_STYLE_LABELS[id],
      version: PROCEDURAL_ALGORITHM_VERSIONS[id],
    })),
  };
}
