# Determinism contract

Glyphkiln promises identical output bytes for identical pixel-affecting inputs
in the same pinned renderer environment.

The render fingerprint includes:

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

The document's request timestamp, manifest creation timestamp, document ID, and
other non-rendering metadata do not affect pixels and are excluded. Output
format is included because SVG and PNG are different byte products.

Objects use recursive key sorting and compact canonical JSON before SHA-256.
Arrays preserve order. Negative zero becomes zero; non-finite numbers and
non-JSON values are rejected.

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

## Environment

Exact PNG hashes assume the pinned Node major, Resvg version, platform binary,
font bytes, and renderer configuration used by CI (Ubuntu latest, Node 22 and
24; coverage, examples, and package-consumer smoke on Node 24). SVG text is
outlined and therefore independent of recipient fonts, but SVG bytes remain
versioned. A renderer migration must be treated as a deliberate
visual change: review images, bump the renderer version, regenerate manifests,
and approve new exact baselines. Cross-environment perceptual comparison is a
review aid, not a replacement for exact determinism.
