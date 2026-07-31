# Typography wrapping

Core typography algorithm `2.0.0` adds deterministic Thai-aware wrapping while
preserving the existing Latin layout contract.

## Segmentation

Each explicit `\n` starts a new paragraph and is never removed or moved. Within
a paragraph:

- space-delimited text keeps the existing `whitespace@1.0.0` tokenization and
  greedy wrapping behavior;
- a paragraph containing Thai characters uses the offline
  `budoux-th@0.7.0` model to find candidate word/phrase boundaries;
- mixed Thai and space-delimited tokens retain normalized spaces between the
  original tokens;
- no word boundary comes from `Intl.Segmenter`, the host locale, or ICU.

The Thai model and compatible scorer are vendored from BudouX 0.7.0 under
Apache-2.0; Core does not import BudouX's unrelated DOM tooling. The model
version is part of the typography policy, render fingerprint configuration, and
manifest. Changing the scorer or model requires a typography and renderer
version bump.

## Balanced line breaking

Thai-aware paragraphs use deterministic dynamic programming over legal
segmentation boundaries. The score minimizes squared unused line width; exact
ties prefer fewer lines and then wider earlier lines. This avoids the old
greedy pattern where nearly all available width was consumed before leaving a
very short final line.

A final line is an orphan when it contains one segmented word or its measured
width is less than 45% of the preceding line. `fitText` continues through the
configured font-size range when a smaller Thai layout removes the orphan. If
no non-orphan layout exists, the best legal fitting layout is returned with an
`ORPHAN_LINE` warning. Latin line selection remains greedy and pixel-identical;
the orphan warning can still describe a poor Latin final line.

A single segmented word is not split while a larger configured font size is
still available. If it remains wider than the box at the minimum size, Core
uses pinned `grapheme-splitter@1.0.4/unicode-10.0.0` clusters and emits the
error-severity `LINGUISTIC_WORD_BROKEN` issue. Rendering is then blocked. A
successful output therefore never contains a word that Core knowingly split
internally. The lower-level fixed-size `wrapText` API leaves an oversized Thai
word intact by default; only `fitText` opts into the recorded emergency split
at the configured minimum size.

## Author-controlled phrases

Design-document schema `1.2.0` adds an optional `keepTogether` array to text
layers (`headline`, `subtitle`, `eyebrow`, `cta`, `footer`, and
`attribution`):

```json
{
  "id": "headline",
  "type": "headline",
  "text": "รายจ่ายบางก้อนยังเดินต่อ",
  "keepTogether": ["ยังเดินต่อ"],
  "visible": true
}
```

The array accepts at most 20 unique phrases of at most 200 characters. Phrases
cannot have leading/trailing whitespace or cross an explicit newline. Matching
is literal after the same whitespace normalization used by wrapping. Boundaries
inside a matched phrase are removed. If a kept phrase is wider than the box at
minimum size, it remains intact and normal `TEXT_OVERFLOW` handling blocks the
render; Core does not override the author's constraint.

Schemas `1.0.0` and `1.1.0` remain readable but reject `keepTogether`, so an old
document cannot silently acquire a new pixel-affecting control.

## Quality evidence

`LINGUISTIC_WORD_BROKEN` is an error and `ORPHAN_LINE` is a warning. Both carry
the layer ID plus the affected line, token or phrase, measured line widths,
final-to-previous width ratio, segmentation policy/version, line-breaking
policy version, and typography algorithm version. Broken-word evidence also
records the grapheme fragments and grapheme policy version. Warnings appear in
successful manifests; error issues are returned in
`QUALITY_VALIDATION_FAILED`, and no output or manifest is created.

## Versioned determinism

The current policy is:

- typography algorithm: `2.0.0`
- Thai segmentation: `budoux-th@0.7.0`
- whitespace segmentation: `whitespace@1.0.0`
- line breaking: `balanced-lines@1.0.0`
- emergency grapheme segmentation:
  `grapheme-splitter@1.0.4/unicode-10.0.0`

Renderer `0.3.0` owns the shared pixel change. Manifest `1.2.0` records the
policy object, and the same object is part of `RENDER_CONFIGURATION` in render
fingerprints. A fresh-process corpus test fixes the exact segmentation,
wrapping, issue details, and policy identifiers.

## Remaining limitations

The bundled Thai model is finite and can choose an undesirable boundary for a
specialized name, novel compound, abbreviation, or malformed text. Authors can
protect known phrases with `keepTogether`; changing the shared model requires a
versioned renderer release. Other scripts that normally omit spaces do not yet
have bundled segmentation models and retain whitespace-token behavior. Core
does not provide hyphenation dictionaries.
