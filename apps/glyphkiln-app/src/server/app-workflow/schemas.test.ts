import { describe, expect, it } from "vitest";

import { CAROUSEL_SEQUENCE_LIMITS } from "@glyphkiln/core";

import { AppCommandSchema, AppQuerySchema } from "./schemas";

describe("App campaign canvas command schema", () => {
  const command = {
    type: "campaign.canvas.attach" as const,
    workspaceId: "workspace-a",
    campaignId: "campaign-a",
    directionId: "direction-a",
    canvasKey: "slide-01",
    designId: "design-a",
    revisionId: "revision-a",
    compositionVariantId: "focal-editorial" as const,
    narrativeRole: "evidence" as const,
    deliveryProfileId: "instagram-api-carousel" as const,
    carouselSequenceKey: "launch-carousel",
    altText: "Launch slide with the product promise and supporting campaign image.",
    ordinal: 0,
  };

  it("normalizes and preserves bounded per-slide source notes", () => {
    expect(
      AppCommandSchema.parse({
        ...command,
        sourceNotes: [
          {
            label: "  Product launch brief  ",
            url: "https://example.com/launch-brief",
          },
        ],
      }),
    ).toMatchObject({
      sourceNotes: [
        {
          label: "Product launch brief",
          url: "https://example.com/launch-brief",
        },
      ],
    });
  });

  it("rejects source-note counts and fields beyond the Core limits", () => {
    expect(
      AppCommandSchema.safeParse({
        ...command,
        sourceNotes: Array.from(
          { length: CAROUSEL_SEQUENCE_LIMITS.sourceNotesPerSlide + 1 },
          (_, index) => ({ label: `Source ${(index + 1).toString()}` }),
        ),
      }).success,
    ).toBe(false);
    expect(
      AppCommandSchema.safeParse({
        ...command,
        sourceNotes: [
          {
            label: "x".repeat(CAROUSEL_SEQUENCE_LIMITS.sourceNoteLabelCharacters + 1),
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      AppCommandSchema.safeParse({
        ...command,
        altText: "x".repeat(CAROUSEL_SEQUENCE_LIMITS.altTextCharacters + 1),
      }).success,
    ).toBe(false);
  });
});

describe("App campaign carousel review query schema", () => {
  it("accepts only a bounded sequence scope", () => {
    const query = {
      type: "campaign.carousel.review" as const,
      workspaceId: "workspace-a",
      campaignId: "campaign-a",
      directionId: "direction-a",
      sequenceKey: "launch-carousel",
    };
    expect(AppQuerySchema.parse(query)).toEqual(query);
    expect(
      AppQuerySchema.safeParse({ ...query, sequenceKey: "../launch-carousel" }).success,
    ).toBe(false);
  });
});
