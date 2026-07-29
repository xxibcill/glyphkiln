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

Glyphkiln App or an ingestion service remains responsible for malware scanning,
color normalization, metadata stripping where appropriate, and license policy.
For hostile bytes, call `renderGraphicIsolated`; full decoding then occurs
inside Core's bounded child-process lifecycle.
