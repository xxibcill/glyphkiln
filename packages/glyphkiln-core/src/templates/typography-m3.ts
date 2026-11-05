import type { TemplateDefinition, TemplateTextLayerType } from "./types.js";
import {
  imageLedCampaignM1Template,
  quoteCardM1Template,
  statisticCardM1Template,
} from "./typography-m1.js";

/**
 * Template versions that opt into the M3 typography (plan M3). Each keeps the
 * exact geometry, fonts and M1 policies of the M1 version it extends and adds:
 *
 * - `line-break-uax14@17.0.0` opportunities with `line-break-tailoring@1.1.0`
 *   (Thai line edges, amount + unit, dashes, numeric ranges);
 * - `thai-segmentation-hybrid@1.0.0` word boundaries in Thai runs, with the
 *   document and brand `lexicon` (DesignDocument 1.8.0);
 * - `prefer-break-after@1.0.0` for `keepTogether.preferBreakAfter`.
 *
 * The M1 versions stay registered and render byte for byte as before.
 */
function onM3(
  base: TemplateDefinition,
  version: TemplateDefinition["version"],
  preferredBreaks: readonly TemplateTextLayerType[],
): TemplateDefinition {
  return {
    ...base,
    version,
    typography: "m3",
    capabilities: { ...base.capabilities, preferredBreaks },
    constraints: {
      ...base.constraints,
      layout: `${base.constraints.layout} Lines break at UAX #14 opportunities with the M3 tailorings, Thai breaks at hybrid dictionary word boundaries with the brand and document lexicon, and preferred breaks follow keepTogether.preferBreakAfter.`,
    },
  };
}

export const quoteCardM3Template = onM3(quoteCardM1Template, "1.5.0", [
  "headline",
  "attribution",
]);

export const statisticCardM3Template = onM3(statisticCardM1Template, "1.5.0", [
  "headline",
]);

export const imageLedCampaignM3Template = onM3(imageLedCampaignM1Template, "1.4.0", [
  "headline",
  "subtitle",
  "eyebrow",
  "cta",
]);
