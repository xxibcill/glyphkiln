# Provenance

Every successful output has its own `RenderManifest 1.2.0`. It records the
design ID/hash, canonical fingerprint, seed, exact template and renderer,
typography and procedural policy versions, asset hashes and origin, font hashes,
dimensions, format, output hash/size, timestamp, rendering method, quality
issues, and the accurate product claim.

`compositionGenerativeImageModelUsed` is always `false`: Core's composition and
render pipeline does not invoke a model. `includedGenerativeAssetUsed`
separately reports whether a declared asset identifies a generative-image-model
origin. Core does not erase, infer away, or rewrite uploaded origin metadata;
unknown origin remains unknown.

Focal points, treatments, and brand typography roles are pixel-affecting design
data and therefore enter the canonical document hash and render fingerprint.
The pinned focal, treatment, and contrast policies are part of renderer
configuration. Layout proof is returned by `renderGraphic` but is not added to
manifest `1.2.0`; no manifest field or meaning changes in this slice.

The manifest is descriptive provenance, not a cryptographic signature or proof
of authorship. Its output hash enables byte verification, and its render ID is
derived from the fingerprint. The creation timestamp is intentionally excluded
from the pixel fingerprint.

`verifyRenderReproduction` checks the validated document hash plus reproduced
output byte size and SHA-256 against a manifest.

C2PA signing is a future integration point for a trusted application, ingestion
service, or rendering worker with key custody. It is intentionally not part of
this MVP and must not require Core to trust Glyphkiln Cloud.
