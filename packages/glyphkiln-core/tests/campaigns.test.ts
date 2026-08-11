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
  deriveCampaignSeeds,
} from "../src/index.js";
import {
  CAMPAIGN_FAMILY_METADATA_VERSION as BROWSER_CAMPAIGN_FAMILY_METADATA_VERSION,
  CAMPAIGN_FAMILY_REGISTRY as BROWSER_CAMPAIGN_FAMILY_REGISTRY,
} from "../src/browser.js";

describe("campaign-family metadata", () => {
  it("publishes the exact image-led family contract", () => {
    expect(CAMPAIGN_FAMILY_METADATA_VERSION).toBe("1.0.0");
    expect(CAMPAIGN_FAMILY_REGISTRY).toEqual({
      "image-led-campaign": {
        id: "image-led-campaign",
        label: "Image-led campaign",
        members: [
          {
            template: { id: "image-led-campaign", version: "1.0.0" },
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
    expect(Object.isFrozen(family.contentRoles)).toBe(true);
    expect(Object.isFrozen(family.assetRoles)).toBe(true);
    expect(Object.isFrozen(family.safeAreaPolicy)).toBe(true);
  });

  it("matches the authoritative template and treatment registries", () => {
    const family = CAMPAIGN_FAMILY_REGISTRY["image-led-campaign"];
    const member = family.members[0];
    const template = TEMPLATE_REGISTRY[member.template.id];
    const imageRole = family.assetRoles.find((role) => role.layerType === "image");

    expect(member.template.version).toBe(template.version);
    expect(member.formats).toEqual(template.supportedFormats);
    expect(imageRole?.supportedTreatments).toEqual(IMAGE_TREATMENT_IDS);
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
    directionKey: "direction-a",
    canvasKey: "hero",
    template: { id: "image-led-campaign", version: "1.0.0" },
    format: "linkedin-landscape",
    compositionVariantId: "focal-editorial",
  } as const;

  it("publishes stable direction and canvas seed vectors", () => {
    expect(CAMPAIGN_SEED_DERIVATION_VERSION).toBe("sha256/canonical-scope-v1");
    expect(deriveCampaignSeeds(baseInput)).toEqual({
      version: "sha256/canonical-scope-v1",
      directionSeed: "9a44bb92d118d8105fe2dc80b5a268b0b62f75bdcbfd3e874c6be1ab79d701d3",
      canvasSeed: "7bf2eb088098d6f8cd10649d888fbfa75dd177d9649e5dfedf351abe5f97db60",
    });
  });

  it("shares an art-direction seed while separating canvas streams", () => {
    const hero = deriveCampaignSeeds(baseInput);
    const square = deriveCampaignSeeds({
      ...baseInput,
      canvasKey: "square-01",
      format: "instagram-square",
    });

    expect(square.directionSeed).toBe(hero.directionSeed);
    expect(square.canvasSeed).not.toBe(hero.canvasSeed);
  });

  it("separates different directions and repeated slides", () => {
    const first = deriveCampaignSeeds(baseInput);
    const nextDirection = deriveCampaignSeeds({
      ...baseInput,
      directionKey: "direction-b",
    });
    const nextSlide = deriveCampaignSeeds({
      ...baseInput,
      canvasKey: "hero-02",
    });

    expect(nextDirection.directionSeed).not.toBe(first.directionSeed);
    expect(nextDirection.canvasSeed).not.toBe(first.canvasSeed);
    expect(nextSlide.directionSeed).toBe(first.directionSeed);
    expect(nextSlide.canvasSeed).not.toBe(first.canvasSeed);
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
