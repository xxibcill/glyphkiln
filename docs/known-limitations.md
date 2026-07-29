# Known limitations

- Text supports left-to-right horizontal layout; bidi, vertical scripts,
  hyphenation dictionaries, and explicit OpenType features are not implemented.
- Missing-glyph coverage is not yet a distinct quality error.
- Inter normal variable is the only bundled development font. Additional font
  bytes work through the SDK but the CLI has no font/asset bundle option yet.
- Asset inputs are PNG/JPEG only. Core verifies bounded file structure, encoded
  dimensions, hashes, byte limits, and decoded-pixel limits, but does not
  perform malware scanning or a full adversarial pixel decode before Resvg.
- Template `1.0.0` is semantic and constrained; arbitrary freeform positions,
  arbitrary charts, uploaded SVG, and custom icons are intentionally absent.
- Procedural quiet regions use an overlay; some styles may show the panel edge.
- Exact PNG baselines are guaranteed only in the pinned renderer environment.
- Quality contrast is calculated against the canvas color, not a composited
  per-pixel background sample.
- C2PA signing, accessibility metadata beyond SVG title/description, and ICC
  color-profile control are future work.
- The CLI does not yet accept a validated local asset/font bundle. Documents
  requiring external resources should use the SDK.
- Process-level wall-clock, memory, credential, filesystem, and network
  isolation is applied by the host using `RENDER_WORKER_PROFILE`; the library
  cannot impose an OS sandbox on its own caller.
