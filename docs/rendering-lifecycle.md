# Rendering lifecycle

1. Read at most the public byte limit or pass an unknown value to the SDK.
2. Iteratively reject cyclic, accessor-backed, non-JSON, oversized, overly
   deep, or over-populated input.
3. Validate with the strict `DesignDocument 1.0.0` schema.
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
8. Measure, fit, coverage-check, shape, and outline text; create deterministic
   procedural geometry; and emit a renderer-neutral scene.
9. Run layout, contrast, overflow, quiet-region, and glyph checks. Error issues
   block export; warnings are recorded.
10. Serialize safe SVG containing glyph paths. For PNG, rasterize that SVG with
    pinned Resvg and temporary files containing only already-verified font
    bytes.
11. Validate the output signature, hash the bytes, compute the canonical
    fingerprint, and return a manifest.

The render performs no network access. Temporary font files are created in an
OS-owned random directory and removed in a `finally` block. Successful SDK calls
return bytes; only the CLI decides where to write them. Its optional offline
resource-bundle adapter resolves a separately selected local root into explicit
verified bytes before this lifecycle begins.

`renderGraphicIsolated` runs this lifecycle in a serialized,
permission-limited child process with V8 memory/stack limits and wall-clock
termination.
