# ADR 0016: Explicit canonical sRGB raster normalization

Status: accepted; cross-platform release qualification pending

## Context

Core verifies and renders exact supplied PNG/JPEG bytes. Image-led work also
needs an explicit admission-time way to turn tagged photography and logos into
one bounded sRGB representation without silently changing a saved document or
render input.

The normalizer must not fetch a profile, infer a filesystem path, accept a URL,
or become an implicit render step. Source bytes and normalized bytes are
different immutable resources with different hashes.

## Decision

Core exposes the async pure-byte operation `normalizeRasterColor(unknown)` under
policy `canonical-srgb-png-v1`.

### Input boundary

The exact inert input object contains only:

- `bytes`: a `Uint8Array` no larger than the existing per-asset byte limit; and
- `mimeType`: `image/png` or `image/jpeg`, which must match magic bytes.

Accessors, prototype-bearing instances, additional authority fields, empty
input, unsupported formats, multiple frames, oversized dimensions, and more
than 40 million decoded pixels fail before output publication.

PNG `iCCP` declarations are decompressed with a one-MiB output ceiling before
lcms receives them. Duplicate `iCCP`, duplicate or malformed `sRGB`, and
conflicting `iCCP` plus `sRGB` declarations fail. JPEG ICC APP2 chunks must use
one complete, consistently counted, duplicate-free sequence whose combined
profile is at most one MiB. Malformed or incomplete declarations fail closed.

### Transformation

The policy pins `@kittl/little-cms@1.0.3` (LittleCMS compiled to WebAssembly),
Glyphkiln raw-WASM adapter `v1`, pngjs `7.0.0`, and jpeg-js `0.4.4`. The exact
LittleCMS dependency is MIT licensed. Its published Node wrapper contains
extensionless ESM imports that supported Node versions cannot resolve, so Core
vendors the package's generated Node WASM loader under the same license and
uses a narrow typed adapter over its fixed C exports. The adapter resolves only
the pinned dependency's packaged `lcms.wasm`; no path comes from the caller.

Normalization runs in a permission-limited child process with the existing
256-MiB old-generation ceiling, serialized concurrency, and 15-second timeout.
The process handles one request and exits, reclaiming its WASM heap. Embedded
RGB and grayscale profiles are converted to built-in sRGB with relative
colorimetric intent and deterministic no-cache/no-optimize flags. Untagged
PNG/JPEG input is explicitly treated as sRGB. EXIF orientation is applied
before output dimensions are recorded.

CMYK sample data and CMYK/other embedded profiles fail with
`COLOR_PROFILE_COLOR_SPACE_UNSUPPORTED`. jpeg-js converts four-channel JPEG
data before exposing it, so it cannot provide the raw CMYK samples required for
a trustworthy profile transform. Supporting CMYK therefore requires a future
bounded decoder decision and a new reviewed policy version.

The output is always an 8-bit RGBA PNG. pngjs uses fixed color type, bit depth,
filter, deflate level, and deflate strategy. EXIF, ICC, XMP, density, comments,
and other source metadata are omitted. Output larger than the normal Core
per-asset byte limit fails because it could not subsequently become a valid
resolved render asset.

### Evidence

The result contains a defensive copy of the canonical PNG bytes and a bounded
report with:

- policy and pinned implementation versions;
- source MIME, byte count, SHA-256, dimensions, normalized color-space class,
  profile kind/hash/size, and orientation;
- output MIME, byte count, SHA-256, dimensions, sRGB declaration, and alpha
  shape; and
- whether profile conversion and orientation were applied and metadata was
  stripped.

The report never echoes profile names, metadata strings, paths, URLs, or other
untrusted values.

## Render and provenance boundary

`renderGraphic` remains unchanged. It never calls this helper and continues to
embed the exact bytes whose SHA-256 appears in the document. An App ingestion
flow may scan the source, call the normalizer under its existing expensive-work
admission bounds, validate the returned PNG through Core, and create a new
immutable resource admission linking source and normalized hashes. The App
binary-upload route implements that flow only when raster metadata explicitly
sets `normalizeColor: true`; existing admissions and saved revisions are never
rewritten.

This policy does not change the design schema, renderer, templates, procedural
algorithms, manifest, fingerprint payload, SVG, PNG render output, or legacy
validation behavior.

## Consequences

- Color conversion is explicit, reproducible, separately versioned, and
  reviewable before document creation.
- Canonical output may be larger than a JPEG source and can fail the normal
  render-asset byte limit.
- The WASM color runtime and vendored loader become part of the normalization
  reproducibility boundary, but not the render fingerprint.
- Browser callers cannot use this Node-only helper; browser authoring metadata
  remains static and byte-free.

## Review gate

Before acceptance, run the exact normalization vectors on supported Node 22 and
24 environments for every supported platform in the release matrix. Review
tagged sRGB, Display P3, alpha PNG, EXIF orientations, malformed ICC,
decompression-bomb, high-entropy output-limit, and stable CMYK-rejection
fixtures. App integration retains both hashes and never replaces an existing
admission in place. A positive CMYK vector is deferred until the raw
sample-decoder gate above is satisfied.
