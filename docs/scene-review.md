# Scene Kernel review in Core 0.9

`renderScene` returns `evidence` with `SCENE_EVIDENCE_VERSION = "1.0.0"`.
It is created from the same resolved scene passed to SVG serialization. Text
records include the fitted font size, rendered line count and lines, measured
canvas bounds, measured line widths, and the chosen wrapping policy and
long-word result. Image
records include the destination, visible and rendered bounds plus the source
crop rectangle. `elements` exposes stable IDs and conservative axis-aligned
canvas bounds for rectangles, circles, text, images, and connectors. Bounds
include group transforms, painted rectangle and circle strokes, and connector
shafts and arrowheads, but precede clipping; path and group bounds are `null`.
The evidence is bounded by Scene resource limits and is not a score or
proof of legibility, semantic correctness, safe-area compliance, or commercial
readability.

Reading-order coverage is opt-in: pass `{ reviewReadingOrder: true }` to
`renderScene` or `renderSceneIsolated`, or `--review-reading-order` to a Scene
CLI command. It returns `SCENE_READING_ORDER_UNCOVERED` warnings for content,
annotations, and text without an entry or ordered ancestor. Decorative
subtrees remain valid. A warning is advisory and limited to 128 records.

Offline CLI examples:

```sh
glyphkiln scene validate scene.json --review-reading-order
glyphkiln scene inspect scene.json --resource-bundle ./bundle --review-reading-order
glyphkiln scene render scene.json --resource-bundle ./bundle \
  --format png --output scene.png --manifest --verify <expected-fingerprint>
```

The bundle uses the existing `glyphkiln-resource-bundle.json` format and the
same regular-file, path traversal, symlink, size, and SHA-256 checks as design
rendering. The Scene document remains inert JSON. The CLI alone reads paths;
the SDK accepts only resolved resource bytes. Existing `--force` output
protection applies to Scene rendering. The CLI `inspect` command resolves the
scene and reports evidence, quality issues, and the SVG fingerprint; it needs
custom font and asset bytes through `--resource-bundle`.

`renderSceneIsolated` uses the same queued child process, Node permission
profile, byte preflight, memory cap, and timeout as `renderGraphicIsolated`.
Node 22.22.2 or a supported Node 24 release is required.

Core 0.9 adds evidence and opt-in diagnostics without changing SceneDocument
`1.0.0`, Scene Kernel `1.0.0`, renderer identity, Scene manifest `1.0.0`, SVG
or PNG bytes, or default fingerprints for accepted Core 0.8 scenes. Opting in
adds warnings to `qualityIssues` and the manifest's existing issues array but
does not change the pixel fingerprint.

The Thai fixture at `packages/glyphkiln-core/fixtures/scene-thai/` uses the
official Google Fonts Noto Sans Thai variable font and its bundled SIL OFL
1.1 text. The font SHA-256 is pinned in the scene and bundle manifest. Its
full-size and 360 px PNGs are exact visual baselines. The fixture exercises
Thai/Latin text, tone marks, phrase wrapping, and `keepTogether` for
`สูงสุด 25%`. Automated checks establish reproducibility and known line
breaks. A Thai-reading human must still review marks, spacing, hierarchy,
meaning, and readability at the actual delivery size. In the 360 px baseline,
the footnote is small and warrants particular review before any commercial
use. Source: [Google Fonts Noto Sans Thai font and OFL](https://github.com/google/fonts/tree/main/ofl/notosansthai).

For migration from the private SVG route, see
[the migration guide](scene-kernel-migration.md).
