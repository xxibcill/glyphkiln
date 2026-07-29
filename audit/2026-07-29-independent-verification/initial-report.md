# Glyphkiln Core Independent Verification — Initial Report

Audit date: 2026-07-29

Audit phase: untouched implementation, before remediation
Repository: `/Users/jjae/Documents/guthib/glyphkiln-core`

## Executive result

**FAIL**

The clean install, build, strict typecheck, lint/security scan, 76-test suite,
coverage run, package creation, fresh-package consumer, CLI SVG/PNG rendering,
four examples, exact visual baselines, and a 192-input cross-process
determinism matrix all passed. The implementation nevertheless fails the full
acceptance criteria because:

- exported JSON Schema rejects the repository's own runtime-valid examples;
- the JavaScript SDK accepts an unsupported output format and emits PNG bytes
  under that invalid format value;
- two templates falsely report text overflow in an advertised landscape format;
- actual fonts used by scenes are not required to be declared and can be absent
  from manifests/fingerprints;
- several visible schema layer types are silently ignored by all templates;
- malformed raster bytes and false image dimensions are accepted;
- required renderable edge fixtures and tracked example outputs are absent;
- the CI workflow omits package and example-consumer smoke checks.

The implementation is a credible deterministic vertical slice, but it is not
yet suitable as the complete open-source foundation described by the audit
brief.

## Environment

| Item                    | Directly observed value                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Repository              | `/Users/jjae/Documents/guthib/glyphkiln-core`                                              |
| Commit                  | `189ca4dc27219098e1aa33d17da26958e54c4d3c`                                                 |
| Branch                  | `main` tracking `origin/main`                                                              |
| Initial tracked changes | None                                                                                       |
| Node.js                 | `v22.23.1`                                                                                 |
| npm                     | `10.9.8`                                                                                   |
| Lockfile                | `package-lock.json`, lockfile version 3                                                    |
| OS                      | Darwin 25.5.0, macOS arm64                                                                 |
| Renderer                | `glyphkiln-svg@0.1.0`                                                                      |
| Rasterizer              | `@resvg/resvg-js@2.6.2` (native Darwin arm64 package)                                      |
| Font measurement        | `fontkit@2.0.4`                                                                            |
| Runtime schema          | `zod@4.4.3`                                                                                |
| Bundled font            | Inter Variable, SHA-256 `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031` |

The repository is one ESM package. Production build output is emitted to
`dist/` as JavaScript, declarations, declaration maps, and JavaScript source
maps. Public exports are the package root, `./schema`, and `./package.json`.
Other built paths were physically present in the tarball but correctly blocked
by the package export map.

## Verification matrix

| Area                   | Status                        | Evidence                                                                                                                                                           | Finding IDs         |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Installation           | Passed                        | Clean `npm ci`: 258 packages added, 0 vulnerabilities, no deprecation/native warnings                                                                              | —                   |
| Build                  | Passed                        | `tsc -p tsconfig.build.json`; production files, declarations and maps emitted                                                                                      | —                   |
| Type checking          | Passed                        | Strict `tsconfig.json`; `npm run typecheck` exit 0                                                                                                                 | —                   |
| Lint                   | Passed                        | ESLint, Prettier check, and 29-file security scan exit 0                                                                                                           | —                   |
| Tests                  | Passed with coverage gaps     | 11 files, 76/76 tests, 0 skipped                                                                                                                                   | F-013               |
| Coverage               | Passed                        | 90.49% statements, 75.70% branches, 91.79% functions, 91.31% lines                                                                                                 | F-013               |
| Package exports        | Passed                        | 526,943-byte tarball; fresh offline consumer runtime and TypeScript imports passed; internal path rejected                                                         | —                   |
| CLI                    | Partially implemented         | Validate, inspect, SVG, PNG, manifest, help and errors exercised; no version command; paths disclosed; output overwrites                                           | F-012               |
| Schema                 | Failed                        | Runtime strict validation works; exported JSON Schema rejects runtime-valid examples because defaulted properties are required                                     | F-001               |
| Templates              | Partially implemented         | Four distinct versioned compositions render; quote/statistic fail LinkedIn landscape with valid content; several visible layer types are ignored                   | F-003, F-005        |
| Procedural backgrounds | Partially implemented         | Four algorithms/version IDs deterministic; all parameter changes affect results; three styles use overlay-only quiet regions                                       | F-008               |
| Typography             | Partially implemented         | Measured wrapping, explicit breaks, long-token splitting and unsupported-font failure passed; landscape minimum-size bug and unembedded SVG fonts remain           | F-003, F-007        |
| Assets                 | Failed acceptance             | Hash/MIME magic/resolution checks passed; malformed PNG and false decoded dimensions were accepted; logo layers are not consumed by templates                      | F-005, F-006        |
| SVG                    | Partially passed              | Four XML-valid, safe generated SVGs with correct dimensions; text remains dependent on recipient font availability                                                 | F-007               |
| PNG                    | Passed for generated examples | Pillow/libpng-independent checks: valid RGBA, opaque, exact dimensions, nonempty, IEND at EOF                                                                      | —                   |
| Determinism            | Passed in tested boundary     | 192 inputs × 2 formats × 2 processes = 768 render executions; 384 output records/run; 0 mismatches                                                                 | —                   |
| Fingerprints           | Partially passed              | Seed, format, dimensions, template/procedural versions, assets/fonts and object order tested; font hash-to-face association is lost                                | F-004               |
| Provenance             | Partially passed              | Output hashes/sizes, document hash, origins, rendering method and timestamps verified; used fonts can be omitted; product claim is ambiguous with generated assets | F-004, F-015        |
| Security               | Conditional                   | No eval/dynamic Function/network fetch/user imports; fixed registries; npm audit clean; resource and decode boundaries remain external                             | F-006, F-014        |
| Documentation          | Partially accurate            | ADR set complete; known limitations are candid; several implementation/package/fixture claims remain overstated                                                    | F-007, F-010, F-011 |
| Licensing              | Passed with review item       | Root/package Apache-2.0; Inter OFL and hash present; no secret pattern hits; transitive license facts recorded                                                     | F-016               |
| CI                     | Partially implemented         | Node 22/24 clean CI runs build/typecheck/lint/tests and coverage; package and example smoke tests absent                                                           | F-011               |
| Scope boundaries       | Passed                        | No auth, billing, DB, queues, hosted storage, live LLM/image API, Cloud client, C2PA signing, or video path                                                        | —                   |

## Commands executed

Every substantive command below was run from the repository unless another
directory is named. Exit status is the process status observed by the audit.
Inline `node -`/`python3 -` commands were self-contained audit probes and wrote
only to temporary directories unless explicitly noted.

| Command                                                                                                                    |    Exit | Result                                                                         |
| -------------------------------------------------------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------------------ |
| `pwd; uname -a; node --version; npm --version; git branch --show-current; git rev-parse HEAD; git status --short --branch` |       0 | Environment and clean baseline captured                                        |
| `find . -maxdepth 2 ...` and `find src tests docs .github fixtures examples assets -type f`                                |       0 | Repository/package/build structure enumerated                                  |
| `sed -n ... package.json tsconfig*.json eslint.config.js vitest.config.ts .github/**`                                      |       0 | Metadata and tooling read                                                      |
| `sed -n ... src/**/*.ts scripts/*.mjs tests/*.ts`                                                                          |       0 | Actual implementation and tests read                                           |
| `sed -n ... README.md CONTRIBUTING.md SECURITY.md LICENSE NOTICE docs/**/*.md`                                             |       0 | Documentation, policy and ADRs read                                            |
| `node -e '...package-lock.json...'`                                                                                        |       0 | Lockfile v3 and exact direct dependencies confirmed                            |
| First attempted `rm -rf ...; npm ci`                                                                                       | blocked | Tool safety policy rejected destructive command before execution               |
| First attempted move-to-backup loop using shell variable `path`                                                            |     127 | Probe mistake shadowed zsh `$path`; nothing moved or installed                 |
| Corrected `mktemp`; `mv node_modules dist coverage`; `npm ci`                                                              |       0 | Clean install: 258 packages, 0 vulnerabilities                                 |
| `npm run build`                                                                                                            |       0 | Production build succeeded                                                     |
| `npm run typecheck`                                                                                                        |       0 | Strict typecheck succeeded                                                     |
| `npm run lint`                                                                                                             |       0 | ESLint, Prettier, security scan succeeded                                      |
| `npm test`                                                                                                                 |       0 | 11 files, 76 passed                                                            |
| `npm run test:coverage`                                                                                                    |       0 | 76 passed; real source coverage recorded                                       |
| `find dist -type f`; root/schema dynamic imports                                                                           |       0 | Build artifacts and runtime exports verified                                   |
| `npm audit --audit-level=low`                                                                                              |       0 | 0 known advisories                                                             |
| `npm pack --dry-run --json`                                                                                                |       0 | 122 files; 526,943-byte package                                                |
| `npm pack --pack-destination <temporary-directory>`                                                                        |       0 | Tarball created without publishing                                             |
| Temporary consumer `npm init --yes`; offline tarball/development installs                                                  |       0 | Fresh external package project created                                         |
| First temporary consumer `tsc -p tsconfig.json`                                                                            |       2 | Audit fixture used a readonly tuple where mutable input was required           |
| Corrected temporary consumer `tsc -p tsconfig.json`                                                                        |       0 | Public package TypeScript declarations usable                                  |
| `node consumer.mts` in temporary consumer                                                                                  |       0 | Create/validate/inspect/SVG/PNG/manifest/fingerprint succeeded                 |
| Temporary consumer package CLI validate/inspect/render SVG/render PNG/help                                                 |       0 | Installed binary and manifest paths worked                                     |
| `import("@glyphkiln/core/renderer/index.js")`                                                                              |       0 | Probe received expected `ERR_PACKAGE_PATH_NOT_EXPORTED`                        |
| Python `jsonschema` vs runtime negative matrix                                                                             |       0 | Found generated-schema/runtime mismatch                                        |
| Direct SDK formats probe `["gif"]`, `[]`, duplicate SVG                                                                    |       0 | GIF incorrectly accepted; empty rejected; duplicates deduplicated              |
| `rg` security/scope searches across tracked implementation                                                                 |       0 | No prohibited execution/network/cloud paths in render source                   |
| Installed-package license inventory and secret-pattern scan                                                                |       0 | No missing license field or secret-pattern hit                                 |
| Temporary four-example SVG/PNG generation                                                                                  |       0 | Eight outputs and manifests created                                            |
| `file`, `xmllint --noout`, manifest hash/size checks                                                                       |       0 | Correct dimensions/syntax/hashes/sizes                                         |
| Initial combined baseline-manifest path probe                                                                              |       1 | Audit harness derived wrong baseline output path after valid comparisons       |
| Corrected baseline manifest/hash probe                                                                                     |       0 | Four baseline hashes and sizes matched                                         |
| First visual failure probe (wrong working directory)                                                                       |       1 | Ordinary source test passed, so harness correctly treated probe as invalid     |
| Corrected copied-baseline corruption probe                                                                                 |       0 | Vitest failed 1/4 in temporary copy as required                                |
| CLI negative-case matrix                                                                                                   |       0 | Exit codes and stdout/stderr behavior captured                                 |
| Requested milestone validate/PNG/SVG/manifest commands                                                                     |       0 | Literal repository commands succeeded                                          |
| Background parameter/determinism probe                                                                                     |       0 | All four algorithms stable and sensitive to all six changed inputs             |
| Seed probe in two Node processes                                                                                           |       0 | Empty, ASCII, Unicode, 100k seed, and fork labels reproduced                   |
| First timestamp/render probe                                                                                               |       1 | Audit harness had a JavaScript parenthesis error                               |
| Corrected timestamp/render probe                                                                                           |       0 | Pixels/fingerprints stable across timestamp changes                            |
| Typography/format/brand edge matrix                                                                                        |       0 | Edge successes and expected failures recorded                                  |
| Font declaration/scene/manifest cross-field probe                                                                          |       0 | Found undeclared used weights and incomplete manifests                         |
| Fingerprint/canonicalization probe                                                                                         |       0 | Expected changes/exclusions passed; sorted font mapping collision demonstrated |
| Two 192-input determinism processes                                                                                        |       0 | Final square/portrait/story matrix: 192/192 per run, exact summaries equal     |
| Initial landscape-inclusive matrix                                                                                         |       0 | 160 passed, 32 failed with false `TEXT_OVERFLOW`                               |
| Representative benchmark script and `/usr/bin/time -l`                                                                     |       0 | Durations, output sizes, RSS and peak footprint recorded                       |
| Pillow PNG structure/transparency/IEND probe                                                                               |       0 | Four outputs valid, opaque RGBA, no trailing bytes                             |
| Manifest tamper probe in temporary directory                                                                               |       0 | Modified byte no longer matched manifest; no verifier export exists            |
| Brand snapshot mutation probe                                                                                              |       0 | Existing design/output unaffected by later input-brand mutation                |
| Four concurrent render/input-mutation/resource-cleanup probe                                                               |       0 | 8 outputs, no caller mutation, no leftover font temp directory                 |
| `git status --short --branch; git diff --stat; git diff --check`                                                           |       0 | Tracked implementation remained untouched                                      |

## Test results

- Test files: 11 passed, 0 failed
- Tests: 76 passed, 0 failed, 0 skipped
- Statements: 90.49% (571/631)
- Branches: 75.70% (243/321)
- Functions: 91.79% (123/134)
- Lines: 91.31% (547/599)
- Visual regression: 4/4 exact PNG tests passed
- Deliberate copied-baseline corruption: correctly failed 1/4
- Final determinism matrix: 192/192 inputs rendered per process, 384
  SVG/PNG outputs per process, 0 mismatches
- Landscape-inclusive exploratory matrix: 160 passed, 32 failed; all failures
  were quote/statistic landscape false overflow errors

## Findings

### F-001 — Generated JSON Schema rejects runtime-valid designs

- Severity: High
- Status: Open
- Area: Schema/public contract
- Evidence: Runtime accepted all four examples. Draft 2020-12 validation of the
  generated schema rejected them because `visible`, defaulted by Zod at runtime,
  was marked required. Other defaulted inputs have the same input/output issue.
- Impact: Form generators, structured-output producers, and non-Zod consumers
  cannot use the exported contract for valid repository examples.
- Recommended correction: Generate the input JSON Schema, add runtime-vs-JSON
  Schema parity tests, and document/refine cross-field refinements that JSON
  Schema cannot express.
- Fixed: No
- Regression test added: No

### F-002 — Unsupported SDK format produces mislabeled PNG

- Severity: High
- Status: Open
- Area: SDK/output validity
- Evidence: Plain JavaScript `renderGraphic(document, {formats:["gif"]})`
  returned an output whose `format` was `"gif"`, MIME was `image/png`, and
  signature was PNG. TypeScript types and the CLI are not runtime trust
  boundaries.
- Impact: Invalid manifests/cache keys and incorrect content handling.
- Recommended correction: Runtime-enforce exactly `svg` and `png`.
- Fixed: No
- Regression test added: No

### F-003 — Minimum-size bug breaks advertised landscape formats

- Severity: High
- Status: Open
- Area: Typography/templates
- Evidence: `fitText` begins its loop at `preferredFontSize`. When responsive
  scaling makes preferred smaller than minimum, the loop is skipped and an
  overflow error is returned even when the minimum-size line fits. Valid
  LinkedIn statistic and quote documents failed; 32 landscape matrix cases
  failed.
- Impact: Two templates list a format they cannot render with representative
  valid content.
- Recommended correction: Clamp the initial size to at least the minimum and
  add landscape tests for every template.
- Fixed: No
- Regression test added: No

### F-004 — Used fonts can be missing from declarations, manifests, and cache identity

- Severity: High
- Status: Open
- Area: Fonts/fingerprints/provenance
- Evidence: A document declaring only Inter 400 rendered scene text at
  400/700/800/900 because the implicit development variable font supplies
  aliases. The manifest listed only 400. Sorting a bare hash array also makes
  swapped font-hash associations fingerprint-identical.
- Impact: A manifest may omit actual pixel inputs; cache identity is incomplete
  for multiple explicitly supplied fonts.
- Recommended correction: Validate every scene font face/weight/style against
  declarations and fingerprint structured font identity-to-hash records.
- Fixed: No
- Regression test added: No

### F-005 — Several visible layer types are silently ignored

- Severity: High
- Status: Open
- Area: Domain/templates/assets
- Evidence: The strict schema accepts `logo`, general `image`, `icon`, `shape`,
  `chart`, and design `footer` layers, but no template consumes them. Only the
  product template consumes a `product-screenshot`; its logo layer probe
  produced identical bytes to the no-logo render.
- Impact: Valid visible user data can have no visual effect while still changing
  fingerprints/manifests.
- Recommended correction: Either implement explicit behavior per supported
  template or reject unsupported semantic layers per template.
- Fixed: No
- Regression test added: No

### F-006 — Raster content and dimensions are not actually decoded at the trust boundary

- Severity: Medium
- Status: Open/documented limitation
- Area: Assets/security
- Evidence: A nine-byte PNG signature plus one byte was accepted, embedded, and
  rasterized without error. A 1200×627 PNG declared as 1×1 was accepted and
  produced identical pixels. The code checks magic bytes only.
- Impact: Broken assets can disappear silently; manifest dimensions can be
  false; decompression/image resource risks remain with Resvg/ingestion.
- Recommended correction: Add bounded independent decode/dimension validation
  or make the prevalidated-ingestion contract explicit in types/API names and
  enforce worker limits.
- Fixed: No
- Regression test added: No

### F-007 — SVG appearance depends on recipient fonts

- Severity: Medium
- Status: Open
- Area: SVG/typography/documentation
- Evidence: Generated SVG retains `<text font-family="Inter">`; it has no
  embedded font or outlines. PNG uses verified bytes, but an independent SVG
  viewer without the exact font can substitute and reflow/clip.
- Impact: SVG bytes are deterministic, but displayed pixels are not portable
  under the same input contract.
- Recommended correction: Embed/subset fonts, outline text, or narrow the
  determinism claim and document recipient requirements.
- Fixed: No
- Regression test added: No

### F-008 — Three quiet-region algorithms do not reduce geometry

- Severity: Medium
- Status: Open/documented limitation
- Area: Procedural backgrounds
- Evidence: Layered waves, contours, and subdivision generate unchanged
  geometry behind a high-opacity rectangle. Only flow-field paths stop at the
  region. Parameter hashes change because the overlay moves, not because
  density is reduced.
- Impact: Does not meet measurable geometry-reduction acceptance and can show a
  panel edge.
- Recommended correction: Add algorithm-versioned spatial attenuation and
  quantitative inside/outside tests.
- Fixed: No
- Regression test added: No

### F-009 — Declared brand controls are unused or partially enforced

- Severity: Medium
- Status: Open
- Area: Brand/quality
- Evidence: `spacingScale`, `visualDensity`, `preferredProceduralStyles`,
  `prohibitedStyles`, `monospaceFamily`, and theme `surface` appear only in the
  schema. Prohibited colors are checked only in the core palette, not layer or
  theme colors.
- Impact: Brand snapshots imply controls that do not affect rendering or issue
  reporting.
- Recommended correction: Implement or clearly mark fields reserved; validate
  actual rendered colors/styles.
- Fixed: No
- Regression test added: No

### F-010 — Required fixtures and distributed examples are incomplete

- Severity: Medium
- Status: Open
- Area: Examples/testing/package
- Evidence: Edge fixtures are text or metadata fragments, not complete
  renderable designs. `examples/generated/` has locally present ignored output,
  but Git tracks only `.gitkeep`; output examples/manifests are not in a clone
  or package.
- Impact: Users cannot reproduce the claimed fixture matrix directly, and the
  four documented generated example sets are not distributed.
- Recommended correction: Add full renderable edge documents and decide whether
  reviewed SVG/PNG/manifests should be tracked or generated by a verified CI
  artifact job.
- Fixed: No
- Regression test added: No

### F-011 — CI/release verification is incomplete

- Severity: Medium
- Status: Open
- Area: CI/release
- Evidence: Node 22/24 CI runs clean install, build, typecheck, lint, tests and
  coverage. It does not run `npm pack --dry-run`, a tarball consumer, CLI
  example renders, or manifest checks. Baseline docs do not identify an exact
  OS/Node/native binary environment.
- Impact: Package/export/example regressions can merge despite source tests.
- Recommended correction: Add package and example smoke jobs and record the
  baseline generation environment.
- Fixed: No
- Regression test added: No

### F-012 — CLI contract is incomplete

- Severity: Medium
- Status: Open
- Area: CLI
- Evidence: `--version` exits 1 as a missing-input error. Input/JSON errors print
  resolved absolute local paths. Existing outputs are overwritten without an
  explicit policy/flag.
- Impact: Missing release-identification behavior and avoidable path disclosure;
  accidental overwrite risk.
- Recommended correction: Implement version output, redact paths to the
  operator-supplied spelling, and document/refuse overwrite unless requested.
- Fixed: No
- Regression test added: No

### F-013 — Quality-control coverage is narrower than the requested model

- Severity: Medium
- Status: Open
- Area: Quality/test coverage
- Evidence: Implemented issue checks cover required layers, text fit/safe area,
  contrast, logo `contain`, quiet-region alignment, prohibited palette colors,
  and registry dimensions. Asset/font/version/output errors are exceptions, not
  structured issues; there is no glyph coverage, actual quiet-density,
  deterministic reproduction, or complete output structural issue check.
- Impact: Consumers cannot uniformly inspect all claimed failures.
- Recommended correction: Define the intended issue-vs-exception boundary and
  add deliberate failing tests per advertised issue.
- Fixed: No
- Regression test added: No

### F-014 — Resource limits are incomplete for untrusted inputs/resources

- Severity: High
- Status: Open/documented operational boundary
- Area: Security/denial of service
- Evidence: Layer/text/procedural counts are bounded, but arbitrary recursive
  `metadata` has no byte/depth bound; CLI JSON reads are unbounded; asset byte
  size and decoded dimensions are not verified. Security docs delegate
  process/network/resource limits to ingestion/workers.
- Impact: Core alone is not a sufficient resource-isolation boundary for
  hostile documents/resources.
- Recommended correction: Add cheap document-depth/size guards where possible
  and publish/enforce worker/ingestion limits; full isolation remains
  application infrastructure.
- Fixed: No
- Regression test added: No

### F-015 — Product claim is ambiguous when a generated upstream asset is used

- Severity: Medium
- Status: Open
- Area: Provenance
- Evidence: An asset with `generativeImageModel` correctly sets
  `generativeImageModelUsed: true`, but the manifest still emits the unconditional
  claim “Created without generative image models...”.
- Impact: Readers can interpret one manifest as making contradictory claims.
- Recommended correction: Distinguish composition rendering method from
  included-asset origin in the claim/fields.
- Fixed: No
- Regression test added: No

### F-016 — Dependency license inventory needs release/legal review

- Severity: Low
- Status: Review required
- Area: Licensing
- Evidence: Installed metadata inventory: MIT 193, Apache-2.0 15, MPL-2.0 4,
  Python-2.0 1, BSD-2-Clause 7, BSD-3-Clause 6, ISC 10, BlueOak-1.0.0 1,
  `SEE LICENSE IN LICENSE` 1, and 0BSD 1. Direct runtime packages declare
  licenses and Inter's OFL is included. The root NOTICE only names Glyphkiln.
- Impact: Observable facts do not establish whether consolidated notices are
  required.
- Recommended correction: Generate a release dependency/license inventory and
  have counsel/release owners review notice obligations.
- Fixed: No
- Regression test added: No

## Verified public SDK

The following root exports were directly exercised from the packed tarball:

- `createDesignDocument`
- `validateDesignDocument`
- `DesignDocumentSchema`
- `getDesignDocumentJsonSchema`
- `inspectDesignDocument`
- `renderGraphic` for SVG and PNG
- `sha256`
- `RenderManifest` TypeScript type

The `@glyphkiln/core/schema` subpath was imported and typed. An internal
renderer subpath was rejected by Node's export map. The consumer did not require
a server, Cloud service, database, credentials, or network after its offline
tarball installation. Four concurrent renders did not mutate the caller input
or leave font temporary directories.

## Verified CLI

Directly verified:

- `glyphkiln validate <design.json>`: valid exit 0; invalid exit 1
- `glyphkiln inspect <design.json>`: JSON inspection and dimensions, exit 0
- `glyphkiln render ... --format svg --output ...`: exit 0
- `glyphkiln render ... --format png --output ...`: exit 0
- `--manifest [path]`: manifest created
- `--verify <fingerprint>`: matching fingerprint exit 0
- invalid JSON, missing file, unsupported format, missing output, unsupported
  font, missing asset, and remote URL field: exit 1 without stack traces
- `--help`: exit 0
- `--version`: not implemented, exit 1

The exact milestone validation and PNG/SVG render commands succeeded.

## Output verification

All paths below are temporary audit outputs; hashes match their manifests.

| Source design                        | PNG / SHA-256                                                                                   | SVG / SHA-256                                                                                   | Dimensions | Seed                     | Template                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- | ------------------------ | ---------------------------- |
| `examples/product-announcement.json` | `product-announcement.png` / `1e76233366ed03b30c84f2e71b7d8ba49610bfb3be665386cf6fbbdfe63b85eb` | `product-announcement.svg` / `49bf5b51beadfb12fc41ddf5618fa80c61416c08b31aa6f59b76b08cf7ae64db` | 1200×627   | `launch-analytics-01`    | `product-announcement@1.0.0` |
| `examples/statistic-card.json`       | `statistic-card.png` / `aaef6ca034574db418d1c79a5fdea3298c33008103b2475cef9d7e71fb633c31`       | `statistic-card.svg` / `8e32d7efa73688274485643182648ba98f278dbe5b3a624fa8d23b122c022c24`       | 1080×1080  | `metrics-retention-42`   | `statistic-card@1.0.0`       |
| `examples/quote-card.json`           | `quote-card.png` / `98560f719b38d5d2ea10180680d18ab5b3854eb86984b727dec42ea6554a2af8`           | `quote-card.svg` / `a9294d8bcf3b75ccfb68a3f4f22201d6a832ce76b12f56bb4b017e0148a18a4a`           | 1080×1350  | `quote-systems-07`       | `quote-card@1.0.0`           |
| `examples/article-cover.json`        | `article-cover.png` / `da635ae246027e1875f1a2a02ccf737fbaaff24eab6c8d16055a4f9ce68a13e0`        | `article-cover.svg` / `f54914c2255728fa737715b719b3b1fcf572c3020d658576c079683a19a1a2bf`        | 1280×720   | `editorial-rendering-19` | `article-cover@1.0.0`        |

Independent PNG inspection found RGBA mode, alpha 255 throughout, nonempty
full-canvas bounds, valid IHDR/IDAT/IEND structure, and no bytes after IEND.
All four SVGs parsed with `xmllint`, had exact width/height/viewBox, finite
generated values, and no active/external content beyond the SVG namespace.

Visual inspection found no clipped example text or glyphs. The
product-announcement/statistic examples visibly show the expected overlay panel
behavior; the layouts remain readable but the panel edge/large quiet block is
visually obvious.

## Performance observations

Single-run, current warm process measurements:

| Probe                         |  Duration | Output bytes | RSS change |
| ----------------------------- | --------: | -----------: | ---------: |
| One SVG                       |  84.59 ms |        8,415 | +37.89 MiB |
| One PNG                       |  78.23 ms |       79,432 | +25.27 MiB |
| Four sequential PNGs          | 304.69 ms |      473,267 | +70.83 MiB |
| Four concurrent PNGs          | 287.99 ms |      473,267 | +15.61 MiB |
| Story PNG                     | 290.64 ms |      167,824 | +11.30 MiB |
| High-complexity story SVG+PNG | 384.13 ms |      761,978 | +15.53 MiB |
| Long-text PNG                 | 129.81 ms |       87,924 | +11.11 MiB |

A fresh one-PNG `/usr/bin/time -l` process reported 134,692,864 bytes maximum
resident set size and 101,051,216 bytes peak memory footprint. These are
observations, not invented performance targets.

## Architecture compliance

The implementation maintains the intended code boundary:

- Core owns strict documents, deterministic scene generation, SVG/PNG,
  provenance, SDK, and CLI.
- No Glyphkiln App code or requirement exists.
- No Cloud client or managed-service coupling exists.

Future App/Cloud code can call the public SDK without editing renderer internals.
The incomplete layer/resource/fixture contracts should be resolved before that
integration becomes a foundation dependency.

## Security assessment

Verified boundary:

- no dynamic JavaScript evaluation;
- no model-generated code execution;
- no dynamic import from document data;
- no network fetch or URL asset resolver;
- fixed template and procedural registries;
- no arbitrary document filesystem path;
- generated raster references are embedded data URIs;
- SVG active/external constructs are rejected;
- dependency audit reported zero known advisories.

Unresolved risks:

- incomplete image decode/dimension/resource validation;
- unbounded metadata/input/resource bytes;
- native Resvg/font/image parsing remains a process-isolation concern;
- full security depends on worker CPU/memory/network limits and an ingestion
  boundary exactly as SECURITY.md states.

## Reproducibility assessment

Exact SVG and PNG bytes reproduced for identical validated documents, exact
font/asset bytes, renderer/template/procedural versions, output format, and
current pinned Node/native environment. The two-process matrix compared 384
render records per run and found zero hash/fingerprint/manifest-relevant
mismatches.

This evidence does **not** establish:

- cross-OS/cross-architecture PNG identity;
- portable SVG displayed pixels when the recipient lacks the exact font;
- deterministic behavior for undeclared/mis-associated custom fonts;
- safety under unbounded hostile metadata/assets.

## Documentation discrepancies

- “Initial production-quality vertical slice” is too broad for the current
  public JSON Schema, ignored-layer, asset and CI gaps.
- The design spec calls the JSON Schema an exported contract, but it does not
  accept the runtime's defaultable input form.
- Font documentation says declarations identify exact rendering inputs, but
  used Inter weights can be undeclared/omitted from manifests.
- Asset lifecycle text says dimensions are verified; only caller metadata is
  compared, not decoded image dimensions.
- Visual-regression documentation refers to a pinned environment without naming
  exact OS/architecture/Node/native binary provenance.
- README points to generated example output, but those files are ignored and
  not tracked/distributed.

## Remaining limitations

- Ignored visible semantic layers.
- No complete asset/font bundle in the CLI.
- No full raster decode or byte/decompression limits.
- No font embedding/outlining in SVG.
- No glyph-coverage, bidi, vertical text or advanced shaping diagnostics.
- Overlay-only quiet regions for three algorithms.
- Reserved/unused brand-system fields.
- No renderable edge-fixture suite.
- No C2PA/signature/manifest verification helper (correctly documented as
  future work).
- No freeform layout/custom templates (intentional).

## Final recommendation

**Requires another core implementation cycle**

Do not begin Glyphkiln App integration as a foundation dependency yet. Small
high-severity correctness fixes can be made immediately, but the ignored-layer,
asset validation, SVG font-portability, fixture, and CI contracts need an
explicit product decision and implementation cycle.

## Required closing statement

Directly verified: clean installation, build, strict typecheck, lint, 76 tests,
coverage, packed consumption, public imports, CLI SVG/PNG/manifests, four
examples, valid output structures, exact baselines, provenance hashes, and a
192-input two-process determinism matrix. Failed: the complete schema,
template-format, font-provenance, asset, fixture, CLI, CI, and documentation
acceptance criteria listed above. Fixed in this initial phase: nothing; the
tracked implementation remained untouched. Blocked by environment: no required
check, although cross-platform determinism was not claimed or tested. Work on
`glyphkiln-app` should not begin until at least the high-severity core findings
and scope decisions are resolved.
