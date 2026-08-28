# Known limitations

- Text supports left-to-right horizontal layout. The pinned
  `unicode-17.0.0/ltr-horizontal-v1` policy rejects known bidi controls, assigned
  strong `R`/`AL` text, Mongolian, Phags-pa, and characters with exact Vertical
  decomposition. It does not implement bidi or vertical layout and does not
  prove every accepted string correct. Hyphenation dictionaries and explicit
  OpenType features are also absent. The market-led multilingual milestone is
  intentionally later than Scene Kernel `0.8.0`.
- Thai wrapping uses the pinned `budoux-th@0.7.0` model. It prevents the known
  whitespace-token/grapheme fallback defect, but a finite model can choose an
  undesirable boundary for specialized names, novel compounds, abbreviations,
  or malformed copy. Schema `1.2.0` authors can protect literal phrases with
  `keepTogether`. Other scripts without spaces do not yet have bundled models.
- Inter normal variable is the only bundled development font. Additional font
  bytes work through the SDK and the validated local CLI resource-bundle
  adapter.
- Asset inputs are PNG/JPEG only. Core fully decodes bounded pixels but does not
  replace an upload malware scanner or normalize color profiles/metadata.
- `DesignDocument` remains semantic and coordinate-free. Scene Kernel is an
  expert data seam for reviewed explicit geometry, not a freeform App editor,
  automatic composition engine, or escape hatch for arbitrary SVG and CSS.
- Scene Kernel v1 supports only its closed primitive, group, transform, clip,
  connector, and text vocabulary. It does not provide general matrices,
  callbacks, expressions, plugins, runtime component registration, or layout
  optimization. Callers remain responsible for art direction and domain truth.
- Exact PNG baselines are guaranteed only in the pinned renderer environment.
- Core emits SVG and PNG proofs. It does not emit PDF, tagged PDF, book files,
  print impositions, spot colors, or CMYK separations. Instagram's publishing API and
  TikTok's Content Posting API may require JPEG or WebP delivery media; callers
  must perform and verify that explicit conversion without mislabeling the Core
  PNG proof as publish-ready.
- Platform-surface overlays are dated Glyphkiln review advisories. In particular,
  TikTok does not publish one stable universal organic Photo Mode safe zone;
  target-device captures remain part of release proofing.
- Existing solid-surface templates calculate contrast against their owned
  surface color. `image-led-campaign@1.0.x` uses a conservative fixed 5 × 5
  composed-raster sample grid; it is not color-profile normalization or a
  perceptual image-quality metric.
- Scene documents can carry explicit semantic reading order, and
  `outline-with-selectable-text` can add a selectable SVG text companion without
  changing Core's visual layout. That is not tagged-PDF/PDF-UA conformance, and
  meaningful descriptions and reading order still require human review.
- C2PA signing and ICC color-profile control are future work.
- CLI resource bundles resolve only local regular files beneath one explicit
  root. They do not scan malware, establish license rights, normalize color
  profiles, or fetch remote resources.
- `renderGraphicIsolated` enforces a child-process timeout, V8 memory/stack
  limits, serialized concurrency, and Node filesystem/subprocess permissions.
  Kernel-level tenant, credential, and network policies remain optional host
  defense in depth.
- Glyphkiln App does not expose SceneDocument upload, editing, or rendering.
  Scene Kernel `0.8.0` does not widen the App Alpha trust boundary. A later
  semantic `@glyphkiln/book` compiler is not part of this release.
