# Rendering lifecycle

## Semantic `renderGraphic` lifecycle

1. Read at most the public byte limit or pass an unknown value to the SDK.
2. Iteratively reject cyclic, accessor-backed, non-JSON, oversized, overly
   deep, or over-populated input.
3. Validate with the strict current `DesignDocument 1.4.0` schema or a supported
   `1.0.0`/`1.1.0`/`1.2.0`/`1.3.0` predecessor.
4. Resolve the format and exact template version. Aggregate required,
   unsupported, duplicate, or mutually exclusive layers; brand restrictions;
   and pinned Unicode text-layout diagnostics. Any error blocks before asset or
   font resolution.
5. Verify every declared asset against supplied bytes: ID, SHA-256, bounded
   PNG/JPEG structure, full decompression, decoder dimensions, pixels, bytes,
   and origin metadata must match.
6. Verify bounded declared fonts and hashes. Unsupported families fail; system
   fallback is disabled.
7. Execute the explicit versioned template with a seed and immutable brand
   snapshot.
8. Segment Thai with the pinned offline model, wrap only at legal boundaries,
   balance Thai lines, then measure, fit, coverage-check, shape, and outline
   text; create deterministic procedural geometry; and emit a renderer-neutral
   scene.
9. For an image-led template, calculate the pinned focal cover, apply only its
   closed treatment, and sample composed raster color beneath text on a fixed
   grid. Run layout, contrast, overflow, quiet-region, and glyph checks. Error issues
   block export; warnings are recorded.
10. Serialize safe SVG containing glyph paths. For PNG, rasterize that SVG with
    pinned Resvg and temporary files containing only already-verified font
    bytes.
11. Validate the output signature, hash the bytes, compute the canonical
    fingerprint, and return a manifest plus bounded safe-area, text-bound,
    crop, overflow, and contrast evidence.

The render performs no network access. Temporary font files are created in an
OS-owned random directory and removed in a `finally` block. Successful SDK calls
return bytes; only the CLI decides where to write them. Its optional offline
resource-bundle adapter resolves a separately selected local root into explicit
verified bytes before this lifecycle begins.

`renderGraphicIsolated` runs this lifecycle in a serialized,
permission-limited child process with V8 memory/stack limits and wall-clock
termination.

## Expert `renderScene` lifecycle

1. Iteratively preflight inert Scene data for byte, depth, entry, and metadata
   bounds, then validate the strict `SceneDocument 1.0.0` schema and runtime
   reference/geometry refinements.
2. Verify caller-resolved PNG/JPEG and font bytes against the exact declarations
   and shared resource limits.
3. Resolve the closed primitive tree, nested groups, transforms, clips,
   explicit-route connectors, semantic reading order, and Core-owned text
   layout. Blocking issues throw `SCENE_QUALITY_VALIDATION_FAILED`.
4. Serialize safe SVG with outlined visual text and, when requested, a
   transparent selectable-text companion. Rasterize PNG from those exact SVG
   bytes with pinned Resvg.
5. Validate each output and return its Scene fingerprint,
   `SceneRenderManifest 1.0.0`, and bounded quality issues. Scene results do not
   include the template-specific `RenderEvidence` returned by `renderGraphic`.

`renderScene` is currently an in-process expert operation. A service admitting
untrusted scenes must provide its own process/container, authorization,
concurrency, timeout, and tenant boundary.
