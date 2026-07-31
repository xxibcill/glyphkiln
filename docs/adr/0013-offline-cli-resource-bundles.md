# ADR 0013: Validated offline CLI resource bundles

Status: accepted

## Context

Core already accepts explicit `ResolvedAsset` and `ResolvedFont` bytes through
the SDK, but the CLI could render only documents using the built-in Inter face
and no raster assets. Adding filesystem paths to a `DesignDocument` would let
untrusted render data choose host resources and would widen the renderer trust
boundary. A bundle adapter also needs to remain deterministic across manifest
ordering and fail before unbounded reads, hashing, parsing, or decoding.

## Options considered

1. Add asset/font paths or URLs to the design schema.
2. Accept a manifest file and allow its entries to resolve relative to the
   process working directory.
3. Accept one explicit operator-selected directory containing a fixed,
   versioned manifest and strictly contained relative files.
4. Define a custom archive format unpacked by Core.

## Decision

Choose option 3. `glyphkiln render` accepts
`--resource-bundle <directory>`. The directory contains
`glyphkiln-resource-bundle.json` with independent bundle version `1.0.0`.

The strict manifest repeats every external resource's immutable renderer
declaration plus a portable relative `file`:

- assets: ID, PNG/JPEG MIME type, SHA-256, dimensions, and complete origin;
- fonts: family, weight, style, and required SHA-256.

Every asset must have a one-to-one exact design declaration. Bundle font
entries must exactly match design declarations, while the pinned built-in Inter
face may be omitted. The loader returns resources in design order, verifies
hashes, and passes bytes to the existing asset/font registries. Those registries
retain ownership of full raster decoding, dimensions, MIME, origin, font
parsing, and render-time declaration checks.

The manifest and files are bounded before reads. Paths are portable relative
ASCII paths; traversal, absolute paths, symbolic links, non-regular files,
realpath escape, and file-identity changes are rejected. Final opens use
`O_NOFOLLOW`. The adapter contains no network or dynamic-execution primitive.

## Consequences

- Design schema `1.0.0` stays path-free and Core's renderer trust boundary does
  not widen.
- Bundle path and manifest ordering do not affect pixels or fingerprints.
- Existing design, template, renderer, procedural, and manifest versions do
  not change because existing render outputs are byte-identical.
- A directory is easy to inspect and construct with ordinary tools, but is not
  a single-file transport. Operators must preserve it immutably when moving or
  rendering it.
- Portable ASCII resource paths are intentionally narrower than every host
  filesystem.
- The adapter verifies structure and reproducibility, not malware safety,
  licensing rights, color normalization, or provenance truth. Those remain
  ingestion/operator responsibilities.
- Bundle format evolution uses its own explicit version. Unsupported versions
  fail rather than silently migrating.
