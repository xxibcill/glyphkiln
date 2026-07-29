# F-005 and F-014 Remediation Addendum

Date: 2026-07-29

Repository: `/Users/jjae/Documents/guthib/glyphkiln-core`
Parent audit: [report.md](report.md)

## Result

**PASS FOR THE REQUESTED F-005 AND F-014 REMEDIATION**

Both remaining high-severity findings are resolved within the documented
`glyphkiln-core` boundary. There are no open high-severity findings from the
parent audit. Its medium/low findings remain separate work; in particular,
F-006 still recommends full adversarial pixel decoding in an isolated ingestion
service.

## F-005 — resolved

Every template now declares `supportedLayers` and optional
`mutuallyExclusiveLayers`. Before any asset or font resolution, rendering
returns error-level structured quality issues for:

- a visible layer type the selected template does not implement;
- a second visible layer of the same semantic type;
- mutually exclusive visible layers, currently announcement `eyebrow` and
  `badge`.

The explicit rejection contract covers the six previously silent layer types:
`logo`, general `image`, `icon`, `shape`, `chart`, and design `footer`. The
inspection API exposes required, supported, and mutually exclusive layer
contracts. Future support for these semantics requires a deliberate versioned
template rather than an implicit generic layout.

## F-014 — resolved within Core scope

`RENDER_RESOURCE_LIMITS` is now the authoritative in-process boundary:

- 1 MiB design input, depth 32, and 10,000 entries;
- 64 KiB metadata, depth 12, and 2,048 entries;
- 100 assets, 16 MiB per asset, 48 MiB total, 8,192 px per dimension,
  40 million pixels per asset, and 80 million pixels total;
- 32 caller fonts, 10 MiB per font, and 32 MiB total;
- two requested output formats and a bounded manifest timestamp.

SDK validation performs an iterative preflight before recursive Zod validation.
It rejects cycles, accessors, non-JSON object instances, excessive depth,
excessive entries, and excessive encoded size. The CLI uses a fixed-size read
with one sentinel byte instead of loading an unbounded file.

PNG/JPEG resources are checked before hashing or rasterization for byte limits,
bounded structure, encoded dimensions, per-image pixels, aggregate pixels, and
agreement between encoded, resolved, and declared dimensions. Caller font bytes
are bounded before hashing or parsing.

`RENDER_WORKER_PROFILE` publishes the required hostile-request deployment
profile: one render at a time, a 15-second timeout, denied outbound network
access, and Node worker memory/stack limits. Core remains an in-process library,
so the App or service host must create and terminate workers and enforce OS,
credential, filesystem, and network isolation.

## Pixel and version result

These changes alter rejection and resource contracts, not successful render
pixels. Therefore renderer `glyphkiln-svg@0.1.1`, template versions, and
procedural algorithm versions were not bumped. Direct evidence:

- ordinary visual tests and the explicit baseline-update command pass 4/4;
- no baseline PNG changed;
- the two-process matrix passed 192/192 inputs and 384 outputs per process;
- the matrix summary remains
  `f45c841fc001cffdb0ec0a627b0b175cc33200adc9a3e1109f21d2a33617ad8c`,
  exactly matching the pre-remediation run.

## Final verification

| Check                                           | Result                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| Clean `npm ci`                                  | Passed; 262 packages, 0 vulnerabilities                            |
| `npm run build`                                 | Passed                                                             |
| `npm run typecheck`                             | Passed                                                             |
| `npm run lint`                                  | Passed; ESLint, Prettier, 30-file security scan                    |
| `npm test`                                      | Passed; 12 files, 110/110 tests                                    |
| `npm run test:coverage`                         | Passed                                                             |
| Coverage                                        | 88.75% statements, 78.01% branches, 92.54% functions, 90.74% lines |
| `npm audit --audit-level=low`                   | Passed; 0 vulnerabilities                                          |
| `npm pack --dry-run --json`                     | Passed; 126 files, 536,398 bytes                                   |
| Fresh packed-package runtime consumer           | Passed                                                             |
| Fresh packed-package strict TypeScript consumer | Passed                                                             |
| Two independent matrix processes                | Passed; exact files, 0 mismatches                                  |
| `git diff --check`                              | Passed                                                             |

No output pixel, baseline PNG, dependency, renderer version, procedural version,
template version, package publication, commit, push, or release was introduced
by this second remediation.

## Remaining scope

The original overall audit remains a FAIL against every requested acceptance
criterion because medium/low work remains, including complete adversarial raster
decoding, portable SVG fonts, quiet-region attenuation, full fixtures and
tracked example artifacts, CLI policy gaps, and CI package/example smoke.
Neither F-005 nor F-014 remains among those open items.
