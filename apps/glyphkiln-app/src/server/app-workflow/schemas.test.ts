import { describe, expect, it } from "vitest";

import { CAROUSEL_SEQUENCE_LIMITS } from "@glyphkiln/core";

import { AppCommandSchema } from "./schemas";

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
  });
});
