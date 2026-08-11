import type { ImageTreatmentId } from "../schema/index.js";

import type { TemplateDefinition } from "./types.js";

type ImageLedAssetLayerType = "image" | "logo";

type ImageLedCampaignTemplateContract = Pick<
  TemplateDefinition,
  | "id"
  | "version"
  | "requiredLayers"
  | "supportedLayers"
  | "supportedFormats"
  | "requiredAssetFits"
  | "constraints"
> & {
  readonly compositionVariants: readonly {
    readonly id: "focal-editorial";
    readonly label: string;
    readonly description: string;
  }[];
  readonly assetCapabilities: Readonly<
    Record<
      ImageLedAssetLayerType,
      {
        readonly supportsFocalPoint: boolean;
        readonly supportedTreatments: readonly ImageTreatmentId[];
      }
    >
  >;
  readonly safeAreaPolicy: {
    readonly semanticContent: "brand-snapshot";
    readonly fullBleedAssetLayers: readonly ImageLedAssetLayerType[];
    readonly exposesRenderEvidence: boolean;
  };
};

export const IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT = deepFreeze({
  id: "image-led-campaign",
  version: "1.0.0",
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
      "Logo and semantic copy stay inside the brand safe area; the focal image is full bleed.",
    layout:
      "A full-bleed focal image, closed composited treatment, compact logo, and role-driven editorial copy form one adaptable image-led campaign family.",
  },
  compositionVariants: [
    {
      id: "focal-editorial",
      label: "Focal editorial",
      description:
        "Full-bleed focal imagery with safe-area editorial copy and a compact brand mark.",
    },
  ],
  assetCapabilities: {
    image: {
      supportsFocalPoint: true,
      supportedTreatments: ["none", "dark-scrim", "light-scrim"],
    },
    logo: {
      supportsFocalPoint: false,
      supportedTreatments: [],
    },
  },
  safeAreaPolicy: {
    semanticContent: "brand-snapshot",
    fullBleedAssetLayers: ["image"],
    exposesRenderEvidence: true,
  },
} as const satisfies ImageLedCampaignTemplateContract);

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
