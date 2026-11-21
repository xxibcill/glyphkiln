# Typography harness (plan M0)

This is development-only test data and tooling for the
[typography engine plan](../../../../docs/plans/typography-engine-plan.md).
Render code never reads anything here.

| Path                                   | What it holds                                                                                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corpora/`                             | C-LAT, C-TH, C-MIX (200 lines), C-PARA (100 Latin and 50 Thai paragraphs at 3 widths), C-EDGE (number/unit, punctuation, break controls), C-EMPH (emphasis runs) and C-PROBE (§3.1 probe and Static Ads T04 regressions). |
| `snapshots/`                           | Today's output for each corpus: glyph runs (`id:cluster:xAdvance:xOffset:yOffset`), line breaks, emphasis runs. Known defects are included on purpose.                                                                    |
| `oracles/instancer-reference.json.gz`  | fontTools 4.60.1 outlines at each `fvar` axis position, generated offline by `scripts/typography/fonttools-instancer-reference.py`. Its gzip and JSON hashes are pinned in `scripts/typography/oracles.mjs`.              |
| `../../vendor/unicode/17.0.0/oracles/` | `LineBreakTest.txt` (Unicode 17.0.0), gzipped, with both hashes pinned in `oracle-checksums.json`.                                                                                                                        |

## Provenance and licence

- **Corpora.** Every string in `corpora/` was written for this repository
  during M0 and is distributed under the repository's Apache-2.0 licence.
  C-MIX and C-PARA are deterministic compositions (index arithmetic, no
  randomness) of the phrase and sentence pools recorded in their own files.
  An entry taken from outside copy, such as a campaign brief or a published
  text, must name its source and licence in the entry before it is committed.
- **Snapshots.** Generated from the corpora by the harness; they are output of
  the code under test, not an independent oracle.
- **Instancer reference.** Generated with fontTools 4.60.1 (MIT) from the two
  bundled fonts, both under the SIL Open Font License 1.1. Both the gzip and
  the uncompressed JSON SHA-256 are pinned, because gzip bytes vary with the
  zlib build.
- **LineBreakTest.** Unicode License v3; source, retrieval commit and date are
  in `oracle-checksums.json`.

The metric definitions live in `src/typography/quality-metrics.ts`
(`typography-metrics@1.0.0`). The harness code is in `scripts/typography/`.

## Commands

Run these from `packages/glyphkiln-core`. All of them run offline.

```sh
npm run typography-harness:verify   # snapshots and the baseline report match the committed files
npm run typography-spike:verify     # HarfBuzz spike: deterministic results match harfbuzz-spike.json
npm run test:typography-harness     # both, plus fresh-process determinism and oracle self-tests
```

`npm test` runs all of them. The update commands are
`npm run typography-harness:update` and `npm run typography-spike`. Use them
only when a change deliberately alters the output, then review the diff.
A fix milestone, for example, updates the snapshots in the same commit as the
fix, and the reviewer can read each defect being corrected.
