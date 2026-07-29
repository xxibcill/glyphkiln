# Font loading

Typography uses explicit bytes. `ResolvedFont` contains family, weight, style,
optional expected SHA-256, and bytes. `FontRegistry` verifies the hash, uses
`fontkit` for measurement, and supplies the same bytes to Resvg. Unsupported
families or hashes fail instead of silently substituting.

Every family, weight, and style used by a rendered text element must have a
matching document declaration. Rendering fails with `UNDECLARED_FONT_REFERENCE`
when a scene uses an available but undeclared face. Manifests and fingerprints
record the structured identity and hash of the faces actually used, rather than
unassociated hash sets or unused declarations.

The repository includes the Inter variable font from Google Fonts at pinned
source commit `7ff85c87f93ea6cca5f41c69f2e4edcb90240f26`. Its SHA-256 is
`29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`.
The font is licensed separately under SIL OFL 1.1 in `assets/fonts/OFL.txt`.
This open development font makes a clone immediately renderable without
proprietary files.

Applications may supply additional fonts as bytes. They should retain a
licensed immutable font object, store the verified hash in the document, and
pass bytes through the SDK. The application/operator is responsible for font
embedding, distribution, and commercial-use rights. Core's Apache license does
not grant rights to third-party fonts.

Current limitations: normal Inter is the built-in face, font fallback stacks
are not supported, OpenType feature selection is not exposed, and missing-glyph
coverage is not yet reported as a separate quality issue.
