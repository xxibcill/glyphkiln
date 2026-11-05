import { LINE_BREAK_POLICY } from "./line-break.js";
import { LINE_BREAK_TAILORING_POLICY } from "./line-break-tailoring.js";
import { PREFERRED_BREAK_POLICY_VERSION } from "./policy.js";
import {
  thaiSegmentationHybridPolicy,
  type ThaiSegmentationHybridPolicy,
} from "./thai-segmentation-hybrid.js";

/**
 * The M3 line-breaking policy record of a render (manifest 1.4.0 and the
 * render fingerprint): UAX #14 with its data hash, the tailoring version, the
 * hybrid Thai segmenter with its dictionary, supplement, model and lexicon
 * hashes, and the preferred-break rule.
 */
export type M3TypographyPolicy = {
  readonly lineBreak: typeof LINE_BREAK_POLICY;
  readonly tailoring: typeof LINE_BREAK_TAILORING_POLICY;
  readonly thaiSegmentation: ThaiSegmentationHybridPolicy;
  readonly preferredBreaks: typeof PREFERRED_BREAK_POLICY_VERSION;
};

export function m3TypographyPolicy(lexicon: readonly string[]): M3TypographyPolicy {
  return Object.freeze({
    lineBreak: LINE_BREAK_POLICY,
    tailoring: LINE_BREAK_TAILORING_POLICY,
    thaiSegmentation: thaiSegmentationHybridPolicy(lexicon),
    preferredBreaks: PREFERRED_BREAK_POLICY_VERSION,
  });
}
