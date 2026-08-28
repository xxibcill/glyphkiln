# Determinism contract

Glyphkiln promises identical output bytes for identical pixel-affecting inputs
in the same pinned renderer environment. The promise applies to both the
semantic `renderGraphic` route and the expert `renderScene` route.

The semantic-design fingerprint includes:

- the validated document except `id` and `metadata`
- seed
- template ID and version
- renderer name and version
- procedural algorithm IDs and versions
- selected registry dimensions
- export format
- resolved asset hashes
- resolved font family/weight/style identities and hashes
- relevant SVG and rasterizer configuration
- focal crop, image-treatment, and composited-contrast policy versions
- typography algorithm, segmentation, line-breaking, and emergency grapheme
  policy versions

The document's request timestamp, manifest creation timestamp, document ID, and
other non-rendering metadata do not affect pixels and are excluded. Output
format is included because SVG and PNG are different byte products.

Objects use recursive key sorting and compact canonical JSON before SHA-256.
Arrays preserve order. Negative zero becomes zero; non-finite numbers and
non-JSON values are rejected.

## Scene Kernel fingerprints

Scene Kernel v1 applies the same canonicalization rules to a validated
`SceneDocument 1.0.0`. Its fingerprint covers every render-affecting input,
including:

- the exact ordered scene tree, excluding only documented non-rendering IDs and
  metadata;
- the scene schema version and the renderer, rasterizer, and output-format
  identities;
- primitive geometry, group nesting, closed transforms, clipping, paint order,
  connector endpoint references, explicit route points, and marker policy;
- Core-laid-out text content, font identities and hashes, layout constraints,
  and the selected `outline` or `outline-with-selectable-text` mode;
- semantic reading order when it changes serialized output semantics;
- resolved asset identities and hashes (which bind the admitted bytes); and
- relevant SVG and raster configuration.

Core derives text and closed connector-marker geometry deterministically;
connector route points remain explicit input. Ambiguous layout choices use
documented stable tie-breaks and must not depend on object iteration, filesystem
order, locale, host fonts, or registration order. Any procedural scene
construction remains caller-owned input and must arrive as explicit data. A
future procedural feature inside the kernel would require a seed and a
versioned algorithm before release.

The scene manifest is independently versioned. Scene fingerprint meaning is
governed by the Scene Kernel version plus its embedded renderer configuration
and renderer identity. Together they establish exact reproduction only when the
complete input scene, admitted resource bytes, renderer configuration, output
format, and pinned environment are identical.

Core `0.8.0` advances the shared renderer identity from `0.4.0` to `0.5.0`.
Legacy `DesignDocument` SVG and PNG bytes remain exact; their fingerprints and
manifest bytes deliberately change because renderer identity is hashed and
recorded.

## Randomness

All randomized rendering uses `xoshiro128**/sha256-seed-v1`. SHA-256 of the
UTF-8 seed supplies four little-endian 32-bit state words. A zero state is
repaired with `0x9e3779b9`. No render path uses unseeded randomness.

Stable unsigned 32-bit test vectors:

| Seed         | First six outputs                                                       |
| ------------ | ----------------------------------------------------------------------- |
| `glyphkiln`  | `3978375345, 944851084, 3189784840, 525328402, 500520451, 68289798`     |
| empty string | `2352176578, 3995682531, 789331166, 3278704162, 3534728208, 3569834582` |

Forks derive a new independent seed as `parent + NUL + label`.

## Text-layout diagnostics

Text-layout acceptance uses generated Unicode 17.0.0 range tables and policy
`unicode-17.0.0/ltr-horizontal-v1`. It does not depend on host ICU, locale, or
Unicode regular-expression properties. Diagnostic codes, evidence, ordering,
and truncation are byte-tested in fresh processes and across the Node 22/24 CI
matrix. The policy version is independent of render fingerprints because
blocked input produces no output and accepted input is pixel-identical.

## Text wrapping

Typography algorithm `2.0.0` uses the bundled `budoux-th@0.7.0` model for Thai
boundaries and `balanced-lines@1.0.0` for Thai line selection. It does not use
host ICU or `Intl.Segmenter`. Emergency minimum-size word splitting uses pinned
`grapheme-splitter@1.0.4/unicode-10.0.0` and creates a blocking quality error.
The complete typography policy is stored in `RENDER_CONFIGURATION`, so it is
hashed into every fingerprint, and is repeated in manifest `1.2.0`. A separate
fresh-process corpus test compares exact wrapping output and a fixed SHA-256.

## Environment

Exact PNG hashes assume the pinned Node major, Resvg version, platform binary,
font bytes, and renderer configuration used by CI (Ubuntu latest, Node 22 and
24; coverage, examples, and package-consumer smoke on Node 24). SVG text is
outlined and therefore independent of recipient fonts, but SVG bytes remain
versioned. A renderer migration must be treated as a deliberate
visual change: review images, bump the renderer version, regenerate manifests,
and approve new exact baselines. Cross-environment perceptual comparison is a
review aid, not a replacement for exact determinism.
