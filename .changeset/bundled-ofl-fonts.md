---
"@glyphkiln/core": minor
---

Bundle the twelve owner-approved OFL families (IBM Plex Sans Thai, Noto Sans Thai, Sarabun, Kanit, Trirong, Noto Serif Thai, IBM Plex Sans, Schibsted Grotesk, Barlow Condensed, Instrument Serif, Source Serif 4, IBM Plex Mono): 101 files from google/fonts at commit `2fe1e8c6`, each pinned by SHA-256 in `assets/fonts/catalog.json` with its OFL text. `FontRegistry` resolves a bundled face only when a document names it, so caller-supplied bytes still win and Inter stays the default. New root exports: `BUNDLED_FONT_FAMILIES`, `BUNDLED_FONT_FILES`, `BUNDLED_FONT_SOURCE`, `bundledFontFile` and `resolveBundledFont`. Offline resource bundles may omit a bundled face declared with its pinned hash. `licenses:verify` now checks every bundled file. Existing SVG, PNG, manifest and fingerprint bytes are unchanged. The package tarball grows from about 0.9 MB to 8.9 MB.
