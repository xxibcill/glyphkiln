# P0 baseline — design-quality benchmark

**22 October 2026. Status: P0 of the
[design-quality improvement plan](../../../docs/plans/design-quality-improvement-plan.md)
complete except the commissioned expert baselines and the first blind round,
which need the owner's budget decision.**

| File                                     | What it is                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [critique-ledger.md](critique-ledger.md) | Seven-dimension critique of all 15 Kilnform stress-test graphics at full size and at 360 px phone width, with located findings, classes, and repairs |
| [craft-review.json](craft-review.json)   | Advisory craft-heuristic results (policy `craft-review 1.2.0`) at 360 px, with a 600 px sensitivity run and the campaign format-set review           |
| [phone-width/](phone-width/)             | Deterministic 360 px box-filtered previews used for the delivered-size critique                                                                      |
| [briefs/](briefs/)                       | Twelve fixed benchmark briefs (seven Kilnform, five GD20 studies) and the [blind scoring protocol](briefs/scoring-sheet.md)                          |

Regenerate or verify from the repository root after `npm run build --workspace @glyphkiln/core`:

```sh
node Deliverables/benchmarks/p0-baseline-2026-10/run-craft-review.mjs --verify
node Deliverables/benchmarks/p0-baseline-2026-10/make-phone-previews.mjs --verify
```

Nothing here is audience, comprehension, or commercial evidence. The previews
are proportional reductions, not device captures.
