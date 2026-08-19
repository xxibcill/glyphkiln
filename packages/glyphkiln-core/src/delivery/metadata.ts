import type { FormatId } from "../formats/index.js";

export const DELIVERY_PROFILE_METADATA_VERSION = "1.0.0" as const;

export const DELIVERY_PROFILE_IDS = Object.freeze([
  "instagram-native-carousel",
  "instagram-api-carousel",
  "tiktok-organic-photo",
  "tiktok-content-posting-photo",
  "tiktok-carousel-ad",
] as const);
export type DeliveryProfileId = (typeof DELIVERY_PROFILE_IDS)[number];

export type DeliveryEvidenceLevel =
  | "platform-requirement"
  | "platform-capability"
  | "platform-recommendation"
  | "glyphkiln-advisory";

export function isBlockingDeliveryEvidence(evidence: DeliveryEvidenceLevel): boolean {
  return evidence === "platform-requirement" || evidence === "platform-capability";
}

export type DeliverySource = {
  readonly id: string;
  readonly publisher: "Meta" | "TikTok" | "W3C" | "Glyphkiln";
  readonly title: string;
  readonly url: string;
  readonly retrievedAt: "2026-08-18";
};

export type DeliveryFact<Value> = {
  readonly value: Value;
  readonly evidence: DeliveryEvidenceLevel;
  readonly sourceIds: readonly string[];
  readonly note: string;
};

export type DeliverySurfaceOverlay = {
  readonly version: "2026-08-18";
  readonly evidence: "glyphkiln-advisory";
  readonly insets: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly note: string;
};

export type DeliveryProfile = {
  readonly id: DeliveryProfileId;
  readonly label: string;
  readonly platform: "instagram" | "tiktok";
  readonly publishingPath: "native" | "api" | "organic" | "content-api" | "paid-ad";
  readonly compatibleFormats: readonly FormatId[];
  readonly slideCount: DeliveryFact<{
    readonly minimum: number;
    readonly maximum: number;
  }>;
  readonly acceptedImageMediaTypes: DeliveryFact<readonly string[]>;
  readonly aspectRatio: DeliveryFact<{
    readonly minimumWidthPerHeight?: number;
    readonly maximumWidthPerHeight?: number;
    readonly sameAcrossSequence: boolean;
  }>;
  readonly raster: DeliveryFact<{
    readonly targetWidth?: number;
    readonly minimumWidth?: number;
    readonly maximumWidth?: number;
    readonly maximumBytesPerImage?: number;
    readonly colorSpace?: "sRGB";
  }>;
  readonly accessibility: DeliveryFact<{
    readonly creatorAltText: boolean;
    readonly maximumAltTextCharacters?: number;
  }>;
  readonly surfaceOverlay: DeliverySurfaceOverlay;
  readonly authoringNotes: readonly string[];
};

const DELIVERY_SOURCES = deepFreeze({
  "glyphkiln-carousel-validation": {
    id: "glyphkiln-carousel-validation",
    publisher: "Glyphkiln",
    title: "Carousel design research validation",
    url: "https://github.com/xxibcill/glyphkiln/blob/main/docs/research/carousel-design-validation-2026-08-18.md",
    retrievedAt: "2026-08-18",
  },
  "meta-instagram-photo-resolution": {
    id: "meta-instagram-photo-resolution",
    publisher: "Meta",
    title: "Image resolution of photos you share on Instagram",
    url: "https://www.facebook.com/help/1631821640426723/",
    retrievedAt: "2026-08-18",
  },
  "meta-instagram-carousel": {
    id: "meta-instagram-carousel",
    publisher: "Meta",
    title: "Share a post with multiple photos or videos on Instagram",
    url: "https://www.facebook.com/help/instagram/269314186824048/",
    retrievedAt: "2026-08-18",
  },
  "instagram-creators-carousel-limit": {
    id: "instagram-creators-carousel-limit",
    publisher: "Meta",
    title: "New text tools to help you personalize your content",
    url: "https://creators.instagram.com/blog/new-text-tools-to-help-you-personalize-your-content",
    retrievedAt: "2026-08-18",
  },
  "meta-instagram-content-publishing": {
    id: "meta-instagram-content-publishing",
    publisher: "Meta",
    title: "Instagram API content publishing",
    url: "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing",
    retrievedAt: "2026-08-18",
  },
  "meta-instagram-user-media": {
    id: "meta-instagram-user-media",
    publisher: "Meta",
    title: "IG User Media reference",
    url: "https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media",
    retrievedAt: "2026-08-18",
  },
  "meta-instagram-alt-text": {
    id: "meta-instagram-alt-text",
    publisher: "Meta",
    title: "Edit the alternative text for a photo on Instagram",
    url: "https://www.facebook.com/help/instagram/503708446705527",
    retrievedAt: "2026-08-18",
  },
  "tiktok-making-a-post": {
    id: "tiktok-making-a-post",
    publisher: "TikTok",
    title: "Making a post",
    url: "https://support.tiktok.com/en/using-tiktok/creating-videos/making-a-post",
    retrievedAt: "2026-08-18",
  },
  "tiktok-content-posting-media": {
    id: "tiktok-content-posting-media",
    publisher: "TikTok",
    title: "Content Posting API media transfer guide",
    url: "https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide",
    retrievedAt: "2026-08-18",
  },
  "tiktok-carousel-ad-specifications": {
    id: "tiktok-carousel-ad-specifications",
    publisher: "TikTok",
    title: "Specifications for carousel ads",
    url: "https://ads.tiktok.com/help/article/specifications-for-carousel-ads/",
    retrievedAt: "2026-08-18",
  },
  "tiktok-accessibility": {
    id: "tiktok-accessibility",
    publisher: "TikTok",
    title: "Accessibility for your videos",
    url: "https://support.tiktok.com/en/using-tiktok/creating-videos/accessibility",
    retrievedAt: "2026-08-18",
  },
} as const satisfies Record<string, DeliverySource>);

const instagramOverlay = {
  version: "2026-08-18",
  evidence: "glyphkiln-advisory",
  insets: { top: 0.05, right: 0.05, bottom: 0.08, left: 0.05 },
  note: "Conservative review overlay only; verify current feed chrome on target devices.",
} as const satisfies DeliverySurfaceOverlay;

const tiktokOrganicOverlay = {
  version: "2026-08-18",
  evidence: "glyphkiln-advisory",
  insets: { top: 0.08, right: 0.18, bottom: 0.2, left: 0.06 },
  note: "No stable first-party organic Photo Mode safe zone is published; verify against captured live UI.",
} as const satisfies DeliverySurfaceOverlay;

const tiktokAdOverlay = {
  version: "2026-08-18",
  evidence: "glyphkiln-advisory",
  insets: { top: 0.08, right: 0.18, bottom: 0.24, left: 0.06 },
  note: "Ad-interface proxy only; use the placement-specific TikTok safe-zone tool before trafficking.",
} as const satisfies DeliverySurfaceOverlay;

export const DELIVERY_PROFILE_REGISTRY = deepFreeze({
  "instagram-native-carousel": {
    id: "instagram-native-carousel",
    label: "Instagram carousel · native app",
    platform: "instagram",
    publishingPath: "native",
    compatibleFormats: ["instagram-square", "instagram-portrait"],
    slideCount: {
      value: { minimum: 2, maximum: 20 },
      evidence: "platform-requirement",
      sourceIds: ["instagram-creators-carousel-limit"],
      note: "The maximum is a publishing limit, not an engagement recommendation.",
    },
    acceptedImageMediaTypes: {
      value: ["image/jpeg", "image/png"],
      evidence: "glyphkiln-advisory",
      sourceIds: ["glyphkiln-carousel-validation"],
      note: "Glyphkiln exports raster images; confirm the current native picker on the target device.",
    },
    aspectRatio: {
      value: {
        minimumWidthPerHeight: 0.75,
        maximumWidthPerHeight: 1.91,
        sameAcrossSequence: true,
      },
      evidence: "platform-requirement",
      sourceIds: ["meta-instagram-photo-resolution", "meta-instagram-carousel"],
      note: "Instagram applies one orientation to the complete carousel.",
    },
    raster: {
      value: { targetWidth: 1080 },
      evidence: "platform-recommendation",
      sourceIds: ["meta-instagram-photo-resolution"],
      note: "1080 px is a compatibility target, not the minimum accepted upload width.",
    },
    accessibility: {
      value: { creatorAltText: true },
      evidence: "platform-capability",
      sourceIds: ["meta-instagram-alt-text"],
      note: "Carry the delivery sidecar text into Instagram's per-image alt-text editor.",
    },
    surfaceOverlay: instagramOverlay,
    authoringNotes: [
      "Keep every slide the same aspect ratio.",
      "Treat slide count, copy length, and composition cadence as account-level hypotheses.",
    ],
  },
  "instagram-api-carousel": {
    id: "instagram-api-carousel",
    label: "Instagram carousel · publishing API",
    platform: "instagram",
    publishingPath: "api",
    compatibleFormats: ["instagram-square", "instagram-portrait"],
    slideCount: {
      value: { minimum: 2, maximum: 10 },
      evidence: "platform-requirement",
      sourceIds: ["meta-instagram-content-publishing"],
      note: "The API maximum is lower than the native-app maximum.",
    },
    acceptedImageMediaTypes: {
      value: ["image/jpeg"],
      evidence: "platform-requirement",
      sourceIds: ["meta-instagram-user-media"],
      note: "A PNG proof needs an explicit JPEG delivery conversion before API publishing.",
    },
    aspectRatio: {
      value: {
        minimumWidthPerHeight: 0.8,
        maximumWidthPerHeight: 1.91,
        sameAcrossSequence: true,
      },
      evidence: "platform-requirement",
      sourceIds: ["meta-instagram-user-media", "meta-instagram-content-publishing"],
      note: "API carousel children are cropped using the first image's aspect ratio.",
    },
    raster: {
      value: {
        targetWidth: 1080,
        minimumWidth: 320,
        maximumWidth: 1440,
        maximumBytesPerImage: 8_000_000,
        colorSpace: "sRGB",
      },
      evidence: "platform-requirement",
      sourceIds: ["meta-instagram-user-media"],
      note: "Validate the exact scheduler or API path again before automated publishing.",
    },
    accessibility: {
      value: { creatorAltText: true },
      evidence: "platform-recommendation",
      sourceIds: ["meta-instagram-alt-text"],
      note: "Retain per-image alt text even when the publishing integration cannot transmit it.",
    },
    surfaceOverlay: instagramOverlay,
    authoringNotes: [
      "Do not send Core PNG proofs directly to the API path.",
      "Keep a delivery sidecar when the integration cannot transmit image alt text.",
    ],
  },
  "tiktok-organic-photo": {
    id: "tiktok-organic-photo",
    label: "TikTok Photo Mode · organic",
    platform: "tiktok",
    publishingPath: "organic",
    compatibleFormats: ["tiktok-photo-carousel"],
    slideCount: {
      value: { minimum: 1, maximum: 35 },
      evidence: "platform-requirement",
      sourceIds: ["tiktok-making-a-post"],
      note: "Glyphkiln still treats two or more slides as a carousel sequence; there is no universal optimal count.",
    },
    acceptedImageMediaTypes: {
      value: ["image/jpeg", "image/png"],
      evidence: "glyphkiln-advisory",
      sourceIds: ["glyphkiln-carousel-validation"],
      note: "TikTok's native help does not publish an exact file-type contract; verify the target device picker.",
    },
    aspectRatio: {
      value: { sameAcrossSequence: false },
      evidence: "glyphkiln-advisory",
      sourceIds: ["glyphkiln-carousel-validation"],
      note: "3:4 is a Glyphkiln working canvas, not an official organic Photo Mode requirement.",
    },
    raster: {
      value: { targetWidth: 1080 },
      evidence: "glyphkiln-advisory",
      sourceIds: ["glyphkiln-carousel-validation"],
      note: "1080 px is a Glyphkiln working target, not a universal native Photo Mode requirement.",
    },
    accessibility: {
      value: { creatorAltText: true, maximumAltTextCharacters: 300 },
      evidence: "platform-capability",
      sourceIds: ["tiktok-accessibility"],
      note: "Supply alt text for every meaningful image in the sequence.",
    },
    surfaceOverlay: tiktokOrganicOverlay,
    authoringNotes: [
      "Do not import Smart Order, 9:16, or 3/7–9 slide advice from the paid-ad path.",
      "Proof the advisory overlay against current device captures before publishing.",
    ],
  },
  "tiktok-content-posting-photo": {
    id: "tiktok-content-posting-photo",
    label: "TikTok photo post · Content Posting API",
    platform: "tiktok",
    publishingPath: "content-api",
    compatibleFormats: ["tiktok-photo-carousel"],
    slideCount: {
      value: { minimum: 1, maximum: 35 },
      evidence: "platform-requirement",
      sourceIds: ["tiktok-making-a-post", "tiktok-content-posting-media"],
      note: "The maximum is a publishing limit, not an engagement recommendation.",
    },
    acceptedImageMediaTypes: {
      value: ["image/jpeg", "image/webp"],
      evidence: "platform-requirement",
      sourceIds: ["tiktok-content-posting-media"],
      note: "A Core PNG proof needs an explicit JPEG or WebP delivery conversion for this API path.",
    },
    aspectRatio: {
      value: { sameAcrossSequence: false },
      evidence: "glyphkiln-advisory",
      sourceIds: ["glyphkiln-carousel-validation"],
      note: "The API does not make Glyphkiln's 3:4 authoring canvas a universal organic requirement.",
    },
    raster: {
      value: { targetWidth: 1080, maximumBytesPerImage: 20_000_000 },
      evidence: "platform-requirement",
      sourceIds: ["tiktok-content-posting-media"],
      note: "Validate the exact Content Posting API contract again before automated publishing.",
    },
    accessibility: {
      value: { creatorAltText: true, maximumAltTextCharacters: 300 },
      evidence: "platform-recommendation",
      sourceIds: ["tiktok-accessibility"],
      note: "Retain per-image alt text even if the publishing integration cannot transmit it.",
    },
    surfaceOverlay: tiktokOrganicOverlay,
    authoringNotes: [
      "Do not send Core PNG proofs directly to the Content Posting API path.",
      "Keep the delivery sidecar when the integration cannot transmit image alt text.",
    ],
  },
  "tiktok-carousel-ad": {
    id: "tiktok-carousel-ad",
    label: "TikTok carousel · paid ad",
    platform: "tiktok",
    publishingPath: "paid-ad",
    compatibleFormats: ["tiktok-carousel"],
    slideCount: {
      value: { minimum: 2, maximum: 35 },
      evidence: "platform-requirement",
      sourceIds: ["tiktok-carousel-ad-specifications"],
      note: "Any 3 or 7–9 guidance belongs to this ad workflow and remains a recommendation.",
    },
    acceptedImageMediaTypes: {
      value: ["image/jpeg", "image/png"],
      evidence: "platform-requirement",
      sourceIds: ["tiktok-carousel-ad-specifications"],
      note: "Traffic only media types accepted by the selected ad placement.",
    },
    aspectRatio: {
      value: {
        minimumWidthPerHeight: 9 / 16,
        maximumWidthPerHeight: 9 / 16,
        sameAcrossSequence: true,
      },
      evidence: "platform-recommendation",
      sourceIds: ["tiktok-carousel-ad-specifications"],
      note: "720 × 1280 is the documented vertical recommendation, not an organic rule.",
    },
    raster: {
      value: { targetWidth: 720 },
      evidence: "platform-recommendation",
      sourceIds: ["tiktok-carousel-ad-specifications"],
      note: "Glyphkiln authors at 1080 × 1920 and expects placement-aware delivery processing.",
    },
    accessibility: {
      value: { creatorAltText: false },
      evidence: "glyphkiln-advisory",
      sourceIds: ["glyphkiln-carousel-validation"],
      note: "Keep descriptions and a reading-order sidecar even when the placement has no alt-text field.",
    },
    surfaceOverlay: tiktokAdOverlay,
    authoringNotes: [
      "Music and placement-specific safe-zone checks belong to the ad trafficking workflow.",
      "Smart Order means every slide needs enough context to be encountered first.",
    ],
  },
} as const satisfies Record<DeliveryProfileId, DeliveryProfile>);

export { DELIVERY_SOURCES };

export function deliveryProfilesForFormat(
  format: FormatId,
): readonly DeliveryProfile[] {
  return DELIVERY_PROFILE_IDS.map((id) => DELIVERY_PROFILE_REGISTRY[id]).filter(
    (profile) => profile.compatibleFormats.some((candidate) => candidate === format),
  );
}

export function defaultDeliveryProfileForFormat(
  format: FormatId,
): DeliveryProfile | undefined {
  if (format === "instagram-square" || format === "instagram-portrait") {
    return DELIVERY_PROFILE_REGISTRY["instagram-native-carousel"];
  }
  if (format === "tiktok-photo-carousel") {
    return DELIVERY_PROFILE_REGISTRY["tiktok-organic-photo"];
  }
  if (format === "tiktok-carousel") {
    return DELIVERY_PROFILE_REGISTRY["tiktok-carousel-ad"];
  }
  return undefined;
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
