---
"@glyphkiln/core": minor
---

Add an advisory craft review, policy `craft-review 1.1.0`. `reviewGraphicCraft` (root entry) and `reviewSceneCraft` (`@glyphkiln/core/scene`) report delivered-size legibility, scale contrast, container and canvas dead space, accent overuse, and brand-mark visibility (measured against the same canvas rendered without the mark) as `advisory` findings with measured details. The review uses the same scene, checks, and rasterization as rendering but writes no outputs; it never blocks rendering and does not enter manifests, fingerprints, or evidence. Existing output bytes are unchanged.
