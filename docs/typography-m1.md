# Typography M1: font model, script runs and cluster tracking

Milestone M1 of the [typography engine plan](plans/typography-engine-plan.md)
(§5). It builds on [ADR 0019](adr/0019-harfbuzz-shaper-qualification.md): new
typography policies shape and outline with HarfBuzz, and every existing policy
stays on fontkit 2.0.4, byte for byte.

## Who gets it

M1 is opt-in by exact version. Owner question Q1 is answered **provisionally**
with the plan's recommendation: the correctness fixes ship behind new template
versions, not a renderer-wide correction.

| Input                                                                  | Typography                  | Renderer | Manifest                         |
| ---------------------------------------------------------------------- | --------------------------- | -------- | -------------------------------- |
| `quote-card@1.4.0`, `statistic-card@1.4.0`, `image-led-campaign@1.3.0` | M1 (HarfBuzz)               | `0.6.0`  | `1.3.0`                          |
| SceneDocument `1.1.0`                                                  | M1 (HarfBuzz)               | `0.6.0`  | Scene manifest `1.1.0`           |
| Every other template version, any DesignDocument schema, Scene `1.0.0` | Legacy (fontkit, unchanged) | `0.5.0`  | `1.2.0` / Scene manifest `1.0.0` |

The three new versions keep the exact geometry of `quote-card@1.3.0`,
`statistic-card@1.3.0` and `image-led-campaign@1.2.0`. They need
DesignDocument `1.8.0`. Legacy renders keep recording renderer `0.5.0` and
manifest `1.2.0`, so their SVG, PNG, manifest and fingerprint bytes stay
exact. `fixtures:verify`, `examples:verify`, the Scene fixtures, schema
conformance and the legacy visual baselines are unchanged.

### Advisory for older versions

Older template versions keep two known defects, because changing them would
change approved pixels:

- **Tracking with Thai.** Letter spacing is added after every glyph, so with
  nonzero tracking Thai tone marks and vowels move off their consonants, and
  Thai lines measure too wide. B2's `size-setting@1.0.0` applies tracking at
  most sizes, so `quote-card@1.3.0`, `statistic-card@1.3.0` and
  `image-led-campaign@1.2.0` show this with Thai copy. Use the `1.4.0` /
  `1.3.0` versions for Thai text with tracking.
- **Latin-first mixed lines.** A line that starts with Latin is shaped as one
  Latin run, so Thai contextual mark forms are not chosen (for example
  `AI ที่ป้ญู`). Use an M1 version for mixed Thai–Latin copy.

## Shaper

- `harfbuzzjs@1.6.4/harfbuzz@15.0.0`. The wasm SHA-256
  `6eeed8e1bc9ad7773038e48ff8f9e07e0ad228572c594b45e5357e9c2f7a0b2e` is checked
  before the module loads. A mismatch fails with `SHAPER_INTEGRITY_MISMATCH`.
- harfbuzzjs is a runtime dependency, loaded lazily and only by M1 inputs.
  `renderGraphic`, `renderScene` and `reviewGraphicCraft` load it themselves.
  Synchronous inspection of an M1 input needs `await loadTypographyEngine()`
  first; otherwise it fails with `TYPOGRAPHY_ENGINE_NOT_LOADED`.
- Outlines come from the same HarfBuzz font instance that shaped the glyph.
  They are cached per face instance. The explicit closing `lineTo` HarfBuzz
  emits before each `Z` is dropped, which leaves the geometry unchanged.

### ADR 0019 pre-ship conditions

| Condition                                      | Evidence                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Per-face outline cache, warm cost ≤ 2× fontkit | `scripts/test-typography-budgets.mjs` in `npm test`; one run measured 2.4 µs per corpus line, against fontkit's 3.6 |
| Cold first shaped line ≤ 100 ms                | Same script, fresh processes; one run measured 48 ms                                                                |
| Warm shaping no slower than fontkit            | Same script; one run measured 51 µs per line, against fontkit's 177                                                 |
| `seven`→`eight` kerning difference explained   | See below; regression test in `tests/typography-m1.test.ts`                                                         |

**`seven`→`eight`.** Inter's `GPOS` has two `kern` features. The `latn` one
lists lookups `[2, 3, 1]`; the `DFLT` one lists `[2, 3, 1, 2, 3, 1]`, with
each lookup twice. A run of digits alone has no strong script, so fontkit uses
`DFLT` and applies the 7→8 pair adjustment twice (−58 units). HarfBuzz applies
each lookup once per stage, as the OpenType processing model specifies
(−29). fontkit also gives −29 once the script is `latn`. HarfBuzz is correct;
the fontkit value is a fontkit defect, kept only on legacy policies.

## Policies

All of them are recorded under `typographyPolicy.m1` in manifest `1.3.0` and
Scene manifest `1.1.0`, and in the fingerprint's renderer configuration.

| Policy                    | Rule                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-runs@1.0.0`       | Itemize with the Unicode 17.0.0 Script property (generated from the vendored, hash-checked `Scripts.txt`). Common and Inherited attach to the preceding run, else to the following one. Each run is shaped alone with its ISO 15924 script.                                                                                                                   |
| `cluster-tracking@1.0.0`  | Tracking falls between typographic character units, never after the last one. A unit is a grapheme cluster (grapheme-splitter 1.0.4), except that sara am splits: its nikhahit stays with the consonant and the gap falls before sara aa. With nonzero tracking, `liga`, `clig` and `dlig` are off unless the layer asks for them.                            |
| `font-variation@1.0.0`    | Start at the axis defaults; `wght` from the weight; then the named instance; then explicit axes; then optical size. Out-of-range values are clamped and reported (`FONT_AXIS_OUT_OF_RANGE`, error). An axis the face lacks is reported and ignored (`FONT_AXIS_UNAVAILABLE`, warning). An unknown named instance is an error (`FONT_NAMED_INSTANCE_UNKNOWN`). |
| `optical-size-auto@1.0.0` | `opsz = 0.75 × s`, where `s` is the set size in px scaled to the 1080 px short-side reference, rounded to 0.01 and clamped to the axis. An explicit `opsz` wins, and `opticalSizing: "none"` keeps the axis default. **Owner question Q6, provisional.**                                                                                                      |
| `script-matching@1.0.0`   | `scale: "auto"` makes the Latin x-height equal the Thai body height, measured on the ink of `x` and `น` on the instances actually set, as a factor on the non-primary face rounded to 0.001. `baselineShift: "auto"` is 0, because Thai and Latin share the alphabetic baseline.                                                                              |

Under `optical-size-auto@1.0.0`, Inter (`opsz` 14–32) reaches its display cut
(32) at 42.67 px on a 1080 px canvas. Source Serif 4 (`opsz` 8–60) reaches 60
at 80 px.

**Not yet re-derived.** B2's `size-setting@1.0.0` tracking curve was tuned
before automatic optical size, so it may partly correct the same spacing twice
(plan §8). The M1 versions keep `size-setting@1.0.0`, and `size-setting@2.0.0`
is left for later.

## Font model fields

DesignDocument `1.8.0` text layers, brand typography roles (`display`, `body`,
`label`) and Scene `1.1.0` text `font` objects accept:

| Field           | Type                                                                                 | Notes                                            |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `axes`          | `{ [tag]: number }`, at most 8; `wght wdth opsz slnt ital` or a custom uppercase tag | Checked against the face's `fvar` at render time |
| `namedInstance` | string                                                                               | An `fvar` instance name, for example `SemiBold`  |
| `opticalSizing` | `"auto"` (default) or `"none"`                                                       |                                                  |
| `opsz`          | number                                                                               | Explicit optical size; wins over `auto`          |

Roles and Scene text also accept:

| Field         | Type                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------- |
| `fallback`    | 1–3 `{ family, scale?, baselineShift? }`, tried in order after the primary family           |
| `scriptFaces` | `{ latn?, thai? }`, the same face shape, tried before the stack for clusters of that script |

`scale` is 0.5–2 or `"auto"` (default 1). `baselineShift` is −0.5 to 0.5 em
or `"auto"` (default 0). Faces are chosen per grapheme cluster, as in CSS
Fonts §5.3. The script face for the cluster's script comes first, then the
primary family, then the fallbacks. The first face that covers the whole
cluster wins, so a cluster is never split across faces. `MISSING_GLYPH` is
reported only when no face covers a cluster, and it lists the stack tried in
`details.stackTried`. Every face a stack names must be declared, at the
element's weight and style.

In the M1 template versions, layer font-model fields override the role's. The
template still chooses the family as before: the layer, then the template's
own default, then the role's family, then `headlineFamily`. The role's
fallback stack and script faces apply. Versions without the `fontModel`
capability reject the layer fields with `TEMPLATE_FEATURE_UNSUPPORTED`.
Scene `1.0.0` rejects the new `font` fields with
`SCENE_FIELD_REQUIRES_VERSION`.

## Provenance (font identity v2)

Manifest `1.3.0` replaces `fonts` with one entry per face actually drawn:
family, weight, style, SHA-256, `coordinates`, `namedInstance`, `role`
(`primary`, `fallback`, `script:latn`, `script:thai`), `scale`,
`baselineShift` and the `scripts` it set. `textStacks` lists, per text
element, the stack it tried and the faces it used. Scene manifest `1.1.0`
keeps `fonts`, extended to every declared face the stacks name, and adds
`typographyPolicy`, `fontFaces` and `textStacks`. The fingerprint includes
the v2 face identities (DesignDocument) or the stack faces (Scene), renderer
`0.6.0` and the M1 policy object.

## Tests and evidence

- `tests/typography-m1.test.ts` covers:
  - T01: C-MIX against an independent `hb-shape` oracle;
  - T03: every axis of every bundled variable file and Inter against a
    fontTools 4.60.1 reference, plus named instances and range errors;
  - T04: the opsz mapping table;
  - T05: the stack, cluster integrity and missing clusters;
  - T06: all six pairings within ±3 %, and exact explicit scale and shift;
  - T08: C-TH at −0.02, 0.05 and 0.1 em, the sara am split and ligatures;
  - the `seven`→`eight` regression.
- `tests/typography-m1-render.test.ts` covers the template and Scene contracts
  and T27: manifest identity, stacks, reproduction, and that legacy keeps its
  identity.
- `tests/visual-m1.test.ts` holds the exact baselines: every family at three
  sizes, brief A and the Kilnform quote for each pairing (no findings), and
  the three new template versions. The
  [review sheet](research/typography-m1-baselines/README.md) shows them with
  360 px previews. **They are awaiting the owner's review.**
- [Before/after metrics](research/typography-m1-metrics/README.md).
