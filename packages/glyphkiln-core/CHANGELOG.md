# @glyphkiln/core

## 0.3.0

### Minor Changes

- eb39dec: Expose browser-safe canonical JSON and render-fingerprint payload helpers so
  applications can independently verify Core proofs without duplicating the
  fingerprint contract. This does not change renderer output pixels or existing
  fingerprints.
- 75f72ba: Add deterministic Unicode 17.0.0 diagnostics for unsupported bidi controls,
  strong right-to-left text, and vertical-primary text. Export the public analyzer
  and diagnostic types, include document inspection, and reject unsupported
  visible copy before resource resolution across direct, isolated, and CLI
  rendering while preserving accepted output bytes and fingerprints.

### Patch Changes

- c7f19b0: Move Core into the Glyphkiln npm workspace without changing its public API or
  render output, and update its package metadata and documentation for the
  monorepo layout.

## 0.2.0

### Minor Changes

- 3e5ff9f: Harden deterministic rendering contracts, fully decode bounded PNG/JPEG assets,
  outline text for portable SVG, add permission-limited child-process rendering,
  implement native procedural quiet regions and brand controls, clarify
  composition versus included-asset provenance, and add full fixtures, tracked
  examples, package/consumer CI, CLI overwrite/version behavior, reproduction
  checks, and a verified production-license inventory. Render product-announcement
  badge labels, route compact CTA copy through the configured monospace face, and
  reject colliding output/manifest paths.
