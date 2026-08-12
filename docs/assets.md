# Asset resolution

Documents declare immutable asset metadata: stable ID, PNG or JPEG MIME type,
SHA-256, dimensions, and origin. Origin may identify a user upload, licensed
library, generated source, or unknown source, plus an upstream reference and a
generative-image-model name when known.

The SDK accepts `ResolvedAsset` objects containing the same metadata and bytes.
Core verifies the hash, MIME magic, bounded PNG chunk or JPEG marker structure,
CRC/compressed pixel decoding, decoder dimensions, byte/pixel limits, and
declaration metadata. Unresolved, undeclared, malformed, undecodable,
oversized, or dimension-mismatched assets fail clearly before rasterization.

Core never accepts an asset URL and never fetches during rendering. It also does
not accept SVG assets in schema `1.0.0`, avoiding scripts, external references,
entities, and sanitizer ambiguity. Images embedded into output SVG are
base64-encoded PNG/JPEG data URIs.

Schema `1.4.0` image layers may provide a normalized focal point and one closed
treatment ID. `focal-cover-v1` calculates one uniform source scale, centers the
visible source rectangle on the focal point, and clamps it to source edges.
`image-treatment-v1` is limited to no treatment or a fixed dark/light scrim.
The image-led template reports exact source/render/destination bounds and
`composited-srgb-grid-5x5-v1` contrast samples; it accepts no transform, URL,
filter graph, or freeform mask.

Rendering embeds the exact verified source bytes. Core does not silently
normalize or rewrite an asset, so the selected admission hash and render-input
hash remain equal.

Callers may explicitly invoke `normalizeRasterColor` before document creation.
Policy `canonical-srgb-png-v1` accepts only bounded explicit PNG/JPEG bytes,
preflights embedded profile declarations, applies the pinned sRGB conversion
and EXIF orientation, strips metadata, and returns canonical RGBA PNG bytes plus
source/output hashes, dimensions, and a bounded report. The output must receive
its own immutable admission and normal Core validation; the helper never
rewrites an existing resource or render input. See
[ADR 0016](adr/0016-explicit-color-normalization.md).

The first policy implementation converts embedded RGB and grayscale ICC
profiles in a bounded Node child process. CMYK and other profile/sample spaces
fail with `COLOR_PROFILE_COLOR_SPACE_UNSUPPORTED`; they are never silently
treated as RGB.

The CLI can turn files beneath one operator-selected local directory into those
same explicit bytes through a validated
[offline resource bundle](resource-bundles.md). Bundle asset metadata must
exactly equal the design declaration, and Core still performs its complete
raster validation after the bundle loader verifies the file hash.

Glyphkiln App or an ingestion service remains responsible for malware scanning,
choosing whether to normalize, retaining source/normalized provenance, bounding
expensive admission work, and license policy. For hostile render bytes, call
`renderGraphicIsolated`; full rendering decode then occurs inside Core's bounded
child-process lifecycle.
