---
"@glyphkiln/core": minor
---

Add typography M3 line breaking, used only by new template versions.

New policies:

- `line-break-uax14@17.0.0`: in-house UAX #14 over generated Unicode 17.0.0 tables. It passes all 19,338 `LineBreakTest.txt` cases.
- `line-break-tailoring@1.1.0`: ๆ, ฯ, em dashes and en dashes never start a line; an amount stays with its unit (a bounded Thai and Latin unit list); currency and dimension glue; a numeric range never breaks.
- `thai-segmentation-hybrid@1.0.0`: a maximal-matching lattice over ICU 78.3 `thaidict` (Unicode-3.0, vendored with hash) plus a 47-word supplement, the document and brand lexicon, a Thai character cluster guard, and BudouX 0.7.0 as scorer and tiebreak.
- `prefer-break-after@1.0.0`: preferred line breaks after `keepTogether.preferBreakAfter` phrases.

DesignDocument 1.8.0 (still unreleased) adds a document `lexicon`, a brand `typography.lexicon` and the object form `keepTogether: { phrases, preferBreakAfter }`.

The new template versions `quote-card@1.5.0`, `statistic-card@1.5.0` and `image-led-campaign@1.4.0` opt in. Their renders write manifest 1.4.0, whose `typographyPolicy.m3` records every data hash, and the M3 policy enters the render fingerprint. Renderer 0.6.0 is unchanged, and so are legacy, M1 and M2 output bytes.
