import {
  quoteCardRolesTemplate,
  statisticCardRolesTemplate,
} from "./editorial-roles.js";
import { imageLedCampaignLocalTemplate } from "./image-led-campaign-local.js";
import type { TemplateDefinition, TemplateTextLayerType } from "./types.js";

/**
 * Template versions that opt into the M1 typography (owner question Q1,
 * provisional default: correctness fixes behind new template versions).
 * Each keeps the exact geometry of the B2 version it extends and pins, in
 * addition to that version's policies:
 *
 * - shaper `harfbuzzjs@1.6.4/harfbuzz@15.0.0` (wasm SHA-256 pinned);
 * - `script-runs@1.0.0` and `cluster-tracking@1.0.0` (M1b);
 * - `font-variation@1.0.0` and `optical-size-auto@1.0.0` (M1a);
 * - `script-matching@1.0.0` fallback stacks and script faces (M1c).
 *
 * The font model comes from the brand typography role (1.8.0 fields) and
 * the layer's own axes, named instance and optical-size fields. The B2
 * versions stay registered and render byte for byte as before.
 */
function onM1(
  base: TemplateDefinition,
  version: TemplateDefinition["version"],
  fontModel: readonly TemplateTextLayerType[],
): TemplateDefinition {
  return {
    ...base,
    version,
    typography: "m1",
    capabilities: { ...base.capabilities, fontModel },
    constraints: {
      ...base.constraints,
      layout: `${base.constraints.layout} Text is set on the M1 typography: HarfBuzz per script run, tracking between character units, every variable axis with automatic optical size, and fallback or per-script faces from the brand role.`,
    },
  };
}

export const quoteCardM1Template = onM1(quoteCardRolesTemplate, "1.4.0", [
  "headline",
  "attribution",
]);

export const statisticCardM1Template = onM1(statisticCardRolesTemplate, "1.4.0", [
  "headline",
]);

export const imageLedCampaignM1Template = onM1(imageLedCampaignLocalTemplate, "1.3.0", [
  "headline",
  "subtitle",
  "eyebrow",
  "cta",
]);
