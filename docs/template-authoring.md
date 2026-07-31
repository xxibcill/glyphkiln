# Template authoring

Templates are concrete versioned functions, not scripts or user-evaluated
expressions. A definition declares:

- stable ID and semantic version
- required semantic layer types
- supported semantic layer types and mutually exclusive groups
- supported registry formats
- headline line limit
- layout and safe-area policy
- deterministic render function

To add a template:

1. Write a narrow explicit function in
   `packages/glyphkiln-core/src/templates`.
2. Use registry dimensions and brand safe-area bounds.
3. Fit all text with the typography helpers and exact loaded family.
4. Use only renderer-neutral scene primitives.
5. Declare and test required, supported, duplicate, mutually exclusive layers,
   formats, and line limits.
6. Add a reviewed example, exact PNG baseline, design, and manifest.
7. Register the new ID in the strict schema and template registry.
8. Document a changeset.

Any pixel-changing edit to an existing template requires a template-version
bump. Keep the old function available while documents using it remain
supported. Do not silently repoint an old version to new layout code.

The four initial templates intentionally share small geometry/typography
helpers but retain explicit composition functions. Introduce a broader
abstraction only after repeated concrete behavior proves it useful.

Carousel templates retain the one-document, one-canvas contract. Author each
slide as a complete design document, keep visible slide numbering in semantic
layers, and use metadata only for non-pixel grouping and ordering. Applications
may coordinate an ordered slide pack without introducing pages, expressions, or
filesystem references into a design document.

## TikTok carousel policy

Author `tiktok-carousel-slide@1.0.2` packs according to the
[TikTok Image Ads | Carousel Ads Playbook](https://ads.tiktok.com/business/library/Image_Ads_Carousel_Ads_Playbook.pdf):

- use the 1080 × 1920 `tiktok-carousel` format for 9:16 output above the
  playbook's 720p minimum, and keep all key text and marks inside the template
  safe zone
- create 3 or 7–9 complete slide documents, each with one concise, readable
  message
- structure the intended sequence as hook, benefits, then a final action that
  matches the carousel's shared CTA
- make every slide understandable on its own so Smart Order can surface any
  slide first without breaking its meaning

When an AI agent assists with a carousel, keep the design typography-first and
use semantic text plus Core-owned layout and background primitives. Do not
generate or upload SVG artwork for visual decoration. Core-owned safe SVG
serialization remains an output format, not an author-supplied artwork path.
