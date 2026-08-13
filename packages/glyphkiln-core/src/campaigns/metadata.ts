import type { DesignLayer, ImageTreatmentId, TemplateId } from "../schema/index.js";
import type { FormatId } from "../formats/index.js";
import { AUTHORING_TEMPLATE_REGISTRY } from "../authoring/metadata.js";
import { IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT } from "../templates/image-led-campaign-contract.js";
import type { TemplateDefinition } from "../templates/types.js";

export const CAMPAIGN_FAMILY_METADATA_VERSION = "1.1.0" as const;

export const CAMPAIGN_FAMILY_IDS = Object.freeze(["image-led-campaign"] as const);
export type CampaignFamilyId = (typeof CAMPAIGN_FAMILY_IDS)[number];

export const CAMPAIGN_COMPOSITION_VARIANT_IDS = Object.freeze([
  "focal-editorial",
  "organic-photo-editorial",
] as const);
export type CampaignCompositionVariantId =
  (typeof CAMPAIGN_COMPOSITION_VARIANT_IDS)[number];

type ContentLayerType = Extract<
  DesignLayer["type"],
  | "eyebrow"
  | "badge"
  | "headline"
  | "subtitle"
  | "statistic"
  | "cta"
  | "footer"
  | "attribution"
>;
type AssetLayerType = Extract<
  DesignLayer["type"],
  "image" | "logo" | "product-screenshot"
>;

export type CampaignCompositionVariant = {
  readonly id: CampaignCompositionVariantId;
  readonly label: string;
  readonly description: string;
};

export type CampaignFamilyMember = {
  readonly template: {
    readonly id: TemplateId;
    readonly version: TemplateDefinition["version"];
  };
  readonly formats: readonly FormatId[];
  readonly compositionVariants: readonly CampaignCompositionVariant[];
  readonly contentRoles: readonly CampaignContentRole[];
  readonly assetRoles: readonly CampaignAssetRole[];
  readonly safeAreaPolicy: CampaignSafeAreaPolicy;
};

export type CampaignContentRole = {
  readonly layerType: ContentLayerType;
  readonly required: boolean;
};

export type CampaignAssetRole = {
  readonly layerType: AssetLayerType;
  readonly required: boolean;
  readonly fit: "contain" | "cover";
  readonly supportsFocalPoint: boolean;
  readonly supportedTreatments: readonly ImageTreatmentId[];
};

export type CampaignSafeAreaPolicy = {
  readonly semanticContent: "brand-snapshot";
  readonly fullBleedAssetLayers: readonly AssetLayerType[];
  readonly exposesRenderEvidence: boolean;
  readonly guidance: string;
};

export type CampaignFamilyDefinition = {
  readonly id: CampaignFamilyId;
  readonly label: string;
  readonly members: readonly CampaignFamilyMember[];
};

const carouselAuthoringContract =
  AUTHORING_TEMPLATE_REGISTRY["tiktok-carousel-slide@1.0.3"];

const imageLedContentRoles = IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.supportedLayers
  .filter(isImageLedContentLayerType)
  .map((layerType) => ({
    layerType,
    required: includesLayer(
      IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.requiredLayers,
      layerType,
    ),
  }));

const imageLedAssetRoles = IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.requiredAssetFits.map(
  ({ layerType, fit }) => ({
    layerType,
    required: includesLayer(
      IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.requiredLayers,
      layerType,
    ),
    fit,
    ...IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.assetCapabilities[layerType],
  }),
);

const imageLedSafeAreaPolicy = {
  ...IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.safeAreaPolicy,
  guidance: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.constraints.safeAreaBehavior,
};

const imageLedCampaignFamily = {
  id: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.id,
  label: "Image-led campaign",
  members: [
    {
      template: {
        id: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.id,
        version: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.version,
      },
      formats: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.supportedFormats,
      compositionVariants: IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.compositionVariants,
      contentRoles: imageLedContentRoles,
      assetRoles: imageLedAssetRoles,
      safeAreaPolicy: imageLedSafeAreaPolicy,
    },
    {
      template: carouselAuthoringContract.template,
      formats: carouselAuthoringContract.compatibleFormats,
      compositionVariants: [
        {
          id: "organic-photo-editorial",
          label: carouselAuthoringContract.compositionVariant.label,
          description: carouselAuthoringContract.compositionVariant.guidance,
        },
      ],
      contentRoles: carouselAuthoringContract.contentRoles.map(
        ({ layerType, required }) => ({ layerType, required }),
      ),
      assetRoles: [],
      safeAreaPolicy: {
        semanticContent: "brand-snapshot",
        fullBleedAssetLayers: [],
        exposesRenderEvidence: true,
        guidance: carouselAuthoringContract.safeAreaGuidance,
      },
    },
  ],
} as const satisfies CampaignFamilyDefinition;

export const CAMPAIGN_FAMILY_REGISTRY = deepFreeze({
  "image-led-campaign": imageLedCampaignFamily,
} as const satisfies Record<CampaignFamilyId, CampaignFamilyDefinition>);

function isImageLedContentLayerType(
  layerType: (typeof IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.supportedLayers)[number],
): layerType is Extract<
  (typeof IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.supportedLayers)[number],
  ContentLayerType
> {
  return (
    layerType === "eyebrow" ||
    layerType === "headline" ||
    layerType === "subtitle" ||
    layerType === "cta"
  );
}

function includesLayer(
  layers: readonly DesignLayer["type"][],
  layerType: DesignLayer["type"],
): boolean {
  return layers.some((candidate) => candidate === layerType);
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
