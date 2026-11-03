/**
 * Size-dependent tracking and leading (W3). One fixed tracking and leading
 * value cannot be right for both a 20 px label and a 160 px headline: display
 * sizes need tighter tracking and leading, small text needs more of both.
 *
 * The curves are keyed by the size the type would have on a 1080 px short
 * side, so the same document gets the same setting in every format. Values are
 * linearly interpolated between fixed stops and clamped at the ends. Only
 * template versions that pin this policy version use it.
 */
export const SIZE_SETTING_POLICY_VERSION = "size-setting@1.0.0" as const;

/** `text` is mixed-case running or display copy; `label` is tracked caps-style chrome. */
export type SizeSettingRole = "text" | "label";

type Stop = readonly [size: number, tracking: number, lineHeight: number];

export const SIZE_SETTING_CURVES: Readonly<Record<SizeSettingRole, readonly Stop[]>> =
  Object.freeze({
    text: Object.freeze([
      [16, 0.01, 1.42],
      [24, 0.004, 1.34],
      [36, -0.004, 1.24],
      [56, -0.012, 1.14],
      [88, -0.02, 1.06],
      [140, -0.028, 1.0],
      [220, -0.035, 0.94],
    ] as const),
    label: Object.freeze([
      [14, 0.1, 1.3],
      [20, 0.085, 1.26],
      [28, 0.07, 1.22],
      [40, 0.055, 1.18],
      [64, 0.04, 1.12],
    ] as const),
  });

export type SizeSetting = {
  /** Tracking in em. */
  tracking: number;
  lineHeight: number;
};

export function sizeSetting(
  role: SizeSettingRole,
  fontSize: number,
  canvasShortSide: number,
): SizeSetting {
  const reference = (fontSize * 1_080) / canvasShortSide;
  const stops = SIZE_SETTING_CURVES[role];
  const first = stops[0]!;
  const last = stops.at(-1)!;
  if (reference <= first[0]) return { tracking: first[1], lineHeight: first[2] };
  if (reference >= last[0]) return { tracking: last[1], lineHeight: last[2] };
  const index = stops.findIndex((stop) => reference <= stop[0]);
  const upper = stops[index]!;
  const lower = stops[index - 1]!;
  const t = (reference - lower[0]) / (upper[0] - lower[0]);
  return {
    tracking: round(lower[1] + (upper[1] - lower[1]) * t),
    lineHeight: round(lower[2] + (upper[2] - lower[2]) * t),
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
