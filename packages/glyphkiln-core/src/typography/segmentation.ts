import { THAI_SEGMENTATION_MODEL } from "./budoux-th-model.js";
import {
  THAI_SEGMENTATION_POLICY,
  THAI_SEGMENTATION_POLICY_VERSION,
  WHITESPACE_SEGMENTATION_POLICY,
  WHITESPACE_SEGMENTATION_POLICY_VERSION,
} from "./policy.js";

export type SegmentationPolicy =
  typeof THAI_SEGMENTATION_POLICY | typeof WHITESPACE_SEGMENTATION_POLICY;

export type SegmentationPolicyVersion =
  | typeof THAI_SEGMENTATION_POLICY_VERSION
  | typeof WHITESPACE_SEGMENTATION_POLICY_VERSION;

export type WrapUnit = {
  text: string;
  separatorBefore: "" | " ";
  wordCount: number;
  start: number;
  end: number;
};

export type SegmentedParagraph = {
  text: string;
  units: WrapUnit[];
  policy: SegmentationPolicy;
  policyVersion: SegmentationPolicyVersion;
  usesThaiSegmentation: boolean;
};

type SegmentationModel = Readonly<Record<string, Readonly<Record<string, number>>>>;

const BUDOUX_FEATURES = [
  ["UW1", -3, -2],
  ["UW2", -2, -1],
  ["UW3", -1, 0],
  ["UW4", 0, 1],
  ["UW5", 1, 2],
  ["UW6", 2, 3],
  ["BW1", -2, 0],
  ["BW2", -1, 1],
  ["BW3", 0, 2],
  ["TW1", -3, 0],
  ["TW2", -2, 1],
  ["TW3", -1, 2],
  ["TW4", 0, 3],
] as const;

// BudouX-compatible scoring derived from google/budoux 0.7.0.
// Copyright 2021 Google LLC; licensed under Apache-2.0.
const thaiParser = createThaiParser(THAI_SEGMENTATION_MODEL);
const THAI_BLOCK_START = 0x0e00;
const THAI_BLOCK_END = 0x0e7f;

export function segmentThaiText(text: string): string[] {
  return thaiParser(text);
}

export function segmentParagraph(
  paragraph: string,
  keepTogether: readonly string[],
): SegmentedParagraph {
  const normalized = normalizeWhitespace(paragraph);
  const usesThaiSegmentation = containsThai(normalized);
  const units = createUnits(normalized);
  return {
    text: normalized,
    units: mergeKeepTogetherUnits(units, normalized, keepTogether),
    policy: usesThaiSegmentation
      ? THAI_SEGMENTATION_POLICY
      : WHITESPACE_SEGMENTATION_POLICY,
    policyVersion: usesThaiSegmentation
      ? THAI_SEGMENTATION_POLICY_VERSION
      : WHITESPACE_SEGMENTATION_POLICY_VERSION,
    usesThaiSegmentation,
  };
}

export function containsThai(text: string): boolean {
  for (const character of text) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= THAI_BLOCK_START && codePoint <= THAI_BLOCK_END) return true;
  }
  return false;
}

function createThaiParser(model: SegmentationModel): (text: string) => string[] {
  const baseScore =
    -0.5 *
    Object.values(model).reduce(
      (total, group) =>
        total + Object.values(group).reduce((sum, score) => sum + score, 0),
      0,
    );
  return (text) => {
    if (text.length === 0) return [];
    const segments: string[] = [];
    let segmentStart = 0;
    for (let boundary = 1; boundary < text.length; boundary += 1) {
      if (boundaryScore(text, boundary, model, baseScore) <= 0) continue;
      segments.push(text.slice(segmentStart, boundary));
      segmentStart = boundary;
    }
    segments.push(text.slice(segmentStart));
    return segments;
  };
}

function boundaryScore(
  text: string,
  boundary: number,
  model: SegmentationModel,
  baseScore: number,
): number {
  return BUDOUX_FEATURES.reduce((score, [group, start, end]) => {
    const feature = text.substring(boundary + start, boundary + end);
    return score + (model[group]?.[feature] ?? 0);
  }, baseScore);
}

function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function createUnits(text: string): WrapUnit[] {
  const units: WrapUnit[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const token = match[0];
    const tokenStart = match.index;
    const segments = containsThai(token) ? segmentThaiText(token) : [token];
    let segmentStart = tokenStart;
    for (const [segmentIndex, segment] of segments.entries()) {
      const segmentEnd = segmentStart + segment.length;
      units.push({
        text: segment,
        separatorBefore: segmentIndex === 0 && units.length > 0 ? " " : "",
        wordCount: 1,
        start: segmentStart,
        end: segmentEnd,
      });
      segmentStart = segmentEnd;
    }
  }
  return units;
}

function mergeKeepTogetherUnits(
  units: readonly WrapUnit[],
  paragraph: string,
  keepTogether: readonly string[],
): WrapUnit[] {
  const ranges = findKeepTogetherRanges(paragraph, keepTogether);
  const merged: WrapUnit[] = [];
  for (const unit of units) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      ranges.some((range) => range.start < unit.start && unit.start < range.end)
    ) {
      previous.text += unit.separatorBefore + unit.text;
      previous.wordCount += unit.wordCount;
      previous.end = unit.end;
      continue;
    }
    merged.push({ ...unit });
  }
  return merged;
}

function findKeepTogetherRanges(
  paragraph: string,
  keepTogether: readonly string[],
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const rawPhrase of keepTogether) {
    const phrase = normalizeWhitespace(rawPhrase);
    let searchFrom = 0;
    while (phrase.length > 0) {
      const start = paragraph.indexOf(phrase, searchFrom);
      if (start < 0) break;
      ranges.push({ start, end: start + phrase.length });
      searchFrom = start + 1;
    }
  }
  return ranges.sort((left, right) => left.start - right.start || left.end - right.end);
}
