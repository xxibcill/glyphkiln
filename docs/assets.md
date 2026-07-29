# Asset resolution

Documents declare immutable asset metadata: stable ID, PNG or JPEG MIME type,
SHA-256, dimensions, and origin. Origin may identify a user upload, licensed
library, generated source, or unknown source, plus an upstream reference and a
generative-image-model name when known.

The SDK accepts `ResolvedAsset` objects containing the same metadata and bytes.
Core verifies the hash, verifies PNG/JPEG magic bytes rather than trusting the
declared MIME type, and requires declaration metadata to match. Unresolved or
undeclared references fail clearly.

Core never accepts an asset URL and never fetches during rendering. It also does
not accept SVG assets in schema `1.0.0`, avoiding scripts, external references,
entities, and sanitizer ambiguity. Images embedded into output SVG are
base64-encoded PNG/JPEG data URIs.

Glyphkiln App or an ingestion service remains responsible for upload-size
limits, malware scanning, complete decoding, decompression-bomb protection,
color normalization, metadata stripping where appropriate, and license policy.
Workers should receive only validated immutable bytes and should have network
access disabled.
