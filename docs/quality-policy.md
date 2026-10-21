# Validation and quality policy

Core separates failures by when they can be known:

- schema, resource, asset/font integrity, unsupported-version, isolation, and
  output-write failures throw `GlyphkilnError` with a stable `code`;
- composition checks return `QualityIssue` records, and any error-severity issue
  blocks semantic rendering with `QUALITY_VALIDATION_FAILED` or Scene rendering
  with `SCENE_QUALITY_VALIDATION_FAILED`;
- warning-severity issues remain in the successful result and manifest;
- `verifyRenderReproduction` returns issue records for semantic document,
  byte-size, and output-hash mismatches; `verifySceneReproduction` checks the
  stricter Scene manifest, identity, resource, accessibility, format,
  fingerprint, method, and byte contracts. Both let callers report all detected
  reproduction differences at once.

This is intentional API policy, not an accidental mix of exceptions and issues.
Failures that make safe interpretation impossible stop immediately. Checks that
can be evaluated together—required/supported layers, brand preferences, solid
or composited-raster contrast, safe areas, quiet-region alignment, text fit,
and glyph coverage—are
aggregated. Known unsupported text layout is checked from pinned Unicode 17.0.0
tables before asset and font resolution. Hidden fields appear in inspection but
do not become render-blocking quality issues. Render failures retain at most 128
visible text-layout issues and expose `details.textLayout.totalDiagnostics`,
`retainedDiagnostics`, and `truncated` so the bounded error remains explicit.

Stable quality codes currently include `REQUIRED_LAYER_MISSING`,
`UNSUPPORTED_VISIBLE_LAYER`, `DUPLICATE_VISIBLE_LAYER`,
`CONFLICTING_VISIBLE_LAYERS`, `ASSET_FIT_REQUIRED`, `PROHIBITED_COLOR`,
`PROHIBITED_STYLE`,
`NON_PREFERRED_PROCEDURAL_STYLE`, `LOW_TEXT_CONTRAST`, `TEXT_OVERFLOW`,
`LINGUISTIC_WORD_BROKEN`, `ORPHAN_LINE`, `MISSING_GLYPH`,
`QUIET_REGION_MISALIGNED`, `BIDI_CONTROL_UNSUPPORTED`,
`BIDI_LAYOUT_UNSUPPORTED`, `VERTICAL_LAYOUT_UNSUPPORTED`, and reproduction
mismatch codes. The three text-layout codes carry a document-rooted field path,
numeric code-point evidence, scalar indexes, and an independent diagnostic
policy version. Tests exercise every policy family; new codes require a
regression test and documentation update.

`LINGUISTIC_WORD_BROKEN` is an error: it means a segmented word remained wider
than its box at minimum size and required an internal grapheme break. It blocks
output. `ORPHAN_LINE` is a warning for a single-word final line or a final line
under 45% of the preceding line width. Both include measured widths and the
versioned segmentation/line-breaking policy. See
[Typography wrapping](typography-wrapping.md).

Scene rendering also reports `SCENE_TEXT_OCCLUDED` when a later-painted, fully
opaque rectangular element covers fitted text. The warning identifies the text
and covering element IDs and gives the covered area in canvas square units.
PNG alpha is checked in the visible crop, so transparent source pixels do not
count. JPEG images and solid square-corner rectangles are opaque; partially
transparent paint is not reported as fully opaque. Authors can pass
`intentionalTextOverlayIds` to `renderScene` for deliberate overlays. The check
uses axis-aligned elements without group clips; rotated or clipped elements
require visual review.

`image-led-campaign@1.0.x` uses
`composited-srgb-grid-5x5-v1`: 25 ordered samples from each text bound map
through the focal crop, source alpha, and selected treatment. A worst sample
below 4.5 emits `LOW_TEXT_CONTRAST`. Successful renders return the bounded
sample evidence with crop and text bounds so the App can draw proof overlays.

## Advisory craft review

Correctness checks cannot say whether a graphic is well designed: a layout can
pass every check above and still read as a template. `reviewGraphicCraft`
(root entry) and `reviewSceneCraft` (`@glyphkiln/core/scene`) add a separate,
**advisory** review of visual craft risks under policy
`CRAFT_REVIEW_POLICY_VERSION` `1.0.0`.

The review is kept apart from correctness on purpose:

- findings are `CraftFinding` records with `severity: "advisory"`, not
  `QualityIssue` records;
- they never block rendering and are never written to render manifests,
  fingerprints, or evidence;
- the review renders the same scene and PNG pixels through the same checks as
  `renderGraphic` / `renderScene` (blocking quality errors still throw), but it
  produces no output files, so existing output bytes are unchanged;
- results are deterministic for identical input, resources, and thresholds.

| Code                           | What it measures                                                                                                                                                                                                                                                 | Default starting threshold                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `CRAFT_TEXT_SMALL_AT_DELIVERY` | Rendered x-height of each text element, in display pixels, when the whole canvas is shown at `displayWidth` (the exact face's x-height ratio is used)                                                                                                            | `displayWidth` 360, `minimumXHeight` 5.5                                                                          |
| `CRAFT_WEAK_SCALE_CONTRAST`    | Largest text size divided by the next largest; lists every competitor within the ratio                                                                                                                                                                           | `minimumDominanceRatio` 1.5                                                                                       |
| `CRAFT_DEAD_SPACE`             | `scope: "container"`: share of a filled rectangle (4–90% of the canvas) still showing its bare fill in the rendered pixels, plus its longest empty row/column band. `scope: "canvas"`: longest canvas band whose rows or columns are almost uncovered by content | `containerEmptyFraction` 0.75 with `containerEmptyBand` 0.4; `canvasEmptyBand` 0.33 with `emptyLineCoverage` 0.05 |
| `CRAFT_ACCENT_OVERUSE`         | Share of non-photographic pixels in an accent color, and the number of distinct accent uses (repeated same-size marks count once)                                                                                                                                | `accentAreaFraction` 0.08, `accentUsageCount` 5                                                                   |

Design documents budget the brand snapshot accent by default; scenes budget
only the `accentColors` the caller declares. Procedural background texture is
excluded from content analysis. Full-canvas rectangles count as ground, while
full-bleed photographs count as content. Text bounds come from glyph
outlines; path bounds are conservative control-point hulls; rotated groups use
axis-aligned bounds.

These thresholds are documented starting values, not proven optima or a
beauty score. A finding is a prompt for review: an intentional quiet field, a
deliberate pair of equal-weight elements, or an accent applied consistently to
one role may be correct. Record the judgment rather than silencing the
heuristic. Delivery width matters: review landscape graphics at the width
where they will actually be seen, and pass `thresholds.displayWidth`
accordingly.
