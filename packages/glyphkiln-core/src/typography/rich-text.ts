import type {
  FontRegistry,
  OpenTypeFeatureMap,
  PositionedGlyph,
  SetSegment,
  SetSegmentsInput,
} from "../fonts/index.js";
import type { TextEmphasisSpan, TextEmphasisStyleId } from "../schema/index.js";
import type { TextMeasurer } from "./index.js";

/**
 * Rich-text emphasis inside one text layer (DesignDocument 1.7.0). A layer
 * names up to eight phrases and one closed style for each. Phrases are kept
 * together on one line, matched on whole words, and set as separate runs on
 * the line's baseline. Only template versions that pin this policy version use
 * it.
 *
 * Matching: scanning left to right, the earliest match wins; at the same start
 * the longer phrase wins, then the earlier-declared one. Matches never overlap.
 * A phrase edge that is a Latin, Greek, or Cyrillic letter or a digit must not
 * touch another such character, so "art" does not match inside "start". Thai
 * and other scripts without spaces match anywhere.
 */
export const RICH_TEXT_POLICY_VERSION = "emphasis-runs@1.0.0" as const;

export type EmphasisRun = { text: string; style?: TextEmphasisStyleId };

export type EmphasisFace = { weight: number; style: "normal" | "italic" };

const WORD_CHARACTER = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Nd}]/u;

export function normalizePhrase(phrase: string): string {
  return phrase.trim().replace(/\s+/g, " ");
}

export function splitEmphasisRuns(
  line: string,
  spans: readonly TextEmphasisSpan[],
): EmphasisRun[] {
  const candidates = spans
    .map((span, order) => ({
      phrase: normalizePhrase(span.phrase),
      style: span.style,
      order,
    }))
    .filter((span) => span.phrase.length > 0)
    .sort(
      (left, right) =>
        right.phrase.length - left.phrase.length || left.order - right.order,
    );
  const runs: EmphasisRun[] = [];
  let plainStart = 0;
  let cursor = 0;
  while (cursor < line.length) {
    const match = candidates.find(
      (candidate) =>
        line.startsWith(candidate.phrase, cursor) &&
        isWordBoundary(line, cursor, candidate.phrase),
    );
    if (match === undefined) {
      cursor += 1;
      continue;
    }
    if (cursor > plainStart) runs.push({ text: line.slice(plainStart, cursor) });
    runs.push({ text: match.phrase, style: match.style });
    cursor += match.phrase.length;
    plainStart = cursor;
  }
  if (plainStart < line.length) runs.push({ text: line.slice(plainStart) });
  return runs.length === 0 ? [{ text: line }] : runs;
}

function isWordBoundary(line: string, start: number, phrase: string): boolean {
  const end = start + phrase.length;
  const before = start > 0 ? line[start - 1]! : "";
  const after = end < line.length ? line[end]! : "";
  if (WORD_CHARACTER.test(phrase[0]!) && WORD_CHARACTER.test(before)) return false;
  if (WORD_CHARACTER.test(phrase.at(-1)!) && WORD_CHARACTER.test(after)) return false;
  return true;
}

/** Face a closed emphasis style uses, from the layer's base face. */
export function emphasisFace(
  style: TextEmphasisStyleId | undefined,
  baseWeight: number,
): EmphasisFace {
  switch (style) {
    case "strong":
    case "strong-accent":
      return {
        weight: Math.min(900, Math.max(700, baseWeight + 200)),
        style: "normal",
      };
    case "italic":
      return { weight: baseWeight, style: "italic" };
    case "accent":
    case "muted":
    case undefined:
      return { weight: baseWeight, style: "normal" };
  }
}

/**
 * A measurer that sets emphasized runs in their own faces, so line breaking
 * and fitting see the real widths. Adjacent runs are separated by the same
 * letter spacing as glyphs within a run. Text without a match is measured as
 * one run, exactly as the base measurer would.
 */
export function createEmphasisMeasurer(
  registry: Pick<FontRegistry, "measure">,
  spans: readonly TextEmphasisSpan[],
  features: OpenTypeFeatureMap | undefined,
): TextMeasurer {
  return {
    measure(text, family, weight, style, fontSize, letterSpacing = 0) {
      const runs = splitEmphasisRuns(text, spans);
      return runs.reduce((total, run, index) => {
        const face =
          run.style === undefined ? { weight, style } : emphasisFace(run.style, weight);
        return (
          total +
          (index > 0 ? letterSpacing : 0) +
          registry.measure(
            run.text,
            family,
            face.weight,
            face.style,
            fontSize,
            letterSpacing,
            features,
          )
        );
      }, 0);
    },
  };
}

/** A measurer that shapes with explicit OpenType features. */
export function createFeatureMeasurer(
  registry: Pick<FontRegistry, "measure">,
  features: OpenTypeFeatureMap,
): TextMeasurer {
  return {
    measure: (text, family, weight, style, fontSize, letterSpacing) =>
      registry.measure(text, family, weight, style, fontSize, letterSpacing, features),
  };
}

export type RichLineOutline = {
  /** Paths of runs set in the base face and color, joined per line. */
  base: string;
  /** One entry per emphasized run, in reading order. */
  emphasis: {
    text: string;
    style: TextEmphasisStyleId;
    face: EmphasisFace;
    data: string;
    x: number;
    width: number;
  }[];
  width: number;
  /** Line start (after alignment) and baseline, in px. */
  x: number;
  baseline: number;
  /** Every run of the line, base and emphasized, with its glyphs. */
  runs: RichLineRun[];
};

export type RichLineRun = {
  text: string;
  /** UTF-16 offset of the run in its line. */
  start: number;
  style: TextEmphasisStyleId | undefined;
  face: EmphasisFace;
  x: number;
  width: number;
  glyphs: PositionedGlyph[];
};

/**
 * Outline fitted lines run by run. Baselines and alignment match
 * FontRegistry.outlineText for the base face.
 */
export function outlineRichLines(input: {
  registry: Pick<FontRegistry, "measure" | "ascent"> & {
    setSegments(input: SetSegmentsInput): { segments: SetSegment[]; width: number };
  };
  lines: readonly string[];
  spans: readonly TextEmphasisSpan[];
  family: string;
  weight: number;
  fontSize: number;
  lineHeight: number;
  x: number;
  y: number;
  align: "left" | "center" | "right";
  letterSpacing?: number;
  features?: OpenTypeFeatureMap;
}): RichLineOutline[] {
  const measurer = createEmphasisMeasurer(input.registry, input.spans, input.features);
  const letterSpacing = input.letterSpacing ?? 0;
  const firstBaseline =
    input.y +
    input.registry.ascent(input.family, input.weight, "normal") * input.fontSize;
  return input.lines.map((line, lineIndex) => {
    const width = measurer.measure(
      line,
      input.family,
      input.weight,
      "normal",
      input.fontSize,
      letterSpacing,
    );
    const lineX =
      input.align === "center"
        ? input.x - width / 2
        : input.align === "right"
          ? input.x - width
          : input.x;
    const baseline = firstBaseline + lineIndex * input.fontSize * input.lineHeight;
    const runs = splitEmphasisRuns(line, input.spans);
    const base: string[] = [];
    const emphasis: RichLineOutline["emphasis"] = [];
    const setRuns: RichLineRun[] = [];
    let penX = lineX;
    let start = 0;
    for (const [index, run] of runs.entries()) {
      if (index > 0) penX += letterSpacing;
      const face =
        run.style === undefined
          ? { weight: input.weight, style: "normal" as const }
          : emphasisFace(run.style, input.weight);
      const set = input.registry.setSegments({
        segments: [{ text: run.text, weight: face.weight, style: face.style }],
        family: input.family,
        fontSize: input.fontSize,
        x: penX,
        baseline,
        letterSpacing,
        ...(input.features === undefined ? {} : { features: input.features }),
      });
      const segment = set.segments[0]!;
      setRuns.push({
        text: run.text,
        start,
        style: run.style,
        face,
        x: penX,
        width: set.width,
        glyphs: segment.glyphs,
      });
      start += run.text.length;
      if (run.style === undefined) {
        base.push(segment.path);
      } else {
        emphasis.push({
          text: run.text,
          style: run.style,
          face,
          data: segment.path,
          x: penX,
          width: set.width,
        });
      }
      penX += set.width;
    }
    return {
      base: base.filter((path) => path.length > 0).join(" "),
      emphasis,
      width,
      x: lineX,
      baseline,
      runs: setRuns,
    };
  });
}
