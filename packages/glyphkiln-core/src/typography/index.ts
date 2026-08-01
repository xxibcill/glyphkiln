import GraphemeSplitter from "grapheme-splitter";

import type { Bounds, QualityIssue } from "../domain/types.js";
import type { FontRegistry } from "../fonts/index.js";
import {
  GRAPHEME_SEGMENTATION_POLICY_VERSION,
  LINE_BREAKING_POLICY_VERSION,
  THAI_SEGMENTATION_POLICY,
  THAI_SEGMENTATION_POLICY_VERSION,
  TYPOGRAPHY_ALGORITHM_VERSION,
  TYPOGRAPHY_POLICY,
  WHITESPACE_SEGMENTATION_POLICY,
  WHITESPACE_SEGMENTATION_POLICY_VERSION,
} from "./policy.js";
import {
  segmentParagraph,
  segmentThaiText,
  type SegmentationPolicy,
  type SegmentationPolicyVersion,
  type SegmentedParagraph,
  type WrapUnit,
} from "./segmentation.js";

export type TextStyle = {
  family: string;
  weight: number;
  style: "normal" | "italic";
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
};

export type TextMeasurer = Pick<FontRegistry, "measure">;

export type BrokenWord = {
  token: string;
  fragments: string[];
  lineIndex: number;
  affectedLine: string;
  segmentationPolicy: SegmentationPolicy;
  segmentationPolicyVersion: SegmentationPolicyVersion;
};

export type OrphanLine = {
  lineIndex: number;
  affectedLine: string;
  previousLine: string;
  previousLineWidth: number;
  finalLineWidth: number;
  finalLineToPreviousLineWidthRatio: number;
  isolatedWord: boolean;
  disproportionatelyShort: boolean;
  segmentationPolicy: SegmentationPolicy;
  segmentationPolicyVersion: SegmentationPolicyVersion;
};

export type WrappedText = {
  lines: string[];
  lineWidths: number[];
  width: number;
  height: number;
  brokeLongWord: boolean;
  brokenWords: BrokenWord[];
  orphanLines: OrphanLine[];
  usesBalancedLineBreaking: boolean;
  segmentationPolicy: SegmentationPolicy;
  segmentationPolicyVersion: SegmentationPolicyVersion;
};

export type FittedText = WrappedText & {
  fontSize: number;
  bounds: Bounds;
  issues: QualityIssue[];
};

export type WrapTextOptions = {
  keepTogether?: readonly string[];
  allowWordBreak?: boolean;
};

export type FitTextOptions = {
  text: string;
  registry: TextMeasurer;
  style: Omit<TextStyle, "fontSize">;
  box: Bounds;
  preferredFontSize: number;
  minimumFontSize: number;
  maximumLines: number;
  layerId: string;
  keepTogether?: readonly string[];
  letterSpacingEm?: number;
};

type ParagraphWrap = {
  lines: string[];
  lineWidths: number[];
  lineWordCounts: number[];
  brokenWords: BrokenWord[];
  policy: SegmentationPolicy;
  policyVersion: SegmentationPolicyVersion;
  usesBalancedLineBreaking: boolean;
};

type BalancedLayout = {
  lines: string[];
  lineWidths: number[];
  lineWordCounts: number[];
};

type BalancedState = {
  line: string;
  lineWidth: number;
  lineWordCount: number;
  lineCount: number;
  score: number;
  previous?: BalancedState;
};

type FitCandidate = {
  wrapped: WrappedText;
  fontSize: number;
  orphanPenalty: number;
};

const graphemeSplitter = new GraphemeSplitter();
const ORPHAN_LINE_WIDTH_RATIO = 0.45;
const SCORE_EPSILON = 1e-9;

export function wrapText(
  text: string,
  maxWidth: number,
  style: TextStyle,
  registry: TextMeasurer,
  options: WrapTextOptions = {},
): WrappedText {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  const lineWidths: number[] = [];
  const orphanLines: OrphanLine[] = [];
  const brokenWords: BrokenWord[] = [];
  let usesBalancedLineBreaking = false;
  let usesThaiSegmentation = false;

  for (const rawParagraph of paragraphs) {
    const segmented = segmentParagraph(rawParagraph, options.keepTogether ?? []);
    const paragraph = wrapParagraph(
      segmented,
      maxWidth,
      style,
      registry,
      options.allowWordBreak ?? !segmented.usesThaiSegmentation,
    );
    const lineOffset = lines.length;
    lines.push(...paragraph.lines);
    lineWidths.push(...paragraph.lineWidths);
    brokenWords.push(
      ...paragraph.brokenWords.map((broken) => ({
        ...broken,
        lineIndex: broken.lineIndex + lineOffset,
      })),
    );
    orphanLines.push(...findOrphanLines(paragraph, lineOffset));
    usesBalancedLineBreaking ||= paragraph.usesBalancedLineBreaking;
    usesThaiSegmentation ||= segmented.usesThaiSegmentation;
  }

  return {
    lines,
    lineWidths,
    width: Math.max(0, ...lineWidths),
    height: lines.length * style.fontSize * style.lineHeight,
    brokeLongWord: brokenWords.length > 0,
    brokenWords,
    orphanLines,
    usesBalancedLineBreaking,
    segmentationPolicy: usesThaiSegmentation
      ? THAI_SEGMENTATION_POLICY
      : WHITESPACE_SEGMENTATION_POLICY,
    segmentationPolicyVersion: usesThaiSegmentation
      ? THAI_SEGMENTATION_POLICY_VERSION
      : WHITESPACE_SEGMENTATION_POLICY_VERSION,
  };
}

export function fitText(options: FitTextOptions): FittedText {
  let bestOrphanCandidate: FitCandidate | undefined;
  for (const fontSize of fontSizesToTry(options)) {
    const style = textStyleAtSize(options, fontSize);
    const wrapped = wrapText(options.text, options.box.width, style, options.registry, {
      ...(options.keepTogether === undefined
        ? {}
        : { keepTogether: options.keepTogether }),
      allowWordBreak: fontSize === options.minimumFontSize,
    });
    if (!fitsTextBox(wrapped, options)) continue;
    if (wrapped.brokeLongWord) {
      return toFittedText(options, wrapped, fontSize, []);
    }
    if (!wrapped.usesBalancedLineBreaking || wrapped.orphanLines.length === 0) {
      return toFittedText(options, wrapped, fontSize, []);
    }
    const candidate = {
      wrapped,
      fontSize,
      orphanPenalty: orphanPenalty(wrapped.orphanLines),
    };
    if (isBetterFitCandidate(candidate, bestOrphanCandidate)) {
      bestOrphanCandidate = candidate;
    }
  }

  if (bestOrphanCandidate !== undefined) {
    return toFittedText(
      options,
      bestOrphanCandidate.wrapped,
      bestOrphanCandidate.fontSize,
      [],
    );
  }

  const style = textStyleAtSize(options, options.minimumFontSize);
  const wrapped = wrapText(options.text, options.box.width, style, options.registry, {
    ...(options.keepTogether === undefined
      ? {}
      : { keepTogether: options.keepTogether }),
    allowWordBreak: true,
  });
  const issues: QualityIssue[] = [
    {
      code: "TEXT_OVERFLOW",
      severity: "error",
      message: `Text does not fit within ${options.maximumLines} lines at the minimum font size.`,
      layerId: options.layerId,
      details: {
        lineCount: wrapped.lines.length,
        maximumLines: options.maximumLines,
        minimumFontSize: options.minimumFontSize,
      },
    },
  ];
  return toFittedText(options, wrapped, options.minimumFontSize, issues);
}

function textStyleAtSize(options: FitTextOptions, fontSize: number): TextStyle {
  return {
    ...options.style,
    fontSize,
    ...(options.letterSpacingEm === undefined
      ? {}
      : { letterSpacing: options.letterSpacingEm * fontSize }),
  };
}

function wrapParagraph(
  paragraph: SegmentedParagraph,
  maxWidth: number,
  style: TextStyle,
  registry: TextMeasurer,
  allowWordBreak: boolean,
): ParagraphWrap {
  if (paragraph.units.length === 0) {
    return {
      lines: [""],
      lineWidths: [0],
      lineWordCounts: [0],
      brokenWords: [],
      policy: paragraph.policy,
      policyVersion: paragraph.policyVersion,
      usesBalancedLineBreaking: paragraph.usesThaiSegmentation,
    };
  }
  if (
    paragraph.usesThaiSegmentation &&
    paragraph.units.every((unit) => measure(unit.text, style, registry) <= maxWidth)
  ) {
    const layout = balanceLines(paragraph.units, maxWidth, style, registry);
    return {
      ...layout,
      brokenWords: [],
      policy: paragraph.policy,
      policyVersion: paragraph.policyVersion,
      usesBalancedLineBreaking: true,
    };
  }
  return wrapGreedily(paragraph, maxWidth, style, registry, allowWordBreak);
}

function wrapGreedily(
  paragraph: SegmentedParagraph,
  maxWidth: number,
  style: TextStyle,
  registry: TextMeasurer,
  allowWordBreak: boolean,
): ParagraphWrap {
  const lines: string[] = [];
  const lineWordCounts: number[] = [];
  const brokenWords: BrokenWord[] = [];
  let current = "";
  let currentWordCount = 0;

  for (const unit of paragraph.units) {
    const candidate = appendUnit(current, unit);
    if (measure(candidate, style, registry) <= maxWidth) {
      current = candidate;
      currentWordCount += unit.wordCount;
      continue;
    }
    if (current.length > 0) {
      lines.push(current);
      lineWordCounts.push(currentWordCount);
    }
    if (measure(unit.text, style, registry) <= maxWidth) {
      current = unit.text;
      currentWordCount = unit.wordCount;
      continue;
    }
    if (!allowWordBreak || unit.wordCount > 1) {
      current = unit.text;
      currentWordCount = unit.wordCount;
      continue;
    }
    const fragments = breakLongToken(unit.text, maxWidth, style, registry);
    if (fragments.length < 2) {
      current = unit.text;
      currentWordCount = unit.wordCount;
      continue;
    }
    const firstFragmentLine = lines.length;
    lines.push(...fragments.slice(0, -1));
    lineWordCounts.push(...fragments.slice(0, -1).map(() => 1));
    current = fragments.at(-1) ?? "";
    currentWordCount = 1;
    brokenWords.push({
      token: unit.text,
      fragments,
      lineIndex: firstFragmentLine,
      affectedLine: fragments[0] ?? "",
      segmentationPolicy: paragraph.policy,
      segmentationPolicyVersion: paragraph.policyVersion,
    });
  }
  lines.push(current);
  lineWordCounts.push(currentWordCount);
  return {
    lines,
    lineWidths: lines.map((line) => measure(line, style, registry)),
    lineWordCounts,
    brokenWords,
    policy: paragraph.policy,
    policyVersion: paragraph.policyVersion,
    usesBalancedLineBreaking: paragraph.usesThaiSegmentation,
  };
}

function balanceLines(
  units: readonly WrapUnit[],
  maxWidth: number,
  style: TextStyle,
  registry: TextMeasurer,
): BalancedLayout {
  const layouts: (BalancedState | undefined)[] = Array.from(
    { length: units.length + 1 },
    () => undefined,
  );
  layouts[0] = {
    line: "",
    lineWidth: 0,
    lineWordCount: 0,
    lineCount: 0,
    score: 0,
  };

  for (let end = 1; end <= units.length; end += 1) {
    let line = "";
    let wordCount = 0;
    for (let start = end - 1; start >= 0; start -= 1) {
      const unit = units[start]!;
      line = prependUnit(line, unit, units[start + 1]);
      wordCount += unit.wordCount;
      const width = measure(line, style, registry);
      if (width > maxWidth) break;
      const prefix = layouts[start];
      if (prefix === undefined) continue;
      const slack = maxWidth - width;
      const finalLinePenalty =
        end === units.length
          ? orphanLayoutPenalty(prefix, width, wordCount, maxWidth)
          : 0;
      const candidate: BalancedState = {
        line,
        lineWidth: width,
        lineWordCount: wordCount,
        lineCount: prefix.lineCount + 1,
        score: prefix.score + slack * slack + finalLinePenalty,
        previous: prefix,
      };
      if (isBetterBalancedState(candidate, layouts[end])) {
        layouts[end] = candidate;
      }
    }
  }

  return materializeBalancedLayout(layouts[units.length]!);
}

function orphanLayoutPenalty(
  prefix: BalancedState,
  finalLineWidth: number,
  finalLineWordCount: number,
  maxWidth: number,
): number {
  if (prefix.lineCount === 0) return 0;
  const previousLineWidth = prefix.lineWidth;
  const ratio = previousLineWidth === 0 ? 1 : finalLineWidth / previousLineWidth;
  const penaltyScale = maxWidth * maxWidth;
  return (
    (finalLineWordCount === 1 ? penaltyScale * 4 : 0) +
    Math.max(0, ORPHAN_LINE_WIDTH_RATIO - ratio) * penaltyScale * 4
  );
}

function prependUnit(
  line: string,
  unit: WrapUnit,
  following: WrapUnit | undefined,
): string {
  if (line.length === 0) return unit.text;
  return `${unit.text}${following?.separatorBefore ?? ""}${line}`;
}

function appendUnit(line: string, unit: WrapUnit): string {
  return line.length === 0 ? unit.text : `${line}${unit.separatorBefore}${unit.text}`;
}

function isBetterBalancedState(
  candidate: BalancedState,
  current: BalancedState | undefined,
): boolean {
  if (current === undefined) return true;
  if (candidate.score < current.score - SCORE_EPSILON) return true;
  if (candidate.score > current.score + SCORE_EPSILON) return false;
  if (candidate.lineCount !== current.lineCount) {
    return candidate.lineCount < current.lineCount;
  }
  const candidateWidths = collectBalancedLineWidths(candidate);
  const currentWidths = collectBalancedLineWidths(current);
  for (const [index, width] of candidateWidths.entries()) {
    const currentWidth = currentWidths[index]!;
    if (Math.abs(width - currentWidth) <= SCORE_EPSILON) continue;
    return width > currentWidth;
  }
  return false;
}

function materializeBalancedLayout(state: BalancedState): BalancedLayout {
  const lines: string[] = [];
  const lineWidths: number[] = [];
  const lineWordCounts: number[] = [];
  let current = state;
  while (current.previous !== undefined) {
    lines.push(current.line);
    lineWidths.push(current.lineWidth);
    lineWordCounts.push(current.lineWordCount);
    current = current.previous;
  }
  lines.reverse();
  lineWidths.reverse();
  lineWordCounts.reverse();
  return { lines, lineWidths, lineWordCounts };
}

function collectBalancedLineWidths(state: BalancedState): number[] {
  const widths: number[] = [];
  let current = state;
  while (current.previous !== undefined) {
    widths.push(current.lineWidth);
    current = current.previous;
  }
  return widths.reverse();
}

function findOrphanLines(paragraph: ParagraphWrap, lineOffset: number): OrphanLine[] {
  if (paragraph.lines.length < 2) return [];
  const finalIndex = paragraph.lines.length - 1;
  const previousIndex = finalIndex - 1;
  const finalLineWidth = paragraph.lineWidths[finalIndex]!;
  const previousLineWidth = paragraph.lineWidths[previousIndex]!;
  const ratio = previousLineWidth === 0 ? 1 : finalLineWidth / previousLineWidth;
  const isolatedWord = paragraph.lineWordCounts[finalIndex] === 1;
  const disproportionatelyShort = ratio < ORPHAN_LINE_WIDTH_RATIO;
  if (!isolatedWord && !disproportionatelyShort) return [];
  return [
    {
      lineIndex: lineOffset + finalIndex,
      affectedLine: paragraph.lines[finalIndex]!,
      previousLine: paragraph.lines[previousIndex]!,
      previousLineWidth,
      finalLineWidth,
      finalLineToPreviousLineWidthRatio: ratio,
      isolatedWord,
      disproportionatelyShort,
      segmentationPolicy: paragraph.policy,
      segmentationPolicyVersion: paragraph.policyVersion,
    },
  ];
}

function fontSizesToTry(options: FitTextOptions): number[] {
  const preferred = Math.max(options.preferredFontSize, options.minimumFontSize);
  const sizes: number[] = [];
  for (let fontSize = preferred; fontSize > options.minimumFontSize; fontSize -= 1) {
    sizes.push(fontSize);
  }
  sizes.push(options.minimumFontSize);
  return sizes;
}

function fitsTextBox(wrapped: WrappedText, options: FitTextOptions): boolean {
  return (
    wrapped.width <= options.box.width &&
    wrapped.lines.length <= options.maximumLines &&
    wrapped.height <= options.box.height
  );
}

function orphanPenalty(orphanLines: readonly OrphanLine[]): number {
  return orphanLines.reduce(
    (total, orphan) =>
      total +
      (orphan.isolatedWord ? 1 : 0) +
      Math.max(0, ORPHAN_LINE_WIDTH_RATIO - orphan.finalLineToPreviousLineWidthRatio),
    0,
  );
}

function isBetterFitCandidate(
  candidate: FitCandidate,
  current: FitCandidate | undefined,
): boolean {
  if (current === undefined) return true;
  if (candidate.orphanPenalty < current.orphanPenalty - SCORE_EPSILON) return true;
  if (candidate.orphanPenalty > current.orphanPenalty + SCORE_EPSILON) return false;
  return candidate.fontSize > current.fontSize;
}

function toFittedText(
  options: FitTextOptions,
  wrapped: WrappedText,
  fontSize: number,
  issues: QualityIssue[],
): FittedText {
  issues.push(
    ...brokenWordIssues(options, wrapped),
    ...orphanLineIssues(options, wrapped),
  );
  return {
    ...wrapped,
    fontSize,
    bounds: {
      x: options.box.x,
      y: options.box.y,
      width: wrapped.width,
      height: wrapped.height,
    },
    issues,
  };
}

function brokenWordIssues(
  options: FitTextOptions,
  wrapped: WrappedText,
): QualityIssue[] {
  const finalRatio = finalLineRatio(wrapped.lineWidths);
  return wrapped.brokenWords.map((broken) => ({
    code: "LINGUISTIC_WORD_BROKEN",
    severity: "error",
    message: `The word "${broken.token}" had to be split internally at the minimum font size.`,
    layerId: options.layerId,
    details: {
      affectedLine: broken.affectedLine,
      lineNumber: broken.lineIndex + 1,
      token: broken.token,
      fragments: broken.fragments,
      measuredLineWidths: wrapped.lineWidths.map(roundMetric),
      finalLineToPreviousLineWidthRatio: roundMetric(finalRatio),
      segmentationPolicy: broken.segmentationPolicy,
      segmentationPolicyVersion: broken.segmentationPolicyVersion,
      graphemeSegmentationPolicyVersion: GRAPHEME_SEGMENTATION_POLICY_VERSION,
      lineBreakingPolicyVersion: LINE_BREAKING_POLICY_VERSION,
      typographyAlgorithmVersion: TYPOGRAPHY_ALGORITHM_VERSION,
    },
  }));
}

function orphanLineIssues(
  options: FitTextOptions,
  wrapped: WrappedText,
): QualityIssue[] {
  return wrapped.orphanLines.map((orphan) => ({
    code: "ORPHAN_LINE",
    severity: "warning",
    message: "The final line is isolated or disproportionately short.",
    layerId: options.layerId,
    details: {
      affectedLine: orphan.affectedLine,
      lineNumber: orphan.lineIndex + 1,
      phrase: orphan.affectedLine,
      previousLine: orphan.previousLine,
      measuredLineWidths: wrapped.lineWidths.map(roundMetric),
      previousLineWidth: roundMetric(orphan.previousLineWidth),
      finalLineWidth: roundMetric(orphan.finalLineWidth),
      finalLineToPreviousLineWidthRatio: roundMetric(
        orphan.finalLineToPreviousLineWidthRatio,
      ),
      isolatedWord: orphan.isolatedWord,
      disproportionatelyShort: orphan.disproportionatelyShort,
      segmentationPolicy: orphan.segmentationPolicy,
      segmentationPolicyVersion: orphan.segmentationPolicyVersion,
      lineBreakingPolicyVersion: LINE_BREAKING_POLICY_VERSION,
      typographyAlgorithmVersion: TYPOGRAPHY_ALGORITHM_VERSION,
    },
  }));
}

function finalLineRatio(widths: readonly number[]): number {
  if (widths.length < 2) return 1;
  const previous = widths.at(-2)!;
  return previous === 0 ? 1 : widths.at(-1)! / previous;
}

function breakLongToken(
  token: string,
  maxWidth: number,
  style: TextStyle,
  registry: TextMeasurer,
): string[] {
  const characters = graphemeSplitter.splitGraphemes(token);
  const fragments: string[] = [];
  let current = "";
  for (const character of characters) {
    const candidate = current + character;
    if (current.length > 0 && measure(candidate, style, registry) > maxWidth) {
      fragments.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) fragments.push(current);
  return fragments;
}

function measure(text: string, style: TextStyle, registry: TextMeasurer): number {
  return registry.measure(
    text,
    style.family,
    style.weight,
    style.style,
    style.fontSize,
    style.letterSpacing,
  );
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export {
  GRAPHEME_SEGMENTATION_POLICY_VERSION,
  LINE_BREAKING_POLICY_VERSION,
  THAI_SEGMENTATION_POLICY_VERSION,
  TYPOGRAPHY_ALGORITHM_VERSION,
  TYPOGRAPHY_POLICY,
  WHITESPACE_SEGMENTATION_POLICY_VERSION,
  segmentThaiText,
};

export {
  TEXT_LAYOUT_DIAGNOSTICS_VERSION,
  analyzeTextLayoutSupport,
} from "./text-layout.js";
export type {
  TextLayoutAnalysis,
  TextLayoutDiagnostic,
  TextLayoutDiagnosticCode,
  TextLayoutMatch,
  TextLayoutMatchProperty,
} from "./text-layout.js";
export type {
  DesignTextLayoutDiagnostic,
  DesignTextLayoutInspection,
} from "./design-text-layout.js";
