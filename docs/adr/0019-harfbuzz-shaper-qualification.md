# ADR 0019: Qualify HarfBuzz behind the Shaper interface

Status: accepted

Proposed 4 November 2026 at the end of typography milestone M0 and **accepted by
the owner on 4 November 2026**, including plan question Q2 (the runtime size)
([plan](../plans/typography-engine-plan.md) §4, §5 M0 item 6). The owner accepts
or rejects it. Nothing in this ADR changes pixels; it decides which shaper new
typography policies use from M1.

## Context

Every glyph Core sets now goes through one internal `Shaper` interface
(`packages/glyphkiln-core/src/fonts/shaper.ts`) and one layout path,
`layoutText` (`src/typography/layout-text.ts`). The only implementation in the
render path is `fontkit@2.0.4`. It reproduces the pre-M0 output byte for byte.

fontkit 2.0.4 has had no release since August 2024. It has no Thai shaper, and
it chooses one script per string (plan §3.1). The plan recommends qualifying
**harfbuzzjs** (MIT, wasm) behind the interface and deciding here, with
evidence, whether new policies should use it.

M0 built that evidence offline:

- a `Shaper` on harfbuzzjs `1.6.4`, which embeds HarfBuzz `15.0.0`
  (`scripts/typography/oracles.mjs`; development only);
- the C-LAT, C-TH and C-MIX corpora (314 lines) and the §3.1 probes;
- a fontTools `4.60.1` instancer reference, generated offline and committed with
  its hash pinned (`tests/typography/oracles/instancer-reference.json.gz`);
- `scripts/typography-harfbuzz-spike.mjs`, which writes
  [`harfbuzz-spike.json`](../research/typography-m0-baseline/harfbuzz-spike.json).
  `npm test` re-checks its deterministic part.

Fonts used: Inter Variable (`opsz`, `wght`), the only bundled face, and Noto
Sans Thai (`wght`, `wdth`) from the Thai Scene fixture. The twelve approved
families are not bundled yet (B2), so they are not measured.

## Evidence

### Glyph-ID agreement with fontkit (whole line, default features)

| Corpus | Lines | Same glyph IDs | Same positions (±1 unit) where IDs match |
| ------ | ----: | -------------: | ---------------------------------------: |
| C-LAT  |    58 |    57 (98.3 %) |                                       56 |
| C-TH   |    56 |    52 (92.9 %) |                                       52 |
| C-MIX  |   200 |    200 (100 %) |                                      200 |

Every difference was inspected:

- **C-LAT, 1 line** (`5°C – 25°C`). HarfBuzz applies Inter's contextual
  `endash.case` between figures. fontkit does not.
- **C-LAT, 1 position** (`0123456789`). fontkit applies a −29-unit pair
  adjustment to `seven` before `eight`, and HarfBuzz does not. M0 did not work
  out which one is correct. M2's differential tests must settle it.
- **C-TH, 4 lines** (`น้ำ ก่ำ…`, `ปู่ ป้า ฝั่ง ฟ้า`, `ญี่ปุ่น…`,
  `แม่น้ำเจ้าพระยา`). HarfBuzz's Thai shaper decomposes sara am and moves the
  nikhahit before the tone mark (`uni0E4D uni0E49.small uni0E32`). It also
  picks `uni0E48.narrow` over a below vowel. fontkit decomposes sara am but
  does not reorder it, so its tone mark keeps the default form. These are
  fontkit defects that HarfBuzz fixes.

### The known defects (plan §3.1)

- **One script per line.** HarfBuzz reproduces this defect when given the whole
  line (`guessSegmentProperties` also takes the first strong script). Both
  shapers fix it when each script run is shaped with its own script tag, using
  the Unicode 17 `Scripts.txt` itemizer. Itemizing changes 32 of the 200 C-MIX
  lines in both shapers, and the itemized output is identical between the two
  shapers on all 200 lines. For `AI ที่ป้ญู`, both then choose
  `uni0E48.small uni0E49.narrow uni0E0D.less`. **The fix is M1b's itemizer, not
  the shaper.**
- **Tracking after every glyph, NBSP breaks, BudouX boundaries inside
  syllables, Thai line edges.** These are engine defects, in tracking placement,
  whitespace handling and segmentation. No shaper changes them. The M0 baseline
  measures them: 246 of 246 C-TH marks move under tracking, and see the
  [baseline report](../research/typography-m0-baseline/README.md).
- **Thai shaping beyond §3.1.** Only HarfBuzz reorders sara am (see above).

### Variable instancing (offline instancer reference, T03)

Both shapers were compared with fontTools 4.60.1 at every `fvar` axis's min,
default, max and the midpoints between them:

| Font           | Shaper   | Worst delta, 1/1000 em | Where                            |
| -------------- | -------- | ---------------------: | -------------------------------- |
| Inter          | HarfBuzz |                  0.005 | `wght` 650                       |
| Inter          | fontkit  |                  0.245 | `opsz` 23, `wght` 250/650/900    |
| Noto Sans Thai | HarfBuzz |                      0 | all positions                    |
| Noto Sans Thai | fontkit  |                  0.500 | `wght` 250 and 650, `wdth` 81.25 |

HarfBuzz reproduces the reference. fontkit rounds instanced points to whole
font units, so away from the default instance it can be up to 0.5 unit off.
That is 0.244/1000 em in Inter (2048 units per em) and 0.5/1000 em in Noto
Sans Thai (1000 units per em), which is the T03 tolerance limit itself. It
happens at the midpoints of every axis and at Inter `wght` 900. The default
instance and the other axis extremes match exactly, which is why fontkit looks
correct for `wght` 400 today.

### Outlines and byte identity

Path geometry from the two shapers is identical at default instances once
HarfBuzz's explicit closing `lineTo` is dropped: Inter 400 is 136 of 136
glyphs, and Noto Sans Thai 400 is 132 of 132. The raw command lists differ,
and at Inter 700 only 1 of 136 glyphs matches because of fontkit's rounding.
**Switching the outline source would change SVG bytes**, so it must be a
renderer identity change under a new policy, never under an existing one.

### Determinism

HarfBuzz shaping and outlines for all 314 corpus lines were byte-identical in
two fresh processes (digest
`4eda4aa2ea56ec98bb3eaf634e1ae828180c788551c043063e9e5af496ae442d`). The digest
is the same on Node 22.23.4 and Node 24.22.1, both on Linux x64. The fontkit
harness output was also identical across fresh processes and both Node
versions (`3727cdac…`).

On 4 November 2026 the owner's Mac reproduced both digests in fresh processes:
macOS 26.6.2 on Apple Silicon (arm64), Node 24.16.0, npm 10.9.8, from a clean
`npm ci`. `typography-harfbuzz-spike.mjs --verify` matched the committed
deterministic report (`4eda4aa2…`), and the harness determinism test matched
its pinned digest (`3727cdac…`). HarfBuzz output is therefore byte-identical
across Linux x64 and macOS arm64. The full repository gate also passed there,
including all 607 Core tests without raised timeouts.

### Cost

From the committed run, on a shared 4-vCPU container: medians of 5 fresh
processes (cold) and of 5 warm rounds. Absolute numbers varied by about 1.5×
between runs; the ratios were stable.

| Measure                                                     | fontkit 2.0.4 | harfbuzzjs 1.6.4 |
| ----------------------------------------------------------- | ------------: | ---------------: |
| Cold: module load                                           |        114 ms |            50 ms |
| Cold: module + parse Inter + first shaped and outlined line |        238 ms |            70 ms |
| Warm shaping, per corpus line                               |        261 µs |            64 µs |
| Warm outlines, per corpus line                              |          7 µs |            96 µs |

HarfBuzz shapes about 3–4× faster. Its outlines are about 13× slower because
`glyphToJson` serializes through wasm on every call, while fontkit caches glyph
paths. A per-face outline cache removes most of that cost.

### Interface coverage of the `HB_TINY` build

harfbuzzjs 1.6.4 provides everything the `Shaper` interface needs:

- shaping with script, language, direction, features and cluster level;
- outlines (`glyphToJson`);
- `fvar` axes and instancing;
- glyph names;
- colour-layer detection;
- ascent and descent, plus x-height and cap height through
  `getMetricPositionWithFallback`;
- feature tags and cmap lookup.

The only metric gap is that HarfBuzz lists the `locl` feature tag, which
fontkit omits. The shipped wasm (`harfbuzz.wasm`, SHA-256
`6eeed8e1bc9ad7773038e48ff8f9e07e0ad228572c594b45e5357e9c2f7a0b2e`) is
444 KB, and the JS wrapper is 85 KB. The 1.3 MB package size includes an
unused `harfbuzz-subset.wasm`.

## Decision (accepted 4 November 2026)

1. **Adopt harfbuzzjs as the shaper and outline source for new typography
   policies, starting in M1.** Build M1b (script runs, cluster tracking) and
   M1a (all axes, optical size) directly on it. M2 then shrinks to keeping
   fontkit for legacy policies. The shaper identity
   (`harfbuzzjs@1.6.4/harfbuzz@15.0.0` plus the wasm SHA-256) goes into the
   typography policy and the manifest.
2. **Keep fontkit 2.0.4 for every existing policy and template version**, byte
   for byte. `FontRegistry` chooses the shaper per policy. No existing render
   changes.
3. **Conditions before the first HarfBuzz policy ships:**
   - ~~fresh-process byte equality on macOS~~ — met on 4 November 2026 (see
     Determinism); Linux on Node 22 and 24 was already shown;
   - ~~a per-face outline cache, so warm outline cost is at most 2× fontkit's~~
     — met in M1 (see below);
   - ~~a cold first-shaped-line budget of ≤ 100 ms and warm shaping no slower
     than fontkit, on CI~~ — met in M1, checked by `npm test`;
   - ~~the open `seven`→`eight` kerning difference explained~~ — explained in
     M1: a fontkit defect;
   - ~~the owner's answer to plan question Q2~~ — the owner accepted about
     530 KB of runtime wasm and JS on 4 November 2026.

## Pre-ship conditions met (typography M1, 4 November 2026)

M1 (branch `claude/typography-m1`) ships the first HarfBuzz policies. The
remaining conditions:

- **Outline cache.** `src/fonts/harfbuzz.ts` caches each glyph's outline per
  face instance. `scripts/test-typography-budgets.mjs` runs in `npm test`.
  One run on the 4-vCPU container measured warm outlines at 2.4 µs per
  corpus line, against fontkit's 3.6, which is under the 2× budget.
- **Cold and warm budgets.** The same script measures a fresh process from
  importing Core's HarfBuzz module (with the wasm hash check) to the first
  shaped and outlined Inter line: 48 ms, against fontkit's 224. Warm shaping
  was 51 µs per line, against fontkit's 177. The script takes medians and
  measures once more before it fails.
- **`seven`→`eight`.** Inter's `GPOS` has a `kern` feature under `latn` with
  lookups `[2, 3, 1]` and one under `DFLT` with `[2, 3, 1, 2, 3, 1]`, in which
  every lookup appears twice. Digits alone have no strong script, so fontkit
  shapes them under `DFLT` and applies the pair lookup twice (−58 units).
  HarfBuzz applies each lookup once, as the OpenType processing model requires
  (−29), under `DFLT` and `latn` alike, and fontkit gives −29 under `latn`.
  HarfBuzz is correct. `tests/typography-m1.test.ts` pins both values.

harfbuzzjs is now a runtime dependency of `@glyphkiln/core`. It is loaded
lazily, so legacy renders never load it. See [Typography M1](../typography-m1.md).

## Consequences

- harfbuzzjs becomes a runtime dependency of `@glyphkiln/core` when the first
  HarfBuzz policy lands. Until then it stays a devDependency used only by the
  M0 oracles.
- Thai shaping gains sara am reordering and contextual mark forms. Variable
  instances match fontTools. Script itemization fixes mixed lines with either
  shaper.
- Two shapers live side by side for as long as legacy versions are supported.
  The differential corpus and the spike verification stay in `npm test` to
  keep both honest.
- New baselines are needed for every template version that opts in.

## Alternatives considered

- **Stay on fontkit and add itemization only.** That fixes the one-script
  defect, but not Thai reordering or instancing precision, and keeps Core on
  an unmaintained shaper.
- **rustybuzz through a custom wasm build.** There is no maintained JS
  package, so we would own a build pipeline.
- **Writing a shaper.** Rejected in the plan (§4).
