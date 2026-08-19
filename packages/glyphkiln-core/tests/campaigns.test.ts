import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_COMPOSITION_VARIANT_IDS,
  CAMPAIGN_FAMILY_IDS,
  CAMPAIGN_FAMILY_METADATA_VERSION,
  CAMPAIGN_FAMILY_REGISTRY,
  CAMPAIGN_SEED_DERIVATION_VERSION,
  GlyphkilnError,
  IMAGE_TREATMENT_IDS,
  TEMPLATE_REGISTRY,
  createCampaignCanvasKey,
  createCampaignDirectionKey,
  deriveCampaignSeeds,
  type CampaignCanvasKey,
  type CampaignDirectionKey,
} from "../src/index.js";
import {
  CAMPAIGN_FAMILY_METADATA_VERSION as BROWSER_CAMPAIGN_FAMILY_METADATA_VERSION,
  CAMPAIGN_FAMILY_REGISTRY as BROWSER_CAMPAIGN_FAMILY_REGISTRY,
} from "../src/browser.js";
import { AUTHORING_TEMPLATE_REGISTRY } from "../src/authoring/metadata.js";
import { IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT } from "../src/templates/image-led-campaign-contract.js";

describe("campaign-family metadata", () => {
  it("publishes the exact image-led family contract", () => {
    expect(CAMPAIGN_FAMILY_METADATA_VERSION).toBe("1.2.0");
    expect(CAMPAIGN_FAMILY_REGISTRY).toEqual({
      "image-led-campaign": {
        id: "image-led-campaign",
        label: "Image-led campaign",
        members: [
          {
            template: { id: "image-led-campaign", version: "1.0.1" },
            formats: ["linkedin-landscape", "instagram-square", "instagram-portrait"],
            compositionVariants: [
              {
                id: "focal-editorial",
                label: "Focal editorial",
                description:
                  "Full-bleed focal imagery with safe-area editorial copy and a compact brand mark.",
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
              guidance:
                "Logo and semantic copy stay inside the brand safe area; the focal image is full bleed.",
            },
          },
          {
            template: { id: "tiktok-carousel-slide", version: "1.0.4" },
            formats: ["tiktok-photo-carousel"],
            compositionVariants: [
              {
                id: "organic-photo-editorial",
                label: "Organic photo editorial",
                description:
                  "A compact 3:4 organic composition with content-responsive spacing and optional deterministic pattern rails.",
              },
            ],
            contentRoles: [
              { layerType: "badge", required: true },
              { layerType: "eyebrow", required: false },
              { layerType: "headline", required: true },
              { layerType: "subtitle", required: false },
              { layerType: "statistic", required: false },
              { layerType: "cta", required: false },
              { layerType: "footer", required: false },
            ],
            assetRoles: [],
            safeAreaPolicy: {
              semanticContent: "brand-snapshot",
              fullBleedAssetLayers: [],
              exposesRenderEvidence: true,
              guidance: "Honor compact top, action-side, and bottom interface insets.",
            },
          },
        ],
      },
    });
  });

  it("freezes the registry and every published nested collection", () => {
    const family = CAMPAIGN_FAMILY_REGISTRY["image-led-campaign"];
    const member = family.members[0];

    expect(Object.isFrozen(CAMPAIGN_FAMILY_IDS)).toBe(true);
    expect(Object.isFrozen(CAMPAIGN_COMPOSITION_VARIANT_IDS)).toBe(true);
    expect(Object.isFrozen(CAMPAIGN_FAMILY_REGISTRY)).toBe(true);
    expect(Object.isFrozen(family)).toBe(true);
    expect(Object.isFrozen(family.members)).toBe(true);
    expect(Object.isFrozen(member)).toBe(true);
    expect(Object.isFrozen(member.formats)).toBe(true);
    expect(Object.isFrozen(member.compositionVariants)).toBe(true);
    expect(Object.isFrozen(member.contentRoles)).toBe(true);
    expect(Object.isFrozen(member.assetRoles)).toBe(true);
    expect(Object.isFrozen(member.safeAreaPolicy)).toBe(true);
  });

  it("matches the authoritative template and treatment registries", () => {
    const family = CAMPAIGN_FAMILY_REGISTRY["image-led-campaign"];
    const member = family.members[0];
    const template = TEMPLATE_REGISTRY[member.template.id];
    const imageRole = member.assetRoles.find((role) => role.layerType === "image");

    expect(template.requiredLayers).toBe(
      IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.requiredLayers,
    );
    expect(template.supportedLayers).toBe(
      IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.supportedLayers,
    );
    expect(template.requiredAssetFits).toBe(
      IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.requiredAssetFits,
    );
    expect(template.constraints).toBe(IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.constraints);
    expect(member.template.version).toBe(IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.version);
    expect(member.formats).toBe(IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.supportedFormats);
    expect(member.compositionVariants).toBe(
      IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.compositionVariants,
    );
    expect(member.safeAreaPolicy).toMatchObject(
      IMAGE_LED_CAMPAIGN_TEMPLATE_CONTRACT.safeAreaPolicy,
    );
    expect(imageRole?.supportedTreatments).toEqual(IMAGE_TREATMENT_IDS);
    const carouselMember = family.members[1];
    const carouselTemplate = TEMPLATE_REGISTRY["tiktok-carousel-slide"];
    expect(carouselMember.template).toEqual({
      id: carouselTemplate.id,
      version: carouselTemplate.version,
    });
    expect(carouselMember.formats).toEqual(carouselTemplate.supportedFormats);
    const carouselAuthoring =
      AUTHORING_TEMPLATE_REGISTRY["tiktok-carousel-slide@1.0.4"];
    expect(carouselMember.formats).toBe(carouselAuthoring.compatibleFormats);
    expect(carouselMember.compositionVariants[0].id).toBe(
      carouselAuthoring.compositionVariant.id,
    );
    expect(carouselMember.contentRoles).toEqual(
      carouselAuthoring.contentRoles.map(({ layerType, required }) => ({
        layerType,
        required,
      })),
    );
    expect(carouselMember.assetRoles).toEqual(carouselAuthoring.assetRoles);
    expect(carouselMember.safeAreaPolicy.guidance).toBe(
      carouselAuthoring.safeAreaGuidance,
    );
  });

  it("exposes the same static catalog through the browser entry point", () => {
    expect(BROWSER_CAMPAIGN_FAMILY_METADATA_VERSION).toBe(
      CAMPAIGN_FAMILY_METADATA_VERSION,
    );
    expect(BROWSER_CAMPAIGN_FAMILY_REGISTRY).toBe(CAMPAIGN_FAMILY_REGISTRY);
  });
});

describe("campaign seed derivation", () => {
  const baseInput = {
    campaignSeed: "kiln-launch-2026",
    familyId: "image-led-campaign",
    directionKey: createCampaignDirectionKey("direction-a"),
    canvasKey: createCampaignCanvasKey("hero"),
    template: { id: "image-led-campaign", version: "1.0.1" },
    format: "linkedin-landscape",
    compositionVariantId: "focal-editorial",
  } as const;

  it("creates distinct validated direction and canvas identities", () => {
    const directionKey: CampaignDirectionKey =
      createCampaignDirectionKey("direction-a");
    const canvasKey: CampaignCanvasKey = createCampaignCanvasKey("hero-01");
    // @ts-expect-error Direction and canvas keys are intentionally distinct.
    const swappedCanvasKey: CampaignCanvasKey = directionKey;
    // @ts-expect-error Direction and canvas keys are intentionally distinct.
    const swappedDirectionKey: CampaignDirectionKey = canvasKey;

    expect(directionKey).toBe("direction-a");
    expect(canvasKey).toBe("hero-01");
    expect(() => createCampaignCanvasKey("hero 01")).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_CAMPAIGN_SEED_SCOPE",
      }),
    );
    void [swappedCanvasKey, swappedDirectionKey];
  });

  it("publishes stable direction and canvas seed vectors", () => {
    expect(CAMPAIGN_SEED_DERIVATION_VERSION).toBe("sha256/canonical-scope-v1");
    expect(deriveCampaignSeeds(baseInput)).toEqual({
      version: "sha256/canonical-scope-v1",
      directionSeed: "9a44bb92d118d8105fe2dc80b5a268b0b62f75bdcbfd3e874c6be1ab79d701d3",
      canvasSeed: "752586c5bd763628854c7c0adab9e2e5a3b2e1b1a1814a1609142a7561aa6762",
    });
  });

  it("shares an art-direction seed while separating canvas streams", () => {
    const hero = deriveCampaignSeeds(baseInput);
    const square = deriveCampaignSeeds({
      ...baseInput,
      canvasKey: createCampaignCanvasKey("square-01"),
      format: "instagram-square",
    });

    expect(square.directionSeed).toBe(hero.directionSeed);
    expect(square.canvasSeed).not.toBe(hero.canvasSeed);
  });

  it("separates different directions and repeated slides", () => {
    const first = deriveCampaignSeeds(baseInput);
    const nextDirection = deriveCampaignSeeds({
      ...baseInput,
      directionKey: createCampaignDirectionKey("direction-b"),
    });
    const nextSlide = deriveCampaignSeeds({
      ...baseInput,
      canvasKey: createCampaignCanvasKey("hero-02"),
    });

    expect(nextDirection.directionSeed).not.toBe(first.directionSeed);
    expect(nextDirection.canvasSeed).not.toBe(first.canvasSeed);
    expect(nextSlide.directionSeed).toBe(first.directionSeed);
    expect(nextSlide.canvasSeed).not.toBe(first.canvasSeed);
  });

  it("derives exact canvas streams for the fourth carousel format", () => {
    const firstSlide = deriveCampaignSeeds({
      ...baseInput,
      canvasKey: createCampaignCanvasKey("carousel-01"),
      template: { id: "tiktok-carousel-slide", version: "1.0.4" },
      format: "tiktok-photo-carousel",
      compositionVariantId: "organic-photo-editorial",
    });
    const secondSlide = deriveCampaignSeeds({
      ...baseInput,
      canvasKey: createCampaignCanvasKey("carousel-02"),
      template: { id: "tiktok-carousel-slide", version: "1.0.4" },
      format: "tiktok-photo-carousel",
      compositionVariantId: "organic-photo-editorial",
    });

    expect(firstSlide.directionSeed).toBe(secondSlide.directionSeed);
    expect(firstSlide.canvasSeed).not.toBe(secondSlide.canvasSeed);
  });

  it.each([
    {
      name: "an unsupported format",
      input: { ...baseInput, format: "instagram-story" },
    },
    {
      name: "an unknown composition variant",
      input: { ...baseInput, compositionVariantId: "unknown" },
    },
    {
      name: "an empty canvas key",
      input: { ...baseInput, canvasKey: "" },
    },
    {
      name: "an oversized campaign seed",
      input: { ...baseInput, campaignSeed: "x".repeat(257) },
    },
    {
      name: "a prototype-like family ID",
      input: { ...baseInput, familyId: "__proto__" },
    },
    {
      name: "an ignored slide index",
      input: { ...baseInput, slideIndex: 2 },
    },
    {
      name: "a non-object scope",
      input: null,
    },
  ])("rejects $name with a stable error", ({ input }) => {
    expect(() => deriveCampaignSeeds(input as never)).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_CAMPAIGN_SEED_SCOPE",
      }),
    );
  });
});
