import { z } from "zod";

import { CAROUSEL_COPY_ADVISORY } from "../authoring/carousel-copy-policy.js";
import {
  isPlainRecord,
  readArrayDataValue,
  readArrayLength,
  readOwnDataProperty,
} from "../authoring/inert-data.js";
import {
  CAMPAIGN_COMPOSITION_VARIANT_IDS,
  CAMPAIGN_FAMILY_REGISTRY,
  type CampaignCompositionVariantId,
} from "../campaigns/index.js";
import { FORMAT_REGISTRY } from "../formats/index.js";
import { GlyphkilnError } from "../domain/types.js";
import {
  validateDesignDocument,
  type DesignDocument,
  type DesignLayer,
} from "../schema/index.js";
import {
  DELIVERY_PROFILE_IDS,
  DELIVERY_PROFILE_METADATA_VERSION,
  DELIVERY_PROFILE_REGISTRY,
  deliverySourcesForProfile,
  isBlockingDeliveryEvidence,
  type DeliveryProfile,
  type DeliveryProfileId,
  type DeliverySource,
} from "../delivery/index.js";

export const CAROUSEL_SEQUENCE_VERSION = "1.2.0" as const;
export const CAROUSEL_DELIVERY_SIDECAR_VERSION = "1.2.0" as const;

export const CAROUSEL_NARRATIVE_ROLE_IDS = Object.freeze([
  "hook",
  "context",
  "evidence",
  "explanation",
  "recap",
  "action",
] as const);
export type CarouselNarrativeRole = (typeof CAROUSEL_NARRATIVE_ROLE_IDS)[number];

export type CarouselSourceNote = {
  readonly label: string;
  readonly url?: string;
};

export type CarouselSlide = {
  readonly document: DesignDocument;
  readonly ordinal: number;
  readonly narrativeRole: CarouselNarrativeRole;
  readonly compositionVariantId: CampaignCompositionVariantId;
  readonly altText: string;
  readonly sourceNotes?: readonly CarouselSourceNote[];
};

export type CarouselSequence = {
  readonly deliveryProfileId: DeliveryProfileId;
  readonly slides: readonly CarouselSlide[];
};

export const CAROUSEL_REVIEW_ISSUE_CODES = Object.freeze([
  "EMPTY_SEQUENCE",
  "SLIDE_COUNT_OUTSIDE_PROFILE",
  "FORMAT_INCOMPATIBLE",
  "ASPECT_RATIO_OUTSIDE_PROFILE",
  "MIXED_SEQUENCE_ASPECT_RATIO",
  "ORDINAL_SEQUENCE_INVALID",
  "HOOK_ROLE_RECOMMENDED",
  "CLOSING_ROLE_RECOMMENDED",
  "COMPOSITION_VARIANT_INCOMPATIBLE",
  "COMPOSITION_RHYTHM_REVIEW",
  "COPY_LENGTH_REVIEW",
  "STATISTIC_SOURCE_REVIEW",
  "ALT_TEXT_OUTSIDE_PROFILE",
  "ALT_TEXT_REVIEW",
] as const);
export type CarouselReviewIssueCode = (typeof CAROUSEL_REVIEW_ISSUE_CODES)[number];

export type CarouselReviewIssue = {
  readonly code: CarouselReviewIssueCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly slideId?: string;
  readonly layerId?: string;
};

export type CarouselSequenceReview = {
  readonly version: typeof CAROUSEL_SEQUENCE_VERSION;
  readonly deliveryProfileId: DeliveryProfileId;
  readonly success: boolean;
  readonly issues: readonly CarouselReviewIssue[];
};

export type CarouselDeliverySidecar = {
  readonly version: typeof CAROUSEL_DELIVERY_SIDECAR_VERSION;
  readonly deliveryProfile: {
    readonly id: DeliveryProfileId;
    readonly metadataVersion: typeof DELIVERY_PROFILE_METADATA_VERSION;
    readonly profile: DeliveryProfile;
    readonly sources: readonly DeliverySource[];
  };
  readonly slides: readonly {
    readonly documentId: string;
    readonly ordinal: number;
    readonly narrativeRole: CarouselNarrativeRole;
    readonly altText: string;
    readonly readingOrder: readonly {
      readonly layerId: string;
      readonly text: string;
    }[];
    readonly visualDescriptions: readonly {
      readonly layerId: string;
      readonly alt: string;
    }[];
    readonly sourceNotes: readonly CarouselSourceNote[];
  }[];
};

export const CAROUSEL_SEQUENCE_LIMITS = Object.freeze({
  slides: 64,
  sourceNotesPerSlide: 32,
  sourceNoteLabelCharacters: 500,
  sourceNoteUrlCharacters: 2_048,
  altTextCharacters: 2_000,
} as const);

const CarouselSourceNoteSchema = z
  .object({
    label: z.string().min(1).max(CAROUSEL_SEQUENCE_LIMITS.sourceNoteLabelCharacters),
    url: z.url().max(CAROUSEL_SEQUENCE_LIMITS.sourceNoteUrlCharacters).optional(),
  })
  .strict();

const CarouselSlideEnvelopeSchema = z
  .object({
    document: z.unknown(),
    ordinal: z
      .number()
      .int()
      .min(0)
      .max(CAROUSEL_SEQUENCE_LIMITS.slides - 1),
    narrativeRole: z.enum(CAROUSEL_NARRATIVE_ROLE_IDS),
    compositionVariantId: z.enum(CAMPAIGN_COMPOSITION_VARIANT_IDS),
    altText: z.string().trim().min(1).max(CAROUSEL_SEQUENCE_LIMITS.altTextCharacters),
    sourceNotes: z
      .array(CarouselSourceNoteSchema)
      .max(CAROUSEL_SEQUENCE_LIMITS.sourceNotesPerSlide)
      .optional(),
  })
  .strict();

const CarouselSequenceEnvelopeSchema = z
  .object({
    deliveryProfileId: z.enum(DELIVERY_PROFILE_IDS),
    slides: z.array(CarouselSlideEnvelopeSchema).max(CAROUSEL_SEQUENCE_LIMITS.slides),
  })
  .strict();

const ADVISORY_TEXT_MAXIMUM_BY_LAYER = Object.freeze({
  badge: CAROUSEL_COPY_ADVISORY.badge.maximum,
  eyebrow: CAROUSEL_COPY_ADVISORY.eyebrow.maximum,
  headline: CAROUSEL_COPY_ADVISORY.headline.maximum,
  subtitle: CAROUSEL_COPY_ADVISORY.subtitle.maximum,
  cta: CAROUSEL_COPY_ADVISORY.cta.maximum,
  footer: CAROUSEL_COPY_ADVISORY.footer.maximum,
  attribution: CAROUSEL_COPY_ADVISORY.attribution.maximum,
} as const satisfies Partial<Record<DesignLayer["type"], number>>);

export function reviewCarouselSequence(input: unknown): CarouselSequenceReview {
  const sequence = parseCarouselSequence(input);
  const profile: DeliveryProfile =
    DELIVERY_PROFILE_REGISTRY[sequence.deliveryProfileId];
  const slides = [...sequence.slides].sort(
    (left, right) => left.ordinal - right.ordinal,
  );
  const issues: CarouselReviewIssue[] = [];
  if (slides.length === 0) {
    issues.push(
      error("EMPTY_SEQUENCE", "A carousel sequence needs at least one slide."),
    );
  }
  const { minimum, maximum } = profile.slideCount.value;
  if (slides.length < minimum || slides.length > maximum) {
    issues.push(
      error(
        "SLIDE_COUNT_OUTSIDE_PROFILE",
        `${profile.label} accepts ${minimum.toString()}–${maximum.toString()} items.`,
      ),
    );
  }

  const aspectRatios = new Set<string>();
  const compositionVariants: string[] = [];
  for (const [index, slide] of slides.entries()) {
    const expectedOrdinal = index;
    if (slide.ordinal !== expectedOrdinal) {
      issues.push(
        error(
          "ORDINAL_SEQUENCE_INVALID",
          `Carousel ordinals must be unique and contiguous from zero; expected ${expectedOrdinal.toString()}.`,
          slide.document.id,
        ),
      );
    }
    if (!profile.compatibleFormats.some((format) => format === slide.document.format)) {
      issues.push(
        error(
          "FORMAT_INCOMPATIBLE",
          `${slide.document.format} is not compatible with ${profile.label}.`,
          slide.document.id,
        ),
      );
    }
    const dimensions = FORMAT_REGISTRY[slide.document.format];
    const ratio = dimensions.width / dimensions.height;
    aspectRatios.add(ratio.toFixed(6));
    const minimumRatio = profile.aspectRatio.value.minimumWidthPerHeight;
    const maximumRatio = profile.aspectRatio.value.maximumWidthPerHeight;
    if (
      (minimumRatio !== undefined && ratio < minimumRatio - 0.000_001) ||
      (maximumRatio !== undefined && ratio > maximumRatio + 0.000_001)
    ) {
      issues.push(
        isBlockingDeliveryEvidence(profile.aspectRatio.evidence)
          ? error(
              "ASPECT_RATIO_OUTSIDE_PROFILE",
              `${slide.document.format} falls outside the selected delivery profile's aspect-ratio range.`,
              slide.document.id,
            )
          : warning(
              "ASPECT_RATIO_OUTSIDE_PROFILE",
              `${slide.document.format} falls outside the selected delivery profile's recommended aspect-ratio range.`,
              slide.document.id,
            ),
      );
    }
    compositionVariants.push(reviewCompositionVariant(slide, issues));
    reviewSlideCopy(slide, issues);
    reviewSlideAccessibility(slide, profile, issues);
  }

  if (profile.aspectRatio.value.sameAcrossSequence && aspectRatios.size > 1) {
    issues.push(
      error(
        "MIXED_SEQUENCE_ASPECT_RATIO",
        `${profile.label} requires one aspect ratio across the sequence.`,
      ),
    );
  }
  if (slides.length > 1 && slides[0]?.narrativeRole !== "hook") {
    issues.push(
      warning(
        "HOOK_ROLE_RECOMMENDED",
        "Use a hook role first so the sequence establishes one clear promise.",
        slides[0]?.document.id,
      ),
    );
  }
  const lastSlide = slides.at(-1);
  if (
    slides.length > 1 &&
    lastSlide !== undefined &&
    lastSlide.narrativeRole !== "action" &&
    lastSlide.narrativeRole !== "recap"
  ) {
    issues.push(
      warning(
        "CLOSING_ROLE_RECOMMENDED",
        "End with an action or recap role so the sequence resolves deliberately.",
        lastSlide.document.id,
      ),
    );
  }
  if (slides.length >= 3 && new Set(compositionVariants).size === 1) {
    issues.push(
      warning(
        "COMPOSITION_RHYTHM_REVIEW",
        "Every slide uses the same composition variant; review visual rhythm without weakening brand continuity.",
      ),
    );
  }
  return {
    version: CAROUSEL_SEQUENCE_VERSION,
    deliveryProfileId: sequence.deliveryProfileId,
    success: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

function reviewCompositionVariant(
  slide: CarouselSlide,
  issues: CarouselReviewIssue[],
): string {
  const member = Object.values(CAMPAIGN_FAMILY_REGISTRY)
    .flatMap((family) => family.members)
    .find(
      (candidate) =>
        candidate.template.id === slide.document.template.id &&
        candidate.template.version === slide.document.template.version &&
        candidate.formats.some((format) => format === slide.document.format),
    );
  if (member === undefined) return slide.compositionVariantId;

  const declaredVariant = member.compositionVariants.find(
    ({ id }) => id === slide.compositionVariantId,
  );
  if (declaredVariant !== undefined) return member.compositionVariants[0].id;

  issues.push(
    error(
      "COMPOSITION_VARIANT_INCOMPATIBLE",
      `${slide.compositionVariantId} is not a composition variant for ${member.template.id}@${member.template.version} in ${slide.document.format}.`,
      slide.document.id,
    ),
  );
  return member.compositionVariants[0].id;
}

export function createCarouselDeliverySidecar(input: unknown): CarouselDeliverySidecar {
  const sequence = parseCarouselSequence(input);
  const profile = DELIVERY_PROFILE_REGISTRY[sequence.deliveryProfileId];
  return {
    version: CAROUSEL_DELIVERY_SIDECAR_VERSION,
    deliveryProfile: {
      id: sequence.deliveryProfileId,
      metadataVersion: DELIVERY_PROFILE_METADATA_VERSION,
      profile,
      sources: deliverySourcesForProfile(profile),
    },
    slides: [...sequence.slides]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((slide) => ({
        documentId: slide.document.id,
        ordinal: slide.ordinal,
        narrativeRole: slide.narrativeRole,
        altText: slide.altText,
        readingOrder: slide.document.layers.flatMap(readingOrderEntry),
        visualDescriptions: slide.document.layers.flatMap(visualDescriptionEntry),
        sourceNotes: [...(slide.sourceNotes ?? [])],
      })),
  };
}

function parseCarouselSequence(input: unknown): CarouselSequence {
  const inertInput = readInertCarouselSequenceEnvelope(input);
  const boundProblems = preflightCarouselSequenceBounds(inertInput);
  if (boundProblems.length > 0) throwInvalidCarouselSequence(boundProblems);

  const result = CarouselSequenceEnvelopeSchema.safeParse(inertInput);
  if (!result.success) {
    throwInvalidCarouselSequence(
      result.error.issues.map((issue) => ({
        path: formatProblemPath(issue.path),
        code: issue.code,
        message: issue.message,
      })),
    );
  }

  const problems: CarouselValidationProblem[] = [];
  const slides: CarouselSlide[] = [];
  for (const [index, slide] of result.data.slides.entries()) {
    const validation = validateDesignDocument(slide.document);
    if (!validation.success) {
      problems.push(
        ...validation.problems.map((problem) => ({
          ...problem,
          path: `slides[${index.toString()}].document.${problem.path}`,
        })),
      );
      continue;
    }
    slides.push({
      document: validation.data,
      ordinal: slide.ordinal,
      narrativeRole: slide.narrativeRole,
      compositionVariantId: slide.compositionVariantId,
      altText: slide.altText,
      ...(slide.sourceNotes === undefined
        ? {}
        : {
            sourceNotes: slide.sourceNotes.map((note) => ({
              label: note.label,
              ...(note.url === undefined ? {} : { url: note.url }),
            })),
          }),
    });
  }
  if (problems.length > 0) throwInvalidCarouselSequence(problems);

  return {
    deliveryProfileId: result.data.deliveryProfileId,
    slides,
  };
}

type CarouselValidationProblem = {
  readonly path: string;
  readonly code: string;
  readonly message: string;
};

function preflightCarouselSequenceBounds(input: unknown): CarouselValidationProblem[] {
  if (!isRecord(input) || !Array.isArray(input["slides"])) return [];
  const slides = input["slides"];
  if (slides.length > CAROUSEL_SEQUENCE_LIMITS.slides) {
    return [
      {
        path: "slides",
        code: "too_big",
        message: `Carousel sequences support at most ${CAROUSEL_SEQUENCE_LIMITS.slides.toString()} slides.`,
      },
    ];
  }
  for (const [index, slide] of slides.entries()) {
    if (!isRecord(slide) || !Array.isArray(slide["sourceNotes"])) continue;
    if (slide["sourceNotes"].length > CAROUSEL_SEQUENCE_LIMITS.sourceNotesPerSlide) {
      return [
        {
          path: `slides[${index.toString()}].sourceNotes`,
          code: "too_big",
          message: `Carousel slides support at most ${CAROUSEL_SEQUENCE_LIMITS.sourceNotesPerSlide.toString()} source notes.`,
        },
      ];
    }
  }
  return [];
}

const CAROUSEL_SEQUENCE_ENVELOPE_KEYS = new Set(["deliveryProfileId", "slides"]);
const CAROUSEL_SLIDE_ENVELOPE_KEYS = new Set([
  "document",
  "ordinal",
  "narrativeRole",
  "compositionVariantId",
  "altText",
  "sourceNotes",
]);
const CAROUSEL_SLIDE_REQUIRED_KEYS = new Set([
  "document",
  "ordinal",
  "narrativeRole",
  "compositionVariantId",
  "altText",
]);
const CAROUSEL_SOURCE_NOTE_KEYS = new Set(["label", "url"]);
const CAROUSEL_SOURCE_NOTE_REQUIRED_KEYS = new Set(["label"]);

function readInertCarouselSequenceEnvelope(input: unknown): unknown {
  const envelope = readInertRecord(
    input,
    CAROUSEL_SEQUENCE_ENVELOPE_KEYS,
    CAROUSEL_SEQUENCE_ENVELOPE_KEYS,
  );
  if (envelope === undefined) return undefined;

  const slides = readBoundedInertArray(
    envelope["slides"],
    CAROUSEL_SEQUENCE_LIMITS.slides,
    readInertCarouselSlide,
  );
  return {
    deliveryProfileId: envelope["deliveryProfileId"],
    slides,
  };
}

function readInertCarouselSlide(input: unknown): unknown {
  const slide = readInertRecord(
    input,
    CAROUSEL_SLIDE_ENVELOPE_KEYS,
    CAROUSEL_SLIDE_REQUIRED_KEYS,
  );
  if (slide === undefined) return undefined;

  const sourceNotes =
    "sourceNotes" in slide && slide["sourceNotes"] !== undefined
      ? readBoundedInertArray(
          slide["sourceNotes"],
          CAROUSEL_SEQUENCE_LIMITS.sourceNotesPerSlide,
          readInertCarouselSourceNote,
        )
      : undefined;
  return {
    document: slide["document"],
    ordinal: slide["ordinal"],
    narrativeRole: slide["narrativeRole"],
    compositionVariantId: slide["compositionVariantId"],
    altText: slide["altText"],
    ...(sourceNotes === undefined ? {} : { sourceNotes }),
  };
}

function readInertCarouselSourceNote(input: unknown): unknown {
  return readInertRecord(
    input,
    CAROUSEL_SOURCE_NOTE_KEYS,
    CAROUSEL_SOURCE_NOTE_REQUIRED_KEYS,
  );
}

function readBoundedInertArray(
  input: unknown,
  maximum: number,
  readEntry: (entry: unknown) => unknown,
): unknown {
  const length = readArrayLength(input);
  if (length === undefined) return null;
  if (length > maximum) return Array.from({ length: maximum + 1 });
  if (!Array.isArray(input)) return null;

  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    values.push(readEntry(readArrayDataValue(input, index)));
  }
  return values;
}

function readInertRecord(
  input: unknown,
  allowedKeys: ReadonlySet<string>,
  requiredKeys: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  if (!isPlainRecord(input)) return undefined;

  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(input);
  } catch {
    return undefined;
  }
  if (
    keys.some((key) => typeof key !== "string" || !allowedKeys.has(key)) ||
    [...requiredKeys].some((key) => !keys.includes(key))
  ) {
    return undefined;
  }

  const output: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of keys) {
    if (typeof key !== "string") return undefined;
    const property = readOwnDataProperty(input, key);
    if (!property.found) return undefined;
    output[key] = property.value;
  }
  return output;
}

function throwInvalidCarouselSequence(
  problems: readonly CarouselValidationProblem[],
): never {
  throw new GlyphkilnError(
    "Carousel sequence validation failed.",
    "INVALID_CAROUSEL_SEQUENCE",
    { problems },
  );
}

function formatProblemPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "$";
  return path.reduce<string>((output, part) => {
    if (typeof part === "number") return `${output}[${part.toString()}]`;
    const segment = String(part);
    return output.length === 0 ? segment : `${output}.${segment}`;
  }, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reviewSlideCopy(slide: CarouselSlide, issues: CarouselReviewIssue[]): void {
  for (const layer of slide.document.layers) {
    if (!layer.visible) continue;
    for (const candidate of copyCandidates(layer)) {
      if (candidate.text.length <= candidate.maximum) continue;
      issues.push(
        warning(
          "COPY_LENGTH_REVIEW",
          `${candidate.label} is ${candidate.text.length.toString()} characters; the ${candidate.maximum.toString()}-character value is an editable Glyphkiln advisory, not a platform limit.`,
          slide.document.id,
          layer.id,
        ),
      );
    }
  }
}

function reviewSlideAccessibility(
  slide: CarouselSlide,
  profile: DeliveryProfile,
  issues: CarouselReviewIssue[],
): void {
  const maximumAltTextCharacters = profile.accessibility.value.maximumAltTextCharacters;
  if (
    maximumAltTextCharacters !== undefined &&
    slide.altText.length > maximumAltTextCharacters
  ) {
    const blocksDelivery = isBlockingDeliveryEvidence(profile.accessibility.evidence);
    issues.push(
      blocksDelivery
        ? error(
            "ALT_TEXT_OUTSIDE_PROFILE",
            `${profile.label} accepts at most ${maximumAltTextCharacters.toString()} alt-text characters per image.`,
            slide.document.id,
          )
        : warning(
            "ALT_TEXT_OUTSIDE_PROFILE",
            `${profile.label} recommends at most ${maximumAltTextCharacters.toString()} alt-text characters per image.`,
            slide.document.id,
          ),
    );
  }
  const hasStatistic = slide.document.layers.some(
    (layer) => layer.visible && layer.type === "statistic",
  );
  if (hasStatistic && (slide.sourceNotes?.length ?? 0) === 0) {
    issues.push(
      warning(
        "STATISTIC_SOURCE_REVIEW",
        "A visible statistic has no delivery source note; verify the claim and add portable provenance.",
        slide.document.id,
      ),
    );
  }
  for (const layer of slide.document.layers) {
    if (!layer.visible || !isAssetLayer(layer)) continue;
    const normalized = layer.alt.trim().toLocaleLowerCase("en-US");
    if (
      normalized === "selected campaign image." ||
      normalized === "selected brand logo." ||
      normalized === "image" ||
      normalized === "logo"
    ) {
      issues.push(
        warning(
          "ALT_TEXT_REVIEW",
          "Replace generic asset alt text with the specific visual meaning needed for this slide.",
          slide.document.id,
          layer.id,
        ),
      );
    }
  }
}

function copyCandidates(layer: DesignLayer): readonly {
  label: string;
  text: string;
  maximum: number;
}[] {
  if (layer.type === "statistic") {
    return [
      {
        label: "Statistic value",
        text: layer.value,
        maximum: CAROUSEL_COPY_ADVISORY.statistic.value.maximum,
      },
      {
        label: "Statistic label",
        text: layer.label,
        maximum: CAROUSEL_COPY_ADVISORY.statistic.label.maximum,
      },
      ...(layer.trend === undefined
        ? []
        : [
            {
              label: "Statistic trend",
              text: layer.trend,
              maximum: CAROUSEL_COPY_ADVISORY.statistic.trend.maximum,
            },
          ]),
    ];
  }
  if (!("text" in layer)) return [];
  const maximum = ADVISORY_TEXT_MAXIMUM_BY_LAYER[layer.type];
  return [{ label: layer.type, text: layer.text, maximum }];
}

function readingOrderEntry(
  layer: DesignLayer,
): readonly { readonly layerId: string; readonly text: string }[] {
  if (!layer.visible) return [];
  if (layer.type === "statistic") {
    return [
      {
        layerId: layer.id,
        text: [layer.value, layer.label, layer.trend].filter(Boolean).join(" · "),
      },
    ];
  }
  return "text" in layer ? [{ layerId: layer.id, text: layer.text }] : [];
}

function visualDescriptionEntry(
  layer: DesignLayer,
): readonly { readonly layerId: string; readonly alt: string }[] {
  return layer.visible && isAssetLayer(layer)
    ? [{ layerId: layer.id, alt: layer.alt }]
    : [];
}

function isAssetLayer(
  layer: DesignLayer,
): layer is Extract<DesignLayer, { type: "image" | "logo" | "product-screenshot" }> {
  return (
    layer.type === "image" ||
    layer.type === "logo" ||
    layer.type === "product-screenshot"
  );
}

function error(
  code: CarouselReviewIssueCode,
  message: string,
  slideId?: string,
  layerId?: string,
): CarouselReviewIssue {
  return {
    code,
    severity: "error",
    message,
    ...(slideId ? { slideId } : {}),
    ...(layerId ? { layerId } : {}),
  };
}

function warning(
  code: CarouselReviewIssueCode,
  message: string,
  slideId?: string,
  layerId?: string,
): CarouselReviewIssue {
  return {
    code,
    severity: "warning",
    message,
    ...(slideId ? { slideId } : {}),
    ...(layerId ? { layerId } : {}),
  };
}
