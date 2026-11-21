/**
 * The one emphasis phrase matcher (emphasis-runs@1.0.0). Schema validation,
 * template accent decisions and run splitting all use it, so a phrase that
 * validates is a phrase that renders.
 *
 * Scanning left to right, the earliest match wins; at the same start the
 * longer phrase wins, then the earlier-declared one. Matches never overlap.
 * A phrase edge that is a word character must not touch another word
 * character, so "art" does not match inside "start".
 *
 * This module has no imports so the schema can depend on it.
 */

const WORD_CHARACTER = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Nd}]/u;

export type EmphasisCandidate<T> = { phrase: string; value: T };

export type EmphasisMatchRun<T> = { text: string; value?: T };

/** Normalize whitespace exactly as the line wrapper does before matching. */
export function normalizeEmphasisText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Split one line into plain and matched runs. */
export function matchEmphasisRuns<T>(
  line: string,
  candidates: readonly EmphasisCandidate<T>[],
): EmphasisMatchRun<T>[] {
  const ordered = candidates
    .map((candidate, order) => ({
      phrase: normalizeEmphasisText(candidate.phrase),
      value: candidate.value,
      order,
    }))
    .filter((candidate) => candidate.phrase.length > 0)
    .sort(
      (left, right) =>
        right.phrase.length - left.phrase.length || left.order - right.order,
    );
  const runs: EmphasisMatchRun<T>[] = [];
  let plainStart = 0;
  let cursor = 0;
  while (cursor < line.length) {
    const match = ordered.find(
      (candidate) =>
        line.startsWith(candidate.phrase, cursor) &&
        isWordBoundary(line, cursor, candidate.phrase),
    );
    if (match === undefined) {
      cursor += 1;
      continue;
    }
    if (cursor > plainStart) runs.push({ text: line.slice(plainStart, cursor) });
    runs.push({ text: match.phrase, value: match.value });
    cursor += match.phrase.length;
    plainStart = cursor;
  }
  if (plainStart < line.length) runs.push({ text: line.slice(plainStart) });
  return runs.length === 0 ? [{ text: line }] : runs;
}

/**
 * Indexes of the phrases that produce at least one run in the text, matched
 * paragraph by paragraph after whitespace normalization. Emphasis phrases are
 * kept together on one line, so this is also what the fitted lines produce.
 */
export function matchedEmphasisIndexes(
  text: string,
  phrases: readonly string[],
): Set<number> {
  const candidates = phrases.map((phrase, index) => ({ phrase, value: index }));
  const matched = new Set<number>();
  for (const paragraph of text.split(/\r?\n/)) {
    for (const run of matchEmphasisRuns(normalizeEmphasisText(paragraph), candidates)) {
      if (run.value !== undefined) matched.add(run.value);
    }
  }
  return matched;
}

function isWordBoundary(line: string, start: number, phrase: string): boolean {
  const end = start + phrase.length;
  const before = start > 0 ? line[start - 1]! : "";
  const after = end < line.length ? line[end]! : "";
  if (WORD_CHARACTER.test(phrase[0]!) && WORD_CHARACTER.test(before)) return false;
  if (WORD_CHARACTER.test(phrase.at(-1)!) && WORD_CHARACTER.test(after)) return false;
  return true;
}
