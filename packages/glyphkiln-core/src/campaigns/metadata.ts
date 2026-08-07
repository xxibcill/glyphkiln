import type { DesignLayer, ImageTreatmentId, TemplateId } from "../schema/index.js";
import type { FormatId } from "../formats/index.js";
import type { TemplateDefinition } from "../templates/types.js";

export const CAMPAIGN_FAMILY_METADATA_VERSION = "1.0.0" as const;

export const CAMPAIGN_FAMILY_IDS = ["image-led-campaign"] as const;
export type CampaignFamilyId = (typeof CAMPAIGN_FAMILY_IDS)[number];

export const CAMPAIGN_COMPOSITION_VARIANT_IDS = ["focal-editorial"] as const;
export type CampaignCompositionVariantId =
  (typeof CAMPAIGN_COMPOSITION_VARIANT_IDS)[number];

type ContentLayerType = Extract<
  DesignLayer["type"],
  "eyebrow" | "headline" | "subtitle" | "cta" | "footer" | "attribution"
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
};

export type CampaignFamilyDefinition = {
  readonly id: CampaignFamilyId;
  readonly label: string;
  readonly members: readonly CampaignFamilyMember[];
  readonly contentRoles: readonly CampaignContentRole[];
  readonly assetRoles: readonly CampaignAssetRole[];
  readonly safeAreaPolicy: CampaignSafeAreaPolicy;
};

const imageLedCampaignFamily = {
  id: "image-led-campaign",
  label: "Image-led campaign",
  members: [
    {
      template: {
        id: "image-led-campaign",
        version: "1.0.0",
      },
      formats: ["linkedin-landscape", "instagram-square", "instagram-portrait"],
      compositionVariants: [
        {
          id: "focal-editorial",
          label: "Focal editorial",
          description:
            "Full-bleed focal imagery with safe-area editorial copy and a compact brand mark.",
        },
      ],
    },
  ],
  contentRoles: [
    { layerType: "eyebrow", required: false },
    { layerType: "headline", required: true },
    { layerType: "subtitle", required: false },
    { layerType: "cta", required: false },
  ],
  assetRoles: [
    {
      layerType: "image",
      required: true,
      fit: "cover",
      supportsFocalPoint: true,
      supportedTreatments: ["none", "dark-scrim", "light-scrim"],
    },
    {
      layerType: "logo",
      required: true,
      fit: "contain",
      supportsFocalPoint: false,
      supportedTreatments: [],
    },
  ],
  safeAreaPolicy: {
    semanticContent: "brand-snapshot",
    fullBleedAssetLayers: ["image"],
    exposesRenderEvidence: true,
  },
} as const satisfies CampaignFamilyDefinition;

export const CAMPAIGN_FAMILY_REGISTRY = deepFreeze({
  "image-led-campaign": imageLedCampaignFamily,
} as const satisfies Record<CampaignFamilyId, CampaignFamilyDefinition>);

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
