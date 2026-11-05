# Typography M3: break opportunities and Thai segmentation

Milestone M3 of the [typography engine plan](plans/typography-engine-plan.md)
(§5). M3 replaces the whitespace and BudouX wrapper with UAX #14 line-break
opportunities, documented tailorings and a hybrid Thai segmenter. Only new template
versions use it, and every older version keeps its exact bytes.

## Policies

| Policy                           | Module                                       | What it does                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `line-break-uax14@17.0.0`        | `src/typography/line-break.ts`               | UAX #14 rules LB1–LB31 over generated Unicode 17.0.0 tables. Passes 19,338 of 19,338 `LineBreakTest.txt` cases. NBSP, NNBSP and WJ never break; ZWSP, SHY and hard hyphens allow a break after them.            |
| `line-break-tailoring@1.1.0`     | `src/typography/line-break-tailoring.ts`     | Removes opportunities only. ๆ, ฯ, em dashes and en dashes never start a line. An amount stays with a unit from a bounded list. Currency and `30 x 45` glue. A numeric range (`3–5`, `9:00–18:00`) never breaks. |
| `thai-segmentation-hybrid@1.0.0` | `src/typography/thai-segmentation-hybrid.ts` | Word boundaries inside Thai runs; see below.                                                                                                                                                                    |
| `prefer-break-after@1.0.0`       | `src/typography/index.ts` (balanced breaker) | A line that ends right after a `keepTogether.preferBreakAfter` phrase scores maxWidth² better.                                                                                                                  |

### Hybrid Thai segmenter

UAX #14 leaves Thai (class SA) unbroken, so the segmenter chooses the boundaries
inside each Thai run:

1. **Cluster guard.** A boundary may fall only between Thai character clusters.
   It is never placed:
   - before a mark, a following vowel, ๆ or ฯ;
   - after a leading vowel or mai han-akat;
   - before a consonant silenced by thanthakhat;
   - inside เ–ีย, เ–ือ or เ–อ.
2. **Lexicon.** The document and brand `lexicon` entries are matched
   leftmost-longest. A match is never split and no word may cross it.
3. **Maximal matching.** A lattice over ICU 78.3 `thaidict` (26,383 words) and a
   47-word Glyphkiln supplement chooses the path with the fewest unknown
   characters, then the fewest words.
4. **BudouX 0.7.0.** It breaks ties. A boundary that touches an unknown span is
   kept only where BudouX also places one.

The segmenter uses integer arithmetic and a fixed tie order. Its work is linear
in the run. The policy record holds SHA-256 hashes of the dictionary, the
supplement, the model and the lexicon. The licence evidence for `thaidict` is in
[`vendor/icu/README.md`](../packages/glyphkiln-core/vendor/icu/README.md).

## Schema

DesignDocument 1.8.0 had not been released, so on 5 November 2026 the owner
chose to extend it instead of adding 1.8.x or 1.9.0. It now has three new
fields:

- a document `lexicon`;
- a brand `typography.lexicon`;
- the object form `keepTogether: { phrases, preferBreakAfter }`.

See [DesignDocument](design-document.md). Scene 1.1.0 is unchanged, because no
Scene path uses M3.

## Template versions and provenance

The new versions `quote-card@1.5.0`, `statistic-card@1.5.0` and
`image-led-campaign@1.4.0` (`typography: "m3"`) are the M1 versions with M3
line breaking added. A version without the `preferredBreaks` capability
rejects `preferBreakAfter` with `TEMPLATE_FEATURE_UNSUPPORTED`.

M3 renders write manifest 1.4.0. Its `typographyPolicy.m3` field records the
UAX #14 data hash, the tailoring version, the segmenter record and the
preferred-break rule. The same record goes into the render fingerprint.

The renderer stays at 0.6.0, because no existing input renders differently.
Legacy, M1 and M2 output is byte-identical.

## Evidence

- [G-TH and probe metrics](research/typography-m3-metrics/README.md) cover five
  widths and the M0 probes, before and after. `npm test` verifies the report.
- Review candidates are in
  [`tests/visual/m3/`](../packages/glyphkiln-core/tests/visual/m3), with
  craft records:
  - the Thai quote before (`quote-card@1.4.0`, where `499 / บาท` splits);
  - the Thai quote after (`quote-card@1.5.0`), with and without a brand lexicon.
- The three Latin-only M3 versions produce PNGs byte-identical to their M1
  baselines.

## Not claimed

T10 needs the G-TH gold set. It is still a draft waiting for the native Thai
reader, who also reviews the Thai unit list and the supplement word list. The
supplement was drawn up from errors on that draft, so the G-TH numbers are not
an independent test.
