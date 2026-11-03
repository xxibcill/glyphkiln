import type { OpenTypeFeatureMap } from "../fonts/index.js";
import type { OpenTypeFeatureSettings } from "../schema/index.js";

/**
 * Explicit, closed OpenType control (DesignDocument 1.7.0). Settings map to a
 * fixed set of feature tags shaped through the existing fontkit path; nothing
 * else in a document can name a tag. Template versions that accept settings
 * pin this policy version.
 */
export const OPENTYPE_FEATURE_POLICY_VERSION = "opentype-settings@1.0.0" as const;

export type OpenTypeFeatureRequest = {
  /** Setting name in the document, for diagnostics. */
  setting: keyof OpenTypeFeatureSettings;
  /** Feature tag that must exist in the face for the request to take effect. */
  tag: string;
};

/**
 * Resolve settings into a feature map. Returns undefined when nothing is set,
 * so the default fontkit shaping path is used unchanged.
 */
export function resolveOpenTypeFeatures(
  settings: OpenTypeFeatureSettings | undefined,
  defaults: OpenTypeFeatureSettings = {},
): OpenTypeFeatureMap | undefined {
  const merged = { ...defaults, ...settings };
  const features: Record<string, boolean> = {};
  if (merged.kerning !== undefined) features["kern"] = merged.kerning;
  if (merged.ligatures !== undefined) {
    features["liga"] = merged.ligatures;
    features["clig"] = merged.ligatures;
  }
  switch (merged.numerals) {
    case "tabular-lining":
      Object.assign(features, { tnum: true, lnum: true });
      break;
    case "proportional-lining":
      Object.assign(features, { pnum: true, lnum: true });
      break;
    case "tabular-oldstyle":
      Object.assign(features, { tnum: true, onum: true });
      break;
    case "proportional-oldstyle":
      Object.assign(features, { pnum: true, onum: true });
      break;
    case undefined:
      break;
  }
  if (merged.caseSensitiveForms !== undefined) {
    features["case"] = merged.caseSensitiveForms;
  }
  if (merged.smallCaps !== undefined) features["smcp"] = merged.smallCaps;
  const ordered = Object.fromEntries(
    Object.entries(features).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
  return Object.keys(ordered).length === 0 ? undefined : Object.freeze(ordered);
}

/**
 * Features the author switched on that change glyph choice. Each needs the
 * tag in the face; otherwise the request is reported instead of being faked.
 * Lining numerals are the default figure style of most faces, so `lnum` is
 * requested only alongside tabular spacing and is not required.
 */
export function requestedOpenTypeFeatures(
  settings: OpenTypeFeatureSettings | undefined,
): OpenTypeFeatureRequest[] {
  if (settings === undefined) return [];
  const requests: OpenTypeFeatureRequest[] = [];
  if (settings.ligatures === true) requests.push({ setting: "ligatures", tag: "liga" });
  if (settings.numerals?.startsWith("tabular") === true) {
    requests.push({ setting: "numerals", tag: "tnum" });
  }
  if (settings.numerals?.endsWith("oldstyle") === true) {
    requests.push({ setting: "numerals", tag: "onum" });
  }
  if (settings.caseSensitiveForms === true) {
    requests.push({ setting: "caseSensitiveForms", tag: "case" });
  }
  if (settings.smallCaps === true) requests.push({ setting: "smallCaps", tag: "smcp" });
  return requests;
}
