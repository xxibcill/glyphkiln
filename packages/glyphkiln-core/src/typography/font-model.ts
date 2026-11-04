import type { QualityIssue } from "../domain/types.js";

/**
 * The M1 font model (typography plan M1a and M1c): every `fvar` axis, named
 * instances, automatic optical size, an ordered fallback stack and per-script
 * faces with size and baseline matching. Each rule is a pinned policy so a
 * change needs a new policy version and a new template version.
 */
export const FONT_VARIATION_POLICY_VERSION = "font-variation@1.0.0" as const;
export const OPTICAL_SIZE_POLICY_VERSION = "optical-size-auto@1.0.0" as const;
export const SCRIPT_MATCHING_POLICY_VERSION = "script-matching@1.0.0" as const;

/**
 * `optical-size-auto@1.0.0`: `opsz = 0.75 × s`, where `s` is the set size in
 * px at the 1080 px short-side reference (CSS 96 px = 72 pt), rounded to
 * 0.01 and clamped to the axis range. Owner question Q6 (provisional default).
 */
export const OPTICAL_SIZE_POLICY = Object.freeze({
  version: OPTICAL_SIZE_POLICY_VERSION,
  pointsPerPixel: 0.75,
  referenceShortSidePx: 1080,
  rounding: 0.01,
  clampToAxis: true,
});

/**
 * `script-matching@1.0.0`: `auto` scale makes the Latin x-height equal the
 * Thai body height, both measured on glyph ink (`x` and `น`) at the default
 * instance, as a factor on the non-primary face rounded to 0.001. `auto`
 * baseline shift is 0: Thai and Latin share the alphabetic baseline.
 */
export const SCRIPT_MATCHING_POLICY = Object.freeze({
  version: SCRIPT_MATCHING_POLICY_VERSION,
  references: Object.freeze({ latn: "x", thai: "น" }),
  scaleRounding: 0.001,
  autoBaselineShift: 0,
});

export const REGISTERED_AXES = ["wght", "wdth", "opsz", "slnt", "ital"] as const;

/** Most faces a text element may name: primary, fallbacks and script faces. */
export const MAXIMUM_STACK_FACES = 6;

export type ScriptFaceTag = "latn" | "thai";

export type FontFaceSpec = {
  family: string;
  /** Size factor against the element's font size; `auto` uses script matching. */
  scale?: number | "auto";
  /** Baseline shift in em (positive raises); `auto` is 0. */
  baselineShift?: number | "auto";
};

export type FontModel = {
  family: string;
  weight: number;
  style: "normal" | "italic";
  axes?: Readonly<Record<string, number>>;
  namedInstance?: string;
  opticalSizing?: "auto" | "none";
  opsz?: number;
  /** Ordered fallback faces after the primary family. */
  fallback?: readonly FontFaceSpec[];
  /** Faces that take every cluster of one script before the stack is tried. */
  scriptFaces?: Readonly<Partial<Record<ScriptFaceTag, FontFaceSpec>>>;
};

export type AxisRange = { min: number; default: number; max: number };

/** Round to a fixed step without binary drift in the recorded value. */
export function roundTo(value: number, step: number): number {
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/** The `opsz` the auto policy picks for a size, before clamping. */
export function automaticOpticalSize(fontSizePx: number, shortSidePx: number): number {
  const referenceSize =
    (fontSizePx * OPTICAL_SIZE_POLICY.referenceShortSidePx) / shortSidePx;
  return roundTo(
    referenceSize * OPTICAL_SIZE_POLICY.pointsPerPixel,
    OPTICAL_SIZE_POLICY.rounding,
  );
}

export type ResolvedCoordinates = {
  coordinates: Record<string, number>;
  namedInstance: string | undefined;
  issues: QualityIssue[];
};

/**
 * `font-variation@1.0.0`. Start from the axis defaults; set `wght` from the
 * requested weight; apply the named instance; apply explicit axes; then
 * optical size (explicit `opsz` wins, else auto unless `opticalSizing` is
 * `none`). Explicit values outside an axis range are reported and clamped;
 * axes the face lacks are reported and ignored.
 */
export function resolveCoordinates(input: {
  model: Pick<FontModel, "axes" | "namedInstance" | "opticalSizing" | "opsz">;
  weight: number;
  axes: Readonly<Partial<Record<string, AxisRange>>>;
  namedInstances: readonly {
    name: string;
    coordinates: Readonly<Record<string, number>>;
  }[];
  fontSizePx: number;
  shortSidePx: number;
  layerId: string;
  family: string;
  primary: boolean;
}): ResolvedCoordinates {
  const issues: QualityIssue[] = [];
  const coordinates: Record<string, number> = {};
  const axes = input.axes;
  const report = (code: string, message: string, details: Record<string, unknown>) =>
    issues.push({
      code,
      severity: code === "FONT_AXIS_UNAVAILABLE" ? "warning" : "error",
      message,
      layerId: input.layerId,
      details: { family: input.family, ...details },
    });
  const set = (tag: string, value: number, explicit: boolean): void => {
    const axis = axes[tag];
    if (axis === undefined) {
      if (explicit) {
        report(
          "FONT_AXIS_UNAVAILABLE",
          `Font "${input.family}" has no "${tag}" axis; the value is ignored.`,
          {
            axis: tag,
            value,
          },
        );
      }
      return;
    }
    if (explicit && (value < axis.min || value > axis.max)) {
      report(
        "FONT_AXIS_OUT_OF_RANGE",
        `Axis "${tag}" ${value} is outside ${axis.min}–${axis.max} in "${input.family}".`,
        { axis: tag, value, min: axis.min, max: axis.max },
      );
    }
    coordinates[tag] = Math.min(axis.max, Math.max(axis.min, value));
  };
  if (axes["wght"] !== undefined) set("wght", input.weight, false);
  let namedInstance: string | undefined;
  if (input.primary && input.model.namedInstance !== undefined) {
    const instance = input.namedInstances.find(
      (candidate) => candidate.name === input.model.namedInstance,
    );
    if (instance === undefined) {
      report(
        "FONT_NAMED_INSTANCE_UNKNOWN",
        `Font "${input.family}" has no named instance "${input.model.namedInstance}".`,
        {
          namedInstance: input.model.namedInstance,
          available: input.namedInstances.map((item) => item.name),
        },
      );
    } else {
      namedInstance = instance.name;
      for (const [tag, value] of Object.entries(instance.coordinates))
        set(tag, value, false);
    }
  }
  const explicitAxes = input.primary ? (input.model.axes ?? {}) : {};
  for (const tag of Object.keys(explicitAxes).sort())
    set(tag, explicitAxes[tag]!, true);
  const explicitOpsz = input.primary
    ? (input.model.opsz ?? explicitAxes["opsz"])
    : undefined;
  if (input.primary && input.model.opsz !== undefined)
    set("opsz", input.model.opsz, true);
  if (
    explicitOpsz === undefined &&
    input.model.opticalSizing !== "none" &&
    axes["opsz"] !== undefined
  ) {
    set("opsz", automaticOpticalSize(input.fontSizePx, input.shortSidePx), false);
  }
  for (const [tag, axis] of Object.entries(axes)) {
    if (axis !== undefined && coordinates[tag] === undefined)
      coordinates[tag] = axis.default;
  }
  return {
    coordinates: Object.fromEntries(
      Object.entries(coordinates).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
    namedInstance,
    issues,
  };
}
