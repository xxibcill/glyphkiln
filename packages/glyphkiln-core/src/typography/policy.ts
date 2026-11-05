export const TYPOGRAPHY_ALGORITHM_VERSION = "2.0.1" as const;
export const THAI_SEGMENTATION_POLICY = "budoux-th" as const;
export const THAI_SEGMENTATION_POLICY_VERSION = "budoux-th@0.7.0" as const;
export const WHITESPACE_SEGMENTATION_POLICY = "whitespace" as const;
export const WHITESPACE_SEGMENTATION_POLICY_VERSION = "whitespace@1.0.0" as const;
export const GRAPHEME_SEGMENTATION_POLICY_VERSION =
  "grapheme-splitter@1.0.4/unicode-10.0.0" as const;
/** M3 (`typography: "m3"` template versions only). */
export const HYBRID_SEGMENTATION_POLICY = "thai-segmentation-hybrid" as const;
export const HYBRID_SEGMENTATION_POLICY_VERSION =
  "thai-segmentation-hybrid@1.0.0" as const;
export const TAILORED_SEGMENTATION_POLICY = "line-break-tailoring" as const;
export const TAILORED_SEGMENTATION_POLICY_VERSION =
  "line-break-tailoring@1.1.0" as const;
export const PREFERRED_BREAK_POLICY_VERSION = "prefer-break-after@1.0.0" as const;
export const LINE_BREAKING_POLICY_VERSION = "balanced-lines@1.0.0" as const;

export const TYPOGRAPHY_POLICY = Object.freeze({
  algorithmVersion: TYPOGRAPHY_ALGORITHM_VERSION,
  thaiSegmentationPolicyVersion: THAI_SEGMENTATION_POLICY_VERSION,
  whitespaceSegmentationPolicyVersion: WHITESPACE_SEGMENTATION_POLICY_VERSION,
  graphemeSegmentationPolicyVersion: GRAPHEME_SEGMENTATION_POLICY_VERSION,
  lineBreakingPolicyVersion: LINE_BREAKING_POLICY_VERSION,
});
