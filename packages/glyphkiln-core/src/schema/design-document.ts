import { z } from "zod";

import { hashCanonical } from "../cache/canonical.js";
import { DESIGN_DOCUMENT_VERSION } from "../domain/types.js";
import { FORMAT_IDS } from "../formats/index.js";
import {
  assertDesignInputResources,
  getDesignInputResourceProblems,
  RENDER_RESOURCE_LIMITS,
} from "../resources/index.js";

const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const semanticVersion = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const normalized = z.number().min(0).max(1);
const positiveDimension = z
  .number()
  .int()
  .positive()
  .max(RENDER_RESOURCE_LIMITS.maxAssetDimension);
const sha256Hash = z.string().regex(/^[0-9a-f]{64}$/);

export const QuietRegionSchema = z
  .object({
    x: normalized,
    y: normalized,
    width: normalized.positive(),
    height: normalized.positive(),
  })
  .strict()
  .refine((region) => region.x + region.width <= 1, {
    message: "Quiet region must fit horizontally inside the canvas.",
  })
  .refine((region) => region.y + region.height <= 1, {
    message: "Quiet region must fit vertically inside the canvas.",
  });

const safeAreaSchema = z
  .object({
    top: z.number().min(0).max(0.4),
    right: z.number().min(0).max(0.4),
    bottom: z.number().min(0).max(0.4),
    left: z.number().min(0).max(0.4),
  })
  .strict();

const themeSchema = z
  .object({
    background: color,
    surface: color,
    text: color,
    mutedText: color,
  })
  .strict();

export const PROCEDURAL_STYLE_IDS = [
  "flow-field",
  "layered-waves",
  "topographic-contours",
  "recursive-subdivision",
] as const;

const legacyTypographySchema = z
  .object({
    headlineFamily: z.string().min(1).max(120),
    bodyFamily: z.string().min(1).max(120),
    monospaceFamily: z.string().min(1).max(120).optional(),
  })
  .strict();

const typographyRoleSchema = z
  .object({
    family: z.string().min(1).max(120),
    weight: z.number().int().min(100).max(900).multipleOf(100),
    lineHeight: z.number().min(0.85).max(1.8),
    tracking: z.number().min(-0.05).max(0.2),
  })
  .strict();

const currentTypographySchema = legacyTypographySchema
  .extend({
    roles: z
      .object({
        display: typographyRoleSchema.optional(),
        body: typographyRoleSchema.optional(),
        label: typographyRoleSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Font model fields introduced by DesignDocument 1.8.0 (typography plan
 * M1a): registered or custom `fvar` axes, a named instance and optical
 * sizing. Values are checked against the face's `fvar` at render time.
 */
export const FONT_AXIS_TAG_PATTERN = /^(?:wght|wdth|opsz|slnt|ital|[A-Z][A-Z0-9]{3})$/;

export const FontAxesSchema = z
  .record(
    z.string().regex(FONT_AXIS_TAG_PATTERN, {
      message: "Axis tags are wght, wdth, opsz, slnt, ital or a custom uppercase tag.",
    }),
    z.number().min(-1000).max(1000),
  )
  .refine((axes) => Object.keys(axes).length <= 8, {
    message: "At most eight axes may be set.",
  });

const fontVariationFields = {
  axes: FontAxesSchema.optional(),
  namedInstance: z.string().min(1).max(64).optional(),
  opticalSizing: z.enum(["auto", "none"]).optional(),
  opsz: z.number().min(1).max(1000).optional(),
};

const fontFamilyName = z.string().min(1).max(120);

/** One face of a fallback stack or a per-script face (M1c). */
export const FontFaceSpecSchema = z
  .object({
    family: fontFamilyName,
    scale: z.union([z.literal("auto"), z.number().min(0.5).max(2)]).optional(),
    baselineShift: z
      .union([z.literal("auto"), z.number().min(-0.5).max(0.5)])
      .optional(),
  })
  .strict();

/**
 * Thai lexicon entries (DesignDocument 1.8.0, M3): Thai letters, vowels and
 * marks only (Line_Break class SA), NFC, at most 40 code units. The
 * `thai-segmentation-hybrid` segmenter never splits an entry.
 */
export const THAI_LEXICON_ENTRY_PATTERN = /^[\u0E01-\u0E3A\u0E40-\u0E4E]+$/;

const thaiLexicon = z
  .array(
    z
      .string()
      .min(1)
      .max(40)
      .regex(THAI_LEXICON_ENTRY_PATTERN, {
        message: "Lexicon entries are Thai letters, vowels and marks only.",
      })
      .refine((entry) => entry.normalize("NFC") === entry, {
        message: "Lexicon entries must be NFC.",
      }),
  )
  .max(100)
  .refine((entries) => new Set(entries).size === entries.length, {
    message: "Lexicon entries must be unique.",
  });

const typographyRoleV1_8_0Schema = typographyRoleSchema
  .extend({
    ...fontVariationFields,
    fallback: z.array(FontFaceSpecSchema).min(1).max(3).optional(),
    scriptFaces: z
      .object({
        latn: FontFaceSpecSchema.optional(),
        thai: FontFaceSpecSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const typographyV1_8_0Schema = legacyTypographySchema
  .extend({
    /** Brand Thai lexicon (M3). */
    lexicon: thaiLexicon.optional(),
    roles: z
      .object({
        display: typographyRoleV1_8_0Schema.optional(),
        body: typographyRoleV1_8_0Schema.optional(),
        label: typographyRoleV1_8_0Schema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const brandSnapshotFields = {
  snapshotId: identifier,
  version: semanticVersion,
  name: z.string().min(1).max(120),
  palette: z
    .object({
      primary: color,
      secondary: color,
      accent: color,
      neutrals: z.array(color).min(2).max(12),
    })
    .strict(),
  themes: z
    .object({
      light: themeSchema,
      dark: themeSchema,
    })
    .strict(),
  spacingScale: z.array(z.number().positive()).min(3).max(12),
  borderRadii: z.array(z.number().min(0)).min(1).max(8),
  visualDensity: z.enum(["quiet", "balanced", "dense"]),
  preferredProceduralStyles: z
    .array(z.enum(PROCEDURAL_STYLE_IDS))
    .min(1)
    .max(PROCEDURAL_STYLE_IDS.length),
  safeArea: safeAreaSchema,
  prohibitedColors: z.array(color).max(24).default([]),
  prohibitedStyles: z.array(z.string().min(1).max(80)).max(24).default([]),
};

const LegacyBrandSnapshotSchema = z
  .object({
    ...brandSnapshotFields,
    typography: legacyTypographySchema,
  })
  .strict();

export const BrandSnapshotSchema = z
  .object({
    ...brandSnapshotFields,
    typography: currentTypographySchema,
  })
  .strict();

/** Closed color-role names introduced by DesignDocument 1.7.0. */
export const BRAND_COLOR_ROLE_IDS = [
  "ground",
  "figure",
  "text",
  "accent",
  "signal",
] as const;

const colorRoleSetSchema = z
  .object({
    ground: color,
    figure: color,
    text: color,
    accent: color,
    signal: color,
  })
  .strict();

export const BrandColorRolesSchema = z
  .object({
    light: colorRoleSetSchema,
    dark: colorRoleSetSchema,
    accentAreaBudget: z.number().min(0.01).max(0.3).default(0.08),
  })
  .strict();

const BrandSnapshotV1_7_0Schema = z
  .object({
    ...brandSnapshotFields,
    typography: currentTypographySchema,
    colorRoles: BrandColorRolesSchema.optional(),
  })
  .strict();

const BrandSnapshotV1_8_0Schema = z
  .object({
    ...brandSnapshotFields,
    typography: typographyV1_8_0Schema,
    colorRoles: BrandColorRolesSchema.optional(),
  })
  .strict();

const layerBase = {
  id: identifier,
  visible: z.boolean().default(true),
};

const keepTogetherPhrase = z
  .string()
  .min(1)
  .max(200)
  .refine((phrase) => phrase.trim() === phrase, {
    message: "Keep-together phrases must not have leading or trailing whitespace.",
  })
  .refine((phrase) => !/[\r\n]/.test(phrase), {
    message: "Keep-together phrases cannot cross an explicit line break.",
  });

const keepTogetherPhrases = z
  .array(keepTogetherPhrase)
  .max(20)
  .refine((phrases) => new Set(phrases).size === phrases.length, {
    message: "Keep-together phrases must be unique.",
  });

/**
 * DesignDocument 1.8.0 keep-together (typography plan M3): the phrase list of
 * earlier versions, or an object with those `phrases` and `preferBreakAfter`
 * phrases, after which a line break is preferred (semantic line breaks).
 */
const keepTogetherV1_8_0 = z.union([
  keepTogetherPhrases,
  z
    .object({
      phrases: keepTogetherPhrases.optional(),
      preferBreakAfter: keepTogetherPhrases.optional(),
    })
    .strict(),
]);

type KeepTogetherValue = z.infer<typeof keepTogetherV1_8_0> | undefined;

/** The keep-together phrases of either 1.8.0 form. */
export function keepTogetherPhrasesOf(value: KeepTogetherValue): readonly string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : (value.phrases ?? []);
}

/** The preferred-break phrases of a 1.8.0 keep-together object. */
export function preferBreakAfterOf(value: KeepTogetherValue): readonly string[] {
  if (value === undefined || Array.isArray(value)) return [];
  return value.preferBreakAfter ?? [];
}

function textLayerFields<T extends string>(type: T) {
  return {
    ...layerBase,
    type: z.literal(type),
    text: z.string().min(1).max(2_000),
    color: color.optional(),
    fontFamily: z.string().min(1).max(120).optional(),
    fontWeight: z.number().int().min(100).max(900).multipleOf(100).optional(),
    fontSize: z.number().positive().max(512).optional(),
    maxLines: z.number().int().positive().max(20).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
  };
}

function legacyTextLayerSchema<T extends string>(type: T) {
  return z.object(textLayerFields(type)).strict();
}

function textLayerSchema<T extends string>(type: T) {
  return z
    .object({
      ...textLayerFields(type),
      keepTogether: keepTogetherPhrases.optional(),
    })
    .strict();
}

/** Closed rich-text emphasis styles introduced by DesignDocument 1.7.0. */
export const TEXT_EMPHASIS_STYLE_IDS = [
  "strong",
  "accent",
  "strong-accent",
  "italic",
  "muted",
] as const;

const emphasisSpans = z
  .array(
    z
      .object({
        phrase: keepTogetherPhrase,
        style: z.enum(TEXT_EMPHASIS_STYLE_IDS),
      })
      .strict(),
  )
  .min(1)
  .max(8)
  .refine((spans) => new Set(spans.map((span) => span.phrase)).size === spans.length, {
    message: "Emphasis phrases must be unique.",
  });

/** Closed numeral styles for explicit OpenType control (1.7.0). */
export const OPENTYPE_NUMERAL_STYLE_IDS = [
  "proportional-lining",
  "tabular-lining",
  "proportional-oldstyle",
  "tabular-oldstyle",
] as const;

export const OpenTypeFeatureSettingsSchema = z
  .object({
    kerning: z.boolean().optional(),
    ligatures: z.boolean().optional(),
    numerals: z.enum(OPENTYPE_NUMERAL_STYLE_IDS).optional(),
    caseSensitiveForms: z.boolean().optional(),
    smallCaps: z.boolean().optional(),
  })
  .strict();

function textLayerV1_7_0Schema<T extends string>(type: T) {
  return z
    .object({
      ...textLayerFields(type),
      keepTogether: keepTogetherPhrases.optional(),
      emphasis: emphasisSpans.optional(),
      openType: OpenTypeFeatureSettingsSchema.optional(),
    })
    .strict();
}

function textLayerV1_8_0Schema<T extends string>(type: T) {
  return z
    .object({
      ...textLayerFields(type),
      keepTogether: keepTogetherV1_8_0.optional(),
      emphasis: emphasisSpans.optional(),
      openType: OpenTypeFeatureSettingsSchema.optional(),
      ...fontVariationFields,
    })
    .strict();
}

function assetLayerSchema<T extends string>(type: T) {
  return z
    .object({
      ...layerBase,
      type: z.literal(type),
      assetId: identifier,
      alt: z.string().min(1).max(500),
      fit: z.enum(["contain", "cover"]).default("contain"),
    })
    .strict();
}

export const IMAGE_TREATMENT_IDS = ["none", "dark-scrim", "light-scrim"] as const;
/** Local treatments (1.7.0) darken or lighten only behind copy. */
export const LOCAL_IMAGE_TREATMENT_IDS = [
  "local-dark-scrim",
  "local-light-scrim",
] as const;

export const FocalPointSchema = z
  .object({
    x: normalized,
    y: normalized,
  })
  .strict();

const currentImageLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("image"),
    assetId: identifier,
    alt: z.string().min(1).max(500),
    fit: z.enum(["contain", "cover"]).default("contain"),
    focalPoint: FocalPointSchema.optional(),
    treatment: z.enum(IMAGE_TREATMENT_IDS).optional(),
  })
  .strict();

const imageLayerV1_7_0Schema = z
  .object({
    ...layerBase,
    type: z.literal("image"),
    assetId: identifier,
    alt: z.string().min(1).max(500),
    fit: z.enum(["contain", "cover"]).default("contain"),
    focalPoint: FocalPointSchema.optional(),
    treatment: z
      .enum([...IMAGE_TREATMENT_IDS, ...LOCAL_IMAGE_TREATMENT_IDS])
      .optional(),
    /** Normalized region of the source image that holds the product or subject. */
    subjectRegion: QuietRegionSchema.optional(),
  })
  .strict();

const backgroundLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("background"),
    color: color.optional(),
  })
  .strict();

const proceduralDecorationFields = {
  ...layerBase,
  type: z.literal("procedural-decoration"),
  style: z.enum(PROCEDURAL_STYLE_IDS),
  intensity: normalized,
  density: normalized,
  complexity: normalized,
  contrast: normalized,
  quietRegion: QuietRegionSchema,
};

const proceduralDecorationLayerSchema = z.object(proceduralDecorationFields).strict();

/** Declared jobs that let decoration render in decoration-off templates (1.7.0). */
export const DECORATION_JOB_IDS = ["atmosphere", "identity"] as const;

const proceduralDecorationLayerV1_7_0Schema = z
  .object({
    ...proceduralDecorationFields,
    job: z.enum(DECORATION_JOB_IDS).optional(),
  })
  .strict();

const iconLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("icon"),
    name: z.enum(["arrow-up-right", "check", "sparkles", "chart"]),
    color: color.optional(),
  })
  .strict();

const badgeLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("badge"),
    text: z.string().min(1).max(80),
    color: color.optional(),
  })
  .strict();

const shapeLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("shape"),
    shape: z.enum(["rectangle", "circle", "line"]),
    color,
    opacity: normalized.default(1),
  })
  .strict();

const statisticLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("statistic"),
    value: z.string().min(1).max(80),
    label: z.string().min(1).max(240),
    trend: z.string().min(1).max(80).optional(),
  })
  .strict();

const chartLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("chart"),
    chart: z.enum(["bar", "sparkline"]),
    values: z
      .array(
        z
          .object({
            label: z.string().min(1).max(80),
            value: z.number(),
            color: color.optional(),
          })
          .strict(),
      )
      .min(2)
      .max(32),
  })
  .strict();

const sharedLayerSchemas = [
  backgroundLayerSchema,
  proceduralDecorationLayerSchema,
  assetLayerSchema("logo"),
  assetLayerSchema("product-screenshot"),
  assetLayerSchema("image"),
  iconLayerSchema,
  badgeLayerSchema,
  shapeLayerSchema,
  statisticLayerSchema,
  chartLayerSchema,
] as const;

const LegacyLayerSchema = z.discriminatedUnion("type", [
  ...sharedLayerSchemas,
  legacyTextLayerSchema("headline"),
  legacyTextLayerSchema("subtitle"),
  legacyTextLayerSchema("eyebrow"),
  legacyTextLayerSchema("cta"),
  legacyTextLayerSchema("footer"),
  legacyTextLayerSchema("attribution"),
]);

const LayerV1_2_0Schema = z.discriminatedUnion("type", [
  ...sharedLayerSchemas,
  textLayerSchema("headline"),
  textLayerSchema("subtitle"),
  textLayerSchema("eyebrow"),
  textLayerSchema("cta"),
  textLayerSchema("footer"),
  textLayerSchema("attribution"),
]);

const LayerV1_4_0Schema = z.discriminatedUnion("type", [
  backgroundLayerSchema,
  proceduralDecorationLayerSchema,
  assetLayerSchema("logo"),
  assetLayerSchema("product-screenshot"),
  currentImageLayerSchema,
  iconLayerSchema,
  badgeLayerSchema,
  shapeLayerSchema,
  statisticLayerSchema,
  chartLayerSchema,
  textLayerSchema("headline"),
  textLayerSchema("subtitle"),
  textLayerSchema("eyebrow"),
  textLayerSchema("cta"),
  textLayerSchema("footer"),
  textLayerSchema("attribution"),
]);

const benefitListLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("benefit-list"),
    items: z
      .array(
        z
          .object({
            title: z.string().min(1).max(80).regex(/\S/u),
            description: z.string().min(1).max(180).regex(/\S/u).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();

const LayerV1_5_0Schema = z.discriminatedUnion("type", [
  ...LayerV1_4_0Schema.options,
  benefitListLayerSchema,
]);

const proofText = (maximum: number) => z.string().min(1).max(maximum).regex(/\S/u);
const comparisonTableLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("comparison-table"),
    leftLabel: proofText(60),
    rightLabel: proofText(60),
    rows: z
      .array(
        z
          .object({ label: proofText(60), left: proofText(100), right: proofText(100) })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();
const problemSolutionLayerSchema = z
  .object({
    ...layerBase,
    type: z.literal("problem-solution"),
    problemTitle: proofText(80),
    problem: proofText(180),
    solutionTitle: proofText(80),
    solution: proofText(180),
  })
  .strict();
const LayerV1_6_0Schema = z.discriminatedUnion("type", [
  ...LayerV1_5_0Schema.options,
  comparisonTableLayerSchema,
  problemSolutionLayerSchema,
]);

export const LayerSchema = z.discriminatedUnion("type", [
  backgroundLayerSchema,
  proceduralDecorationLayerV1_7_0Schema,
  assetLayerSchema("logo"),
  assetLayerSchema("product-screenshot"),
  imageLayerV1_7_0Schema,
  iconLayerSchema,
  badgeLayerSchema,
  shapeLayerSchema,
  statisticLayerSchema,
  chartLayerSchema,
  textLayerV1_7_0Schema("headline"),
  textLayerV1_7_0Schema("subtitle"),
  textLayerV1_7_0Schema("eyebrow"),
  textLayerV1_7_0Schema("cta"),
  textLayerV1_7_0Schema("footer"),
  textLayerV1_7_0Schema("attribution"),
  benefitListLayerSchema,
  comparisonTableLayerSchema,
  problemSolutionLayerSchema,
]);

export const LayerV1_8_0Schema = z.discriminatedUnion("type", [
  backgroundLayerSchema,
  proceduralDecorationLayerV1_7_0Schema,
  assetLayerSchema("logo"),
  assetLayerSchema("product-screenshot"),
  imageLayerV1_7_0Schema,
  iconLayerSchema,
  badgeLayerSchema,
  shapeLayerSchema,
  statisticLayerSchema,
  chartLayerSchema,
  textLayerV1_8_0Schema("headline"),
  textLayerV1_8_0Schema("subtitle"),
  textLayerV1_8_0Schema("eyebrow"),
  textLayerV1_8_0Schema("cta"),
  textLayerV1_8_0Schema("footer"),
  textLayerV1_8_0Schema("attribution"),
  benefitListLayerSchema,
  comparisonTableLayerSchema,
  problemSolutionLayerSchema,
]);

export const AssetDeclarationSchema = z
  .object({
    id: identifier,
    mimeType: z.enum(["image/png", "image/jpeg"]),
    sha256: sha256Hash,
    width: positiveDimension,
    height: positiveDimension,
    origin: z
      .object({
        kind: z.enum(["user-upload", "licensed-library", "generated", "unknown"]),
        sourceName: z.string().min(1).max(200).optional(),
        sourceReference: z.string().min(1).max(500).optional(),
        generativeImageModel: z.string().min(1).max(200).optional(),
      })
      .strict(),
  })
  .strict();

export const FontDeclarationSchema = z
  .object({
    family: z.string().min(1).max(120),
    weight: z.number().int().min(100).max(900).multipleOf(100),
    style: z.enum(["normal", "italic"]),
    sha256: sha256Hash.optional(),
  })
  .strict();

const DESIGN_DOCUMENT_1_4_0_TEMPLATE_IDS = [
  "product-announcement",
  "statistic-card",
  "quote-card",
  "article-cover",
  "tiktok-carousel-slide",
  "image-led-campaign",
] as const;

const DESIGN_DOCUMENT_1_5_0_TEMPLATE_IDS = [
  ...DESIGN_DOCUMENT_1_4_0_TEMPLATE_IDS,
  "benefit-proof",
] as const;

export const TEMPLATE_IDS = [
  ...DESIGN_DOCUMENT_1_5_0_TEMPLATE_IDS,
  "testimonial-evidence",
  "comparison",
  "problem-solution",
  "offer-urgency",
] as const;

const DESIGN_DOCUMENT_1_1_0_TEMPLATE_IDS = [
  "product-announcement",
  "statistic-card",
  "quote-card",
  "article-cover",
  "tiktok-carousel-slide",
] as const;

const DESIGN_DOCUMENT_1_0_0_TEMPLATE_IDS = [
  "product-announcement",
  "statistic-card",
  "quote-card",
  "article-cover",
] as const;

const DESIGN_DOCUMENT_1_0_0_FORMAT_IDS = [
  "linkedin-landscape",
  "instagram-square",
  "instagram-portrait",
  "instagram-story",
  "x-landscape",
  "youtube-thumbnail",
] as const;

const DESIGN_DOCUMENT_1_1_0_FORMAT_IDS = [
  "linkedin-landscape",
  "instagram-square",
  "instagram-portrait",
  "instagram-story",
  "tiktok-carousel",
  "x-landscape",
  "youtube-thumbnail",
] as const;

function createVersionedDesignDocumentSchema<
  Version extends string,
  TemplateIds extends readonly [string, ...string[]],
  FormatIds extends readonly [string, ...string[]],
  Layers extends z.ZodType,
  Brand extends z.ZodType,
  // No extra fields by default; only 1.8.0 adds a root `lexicon`.
  // eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type
  Extra extends z.ZodRawShape = Record<never, never>,
>(
  version: Version,
  templateIds: TemplateIds,
  formatIds: FormatIds,
  layerSchema: Layers,
  brandSchema: Brand,
  extra: Extra = {} as Extra,
) {
  return z
    .object({
      schemaVersion: z.literal(version),
      id: identifier,
      template: z
        .object({
          id: z.enum(templateIds),
          version: semanticVersion,
        })
        .strict(),
      format: z.enum(formatIds),
      seed: z.string().min(1).max(256),
      mode: z.enum(["light", "dark"]).default("light"),
      brand: brandSchema,
      assets: z.array(AssetDeclarationSchema).max(100).default([]),
      fonts: z.array(FontDeclarationSchema).min(1).max(32),
      metadata: z.record(z.string(), z.json()).optional(),
      layers: z.array(layerSchema).min(1).max(100),
      ...extra,
    })
    .strict();
}

const DesignDocumentV1_0_0Schema = createVersionedDesignDocumentSchema(
  "1.0.0",
  DESIGN_DOCUMENT_1_0_0_TEMPLATE_IDS,
  DESIGN_DOCUMENT_1_0_0_FORMAT_IDS,
  LegacyLayerSchema,
  LegacyBrandSnapshotSchema,
);

const DesignDocumentV1_1_0Schema = createVersionedDesignDocumentSchema(
  "1.1.0",
  DESIGN_DOCUMENT_1_1_0_TEMPLATE_IDS,
  DESIGN_DOCUMENT_1_1_0_FORMAT_IDS,
  LegacyLayerSchema,
  LegacyBrandSnapshotSchema,
);

const DesignDocumentV1_2_0Schema = createVersionedDesignDocumentSchema(
  "1.2.0",
  DESIGN_DOCUMENT_1_1_0_TEMPLATE_IDS,
  DESIGN_DOCUMENT_1_1_0_FORMAT_IDS,
  LayerV1_2_0Schema,
  LegacyBrandSnapshotSchema,
);

const DesignDocumentV1_3_0Schema = createVersionedDesignDocumentSchema(
  "1.3.0",
  DESIGN_DOCUMENT_1_1_0_TEMPLATE_IDS,
  FORMAT_IDS,
  LayerV1_2_0Schema,
  LegacyBrandSnapshotSchema,
);

const DesignDocumentV1_4_0Schema = createVersionedDesignDocumentSchema(
  "1.4.0",
  DESIGN_DOCUMENT_1_4_0_TEMPLATE_IDS,
  FORMAT_IDS,
  LayerV1_4_0Schema,
  BrandSnapshotSchema,
);

const DesignDocumentV1_5_0Schema = createVersionedDesignDocumentSchema(
  "1.5.0",
  DESIGN_DOCUMENT_1_5_0_TEMPLATE_IDS,
  FORMAT_IDS,
  LayerV1_5_0Schema,
  BrandSnapshotSchema,
);
const DesignDocumentV1_6_0Schema = createVersionedDesignDocumentSchema(
  "1.6.0",
  TEMPLATE_IDS,
  FORMAT_IDS,
  LayerV1_6_0Schema,
  BrandSnapshotSchema,
);
const DesignDocumentV1_7_0Schema = createVersionedDesignDocumentSchema(
  "1.7.0",
  TEMPLATE_IDS,
  FORMAT_IDS,
  LayerSchema,
  BrandSnapshotV1_7_0Schema,
);
const DesignDocumentV1_8_0Schema = createVersionedDesignDocumentSchema(
  DESIGN_DOCUMENT_VERSION,
  TEMPLATE_IDS,
  FORMAT_IDS,
  LayerV1_8_0Schema,
  BrandSnapshotV1_8_0Schema,
  { lexicon: thaiLexicon.optional() },
);

export const DesignDocumentSchema = z
  .discriminatedUnion("schemaVersion", [
    DesignDocumentV1_0_0Schema,
    DesignDocumentV1_1_0Schema,
    DesignDocumentV1_2_0Schema,
    DesignDocumentV1_3_0Schema,
    DesignDocumentV1_4_0Schema,
    DesignDocumentV1_5_0Schema,
    DesignDocumentV1_6_0Schema,
    DesignDocumentV1_7_0Schema,
    DesignDocumentV1_8_0Schema,
  ])
  .superRefine((document, context) => {
    checkUniqueIds(document.layers, "layer", context);
    checkUniqueIds(document.assets, "asset", context);
    checkEmphasisPhrases(document.layers, context);
  });

/** Normalize whitespace exactly as the line wrapper does before matching. */
export function normalizeEmphasisText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function checkEmphasisPhrases(
  layers: readonly object[],
  context: z.RefinementCtx,
): void {
  for (const [index, layer] of layers.entries()) {
    if (!("emphasis" in layer) || !("text" in layer)) continue;
    const spans = layer.emphasis as { phrase: string }[] | undefined;
    if (spans === undefined) continue;
    const paragraphs = String(layer.text).split(/\r?\n/).map(normalizeEmphasisText);
    for (const [spanIndex, span] of spans.entries()) {
      const phrase = normalizeEmphasisText(span.phrase);
      if (paragraphs.some((paragraph) => paragraph.includes(phrase))) continue;
      context.addIssue({
        code: "custom",
        message: `Emphasis phrase "${span.phrase}" does not occur in the layer text.`,
        path: ["layers", index, "emphasis", spanIndex, "phrase"],
      });
    }
  }
}

function checkUniqueIds(
  entries: readonly { id: string }[],
  kind: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (seen.has(entry.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate ${kind} ID "${entry.id}".`,
        path: [kind === "layer" ? "layers" : "assets", index, "id"],
      });
    }
    seen.add(entry.id);
  }
}

export type DesignDocument = z.infer<typeof DesignDocumentSchema>;
export type DesignLayer =
  | z.infer<typeof LegacyLayerSchema>
  | z.infer<typeof LayerV1_2_0Schema>
  | z.infer<typeof LayerSchema>
  | z.infer<typeof LayerV1_8_0Schema>;
export type BrandSnapshot = DesignDocument["brand"];
export type BrandTypographyRole = z.infer<typeof typographyRoleSchema>;
export type BrandTypographyRoleV1_8_0 = z.infer<typeof typographyRoleV1_8_0Schema>;
export type FontFaceSpecification = z.infer<typeof FontFaceSpecSchema>;
export type FontAxes = z.infer<typeof FontAxesSchema>;
export type FocalPoint = z.infer<typeof FocalPointSchema>;
export type LegacyImageTreatmentId = (typeof IMAGE_TREATMENT_IDS)[number];
export type LocalImageTreatmentId = (typeof LOCAL_IMAGE_TREATMENT_IDS)[number];
export type ImageTreatmentId = LegacyImageTreatmentId | LocalImageTreatmentId;
export type TextEmphasisStyleId = (typeof TEXT_EMPHASIS_STYLE_IDS)[number];
export type TextEmphasisSpan = { phrase: string; style: TextEmphasisStyleId };
export type OpenTypeFeatureSettings = z.infer<typeof OpenTypeFeatureSettingsSchema>;
export type BrandColorRoles = z.infer<typeof BrandColorRolesSchema>;
export type BrandColorRoleSet = z.infer<typeof colorRoleSetSchema>;
export type DecorationJobId = (typeof DECORATION_JOB_IDS)[number];
export type NormalizedRegion = z.infer<typeof QuietRegionSchema>;
export type AssetDeclaration = DesignDocument["assets"][number];
export type FontDeclaration = DesignDocument["fonts"][number];
export type ProceduralStyleId = (typeof PROCEDURAL_STYLE_IDS)[number];
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type ValidationProblem = {
  path: string;
  code: string;
  message: string;
};

export type ValidationResult =
  | { success: true; data: DesignDocument; problems: [] }
  | { success: false; problems: ValidationProblem[] };

export type CreateDesignDocumentInput = Omit<
  z.input<typeof DesignDocumentV1_8_0Schema>,
  "schemaVersion" | "id"
> & {
  schemaVersion?: typeof DESIGN_DOCUMENT_VERSION;
  id?: string;
};

export function validateDesignDocument(input: unknown): ValidationResult {
  const resourceProblems = getDesignInputResourceProblems(input);
  if (resourceProblems.length > 0) {
    return { success: false, problems: resourceProblems };
  }
  const result = DesignDocumentSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, problems: [] };
  }
  return {
    success: false,
    problems: result.error.issues.map((issue) => ({
      path: formatIssuePath(issue.path),
      code: issue.code,
      message: issue.message,
    })),
  };
}

export function createDesignDocument(input: CreateDesignDocumentInput): DesignDocument {
  assertDesignInputResources(input);
  const id = input.id ?? `gk_${hashCanonical(input).slice(0, 20)}`;
  return DesignDocumentSchema.parse({
    ...input,
    id,
    schemaVersion: input.schemaVersion ?? DESIGN_DOCUMENT_VERSION,
  });
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "$";
  }
  return path.reduce<string>((output, part) => {
    if (typeof part === "number") {
      return `${output}[${part}]`;
    }
    const segment = String(part);
    return output.length === 0 ? segment : `${output}.${segment}`;
  }, "");
}
