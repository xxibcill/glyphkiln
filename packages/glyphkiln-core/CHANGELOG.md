# @glyphkiln/core

## 0.4.0

### Minor Changes

- ea48cbf: Add the 1080 × 1440 `tiktok-photo-carousel` format and make
  `tiktok-carousel-slide@1.0.3` the default organic-photo composition with a
  shorter bottom safe region. Preserve `tiktok-carousel-slide@1.0.1` and `1.0.2`
  with the existing 1080 × 1920 `tiktok-carousel` ad format so saved documents
  retain identical output.
- db8ee9b: Add deterministic Thai-aware headline segmentation, balanced legal line
  breaking, orphan diagnostics, blocking linguistic-word-break errors, and the
  schema 1.2.0 `keepTogether` phrase control. Record typography policy 2.0.0 in
  renderer 0.3.0 fingerprints and manifest 1.2.0 provenance.
- 7c6a8e9: Add design schema 1.1.0 with deterministic `tiktok-carousel-slide@1.0.2`, a
  high-resolution 9:16 format, narrative and metric slide modes, and reviewed
  SVG/PNG examples. The template follows the
  [TikTok Image Ads | Carousel Ads Playbook](https://ads.tiktok.com/business/library/Image_Ads_Carousel_Ads_Playbook.pdf):
  author 3 or 7–9 safe-zone slides with one concise message each, sequence a hook
  through benefits to the shared CTA, and keep slides independently meaningful
  for Smart Order. AI-assisted authoring is typography-first and rejects
  generated or uploaded SVG artwork; Core-owned safe SVG output remains
  supported. Existing schema 1.0.0 documents remain supported.
- 26bb0b7: Add a validated, bounded offline CLI resource-bundle format for explicit local
  PNG/JPEG assets and font bytes.

### Patch Changes

- Allow strict TypeScript consumers to create current schema 1.3.0 documents,
  including the 3:4 TikTok photo-carousel format, through `createDesignDocument`.
- e266314: Add a runnable consumer-style project that validates, renders, and byte-verifies
  a deterministic industrial-editorial graphic through the public SDK.

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
