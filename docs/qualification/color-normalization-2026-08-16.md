# Color-normalization release-matrix qualification — 2026-08-16

Status: **PASS**

Reviewer sign-off: 2026-08-18. The cited CI matrix records were checked against
their exact jobs, and the 28-vector suite was independently repeated on local
Node `24.16.0` and Node `22.22.2` with npm `10.9.8`; both runs passed.

This record qualifies the exact
[ADR 0016](../adr/0016-explicit-color-normalization.md) normalization vectors
on the supported Node/platform release matrix, satisfying the ADR's review-gate
execution requirement. A positive CMYK vector remains deferred; CMYK stays an
explicit stable rejection until a bounded decoder exposes raw CMYK samples.

## Scope and method

The exact vectors are the checked-in suite
`packages/glyphkiln-core/tests/color-normalization.test.ts` (28 tests), which
pins exact output SHA-256 digests, exact decoded pixels, and exact rejection
codes. Two complementary runs qualify each matrix leg:

1. The checked-in suite passing with its pinned digests proves byte-identical
   output on that leg.
2. A boundary evidence run drives the same vectors through the public
   child-process `normalizeRasterColor` entry point and records every report
   field; the two local legs' records are compared for cross-runtime identity.

The release matrix is the CI matrix (`ubuntu-latest` × Node `22.22.2` and Node
`24`, npm `10.9.8`) plus the local development platform (`darwin/arm64`).

## Matrix legs

| Platform      | Runtime      | Vector suite          | Boundary evidence             |
| ------------- | ------------ | --------------------- | ----------------------------- |
| ubuntu-latest | Node 22.22.2 | PASS (CI, full suite) | pinned digests asserted       |
| ubuntu-latest | Node 24.x    | PASS (CI, full suite) | pinned digests asserted       |
| darwin/arm64  | Node 24.16.0 | PASS (28/28, local)   | recorded below                |
| darwin/arm64  | Node 22.22.2 | PASS (28/28, local)   | byte-identical to Node 24 leg |

CI evidence: workflow `CI`, runs `31934633396` and `31934713145`
(2026-08-16, main at `3562924`). The Node `22.22.2` job passed in full. On the
Node `24` job, `npm test` — which builds Core and runs the pinned-digest
normalization suite — passed; the job's later failure is an unrelated App
coverage-step timeout in
`apps/glyphkiln-app/src/server/app-workflow/workflow.test.ts`
("coordinates a deterministic campaign board around exact revisions and
canonical locks", 15 s test timeout under coverage instrumentation). That
flake does not touch the normalization boundary and is tracked separately.

Local evidence: macOS arm64, Node `24.16.0` and a disposable nvm-installed
Node `22.22.2`, each with pinned npm `10.9.8` via corepack. The 28-test suite
passed on both runtimes, and the boundary evidence records were byte-identical
across runtimes (same policy, implementation pins, reports, digests, and
rejection details).

Policy `canonical-srgb-png-v1`; implementation pins
`@kittl/little-cms@1.0.3`, `glyphkiln-raw-wasm-adapter-v1`, `pngjs 7.0.0`,
`jpeg-js 0.4.4`.

## Positive vectors (recorded on darwin/arm64, identical on both runtimes)

| Vector                  | Source                | Output PNG bytes | Output dims | Output SHA-256                                                     | Conversion               | Orientation applied |
| ----------------------- | --------------------- | ---------------- | ----------- | ------------------------------------------------------------------ | ------------------------ | ------------------- |
| implicit-srgb-rgba-png  | PNG 74 B, 2x1         | 74               | 2x1         | `0ca86b21917f11884e6e6789f6c8c8c554fa29b7d8888beb6932ca7681cc0307` | assumed-or-declared-srgb | no                  |
| embedded-display-p3-png | PNG 426 B, 2x1, iCCP  | 74               | 2x1         | `7db360a138d2c2e06809a6e84f1397dd110e19c68be37fef69b972947058e6f5` | embedded-profile-to-srgb | no                  |
| declared-srgb-png       | PNG 83 B, 1x1, sRGB   | 70               | 1x1         | `77addf398c232d0cd8049f6de7a0e50982d2da43cc52935cc1278a2301480de0` | assumed-or-declared-srgb | no                  |
| exif-orientation-1-png  | PNG 120 B, 3x2, eXIf  | 84               | 3x2         | `2900134281131868034c2c01a11eae023a1269dc0d9e231fe8d076a160fc24a6` | assumed-or-declared-srgb | no                  |
| exif-orientation-2-png  | PNG 120 B, 3x2, eXIf  | 84               | 3x2         | `79b02e7db293fbad787ed7a8e584b32b3464065f5db2f1f21b7cd5650bf4d70a` | assumed-or-declared-srgb | yes                 |
| exif-orientation-3-png  | PNG 120 B, 3x2, eXIf  | 85               | 3x2         | `02f461197985f9dd746e5366f13912d03b5978070884281e1caf6f1755fd349b` | assumed-or-declared-srgb | yes                 |
| exif-orientation-4-png  | PNG 120 B, 3x2, eXIf  | 84               | 3x2         | `5595217b3bf6faa85c4e9741c1bae970328aa5fe4a1f6ac76d72b39b7c4812b4` | assumed-or-declared-srgb | yes                 |
| exif-orientation-5-png  | PNG 120 B, 3x2, eXIf  | 85               | 2x3         | `4e0c0cbbfc3f17078b268e542b3f169849f2110c6ea11aa36fd7542b48550e5c` | assumed-or-declared-srgb | yes                 |
| exif-orientation-6-png  | PNG 120 B, 3x2, eXIf  | 85               | 2x3         | `e623bdf806bc445c35209670b1dddbf47cf1f7d8a5bd784711d00ceac126a898` | assumed-or-declared-srgb | yes                 |
| exif-orientation-7-png  | PNG 120 B, 3x2, eXIf  | 85               | 2x3         | `0b25cb8e8fd10c63cb83395642ef8c26cb91d51fc76d3409c6e906ab8d15440a` | assumed-or-declared-srgb | yes                 |
| exif-orientation-8-png  | PNG 120 B, 3x2, eXIf  | 85               | 2x3         | `8f4e019b07cb455b10bc916573b4317c4e790e0c413900ba7516db73add83ff3` | assumed-or-declared-srgb | yes                 |
| jpeg-exif-orientation-6 | JPEG 707 B, 2x1, Exif | 75               | 1x2         | `c80feae75645a9552c89a1867582cd785e1a60903628e5ecb550df02688fa4b1` | assumed-or-declared-srgb | yes                 |

The tagged-sRGB and Display P3 digests match the suite's pinned values on all
four legs. Every output is an 8-bit RGBA PNG containing only `IHDR`, `IDAT`,
and `IEND` chunks: source EXIF, ICC, XMP, density, and comment metadata are
stripped, and EXIF orientation is applied before output dimensions are
recorded.

## Negative vectors (identical on all legs)

| Vector                              | Rejection code                              | Details                                        |
| ----------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| decompression-bomb iCCP             | `COLOR_PROFILE_LIMIT_EXCEEDED`              | maximum 1048576, actual 1048577 inflated bytes |
| high-entropy output limit           | `COLOR_NORMALIZATION_OUTPUT_LIMIT_EXCEEDED` | maximum 16777216, actual 21334068 output bytes |
| conflicting iCCP plus sRGB          | `COLOR_PROFILE_INVALID`                     | —                                              |
| out-of-range sRGB rendering intent  | `COLOR_PROFILE_INVALID`                     | —                                              |
| incomplete JPEG ICC chunk sequence  | `COLOR_PROFILE_INVALID`                     | —                                              |
| malformed ICC, PNG trailing bytes   | `COLOR_PROFILE_INVALID`                     | —                                              |
| malformed ICC, PNG truncated bytes  | `COLOR_PROFILE_INVALID`                     | —                                              |
| malformed ICC, JPEG trailing bytes  | `COLOR_PROFILE_INVALID`                     | —                                              |
| malformed ICC, JPEG truncated bytes | `COLOR_PROFILE_INVALID`                     | —                                              |
| CMYK sample data (stable rejection) | `COLOR_PROFILE_COLOR_SPACE_UNSUPPORTED`     | colorSpace `cmyk`                              |

## App integration boundary

The App retains source and normalized hashes in a new immutable admission and
never replaces an existing admission in place; the binary-upload flow runs
only when raster metadata explicitly sets `normalizeColor: true`. That
behavior is covered by the checked-in App admission tests qualified in the
[2026-08-12 verification snapshot](../plans/post-alpha-next-milestones.md#verification-snapshot-2026-08-12)
and is unchanged by this record.

## Deferred

- A positive CMYK vector remains deferred until a bounded decoder exposes raw
  CMYK samples; the stable rejection above is the qualified behavior.
