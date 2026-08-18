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

## Image-led campaign policy

`image-led-campaign@1.0.1` is the current brand-fidelity family. It supports
LinkedIn landscape, Instagram square, and Instagram portrait with one required
full-bleed `image`, contained `logo`, and `headline`; `eyebrow`, `subtitle`, and
`cta` are optional. The image must use cover fit and may provide only a
normalized focal point plus `none`, `dark-scrim`, or `light-scrim`.

Version `1.0.1` sizes the contained logo box from the admitted raster aspect
ratio and anchors it at the safe-area column. Version `1.0.0` retains its
original wider fixed logo slot for exact saved-document reproduction.

Display, body, and label roles control exact family/weight and bounded tracking
and line height. Text contrast is checked against fixed samples from the actual
cropped and treated raster. The renderer returns crop, safe-area, text-bound,
overflow, and contrast proof from the same scene used for SVG and PNG.

## TikTok carousel policy

Treat organic Photo Mode and paid Carousel Ads as different products.

For organic Photo Mode, author `tiktok-carousel-slide@1.0.4` with the 1080 ×
1440 `tiktok-photo-carousel` format. This 3:4 canvas is a Glyphkiln working
format, not an official TikTok requirement. TikTok documents a maximum of 35
photos, but does not publish one universal organic canvas or stable organic safe
zone. Choose sequence length from the communication job, proof the dated
advisory overlay against current live UI, and do not import Smart Order or 3/7–9
slide advice from advertising. See [TikTok's current post-creation help](https://support.tiktok.com/en/using-tiktok/creating-videos/making-a-post)
and [Content Posting API media guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide).

The organic template keeps headline leading at or above `1.08` so adjacent
glyph outlines do not collide. Keep the slide-number badge for sequence
orientation, but treat the eyebrow header and footer as optional chrome: use
them to open, close, or mark a real section change rather than repeating them
automatically. Whitespace is not a failure by itself; it should establish a
dominant reading path or make room for a deliberate pattern interrupt. A
visible procedural-decoration layer activates a deterministic Core-owned
pattern rail and alternate field alignment. Use that variation selectively so
the sequence changes beat without changing brand grammar.

For paid Carousel Ads, preserved `tiktok-carousel-slide@1.0.2` uses the 1080 ×
1920 `tiktok-carousel` format. TikTok's current ad specification accepts 2–35
images and documents vertical 720 × 1280 guidance, music, placement-specific
safe-zone behavior, and optional Smart Order. Any recommendation for 3 or 7–9
cards applies only to this ad workflow and remains a recommendation, not a Core
validation rule. See [TikTok carousel-ad specifications](https://ads.tiktok.com/help/article/specifications-for-carousel-ads/).

Every carousel still uses one complete document per slide, an explicit narrative
role, one dominant communication job, and a deliberate hook-to-resolution arc.
Ad slides need enough local context to survive reordering; organic slides may
depend on intentional sequence when the current surface preserves it.

When an AI agent assists with a carousel, keep the design typography-first and
use semantic text plus Core-owned layout and background primitives. Do not
generate or upload SVG artwork for visual decoration. Core-owned safe SVG
serialization remains an output format, not an author-supplied artwork path.

## Delivery-profile and copy guidance

`DELIVERY_PROFILE_REGISTRY` publishes browser-safe, dated metadata for Instagram
native, Instagram API, TikTok native Photo Mode, TikTok Content Posting API, and
TikTok Carousel Ads. Every
fact is labeled `platform-requirement`, `platform-capability`,
`platform-recommendation`, or `glyphkiln-advisory`. Use
`deliveryProfilesForFormat()` to present compatible
paths; never infer that native and API limits match.

Authoring content fields may include `recommendedCharacters`. These values are
editable Glyphkiln heuristics used for copy review. The design schema's existing
minimum and maximum fields remain the hard inert-input bounds; a recommendation
must never be reported as a platform rejection or engagement promise.
