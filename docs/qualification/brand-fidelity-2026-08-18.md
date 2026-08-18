# Brand-fidelity product qualification — 2026-08-18

Status: **PASS**

This controlled qualification exercises the existing
`image-led-campaign@1.0.1` template against two realistic fictional briefs,
three visibly different immutable brand snapshots, portrait and landscape
source photography, variable multi-weight fonts, deterministic logo variants,
and all three supported campaign formats. It is internal product evidence, not
a claim of customer or market validation.

The automated and authoring gates pass. The project owner approved the complete
regenerated review board in Codex on 2026-08-18 without requesting manual pixel
repair, closing the brand-fidelity product gate.

## Briefs

### Brief 01: First Firing

**Brand:** Kilnform

Launch a sculptural ceramic table lamp with one warm, image-led direction. The
product must remain recognizable across LinkedIn landscape, Instagram square,
and Instagram portrait. Preserve Kilnform's cobalt, clay, and cream palette,
compact seal, sturdy sans typography, restrained copy, and dark editorial
treatment.

Required message hierarchy:

1. Kilnform and series label
2. `Fired into light.`
3. One concise product line
4. First Firing call to action

### Brief 02: One object, clearly held

**Brands:** Morrow Field and Northline Works

Prove that one fixed campaign composition can retain a clear product focal
point and semantic hierarchy while two brand systems remain unmistakably
different:

- Morrow Field is warm, botanical, restorative, serif-led, softly paced, and
  photographed from a portrait source.
- Northline Works is cool, technical, transit-led, geometric, direct, and
  photographed from a landscape source.

Each execution must adapt to LinkedIn landscape, Instagram square, and
Instagram portrait without changing the template, manually repairing pixels,
or hiding proof failures.

## Brand and asset matrix

| Brand           | Typeface and weights      | Source image        | Logo variants                  | Snapshot character              |
| --------------- | ------------------------- | ------------------- | ------------------------------ | ------------------------------- |
| Kilnform        | Inter 400/700/800         | 1536×1024 landscape | symbol, horizontal, monochrome | cobalt/clay, industrial warmth  |
| Morrow Field    | Fraunces 400/600/700      | 1024×1536 portrait  | symbol, horizontal, monochrome | moss/amber, botanical editorial |
| Northline Works | Space Grotesk 400/500/700 | 1536×1024 landscape | symbol, horizontal, monochrome | slate/amber, technical transit  |

Morrow Field and Northline Works use original fictional source photographs
created with the built-in OpenAI image-generation tool. Both inputs contain no
readable text, trademarks, or third-party logos. Their final prompts are stored
in [the prompt record](brand-fidelity-2026-08-18/prompts.md).

Fraunces and Space Grotesk are pinned to Google Fonts commit
`e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7`. The exact font binaries and their
SIL Open Font License 1.1 texts are retained under
`brand-fidelity-2026-08-18/assets/fonts/`. Google Fonts identifies the files in
its OFL collection and publishes the corresponding
[Fraunces](https://github.com/google/fonts/tree/e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7/ofl/fraunces)
and
[Space Grotesk](https://github.com/google/fonts/tree/e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7/ofl/spacegrotesk)
source directories.

The two new symbol, horizontal, and monochrome logo sets are project-authored
deterministic vector paths. The generated symbol PNGs are the exact admitted
logo bytes used by Core.

## Normalization and immutable inputs

Both new photographs pass the explicit `canonical-srgb-png-v1` policy before
document construction. The normalizer assumed implicit sRGB, preserved source
dimensions, stripped metadata, produced canonical RGBA PNGs, and recorded both
source and admitted hashes.

| Brand           | Source SHA-256                                                     | Admitted SHA-256                                                   |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Morrow Field    | `8475c803a2651ac635bf6872d5dc0b77f5ec66765cc77cb0214916ab4580773d` | `e3f6cb8d778011c0a2b5d788c2aa8d141655b46ccf0e4ae984ec94c8cceb0a1c` |
| Northline Works | `51a9ce1732dc938ee540b24039b4680bf078393818570106f3059982f128bbe5` | `65f8f0915764e9f83bd9486cc67fbfd09836d92450c266893637376c7ca51009` |

Kilnform retains the already-reviewed exact example admissions so this pass can
compare the established brand against the two new snapshots without altering
its source assets.

## Automated result

The generator rendered nine strict schema `1.4.0` documents through
`image-led-campaign@1.0.1`, renderer `0.4.0`, and manifest `1.2.0`. Each case
produced exact SVG and PNG bytes plus a manifest and proof evidence.

- 9/9 documents validated and rendered.
- 18/18 output artifacts were generated.
- 9/9 cases returned zero quality issues.
- 9/9 cases reported no text overflow.
- Every required text layer remained within the brand safe area.
- Every source image recorded a bounded `focal-cover-v1` crop.
- Every rendered text layer recorded composited 5×5 contrast evidence.
- The minimum sampled contrast across all cases was `5.389862542116832:1`,
  above the `4.5:1` policy floor.
- Re-running `npm run qualification:brand-fidelity:verify` reproduces the exact
  logos, normalized admissions, designs, SVGs, PNGs, manifests, evidence, and
  review board.

The machine-readable source of truth is
[qualification-index.json](brand-fidelity-2026-08-18/generated/qualification-index.json).

## Repository verification

The completed local handoff gate ran on Node `24.16.0` with npm `10.9.8`:

```text
npm run build                              PASS
npm run typecheck                          PASS
npm run lint                               PASS
npm test                                   PASS
npm run test:coverage                      PASS
npm run text-layout-data:verify            PASS
npm run fixtures:verify                    PASS
npm run schema-conformance:verify          PASS
npm run examples:verify                    PASS
npm run licenses:verify                    PASS
npm run test:package-consumer              PASS
npm run qualification:brand-fidelity:verify PASS
```

Core passed 321 tests with 84.19% statement coverage. The App passed 516
active tests with five intentional skips and 87.69% statement coverage. The
showcase passed four tests with 92.27% line coverage. The checks also verified
isolated rendering, deterministic text layout and wrapping, the standalone App,
Unicode 17 data, 16 full design fixtures, five schema-conformance vectors, all
generated examples, 31 production dependency license records, and a fresh
packed-package consumer.

The visual review identified a shared fixed-slot logo alignment defect. Template
`image-led-campaign@1.0.1` now sizes each contained logo box from the admitted
raster aspect ratio and anchors it to the safe-area column. Version `1.0.0`
retains its exact original pixels. The renderer, schema, procedural, and manifest
versions remain unchanged; current fingerprints, SVGs, PNGs, manifests,
baselines, and qualification evidence changed deliberately with the template.

## Human review checkpoint

Review
[brand-fidelity-review-board.png](brand-fidelity-2026-08-18/generated/brand-fidelity-review-board.png)
at full size and confirm all of the following:

- [x] The three brands are visibly different without relying only on copy.
- [x] The product remains clear in landscape, square, and portrait crops.
- [x] Each logo remains recognizable at campaign size.
- [x] Headline, supporting copy, and CTA hierarchy feels publishable.
- [x] No output needs Figma or other manual pixel repair.
- [x] The complete nine-output board is approved.

Reviewer: project owner, through Codex

Approval date: 2026-08-18

This record does not qualify the separate four-format, multi-slide campaign
workflow gate.

## Reproduction

```sh
npm run qualification:brand-fidelity:verify
```

The generator lives at
[`scripts/generate-brand-fidelity-qualification.mjs`](../../scripts/generate-brand-fidelity-qualification.mjs).
It uses only explicit local bytes and the public `@glyphkiln/core` API. It does
not fetch resources at render time. Reproduction uses the versioned template
contract and verifies the regenerated fingerprint, SVG, PNG, manifest, and
review-board bytes.
