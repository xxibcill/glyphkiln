# Font loading

Typography uses explicit bytes. `ResolvedFont` contains family, weight, style,
optional expected SHA-256, and bytes. `FontRegistry` verifies the hash and uses
the same pinned `fontkit` face for measurement, shaping, variable-weight
selection, glyph-coverage checks, and vector outlining. Unsupported families,
hashes, missing glyphs, or unsupported color glyphs fail instead of silently
substituting.

Every family, weight, and style used by a rendered text element must have a
matching document declaration. Scene validation reports
`UNDECLARED_SCENE_FONT_REFERENCE` inside `INVALID_SCENE_DOCUMENT` before
resolution; `UNDECLARED_FONT_REFERENCE` remains an internal fail-closed render
safeguard. Manifests and fingerprints record the structured identity and hash of
the faces actually used, rather than unassociated hash sets or unused
declarations.

The repository includes the Inter variable font from Google Fonts at pinned
source commit `7ff85c87f93ea6cca5f41c69f2e4edcb90240f26`. Its SHA-256 is
`29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`.
The font is licensed separately under SIL OFL 1.1 in
`packages/glyphkiln-core/assets/fonts/OFL.txt`.
This open development font makes a clone immediately renderable without
proprietary files.

## Bundled font library

Core also ships the twelve OFL families the owner approved on 4 November 2026
(decision D3; see the [Thai + Latin](research/thai-latin-fonts-2026-11/README.md)
and [Latin](research/latin-fonts-2026-11/README.md) research):

| Thai + Latin       | Latin only        |
| ------------------ | ----------------- |
| IBM Plex Sans Thai | IBM Plex Sans     |
| Noto Sans Thai     | Schibsted Grotesk |
| Sarabun            | Barlow Condensed  |
| Kanit              | Instrument Serif  |
| Trirong            | Source Serif 4    |
| Noto Serif Thai    | IBM Plex Mono     |

The 101 files come unchanged from `github.com/google/fonts` `ofl/` at commit
`2fe1e8c6b137fb13041a7cfca6fdcd8a910ea4dc`. Each lives under
`packages/glyphkiln-core/assets/fonts/<family>/` next to that family's
`OFL.txt`. Its SHA-256 and byte size are recorded in
`assets/fonts/catalog.json` and compiled into Core's pinned table
(`src/fonts/bundled-catalog.generated.ts`). `npm run licenses:verify` fails
if any file under `assets/fonts` is unlisted, missing, changed or lacks its
licence. The 17 hashes published in the research READMEs are checked again in
`tests/bundled-fonts.test.ts`.

The bundled families follow Inter's contract:

- A face resolves only when a document names that exact family, weight and
  style. Bytes are read once per process and checked against the pinned hash.
  A changed install fails with `FONT_HASH_MISMATCH`.
- Caller-supplied faces are registered first, so they always win over bundled
  bytes.
- Variable files (Noto Sans Thai, Noto Serif Thai, IBM Plex Sans, Schibsted
  Grotesk, Source Serif 4) serve every hundred weight inside their `wght`
  range. Static files serve their own weight only. There is no
  synthesized weight or italic.
- Offline resource bundles may omit a bundled face if the design declares it
  with its pinned SHA-256.
- Bundling changes no existing render. Documents that render today use the
  same faces and bytes, and an unknown family still fails with
  `UNSUPPORTED_FONT`.

**Where the files live.** The fonts are part of `@glyphkiln/core`'s tarball
(about 8.9 MB packed, against about 0.9 MB before), not a separate
`@glyphkiln/fonts` package. That keeps the bytes in the same immutable unit as
the code that pins their hashes, so a package manager cannot dedupe or
override them to another version. Isolated workers can already read the
package root, and the package-consumer test needs no second tarball. The
lookup API (`resolveBundledFont`) does not expose the location, so moving the
files into a separate package later would not break callers.

Applications may supply additional fonts as bytes. They should retain a
licensed immutable font object, store the verified hash in the document, and
pass bytes through the SDK. `DesignDocument` output and Scene Kernel `outline`
mode serialize shaped text entirely as glyph `<path>` geometry, with no
recipient-dependent `<text>` elements or external font references. Scene Kernel
`outline-with-selectable-text` keeps those paths as the visible source of truth
and adds a transparent `<text>` companion with Core's fixed content and line
breaks. A recipient may substitute its local face for that invisible companion,
but it cannot alter the reviewed pixels. The application/operator remains
responsible for commercial-use and redistribution rights for caller-supplied
font bytes. Core's Apache license does not grant rights to third-party fonts.

CLI users can supply those bytes with a validated
[offline resource bundle](resource-bundles.md). Every caller-supplied bundle
font requires an exact family, weight, style, and SHA-256 declaration in the
design. The built-in Inter normal variable face does not need a bundle entry.

Font shaping and text-layout capability diagnostics are separate. Before font
resolution, Core classifies known bidi-control, strong right-to-left, and
vertical-primary input using generated Unicode 17.0.0 tables. This prevents a
font that contains the glyphs from making unsupported layout appear valid.
Glyph coverage remains a later font-specific quality check.

ADR 0005's statement that Core did not report glyph coverage records the
original decision state. Glyph coverage shipped before `v0.2.0`; the accepted
ADR remains unchanged as historical evidence.

Current limitations: normal Inter variable is the default face, font fallback
stacks are not supported, explicit OpenType feature selection is limited to the
closed DesignDocument 1.7.0 settings in
[type and color craft controls](type-and-color-craft.md),
and color/bitmap glyphs are rejected by the portable SVG outliner. Bidi and
vertical layout are diagnosed but not implemented.
