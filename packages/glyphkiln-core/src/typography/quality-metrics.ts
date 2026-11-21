import GraphemeSplitter from "grapheme-splitter";

import type { OutlineCommand } from "../fonts/shaper.js";

/**
 * Typography quality measures (plan M0, scope item 4). Pure functions over
 * laid-out lines and glyphs. They are measurement tooling: no render path
 * calls them, so they never change output. The definitions are fixed here so
 * that the baseline report and later milestones (M4 composer, M10 parity)
 * measure the same thing.
 */

export const TYPOGRAPHY_METRICS_VERSION = "typography-metrics@1.0.0" as const;

export type MeasuredLine = {
  text: string;
  /** Natural width of the line in px. */
  width: number;
};

export type GlueModel = {
  /** Natural interword space in px. */
  space: number;
  /** Stretchability per space, as a fraction of `space` (TeX: 1/2). */
  stretch: number;
  /** Shrinkability per space, as a fraction of `space` (TeX: 1/3). */
  shrink: number;
};

const graphemeSplitter = new GraphemeSplitter();

/**
 * TeX adjustment ratio r for one line set to `measure`: (measure − natural) /
 * total stretch when the line is short, / total shrink when it is long. A
 * line with no interword space has no glue, so r is undefined (`null`).
 * Ragged setting does not apply r; it says how far each line is from flush,
 * in units of available glue, which is what a composer would have to absorb.
 */
export function adjustmentRatio(
  line: MeasuredLine,
  measure: number,
  glue: GlueModel,
): number | null {
  const spaces = countInterwordSpaces(line.text);
  if (spaces === 0) return null;
  const difference = measure - line.width;
  const capacity =
    difference >= 0
      ? spaces * glue.space * glue.stretch
      : spaces * glue.space * glue.shrink;
  return capacity === 0 ? null : difference / capacity;
}

export function countInterwordSpaces(text: string): number {
  let count = 0;
  for (const character of text.trim()) if (character === " ") count += 1;
  return count;
}

export type ParagraphMetrics = {
  lineCount: number;
  /** r of every line except the last (TeX's last line has parfillskip). */
  adjustmentRatios: (number | null)[];
  /** Mean |r| over non-final lines that have glue; null when none do. */
  meanAbsoluteAdjustmentRatio: number | null;
  /** Final line of a multi-line paragraph holds a single word. */
  runt: boolean;
  /** Lines ending in a hyphen (hard hyphen, U+2010, U+2011 or SHY). */
  hyphenatedLines: number;
  /**
   * Rag deviation: population standard deviation of non-final line widths,
   * divided by the measure. 0 for fewer than two non-final lines.
   */
  ragDeviation: number;
  /** Mean of (measure − width) / measure over non-final lines. */
  meanSlack: number;
  /** Lines wider than the measure (overfull). */
  overfullLines: number;
};

export function paragraphMetrics(
  lines: readonly MeasuredLine[],
  measure: number,
  glue: GlueModel,
  options: {
    /**
     * Break units on the final line. Needed for scripts without spaces (Thai),
     * where a whole line has no space; without it a word is a space-free run.
     */
    finalLineUnitCount?: number;
  } = {},
): ParagraphMetrics {
  const body = lines.slice(0, -1);
  const ratios = body.map((line) => adjustmentRatio(line, measure, glue));
  const defined = ratios.filter((ratio): ratio is number => ratio !== null);
  const widths = body.map((line) => line.width);
  const final = lines.at(-1);
  return {
    lineCount: lines.length,
    adjustmentRatios: ratios,
    meanAbsoluteAdjustmentRatio:
      defined.length === 0
        ? null
        : defined.reduce((total, ratio) => total + Math.abs(ratio), 0) / defined.length,
    runt:
      lines.length > 1 &&
      final !== undefined &&
      (options.finalLineUnitCount === undefined
        ? isSingleWord(final.text)
        : options.finalLineUnitCount === 1),
    hyphenatedLines: lines.filter((line) => /[-‐‑­]$/u.test(line.text)).length,
    ragDeviation:
      widths.length < 2 || measure === 0 ? 0 : standardDeviation(widths) / measure,
    meanSlack:
      widths.length === 0 || measure === 0
        ? 0
        : widths.reduce((total, width) => total + (measure - width) / measure, 0) /
          widths.length,
    overfullLines: lines.filter((line) => line.width > measure + 1e-9).length,
  };
}

function isSingleWord(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !/\s/u.test(trimmed);
}

function standardDeviation(values: readonly number[]): number {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * UTF-16 offsets in `text` where consecutive lines meet. `lines` must be the
 * paragraph's lines in order; whitespace dropped at a break is skipped.
 */
export function lineBreakOffsets(text: string, lines: readonly string[]): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const [index, line] of lines.entries()) {
    const start = text.indexOf(line, cursor);
    if (start < 0) return offsets;
    if (index > 0) offsets.push(start);
    cursor = start + line.length;
  }
  return offsets;
}

/** Break offsets that fall inside an extended grapheme cluster. */
export function breaksInsideGraphemeClusters(
  text: string,
  offsets: readonly number[],
): number[] {
  const boundaries = new Set<number>([0]);
  let position = 0;
  for (const cluster of graphemeSplitter.splitGraphemes(text)) {
    position += cluster.length;
    boundaries.add(position);
  }
  return offsets.filter((offset) => !boundaries.has(offset));
}

const THAI_LEADING_VOWEL = /[\u0E40-\u0E44]/u;
// Above and below vowels, tone marks, signs, plus the following vowels that
// cannot begin an orthographic syllable (sara a, sara aa, sara am, lakkhangyao).
function isThaiNonInitial(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x0e30 && codePoint <= 0x0e3a) ||
    codePoint === 0x0e45 ||
    (codePoint >= 0x0e47 && codePoint <= 0x0e4e)
  );
}
const THAI_NO_LINE_START = /[\u0E46\u0E2F]/u;

export type ThaiBreakFinding = {
  offset: number;
  kind: "inside-cluster" | "after-leading-vowel" | "before-dependent" | "line-edge";
};

/**
 * Thai breaks that split an orthographic unit: inside a grapheme cluster,
 * after a leading vowel (เ แ โ ใ ไ), before a vowel or mark that cannot start
 * a syllable, or before ๆ / ฯ (a line must not start with them). This is an
 * orthographic check, not a dictionary: a break between two well-formed
 * syllables of one word (กรุงเทพม | หานคร) passes it and needs a gold
 * boundary set to be caught.
 */
export function thaiBreakFindings(
  text: string,
  offsets: readonly number[],
): ThaiBreakFinding[] {
  const inside = new Set(breaksInsideGraphemeClusters(text, offsets));
  const findings: ThaiBreakFinding[] = [];
  for (const offset of offsets) {
    const before = text[offset - 1] ?? "";
    const after = text[offset] ?? "";
    if (inside.has(offset)) findings.push({ offset, kind: "inside-cluster" });
    else if (THAI_LEADING_VOWEL.test(before))
      findings.push({ offset, kind: "after-leading-vowel" });
    else if (isThaiNonInitial(after))
      findings.push({ offset, kind: "before-dependent" });
    else if (THAI_NO_LINE_START.test(after))
      findings.push({ offset, kind: "line-edge" });
  }
  return findings;
}

/** Breaks not in an annotated set of acceptable boundaries. */
export function breaksOutsideGold(
  offsets: readonly number[],
  acceptable: readonly number[],
): number[] {
  const gold = new Set(acceptable);
  return offsets.filter((offset) => !gold.has(offset));
}

export type GlyphPlacement = {
  /** Glyph origin x in px. */
  x: number;
  /** Whether the glyph is a combining mark (it attaches to a base). */
  mark: boolean;
};

/**
 * Offset of every mark from its base glyph (the nearest preceding non-mark).
 * Marks with no base are skipped.
 */
export function markOffsets(glyphs: readonly GlyphPlacement[]): number[] {
  const offsets: number[] = [];
  let base: GlyphPlacement | undefined;
  for (const glyph of glyphs) {
    if (!glyph.mark) {
      base = glyph;
      continue;
    }
    if (base !== undefined) offsets.push(glyph.x - base.x);
  }
  return offsets;
}

/**
 * Mark offset invariance (plan T08): the largest change of any mark's offset
 * to its base between a reference setting (tracking 0) and a tracked one.
 * Professional behaviour is 0.
 */
export function markOffsetDeviation(
  reference: readonly GlyphPlacement[],
  tracked: readonly GlyphPlacement[],
): { maximum: number; moved: number; marks: number } {
  const left = markOffsets(reference);
  const right = markOffsets(tracked);
  const count = Math.min(left.length, right.length);
  let maximum = 0;
  let moved = 0;
  for (let index = 0; index < count; index += 1) {
    const delta = Math.abs(right[index]! - left[index]!);
    if (delta > 1e-9) moved += 1;
    maximum = Math.max(maximum, delta);
  }
  return { maximum, moved, marks: count };
}

/**
 * Highest point of an outline in its own units (y up), using exact curve
 * extrema rather than control points.
 */
export function outlineTop(commands: readonly OutlineCommand[]): number | null {
  let top = -Infinity;
  let currentY = 0;
  for (const { command, args } of commands) {
    switch (command) {
      case "moveTo":
      case "lineTo":
        currentY = args[1]!;
        top = Math.max(top, currentY);
        break;
      case "quadraticCurveTo": {
        const [, y1, , y2] = args as [number, number, number, number];
        top = Math.max(top, quadraticMaximum(currentY, y1, y2));
        currentY = y2;
        break;
      }
      case "bezierCurveTo": {
        const [, y1, , y2, , y3] = args as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        top = Math.max(top, cubicMaximum(currentY, y1, y2, y3));
        currentY = y3;
        break;
      }
      case "closePath":
        break;
    }
  }
  return Number.isFinite(top) ? top : null;
}

function quadraticMaximum(p0: number, p1: number, p2: number): number {
  let maximum = Math.max(p0, p2);
  const denominator = p0 - 2 * p1 + p2;
  if (denominator !== 0) {
    const t = (p0 - p1) / denominator;
    if (t > 0 && t < 1) {
      maximum = Math.max(
        maximum,
        (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2,
      );
    }
  }
  return maximum;
}

function cubicMaximum(p0: number, p1: number, p2: number, p3: number): number {
  let maximum = Math.max(p0, p3);
  // Derivative: 3[(p1-p0)(1-t)^2 + 2(p2-p1)(1-t)t + (p3-p2)t^2] = a t^2 + b t + c
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      roots.push((-b + root) / (2 * a), (-b - root) / (2 * a));
    }
  }
  for (const t of roots) {
    if (t <= 0 || t >= 1) continue;
    const u = 1 - t;
    maximum = Math.max(
      maximum,
      u ** 3 * p0 + 3 * u ** 2 * t * p1 + 3 * u * t ** 2 * p2 + t ** 3 * p3,
    );
  }
  return maximum;
}

/**
 * Cross-script optical match (plan T06): Latin x-height ink over Thai body
 * height ink, each in em. 1.00 is a match; the delta is ratio − 1.
 */
export function crossScriptXHeight(
  latinXInkEm: number,
  thaiBodyInkEm: number,
): { ratio: number; delta: number } {
  const ratio = latinXInkEm / thaiBodyInkEm;
  return { ratio, delta: ratio - 1 };
}
