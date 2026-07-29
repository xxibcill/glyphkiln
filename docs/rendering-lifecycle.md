# Rendering lifecycle

1. Parse JSON outside Core or pass an unknown value to the SDK.
2. Validate with the strict `DesignDocument 1.0.0` schema.
3. Resolve the format and exact template version.
4. Verify every declared asset against supplied bytes: ID, SHA-256, MIME magic,
   dimensions, and origin metadata must match.
5. Verify declared fonts and hashes. Unsupported families fail; system fallback
   is disabled.
6. Run document and required-layer quality checks.
7. Execute the explicit versioned template with a seed and immutable brand
   snapshot.
8. Measure and fit text, create deterministic procedural geometry, and emit a
   renderer-neutral scene.
9. Run layout, contrast, overflow, quiet-region, and logo checks. Error issues
   block export; warnings are recorded.
10. Serialize safe SVG. For PNG, rasterize that SVG with pinned Resvg and
    temporary files containing only already-verified font bytes.
11. Validate the output signature, hash the bytes, compute the canonical
    fingerprint, and return a manifest.

The render performs no network access. Temporary font files are created in an
OS-owned random directory and removed in a `finally` block. Successful SDK calls
return bytes; only the CLI decides where to write them.
