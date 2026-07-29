# Provenance

Every successful output has its own `RenderManifest 1.0.0`. It records the
design ID/hash, canonical fingerprint, seed, exact template and renderer,
procedural versions, asset hashes and origin, font hashes, dimensions, format,
output hash/size, timestamp, rendering method, quality issues, and the accurate
product claim.

`generativeImageModelUsed` is `false` for native vector/procedural renders unless
a declared asset truthfully identifies a generative-image-model origin. Core
does not erase, infer away, or rewrite uploaded origin metadata. The flag does
not claim that every unknown-origin asset is non-generative; consumers must
inspect individual `origin.kind` values.

The manifest is descriptive provenance, not a cryptographic signature or proof
of authorship. Its output hash enables byte verification, and its render ID is
derived from the fingerprint. The creation timestamp is intentionally excluded
from the pixel fingerprint.

C2PA signing is a future integration point for a trusted application, ingestion
service, or rendering worker with key custody. It is intentionally not part of
this MVP and must not require Core to trust Glyphkiln Cloud.
