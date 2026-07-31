# Known limitations

- Text supports left-to-right horizontal layout. The pinned
  `unicode-17.0.0/ltr-horizontal-v1` policy rejects known bidi controls, assigned
  strong `R`/`AL` text, Mongolian, Phags-pa, and characters with exact Vertical
  decomposition. It does not implement bidi or vertical layout and does not
  prove every accepted string correct. Hyphenation dictionaries and explicit
  OpenType features are also absent.
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
- Template `1.1.x` is semantic and constrained; arbitrary freeform positions,
  arbitrary charts, uploaded SVG, and custom icons are intentionally absent.
- Exact PNG baselines are guaranteed only in the pinned renderer environment.
- Quality contrast is calculated against the canvas color, not a composited
  per-pixel background sample.
- C2PA signing, accessibility metadata beyond SVG title/description, and ICC
  color-profile control are future work.
- CLI resource bundles resolve only local regular files beneath one explicit
  root. They do not scan malware, establish license rights, normalize color
  profiles, or fetch remote resources.
- `renderGraphicIsolated` enforces a child-process timeout, V8 memory/stack
  limits, serialized concurrency, and Node filesystem/subprocess permissions.
  Kernel-level tenant, credential, and network policies remain optional host
  defense in depth.
