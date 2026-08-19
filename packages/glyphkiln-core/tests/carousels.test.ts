import { describe, expect, it } from "vitest";

import {
  CAROUSEL_DELIVERY_SIDECAR_VERSION,
  CAROUSEL_NARRATIVE_ROLE_IDS,
  CAROUSEL_SEQUENCE_LIMITS,
  CAROUSEL_SEQUENCE_VERSION,
  DELIVERY_PROFILE_IDS,
  DELIVERY_PROFILE_METADATA_VERSION,
  DELIVERY_PROFILE_REGISTRY,
  DELIVERY_SOURCES,
  GlyphkilnError,
  createCampaignCanvasKey,
  createCarouselDeliverySidecar,
  createCarouselSequenceKey,
  defaultDeliveryProfileForFormat,
  deliveryProfilesForFormat,
  deliverySourcesForProfile,
  reviewCarouselSequence,
  validateDesignDocument,
  type CarouselSequence,
  type CarouselSequenceKey,
  type CampaignCanvasKey,
  type DesignDocument,
} from "../src/index.js";
import {
  CAROUSEL_SEQUENCE_LIMITS as BROWSER_CAROUSEL_SEQUENCE_LIMITS,
  DELIVERY_PROFILE_REGISTRY as BROWSER_DELIVERY_PROFILE_REGISTRY,
  reviewCarouselSequence as reviewBrowserCarouselSequence,
} from "../src/browser.js";
import { cloneDocument, loadExample } from "./helpers.js";

describe("carousel delivery profiles", () => {
  it("creates a distinct validated sequence identity", () => {
    const sequenceKey: CarouselSequenceKey =
      createCarouselSequenceKey("launch-carousel");
    const canvasKey: CampaignCanvasKey = createCampaignCanvasKey("launch-carousel");
    // @ts-expect-error Raw strings must pass the sequence-key constructor.
    const rawSequenceKey: CarouselSequenceKey = "launch-carousel";
    // @ts-expect-error Canvas and sequence keys are intentionally distinct.
    const swappedSequenceKey: CarouselSequenceKey = canvasKey;

    expect(sequenceKey).toBe("launch-carousel");
    expect(() => createCarouselSequenceKey("../launch-carousel")).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_CAROUSEL_SEQUENCE",
      }),
    );
    void [rawSequenceKey, swappedSequenceKey];
  });

  it("keeps native, API, organic, and paid-ad rules separate", () => {
    expect(DELIVERY_PROFILE_METADATA_VERSION).toBe("1.0.0");
    expect(DELIVERY_PROFILE_IDS).toEqual([
      "instagram-native-carousel",
      "instagram-api-carousel",
      "tiktok-organic-photo",
      "tiktok-content-posting-photo",
      "tiktok-carousel-ad",
    ]);
    expect(
      DELIVERY_PROFILE_REGISTRY["instagram-native-carousel"].slideCount.value.maximum,
    ).toBe(20);
    expect(
      DELIVERY_PROFILE_REGISTRY["instagram-native-carousel"].slideCount.sourceIds,
    ).toEqual(["instagram-creators-carousel-limit"]);
    expect(DELIVERY_SOURCES["instagram-creators-carousel-limit"]).toMatchObject({
      publisher: "Meta",
      url: "https://creators.instagram.com/blog/new-text-tools-to-help-you-personalize-your-content",
    });
    expect(
      DELIVERY_PROFILE_REGISTRY["instagram-api-carousel"].slideCount.value.maximum,
    ).toBe(10);
    expect(
      DELIVERY_PROFILE_REGISTRY["tiktok-organic-photo"].slideCount.value.maximum,
    ).toBe(35);
    expect(
      DELIVERY_PROFILE_REGISTRY["tiktok-organic-photo"].authoringNotes.join(" "),
    ).toContain("Do not import Smart Order");
    expect(
      DELIVERY_PROFILE_REGISTRY["tiktok-carousel-ad"].authoringNotes.join(" "),
    ).toContain("Smart Order");
  });

  it("is immutable, browser-safe, and queryable by format", () => {
    expect(BROWSER_DELIVERY_PROFILE_REGISTRY).toBe(DELIVERY_PROFILE_REGISTRY);
    expect(Object.isFrozen(DELIVERY_PROFILE_REGISTRY)).toBe(true);
    expect(
      Object.isFrozen(
        DELIVERY_PROFILE_REGISTRY["tiktok-organic-photo"].surfaceOverlay.insets,
      ),
    ).toBe(true);
    expect(deliveryProfilesForFormat("instagram-portrait").map(({ id }) => id)).toEqual(
      ["instagram-native-carousel", "instagram-api-carousel"],
    );
    expect(defaultDeliveryProfileForFormat("tiktok-photo-carousel")?.id).toBe(
      "tiktok-organic-photo",
    );
    expect(defaultDeliveryProfileForFormat("linkedin-landscape")).toBeUndefined();
    expect(
      deliverySourcesForProfile(DELIVERY_PROFILE_REGISTRY["instagram-native-carousel"]),
    ).toEqual([
      DELIVERY_SOURCES["glyphkiln-carousel-validation"],
      DELIVERY_SOURCES["instagram-creators-carousel-limit"],
      DELIVERY_SOURCES["meta-instagram-alt-text"],
      DELIVERY_SOURCES["meta-instagram-carousel"],
      DELIVERY_SOURCES["meta-instagram-photo-resolution"],
    ]);
  });
});

describe("carousel sequence review and sidecars", () => {
  it("rejects malformed and unbounded public input with a stable error", async () => {
    expect(() =>
      reviewCarouselSequence({ deliveryProfileId: "not-a-profile", slides: [] }),
    ).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_CAROUSEL_SEQUENCE",
      }),
    );

    const sequence = await organicSequence();
    let oversizedError: unknown;
    try {
      createCarouselDeliverySidecar({
        ...sequence,
        slides: Array.from({ length: 65 }, () => sequence.slides[0]),
      });
    } catch (error) {
      oversizedError = error;
    }
    expect(oversizedError).toBeInstanceOf(GlyphkilnError);
    if (!(oversizedError instanceof GlyphkilnError)) return;
    expect(oversizedError.code).toBe("INVALID_CAROUSEL_SEQUENCE");
    expect(oversizedError.details?.["problems"]).toEqual([
      expect.objectContaining({ path: "slides", code: "too_big" }),
    ]);

    expect(() =>
      reviewCarouselSequence({
        ...sequence,
        slides: [
          {
            ...sequence.slides[0],
            document: { ...sequence.slides[0]?.document, format: "unknown-format" },
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_CAROUSEL_SEQUENCE",
      }),
    );

    let accessorReads = 0;
    const accessorEnvelope = {};
    Object.defineProperty(accessorEnvelope, "slides", {
      enumerable: true,
      get() {
        accessorReads += 1;
        throw new Error("Carousel accessors must not run.");
      },
    });
    expect(() => reviewCarouselSequence(accessorEnvelope)).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_CAROUSEL_SEQUENCE",
      }),
    );

    const accessorSlide = { ...sequence.slides[0] };
    Object.defineProperty(accessorSlide, "sourceNotes", {
      enumerable: true,
      get() {
        accessorReads += 1;
        throw new Error("Carousel accessors must not run.");
      },
    });
    expect(() =>
      createCarouselDeliverySidecar({
        ...sequence,
        slides: [accessorSlide],
      }),
    ).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_CAROUSEL_SEQUENCE",
      }),
    );
    expect(accessorReads).toBe(0);
  });

  it("reviews a valid ordered organic sequence without inventing hard design rules", async () => {
    const sequence = await organicSequence();
    const review = reviewCarouselSequence(sequence);

    expect(CAROUSEL_SEQUENCE_VERSION).toBe("1.2.0");
    expect(CAROUSEL_NARRATIVE_ROLE_IDS).toEqual([
      "hook",
      "context",
      "evidence",
      "explanation",
      "recap",
      "action",
    ]);
    expect(CAROUSEL_SEQUENCE_LIMITS).toEqual({
      sequenceKeyCharacters: 120,
      slides: 64,
      sourceNotesPerSlide: 32,
      sourceNoteLabelCharacters: 500,
      sourceNoteUrlCharacters: 2_048,
      altTextCharacters: 2_000,
    });
    expect(BROWSER_CAROUSEL_SEQUENCE_LIMITS).toBe(CAROUSEL_SEQUENCE_LIMITS);
    expect(review.success).toBe(true);
    expect(review.issues.every((issue) => issue.severity === "warning")).toBe(true);
    expect(reviewBrowserCarouselSequence(sequence)).toEqual(review);
  });

  it("blocks only concrete profile and sequence-contract failures", async () => {
    const sequence = await organicSequence();
    const review = reviewCarouselSequence({
      deliveryProfileId: "instagram-api-carousel",
      slides: sequence.slides.map((slide, index) => ({
        ...slide,
        ordinal: index + 1,
      })),
    });

    expect(review.success).toBe(false);
    expect(review.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["FORMAT_INCOMPATIBLE", "ORDINAL_SEQUENCE_INVALID"]),
    );
    expect(review.issues.some(({ code }) => code === "COPY_LENGTH_REVIEW")).toBe(
      sequence.slides.some(({ document }) =>
        document.layers.some(
          (layer) =>
            layer.visible && layer.type === "headline" && layer.text.length > 72,
        ),
      ),
    );
  });

  it("keeps recommended aspect ratios advisory", async () => {
    const sequence = await organicSequence();
    const review = reviewCarouselSequence({
      ...sequence,
      deliveryProfileId: "tiktok-carousel-ad",
    });

    expect(review.issues).toContainEqual(
      expect.objectContaining({
        code: "ASPECT_RATIO_OUTSIDE_PROFILE",
        severity: "warning",
      }),
    );
    expect(review.issues).toContainEqual(
      expect.objectContaining({
        code: "FORMAT_INCOMPATIBLE",
        severity: "error",
      }),
    );
  });

  it("blocks publisher alt text that exceeds the selected profile", async () => {
    const sequence = await organicSequence();
    const first = sequence.slides[0];
    if (first === undefined) throw new Error("Expected a first organic slide.");
    const review = reviewCarouselSequence({
      ...sequence,
      slides: [{ ...first, altText: "a".repeat(301) }, ...sequence.slides.slice(1)],
    });

    expect(review.success).toBe(false);
    expect(review.issues).toContainEqual(
      expect.objectContaining({
        code: "ALT_TEXT_OUTSIDE_PROFILE",
        severity: "error",
        slideId: first.document.id,
      }),
    );
  });

  it("keeps recommended publisher alt-text lengths advisory", async () => {
    const sequence = await organicSequence();
    const first = sequence.slides[0];
    if (first === undefined) throw new Error("Expected a first organic slide.");
    const review = reviewCarouselSequence({
      ...sequence,
      deliveryProfileId: "tiktok-content-posting-photo",
      slides: [{ ...first, altText: "a".repeat(301) }, ...sequence.slides.slice(1)],
    });

    expect(review.success).toBe(true);
    expect(review.issues).toContainEqual(
      expect.objectContaining({
        code: "ALT_TEXT_OUTSIDE_PROFILE",
        severity: "warning",
        slideId: first.document.id,
      }),
    );
  });

  it("rejects blank source notes before they can suppress statistic review", async () => {
    const sequence = await organicSequence();
    const first = sequence.slides[0];
    if (first === undefined) throw new Error("Expected a first organic slide.");
    const statisticSlide = {
      ...first,
      document: {
        ...cloneDocument(first.document),
        layers: [
          ...first.document.layers.filter((layer) => layer.type !== "subtitle"),
          {
            id: "proof-statistic",
            type: "statistic" as const,
            value: "42%",
            label: "of launch variants",
            visible: true,
          },
        ],
      },
    };
    const review = reviewCarouselSequence({
      ...sequence,
      slides: [statisticSlide, ...sequence.slides.slice(1)],
    });
    expect(review.issues).toContainEqual(
      expect.objectContaining({
        code: "STATISTIC_SOURCE_REVIEW",
        slideId: statisticSlide.document.id,
      }),
    );

    expect(() =>
      reviewCarouselSequence({
        ...sequence,
        slides: [
          { ...statisticSlide, sourceNotes: [{ label: "   " }] },
          ...sequence.slides.slice(1),
        ],
      }),
    ).toThrow(
      expect.objectContaining<Partial<GlyphkilnError>>({
        code: "INVALID_CAROUSEL_SEQUENCE",
      }),
    );
  });

  it("derives composition rhythm from the document family contract", async () => {
    const sequence = await organicSequence();
    const source = sequence.slides[0];
    if (source === undefined) throw new Error("Expected an organic source slide.");
    const review = reviewCarouselSequence({
      ...sequence,
      slides: [
        source,
        {
          ...source,
          document: { ...cloneDocument(source.document), id: "spoofed-rhythm" },
          ordinal: 1,
          narrativeRole: "context",
          compositionVariantId: "focal-editorial",
        },
        {
          ...source,
          document: { ...cloneDocument(source.document), id: "organic-close" },
          ordinal: 2,
          narrativeRole: "action",
        },
      ],
    });

    expect(review.success).toBe(false);
    expect(review.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "COMPOSITION_VARIANT_INCOMPATIBLE",
          severity: "error",
          slideId: "spoofed-rhythm",
        }),
        expect.objectContaining({
          code: "COMPOSITION_RHYTHM_REVIEW",
          severity: "warning",
        }),
      ]),
    );
  });

  it("creates a deterministic reading-order, alt-text, and source sidecar", async () => {
    const document = await loadNormalizedExample("image-led-campaign");
    document.format = "instagram-portrait";
    const sequence: CarouselSequence = {
      deliveryProfileId: "instagram-native-carousel",
      slides: [
        {
          document,
          ordinal: 0,
          narrativeRole: "hook",
          compositionVariantId: "focal-editorial",
          altText:
            "Portrait launch slide featuring a cobalt ceramic table lamp and campaign copy.",
          sourceNotes: [{ label: "Product launch brief" }],
        },
        {
          document: { ...document, id: "image-led-close" },
          ordinal: 1,
          narrativeRole: "action",
          compositionVariantId: "focal-editorial",
          altText: "Closing campaign slide with a cobalt table lamp and action copy.",
        },
      ],
    };

    const sidecar = createCarouselDeliverySidecar(sequence);
    expect(CAROUSEL_DELIVERY_SIDECAR_VERSION).toBe("1.2.0");
    expect(sidecar.deliveryProfile).toMatchObject({
      id: "instagram-native-carousel",
      metadataVersion: "1.0.0",
      profile: {
        id: "instagram-native-carousel",
        publishingPath: "native",
        slideCount: { value: { minimum: 2, maximum: 20 } },
      },
    });
    expect(sidecar.deliveryProfile.sources.map(({ id }) => id)).toEqual([
      "glyphkiln-carousel-validation",
      "instagram-creators-carousel-limit",
      "meta-instagram-alt-text",
      "meta-instagram-carousel",
      "meta-instagram-photo-resolution",
    ]);
    expect(sidecar.deliveryProfile.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://www.facebook.com/help/instagram/503708446705527",
          retrievedAt: "2026-08-18",
        }),
      ]),
    );
    expect(sidecar.slides[0]?.readingOrder.map(({ layerId }) => layerId)).toEqual([
      "eyebrow",
      "headline",
      "subtitle",
      "cta",
    ]);
    expect(sidecar.slides[0]?.visualDescriptions).toEqual([
      {
        layerId: "campaign-image",
        alt: "A cobalt ceramic table lamp on a warm plaster pedestal.",
      },
      { layerId: "brand-mark", alt: "Kilnform arch mark." },
    ]);
    expect(sidecar.slides[0]?.altText).toBe(
      "Portrait launch slide featuring a cobalt ceramic table lamp and campaign copy.",
    );
    expect(createCarouselDeliverySidecar(sequence)).toEqual(sidecar);
  });
});

async function organicSequence(): Promise<CarouselSequence> {
  const source = await loadNormalizedExample("tiktok-carousel-slide");
  const second: DesignDocument = {
    ...cloneDocument(source),
    id: "tiktok-carousel-close",
  };
  return {
    deliveryProfileId: "tiktok-organic-photo",
    slides: [
      {
        document: source,
        ordinal: 0,
        narrativeRole: "hook",
        compositionVariantId: "organic-photo-editorial",
        altText: "Opening organic carousel slide introducing the sequence.",
      },
      {
        document: second,
        ordinal: 1,
        narrativeRole: "action",
        compositionVariantId: "organic-photo-editorial",
        altText: "Closing organic carousel slide with the final action.",
      },
    ],
  };
}

async function loadNormalizedExample(name: string): Promise<DesignDocument> {
  const validation = validateDesignDocument(await loadExample(name));
  if (!validation.success) throw new Error(`Example ${name} did not validate.`);
  return cloneDocument(validation.data);
}
