/**
 * Advisory craft-review policy. These heuristics describe visual craft risks;
 * they never block rendering, never enter render manifests or fingerprints, and
 * are reported separately from correctness `QualityIssue` records.
 *
 * Thresholds are documented starting values for review, not proven optima.
 */
export const CRAFT_REVIEW_POLICY_VERSION = "1.1.0" as const;

export const CRAFT_FINDING_CODES = [
  "CRAFT_TEXT_SMALL_AT_DELIVERY",
  "CRAFT_WEAK_SCALE_CONTRAST",
  "CRAFT_DEAD_SPACE",
  "CRAFT_ACCENT_OVERUSE",
  "CRAFT_MARK_LOW_VISIBILITY",
] as const;

export type CraftFindingCode = (typeof CRAFT_FINDING_CODES)[number];

export type CraftReviewThresholds = {
  /** CSS-pixel width at which the whole canvas is viewed, such as a phone feed. */
  displayWidth: number;
  /** Minimum rendered x-height, in display pixels, before text is flagged. */
  minimumXHeight: number;
  /** Largest text size divided by the next largest; lower values compete. */
  minimumDominanceRatio: number;
  /** Fraction of a container still showing its own fill before it is flagged. */
  containerEmptyFraction: number;
  /** Contiguous empty band, as a fraction of container height or width. */
  containerEmptyBand: number;
  /** Contiguous canvas band with almost no content, as a fraction of the canvas. */
  canvasEmptyBand: number;
  /** Share of a canvas row or column that may be covered while still "empty". */
  emptyLineCoverage: number;
  /** Maximum share of non-photographic canvas pixels painted in an accent color. */
  accentAreaFraction: number;
  /** Maximum distinct accent uses; repeated same-size marks count once. */
  accentUsageCount: number;
  /** Minimum median contrast between a brand mark and what lies behind it. */
  markMinimumContrast: number;
  /** Minimum displayed size, in display pixels, of a mark's longer visible side. */
  markMinimumSize: number;
};

export const CRAFT_REVIEW_DEFAULTS: Readonly<CraftReviewThresholds> = Object.freeze({
  displayWidth: 360,
  minimumXHeight: 5.5,
  minimumDominanceRatio: 1.5,
  containerEmptyFraction: 0.75,
  containerEmptyBand: 0.4,
  canvasEmptyBand: 0.33,
  emptyLineCoverage: 0.05,
  accentAreaFraction: 0.08,
  accentUsageCount: 5,
  markMinimumContrast: 3,
  markMinimumSize: 24,
});

/** Containers smaller than this share of the canvas are treated as marks or rules. */
export const CRAFT_MINIMUM_CONTAINER_AREA = 0.04;
/** Rectangles at least this large are backgrounds, reviewed at canvas level. */
export const CRAFT_BACKGROUND_AREA = 0.9;
/** Per-channel tolerance when comparing rendered pixels with a declared color. */
export const CRAFT_PIXEL_TOLERANCE = 8;
/** Per-channel difference that separates mark ink from the ground behind it. */
export const CRAFT_MARK_PIXEL_DIFFERENCE = 16;
