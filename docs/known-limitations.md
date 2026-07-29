# Known limitations

- Text supports left-to-right horizontal layout; bidi, vertical scripts,
  hyphenation dictionaries, and explicit OpenType features are not implemented.
- Inter normal variable is the only bundled development font. Additional font
  bytes work through the SDK but the CLI has no font/asset bundle option yet.
- Asset inputs are PNG/JPEG only. Core fully decodes bounded pixels but does not
  replace an upload malware scanner or normalize color profiles/metadata.
- Template `1.1.x` is semantic and constrained; arbitrary freeform positions,
  arbitrary charts, uploaded SVG, and custom icons are intentionally absent.
- Exact PNG baselines are guaranteed only in the pinned renderer environment.
- Quality contrast is calculated against the canvas color, not a composited
  per-pixel background sample.
- C2PA signing, accessibility metadata beyond SVG title/description, and ICC
  color-profile control are future work.
- The CLI does not yet accept a validated local asset/font bundle. Documents
  requiring external resources should use the SDK.
- `renderGraphicIsolated` enforces a child-process timeout, V8 memory/stack
  limits, serialized concurrency, and Node filesystem/subprocess permissions.
  Kernel-level tenant, credential, and network policies remain optional host
  defense in depth.
