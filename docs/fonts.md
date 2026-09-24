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

Current limitations: normal Inter variable is the built-in face, font fallback
stacks are not supported, explicit OpenType feature selection is not exposed,
and color/bitmap glyphs are rejected by the portable SVG outliner. Bidi and
vertical layout are diagnosed but not implemented.
