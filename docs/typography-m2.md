# Typography M2: closing out the HarfBuzz shaper switch

Milestone M2 of the [typography engine plan](plans/typography-engine-plan.md)
(§5). [ADR 0019](adr/0019-harfbuzz-shaper-qualification.md) chose HarfBuzz
early, so [M1](typography-m1.md) was built on it directly. As the plan
foresaw, M2 shrank to legacy retention: fontkit 2.0.4 stays on every legacy
policy, byte for byte, and M2 makes each exit-gate item a permanent check.

M2 changes no pixels, schema, manifest or policy versions. Every legacy and
M1 baseline, example and fixture is byte-identical.

## Exit gate

| Gate item                                                       | Check                                                                                                                                                      | Status                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Glyph IDs match fontkit wherever fontkit was correct            | `tests/typography-m2-differential.test.ts` against the [allowlist](../packages/glyphkiln-core/tests/typography/differential/allowlist.json), in `npm test` | Met                                                              |
| The known fontkit defects are fixed                             | Same file, "the known fontkit defects are fixed on M1 and kept on legacy"                                                                                  | Met                                                              |
| Bytes identical across Linux and macOS, Node 22 and 24          | `npm run typography-m1-digest` (also in `npm test`), plus the M1 visual baselines                                                                          | Linux 22 and 24 met; **macOS + Node 22 pending the owner's run** |
| Cold start and per-render cost within the ADR's budgets         | `scripts/test-typography-budgets.mjs`, in `npm test`                                                                                                       | Met                                                              |
| The policy and manifests record the shaper; legacy records none | `tests/typography-m2-identity.test.ts`; both visual suites now pin each committed manifest exactly                                                         | Met                                                              |

## Differential corpus

C-LAT (58 lines), C-TH (56) and C-MIX (200) are set through both production
paths at 1 px per font unit:

- **legacy**: `FontRegistry.setLines`, fontkit 2.0.4, one call per line;
- **M1**: the typesetter from `createTypesetter`, which is HarfBuzz per script
  run. Optical size stays at the axis default, because legacy has none.

Glyph IDs and positions (±0.5 font unit) must match. 250 of the 314 lines are
identical. The other 64 are each listed in the allowlist with a kind, and the
test proves each kind mechanically. A new, changed or vanished difference
fails.

| Kind                  | Lines                                            | Why M1 differs                                                                                                                                                                                                                                                                                                                            | Proof in the test                                                                                                                        |
| --------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `script-itemization`  | C-MIX: 32 glyph-ID lines, 26 position-only lines | The §3.1 one-script-per-line defect. On a Latin-first line, legacy shapes the Thai under `latn`, which loses the contextual tone-mark forms (`.small`, `.narrow`, `uni0E0D.less`) and Thai pair kerning (ใ+ช −12, เ+ศ −10 units). On a Thai-first line, the Latin is shaped under `thai`, which loses Latin kerning (r+e −20 in "Store"). | fontkit itself, given M1's `script-runs@1.0.0` runs, reproduces the M1 line exactly. The fix is the itemizer, not the shaper (ADR 0019). |
| `thai-mark-shaping`   | C-TH: 4                                          | fontkit has no Thai shaper. HarfBuzz decomposes sara am and moves the nikhahit before the tone mark, which then takes its `.small` form (`น้ำ` → `uni0E4D uni0E49.small uni0E32`). Over a tall consonant with a below vowel between (`ปู่`, `ปุ่`), it keeps the tone mark's `.narrow` form.                                              | Thai-only line; same characters and non-mark glyphs in the same order; only Thai marks differ.                                           |
| `inter-endash-case`   | C-LAT: 1 (`5°C – 25°C`)                          | Inter's own `calt` rule raises the dash between figures or capitals. fontkit applies it to `5–2` but drops it when the context spans a space (`5 – 2`).                                                                                                                                                                                   | Only `endash`→`endash.case` differs; HarfBuzz with `calt` off gives the legacy glyph; `5–2`, `5 – 2` and `a – a` probes.                 |
| `dflt-duplicate-kern` | C-LAT: 1 (`0123456789`)                          | Inter's `DFLT` kern feature lists every lookup twice. Figures alone resolve to `DFLT`, so fontkit kerns 7→8 twice (−58). HarfBuzz applies each lookup once (−29).                                                                                                                                                                         | Same glyphs; only seven→eight differs, by +29; fontkit under `latn` reproduces M1.                                                       |

In every kind, fontkit is the incorrect one. No line shows M1 departing from
correct fontkit output.

## Known fontkit defects

Each is asserted on both production paths: fixed on M1, still present on
legacy, where it is kept for byte identity.

- **§3.1 one script per line.** `AI ที่ป้ญู` gets `uni0E48.small`,
  `uni0E49.narrow` and `uni0E0D.less` on M1 only. The Thai-only control line
  is identical on both paths.
- **§3.1 tracking after every glyph.** At 0.05 em tracking on C-TH, legacy
  moves all 263 zero-advance mark glyphs off their bases. M0's metric counts
  246 marks by its own definition. On all 53 lines with a mark, legacy also
  measures width as untracked + (glyphs − 1) × tracking. M1 moves no mark and
  adds gaps only between character units.
- **ADR 0019 sara am and tone-mark forms**, **`seven`→`eight`** and **instanced
  outlines.** Against the fontTools 4.60.1 reference, fontkit is off by more
  than 0.2/1000 em on Inter, and HarfBuzz by at most 0.01.

The other §3.1 defects are not shaper defects, and M1 does not claim them: NBSP
breaks, BudouX boundaries inside syllables, and Thai line edges. They belong
to M3.

## Cross-platform and Node bytes

`npm run typography-m1-digest` builds Core and runs
`packages/glyphkiln-core/scripts/typography-m1-digest.mjs`. The script computes
one digest of M1 shaping and outlines in two fresh processes, through the
runtime HarfBuzz shaper with its wasm hash check. It covers glyph IDs,
positions and raw outlines at 1 px per unit; SVG path data at 48 px with
automatic optical size; C-TH at 0.05 em tracking; and C-MIX on an Inter +
Noto Sans Thai stack. It fails unless both processes match the pinned digest.

| Platform    | Node    | Digest                                                             | M1 visual baselines (27) |
| ----------- | ------- | ------------------------------------------------------------------ | ------------------------ |
| Linux x64   | 22.23.4 | `8aef70cfe3a1d671c04a6dd5854b8ba1adff471c687641407d446dc298e72007` | byte-identical           |
| Linux x64   | 24.22.1 | `8aef70cfe3a1d671c04a6dd5854b8ba1adff471c687641407d446dc298e72007` | byte-identical           |
| macOS arm64 | 24.16.0 | not run with this script; the baselines matched in M1              | byte-identical (M1)      |
| macOS arm64 | 22      | **pending the owner's run**                                        | **pending**              |

To close the last row, run these on the Mac with Node 22 from a clean checkout of this
branch. The first prints the digest and fails unless it matches the pinned one.
The second re-checks the 27 M1 baselines.

```bash
npm ci && npm run typography-m1-digest
```

```bash
cd packages/glyphkiln-core && npx vitest run tests/visual-m1.test.ts
```

## Budgets

`scripts/test-typography-budgets.mjs` checks all three of the ADR's limits:

- the cold first shaped and outlined line takes at most 100 ms in a fresh
  process, counting Core's HarfBuzz module, the wasm hash check and parsing
  Inter;
- warm shaping per corpus line is no slower than fontkit;
- warm outlines per corpus line, with the per-face cache, cost at most 2×
  fontkit's.

It takes medians and allows one re-measurement. The ADR sets no separate
per-render budget, so M2 adds none.

Numbers from five runs on the shared 4-vCPU container (5 November 2026), some
of them while another test suite was running:

| Measure                    | HarfBuzz (M1) | fontkit 2.0.4 | Budget       |
| -------------------------- | ------------: | ------------: | ------------ |
| Cold first line, ms        |     30.1–52.2 |   124.3–288.1 | ≤ 100        |
| Warm shaping, µs per line  |     32.4–61.2 |   100.3–185.8 | ≤ fontkit    |
| Warm outlines, µs per line |       1.2–2.3 |       1.8–3.2 | ≤ 2× fontkit |
