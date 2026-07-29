# Glyphkiln Core Audit Closure

Date: 2026-07-29

Parent audit: [report.md](report.md)

## Result

**PASS**

All findings F-001 through F-017 are resolved within the documented Core
boundary. The earlier report remains an immutable audit snapshot; this report
records the final implementation and verification state.

## Closure evidence

| Findings    | Resolution                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-001–F-005 | Strict input JSON Schema, runtime format checks, corrected text fitting, complete used-font identity, and explicit per-template visible-layer policy. |
| F-006       | PNG and JPEG bytes now pass bounded structural inspection and full pinned pixel decompression with CRC/scan and decoded-dimension checks.             |
| F-007       | Fontkit shapes variable-weight text and serializes every successful SVG text run as glyph paths; output contains no recipient-dependent `<text>`.     |
| F-008       | Procedural `1.1.0` primitives carry exact exclusion masks; raster tests prove zero procedural pixels in each quiet region.                            |
| F-009       | Surface, spacing, visual density, procedural preferences/prohibitions, and monospace controls have tested render or quality behavior.                 |
| F-010       | Twelve full renderable/failure edge documents and three schema-conformance documents are committed; eight example outputs/manifests are tracked.      |
| F-011       | CI verifies Node 22/24, coverage, fixtures, licenses, pack contents, tracked examples, and a fresh direct/isolated installed-package consumer.        |
| F-012       | CLI supports `--version`, redacts absolute input paths, refuses overwrite by default, and requires explicit `--force`.                                |
| F-013       | Validation/quality policy is documented; glyph coverage, quiet density, and output/document reproduction checks have stable tested codes.             |
| F-014       | `renderGraphicIsolated` serializes work in a permission-limited child process with V8 memory/stack bounds and wall-clock termination.                 |
| F-015       | Manifest `1.1.0` separates model-free composition from truthfully reported included generative-asset origin.                                          |
| F-016       | A generated, CI-verified inventory records all 29 production packages and rejects missing/unreviewed SPDX identifiers.                                |
| F-017       | Standard JSON Schema stays strict-validator portable; runtime-only semantics are exported and covered by shared conformance fixtures.                 |

Kernel-level network, credential, and tenant separation can still be added by a
host as defense in depth. It is no longer required to implement Core's worker
lifecycle, timeout, V8 memory, filesystem, or subprocess enforcement.

## Versioned pixel contract

- package remains `0.1.0` until the committed minor Changeset is released;
- renderer is `glyphkiln-svg@0.2.0`;
- `product-announcement` is `1.1.1`; the other three templates are `1.1.0`;
- all four procedural algorithms are `1.1.0`;
- manifest is `1.1.0`.

The four changed PNG baselines and eight tracked example outputs were reviewed
and regenerated under those versions.

## Verification

| Check                                      | Result                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| Build / strict typecheck / lint-security   | Passed                                                                   |
| Unit, integration, visual, fixture tests   | Passed; 13 files, 133/133 tests                                          |
| Isolated child-process smoke               | Passed for SVG+PNG, timeout, and serialized error propagation            |
| Coverage                                   | 81.18% statements, 73.17% branches, 78.8% functions, 82.8% lines         |
| Visual baselines                           | Passed; 4/4 exact PNG bytes                                              |
| Tracked example regeneration               | Passed; 8 outputs and 8 manifests exact                                  |
| Schema/full fixture verification           | Passed; 12 design fixtures plus 3 conformance documents                  |
| Dependency audit and license inventory     | Passed; 0 vulnerabilities, 29 reviewed production package records        |
| Package dry run                            | Passed; 135 files, 550,827-byte tarball                                  |
| Fresh installed runtime consumer           | Passed; direct SVG and isolated PNG                                      |
| Fresh installed strict TypeScript consumer | Passed                                                                   |
| Two independent determinism processes      | Passed; 192/192 inputs and 384 outputs each, byte-identical result files |

The final two-process matrix SHA-256 is
`9c46fdf0f001c00866a0a168394c39b230b622bd89f45805925203743cc0cb3c`.
