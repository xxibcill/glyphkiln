/**
 * Hybrid Thai segmentation (policy `thai-segmentation-hybrid@1.0.0`, plan §4
 * and M3).
 *
 * Thai has no spaces between words, so UAX #14 leaves every run of class SA
 * unbroken (LB1 resolves SA to AL). This module chooses word boundaries inside
 * those runs:
 *
 * 1. **Cluster guard.** Candidate boundaries are Thai character cluster (TCC)
 *    boundaries only: never before a combining mark, a following vowel, ๆ or
 *    ฯ, never after a leading vowel or mai han-akat, never before a consonant
 *    silenced by thanthakhat, and never inside the vowel frames เ–ีย, เ–ือ
 *    and เ–อ. A break inside a cluster is always inside a syllable.
 * 2. **Lexicon.** Occurrences of the document or brand `lexicon` are found
 *    leftmost-longest and are never split: the lexicon overrides the
 *    dictionary.
 * 3. **Maximal matching.** A lattice over the ICU 78.3 `thaidict` words,
 *    Glyphkiln's supplement word list and the lexicon chooses the path with the fewest characters outside known words,
 *    then the fewest words.
 * 4. **BudouX.** The BudouX 0.7.0 Thai model breaks the remaining ties (the
 *    path whose boundaries it scores highest wins). A boundary between two
 *    known words is always kept; a boundary inside or at the edge of an
 *    unknown span is kept only where BudouX also places one.
 *
 * Work is bounded: the lattice visits each position once and tries at most
 * `maxWordLength` (20, or the longest lexicon entry) end positions from it.
 * Arithmetic is on integers and every tie has a fixed order, so the output is
 * deterministic. The dictionary, model and lexicon are hashed into the policy.
 */
import { sha256 } from "../cache/canonical.js";
import { canonicalJson } from "../cache/canonical-json.js";
import { THAI_SEGMENTATION_MODEL } from "./budoux-th-model.js";
import { lineBreakProperties, type LineBreakOpportunity } from "./line-break.js";
import { tailoredLineBreakOpportunities } from "./line-break-tailoring.js";
import {
  THAI_DICTIONARY_SOURCE,
  THAI_DICTIONARY_WORDS,
} from "./thai-dictionary.generated.js";
import { THAI_SUPPLEMENT_WORDS } from "./thai-supplement-words.js";

export const THAI_SEGMENTATION_HYBRID_VERSION = "1.0.0" as const;

/** Bounds on a lexicon, shared with the schema. */
export const THAI_LEXICON_LIMITS = Object.freeze({
  maxEntries: 200,
  maxEntryLength: 40,
});

export type ThaiSegmentationHybridPolicy = {
  readonly id: "thai-segmentation-hybrid";
  readonly version: typeof THAI_SEGMENTATION_HYBRID_VERSION;
  readonly lineBreak: "line-break-tailoring@1.1.0";
  readonly dictionary: {
    readonly name: "icu-thaidict";
    readonly icuVersion: string;
    readonly license: "Unicode-3.0";
    readonly sourceSha256: string;
    readonly wordsSha256: string;
  };
  /** Glyphkiln's own supplement word list (`thai-supplement-words.ts`). */
  readonly supplement: { readonly entries: number; readonly sha256: string };
  readonly model: {
    readonly name: "budoux-th";
    readonly version: "0.7.0";
    readonly sha256: string;
  };
  readonly lexicon: { readonly entries: number; readonly sha256: string };
};

const THAI_FIRST = 0x0e01;
const THAI_LAST = 0x0e5b;
const SARA_A = 0x0e30;
const MAI_HAN_AKAT = 0x0e31;
const SARA_AA = 0x0e32;
const SARA_AM = 0x0e33;
const SARA_II = 0x0e35;
const SARA_UEE = 0x0e37;
const LEADING_VOWEL_FIRST = 0x0e40; // เ แ โ ใ ไ
const LEADING_VOWEL_LAST = 0x0e44;
const SARA_E = 0x0e40;
const LAKKHANGYAO = 0x0e45;
const MAIYAMOK = 0x0e46;
const PAIYANNOI = 0x0e2f;
const TONE_FIRST = 0x0e48;
const TONE_LAST = 0x0e4b;
const THANTHAKHAT = 0x0e4c;
const YO_YAK = 0x0e22;
const O_ANG = 0x0e2d;
const CONSONANT_FIRST = 0x0e01;
const CONSONANT_LAST = 0x0e2e;

const isConsonant = (code: number): boolean =>
  code >= CONSONANT_FIRST && code <= CONSONANT_LAST;
const isTone = (code: number): boolean => code >= TONE_FIRST && code <= TONE_LAST;
/** Thai combining marks (General_Category Mn), from the pinned table. */
const isMark = (code: number): boolean =>
  code >= THAI_FIRST &&
  code <= THAI_LAST &&
  lineBreakProperties(code).lineBreakClass === "SA" &&
  (code === MAI_HAN_AKAT ||
    (code >= 0x0e34 && code <= 0x0e3a) ||
    (code >= 0x0e47 && code <= 0x0e4e));

/** True for a Thai code point of Line_Break class SA (letters, vowels, marks, ๆ, ฯ). */
const isThaiSa = (code: number): boolean =>
  code >= THAI_FIRST &&
  code <= THAI_LAST &&
  lineBreakProperties(code).lineBreakClass === "SA";

/**
 * True when a boundary between `run[index - 1]` and `run[index]` is a Thai
 * character cluster boundary.
 */
export function isThaiClusterBoundary(run: string, index: number): boolean {
  if (index <= 0 || index >= run.length) return true;
  const next = run.charCodeAt(index);
  const previous = run.charCodeAt(index - 1);
  if (isMark(next)) return false;
  if (next === SARA_A || next === SARA_AA || next === SARA_AM) return false;
  if (next === LAKKHANGYAO || next === MAIYAMOK || next === PAIYANNOI) return false;
  if (previous >= LEADING_VOWEL_FIRST && previous <= LEADING_VOWEL_LAST) return false;
  if (previous === MAI_HAN_AKAT) return false;
  if (isTone(previous) && run.charCodeAt(index - 2) === MAI_HAN_AKAT) return false;
  if (isConsonant(next)) {
    // A consonant silenced by thanthakhat (ต์, ทร์ ends in ร์, ติ์) joins the
    // cluster before it.
    const after = run.charCodeAt(index + 1);
    if (after === THANTHAKHAT) return false;
    if (isMark(after) && run.charCodeAt(index + 2) === THANTHAKHAT) return false;
  }
  // Vowel frames เ–ีย, เ–ือ (one or two consonants) and เ–อ (one consonant):
  // the final ย or อ belongs to the frame.
  if (next === YO_YAK || next === O_ANG) {
    let back = index - 1;
    if (isTone(run.charCodeAt(back))) back -= 1;
    const vowel = run.charCodeAt(back);
    if (
      (next === YO_YAK && vowel === SARA_II) ||
      (next === O_ANG && vowel === SARA_UEE)
    ) {
      if (!isConsonant(run.charCodeAt(back - 1))) return true;
      if (run.charCodeAt(back - 2) === SARA_E) return false;
      return !(
        isConsonant(run.charCodeAt(back - 2)) && run.charCodeAt(back - 3) === SARA_E
      );
    }
    if (next === O_ANG && isConsonant(vowel))
      return run.charCodeAt(back - 1) !== SARA_E;
  }
  return true;
}

// BudouX-compatible scoring derived from google/budoux 0.7.0.
// Copyright 2021 Google LLC; licensed under Apache-2.0.
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
const MODEL_TOTAL = Object.values(THAI_SEGMENTATION_MODEL).reduce(
  (total, group) => total + Object.values(group).reduce((sum, score) => sum + score, 0),
  0,
);

/**
 * Twice the BudouX score of a boundary before `run[index]` (an integer, since
 * the model's weights are integers). Positive means BudouX would break.
 */
export function budouxThaiScore(run: string, index: number): number {
  let score = -MODEL_TOTAL;
  for (const [group, start, end] of BUDOUX_FEATURES) {
    const feature = run.substring(index + start, index + end);
    score += 2 * (THAI_SEGMENTATION_MODEL[group]?.[feature] ?? 0);
  }
  return score;
}

let dictionary: ReadonlySet<string> | undefined;
function dictionaryWords(): ReadonlySet<string> {
  dictionary ??= new Set([
    ...THAI_DICTIONARY_WORDS.split("\n"),
    ...THAI_SUPPLEMENT_WORDS,
  ]);
  return dictionary;
}

/** Checks and normalizes a lexicon: unique, sorted in code-unit order. */
export function normalizeThaiLexicon(lexicon: readonly string[]): readonly string[] {
  if (lexicon.length > THAI_LEXICON_LIMITS.maxEntries) {
    throw new RangeError(
      `A Thai lexicon holds at most ${THAI_LEXICON_LIMITS.maxEntries} entries.`,
    );
  }
  for (const entry of lexicon) {
    if (
      entry.length === 0 ||
      entry.length > THAI_LEXICON_LIMITS.maxEntryLength ||
      entry.normalize("NFC") !== entry ||
      !Array.from({ length: entry.length }, (_, index) =>
        entry.charCodeAt(index),
      ).every(isThaiSa)
    ) {
      throw new RangeError(
        `Lexicon entry ${JSON.stringify(entry)} must be 1–${THAI_LEXICON_LIMITS.maxEntryLength} NFC Thai letters, vowels or marks.`,
      );
    }
  }
  return Object.freeze(
    [...new Set(lexicon)].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

const MODEL_SHA256 = sha256(canonicalJson(THAI_SEGMENTATION_MODEL));

/** The policy record, with the dictionary, model and lexicon hashes. */
export function thaiSegmentationHybridPolicy(
  lexicon: readonly string[] = [],
): ThaiSegmentationHybridPolicy {
  const entries = normalizeThaiLexicon(lexicon);
  return Object.freeze({
    id: "thai-segmentation-hybrid",
    version: THAI_SEGMENTATION_HYBRID_VERSION,
    lineBreak: "line-break-tailoring@1.1.0",
    dictionary: Object.freeze({
      name: "icu-thaidict",
      icuVersion: THAI_DICTIONARY_SOURCE.icuVersion,
      license: "Unicode-3.0",
      sourceSha256: THAI_DICTIONARY_SOURCE.sourceSha256,
      wordsSha256: THAI_DICTIONARY_SOURCE.wordsSha256,
    }),
    supplement: Object.freeze({
      entries: THAI_SUPPLEMENT_WORDS.length,
      sha256: sha256(THAI_SUPPLEMENT_WORDS.join("\n")),
    }),
    model: Object.freeze({ name: "budoux-th", version: "0.7.0", sha256: MODEL_SHA256 }),
    lexicon: Object.freeze({
      entries: entries.length,
      sha256: sha256(entries.join("\n")),
    }),
  });
}

type Cost = { unknown: number; words: number; score: number };
const better = (left: Cost, right: Cost): boolean =>
  left.unknown !== right.unknown
    ? left.unknown < right.unknown
    : left.words !== right.words
      ? left.words < right.words
      : left.score > right.score;

/**
 * Leftmost-longest, non-overlapping lexicon occurrences in `run` whose edges
 * are cluster boundaries.
 */
function lexiconSpans(
  run: string,
  lexicon: readonly string[],
  allowed: readonly boolean[],
): [number, number][] {
  const spans: [number, number][] = [];
  if (lexicon.length === 0) return spans;
  for (let start = 0; start < run.length;) {
    let end = start;
    if (allowed[start]) {
      for (const entry of lexicon) {
        const candidate = start + entry.length;
        if (candidate > end && allowed[candidate] && run.startsWith(entry, start)) {
          end = candidate;
        }
      }
    }
    if (end > start) {
      spans.push([start, end]);
      start = end;
    } else {
      start += 1;
    }
  }
  return spans;
}

/**
 * Word boundaries inside one Thai SA run, as offsets in `(0, run.length)`.
 * `lexicon` must already be normalized.
 */
function segmentRun(run: string, lexicon: readonly string[]): number[] {
  const n = run.length;
  const allowed: boolean[] = [];
  for (let index = 0; index <= n; index += 1) {
    allowed.push(isThaiClusterBoundary(run, index));
  }
  // A lexicon occurrence is never split, no word may cross its edges, and its
  // edges are always boundaries.
  const lexiconSet = new Set(lexicon);
  const forced: boolean[] = new Array<boolean>(n + 1).fill(false);
  for (const [start, end] of lexiconSpans(run, lexicon, allowed)) {
    for (let index = start + 1; index < end; index += 1) allowed[index] = false;
    forced[start] = true;
    forced[end] = true;
  }
  const words = dictionaryWords();
  const maxLength = Math.max(
    THAI_DICTIONARY_SOURCE.maxWordLength,
    ...lexicon.map((entry) => entry.length),
  );
  const boundaryScore = (index: number): number =>
    index === 0 || index === n ? 0 : budouxThaiScore(run, index);

  const best: (Cost | undefined)[] = new Array<Cost | undefined>(n + 1).fill(undefined);
  const from: number[] = new Array<number>(n + 1).fill(-1);
  const known: boolean[] = new Array<boolean>(n + 1).fill(false);
  best[0] = { unknown: 0, words: 0, score: 0 };
  const relax = (start: number, end: number, isKnown: boolean): void => {
    const base = best[start]!;
    const candidate: Cost = {
      unknown: base.unknown + (isKnown ? 0 : end - start),
      words: base.words + 1,
      score: base.score + boundaryScore(start),
    };
    const current = best[end];
    if (current === undefined || better(candidate, current)) {
      best[end] = candidate;
      from[end] = start;
      known[end] = isKnown;
    }
  };
  for (let start = 0; start < n; start += 1) {
    if (best[start] === undefined || !allowed[start]) continue;
    let nextCluster = start + 1;
    while (nextCluster < n && !allowed[nextCluster]) nextCluster += 1;
    relax(start, nextCluster, false);
    const limit = Math.min(n, start + maxLength);
    for (let end = start + 1; end <= limit; end += 1) {
      if (!allowed[end]) continue;
      const piece = run.slice(start, end);
      if (words.has(piece) || lexiconSet.has(piece)) relax(start, end, true);
      if (forced[end]) break;
    }
  }

  // Walk back. A lexicon edge or a boundary between two known words is kept;
  // a boundary that touches an unknown span is kept only where BudouX places
  // one.
  const pieces: { start: number; end: number; known: boolean }[] = [];
  for (let end = n; end > 0; end = from[end]!) {
    pieces.push({ start: from[end]!, end, known: known[end]! });
  }
  pieces.reverse();
  const boundaries: number[] = [];
  for (const [index, piece] of pieces.entries()) {
    if (piece.start > 0) {
      const previous = pieces[index - 1]!;
      if (
        forced[piece.start] ||
        (piece.known && previous.known) ||
        boundaryScore(piece.start) > 0
      ) {
        boundaries.push(piece.start);
      }
    }
  }
  return boundaries;
}

/** Thai SA runs of `text` as [start, end) UTF-16 ranges. */
function thaiRuns(text: string): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  for (let index = 0; index <= text.length; index += 1) {
    const inside = index < text.length && isThaiSa(text.charCodeAt(index));
    if (inside && start < 0) start = index;
    if (!inside && start >= 0) {
      runs.push([start, index]);
      start = -1;
    }
  }
  return runs;
}

/** Offsets in `text` of the word boundaries chosen inside its Thai runs. */
export function thaiWordBoundaries(
  text: string,
  lexicon: readonly string[] = [],
): number[] {
  const entries = normalizeThaiLexicon(lexicon);
  const boundaries: number[] = [];
  for (const [start, end] of thaiRuns(text)) {
    for (const offset of segmentRun(text.slice(start, end), entries)) {
      boundaries.push(start + offset);
    }
  }
  return boundaries;
}

/**
 * Line-break opportunities for the M3 policy: `line-break-tailoring@1.1.0`
 * plus the hybrid Thai word boundaries inside SA runs.
 */
export function hybridLineBreakOpportunities(
  text: string,
  lexicon: readonly string[] = [],
): LineBreakOpportunity[] {
  const opportunities = tailoredLineBreakOpportunities(text);
  const taken = new Set(opportunities.map(({ offset }) => offset));
  for (const offset of thaiWordBoundaries(text, lexicon)) {
    if (!taken.has(offset)) opportunities.push({ offset, required: false });
  }
  return opportunities.sort((left, right) => left.offset - right.offset);
}
