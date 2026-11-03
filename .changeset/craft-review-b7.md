---
"@glyphkiln/core": minor
---

Advisory craft review policy `craft-review 1.2.0` adds two checks. `CRAFT_PRODUCT_COLOR_DIMMED` compares each photograph's rendered pixels with its source asset at the same mapped positions and flags dominant colors whose OKLab chroma or lightness drops beyond documented starting thresholds (for example a global dark scrim over the product). `CRAFT_FORMATS_NOT_RECOMPOSED` comes from the new `reviewFormatSet` (root and `@glyphkiln/core/scene` entries), which compares the normalized text, image, and mark layouts of one design's format reviews and flags pairs that are one composition resized. Reviews now also report `metrics.images` and `metrics.layout`. Results of the five earlier checks are unchanged; the review still writes no outputs, never blocks rendering, and does not change output bytes, manifests, or fingerprints.
