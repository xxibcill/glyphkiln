import { describe, expect, it } from "vitest";

import {
  CAROUSEL_DELIVERY_SIDECAR_VERSION,
  CAROUSEL_NARRATIVE_ROLE_IDS,
  CAROUSEL_SEQUENCE_VERSION,
  DELIVERY_PROFILE_IDS,
  DELIVERY_PROFILE_METADATA_VERSION,
  DELIVERY_PROFILE_REGISTRY,
  DELIVERY_SOURCES,
  GlyphkilnError,
  createCarouselDeliverySidecar,
  defaultDeliveryProfileForFormat,
  deliveryProfilesForFormat,
  reviewCarouselSequence,
  validateDesignDocument,
  type CarouselSequence,
  type DesignDocument,
} from "../src/index.js";
import {
  DELIVERY_PROFILE_REGISTRY as BROWSER_DELIVERY_PROFILE_REGISTRY,
  reviewCarouselSequence as reviewBrowserCarouselSequence,
} from "../src/browser.js";
import { cloneDocument, loadExample } from "./helpers.js";

describe("carousel delivery profiles", () => {
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

    expect(CAROUSEL_SEQUENCE_VERSION).toBe("1.0.0");
    expect(CAROUSEL_NARRATIVE_ROLE_IDS).toEqual([
      "hook",
      "context",
      "evidence",
      "explanation",
      "recap",
      "action",
    ]);
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
          sourceNotes: [{ label: "Product launch brief" }],
        },
        {
          document: { ...document, id: "image-led-close" },
          ordinal: 1,
          narrativeRole: "action",
          compositionVariantId: "focal-editorial",
        },
      ],
    };

    const sidecar = createCarouselDeliverySidecar(sequence);
    expect(CAROUSEL_DELIVERY_SIDECAR_VERSION).toBe("1.0.0");
    expect(sidecar.deliveryProfile).toEqual({
      id: "instagram-native-carousel",
      metadataVersion: "1.0.0",
    });
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
      },
      {
        document: second,
        ordinal: 1,
        narrativeRole: "action",
        compositionVariantId: "organic-photo-editorial",
      },
    ],
  };
}

async function loadNormalizedExample(name: string): Promise<DesignDocument> {
  const validation = validateDesignDocument(await loadExample(name));
  if (!validation.success) throw new Error(`Example ${name} did not validate.`);
  return cloneDocument(validation.data);
}
