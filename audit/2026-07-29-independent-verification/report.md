# Glyphkiln Core Independent Verification — Final Report

> Follow-up: F-005 and F-014 were subsequently resolved. See
> [remediation-report.md](remediation-report.md). This report otherwise
> preserves the earlier audit snapshot.
>
> Final closure: all F-001 through F-017 findings are resolved and the overall
> result is PASS. See [closure-report.md](closure-report.md).

Audit date: 2026-07-29

Repository: `/Users/jjae/Documents/guthib/glyphkiln-core`

Initial untouched report: [initial-report.md](initial-report.md)
Machine-readable initial report: [initial-report.json](initial-report.json)

## Executive result

**FAIL**

The repository has a strong, directly verified deterministic rendering slice:
clean installation, build, strict typecheck, lint/security scan, 84 tests,
coverage, package consumption, CLI SVG/PNG/manifests, four distinct templates,
four procedural styles, valid outputs, exact visual baselines, and a 192-input
two-process determinism matrix all pass after remediation.

Four high-severity correctness defects found during the untouched audit were
fixed:

- generated JSON Schema now models defaultable input and accepts the examples;
- the SDK rejects unsupported output formats at runtime;
- responsive text fitting no longer falsely fails below the minimum size;
- rendered font faces must be declared and are fingerprinted with structured
  identity/hash provenance.

The result remains FAIL because several schema-valid visible layers are silently
ignored, Core does not fully validate raster decode/dimensions/resources, and
untrusted input/resource isolation remains incomplete. Required renderable edge
fixtures, tracked example outputs, portable SVG font handling, full quiet-region
attenuation, and package/example CI smoke checks are also incomplete.

## Environment

| Item                       | Directly observed value                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Repository                 | `/Users/jjae/Documents/guthib/glyphkiln-core`                                              |
| Base commit                | `189ca4dc27219098e1aa33d17da26958e54c4d3c`                                                 |
| Branch                     | `main` tracking `origin/main`                                                              |
| Node.js                    | `v22.23.1`                                                                                 |
| Package manager            | npm `10.9.8`                                                                               |
| Lockfile                   | `package-lock.json`, version 3                                                             |
| OS/architecture            | Darwin 25.5.0, arm64                                                                       |
| Renderer                   | `glyphkiln-svg@0.1.1` after remediation                                                    |
| Rasterizer                 | `@resvg/resvg-js@2.6.2`, native Darwin arm64                                               |
| Font measurement           | `fontkit@2.0.4`                                                                            |
| Runtime schema             | `zod@4.4.3`                                                                                |
| JSON Schema test validator | `ajv@8.20.0` (development only)                                                            |
| Bundled font               | Inter Variable, SHA-256 `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031` |

The package remains `@glyphkiln/core@0.1.0`; a patch Changeset was added for
the next release. Direct runtime dependencies remain exact, not ranged:
`@resvg/resvg-js@2.6.2`, `fontkit@2.0.4`, and `zod@4.4.3`.

## Verification matrix

| Area                   | Status                          | Evidence                                                                                                             | Finding IDs         |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Installation           | Passed                          | Lockfile-enforced `npm ci`; no warnings or advisories                                                                | —                   |
| Build                  | Passed                          | Production ESM, declarations, declaration maps and source maps emitted                                               | —                   |
| Type checking          | Passed                          | Strict TypeScript configuration, exit 0                                                                              | —                   |
| Lint                   | Passed                          | ESLint, Prettier and 29-file security scan, exit 0                                                                   | —                   |
| Tests                  | Passed                          | 11 files, 84/84 tests, 0 skipped                                                                                     | —                   |
| Coverage               | Passed                          | 90.75% statements, 76.55% branches, 91.85% functions, 91.55% lines                                                   | F-013               |
| Package exports        | Passed                          | 122-file, 527,808-byte tarball; fresh offline JS/TS consumer passed; internal import blocked                         | —                   |
| CLI                    | Partially implemented           | Validate/inspect/render/manifest/help pass; version/path/overwrite policy incomplete                                 | F-012               |
| Schema                 | Passed with documented mismatch | Runtime and generated input schema accept examples; strict unknowns pass; cross-field refinements are runtime-only   | F-017               |
| Templates              | Partially implemented           | Four distinct templates render landscape and portrait/square; accepted visible layers remain ignored                 | F-005               |
| Procedural backgrounds | Partially implemented           | Four deterministic versioned algorithms; all input controls change output; three quiet regions overlay only          | F-008               |
| Typography             | Passed for tested LTR boundary  | Measured wrap, explicit breaks, long words, minimum fitting, overflow and supported Unicode tested                   | F-007               |
| Assets                 | Failed acceptance               | Resolver/hash/magic/origin behavior works; malformed bytes/decoded dimensions and logo/general-image behavior do not | F-005, F-006        |
| SVG                    | Partially passed                | Safe XML, exact dimensions, finite output; recipient font availability is uncontrolled                               | F-007               |
| PNG                    | Passed for generated outputs    | Valid opaque RGBA, exact sizes, full pixels, IEND at EOF, exact repeatability                                        | —                   |
| Determinism            | Passed in named boundary        | 192 inputs and 384 outputs per process, two processes, 0 mismatches after fixes                                      | —                   |
| Fingerprints           | Passed for tested inputs        | Structured font identity/hash, seed, versions, dimensions, output format and ordering probes pass                    | —                   |
| Provenance             | Passed with claim caveat        | Actual used fonts, output hashes/sizes, origins and methods verified                                                 | F-015               |
| Security               | Conditional                     | No execution/fetch/cloud coupling; decode and resource isolation remain external/incomplete                          | F-006, F-014        |
| Documentation          | Partially accurate              | ADRs complete; known limits candid; package/fixture/SVG portability discrepancies remain                             | F-007, F-010, F-011 |
| Licensing              | Passed with legal-review item   | Apache-2.0/OFL metadata consistent; no secret hit; dependency notices need release review                            | F-016               |
| CI                     | Partially implemented           | Node 22/24 standard checks present; package/external-consumer/example smoke absent                                   | F-011               |
| Scope boundaries       | Passed                          | No App/Cloud/auth/billing/DB/queue/LLM/image API/C2PA/video coupling                                                 | —                   |

## Commands executed

The complete initial command ledger, including corrected audit-harness mistakes,
is in [initial-report.md](initial-report.md#commands-executed). The following
post-fix commands were also executed:

| Exact command                                                                              |  Exit | Result                                                                      |
| ------------------------------------------------------------------------------------------ | ----: | --------------------------------------------------------------------------- |
| `npm install --save-dev --save-exact ajv@8.17.1`                                           |     0 | Installed, then audit identified a moderate advisory                        |
| `npm audit --json`                                                                         |     1 | Reported AJV advisory fixed in 8.20.0                                       |
| `npm install --save-dev --save-exact ajv@8.20.0`                                           |     0 | Updated to fixed exact version                                              |
| `npm audit --audit-level=low`                                                              |     0 | 0 vulnerabilities                                                           |
| First post-fix `npm run typecheck`                                                         |     2 | AJV CommonJS/default import was not constructable                           |
| Second post-fix `npm run typecheck`                                                        |     2 | Test assertion message required a string                                    |
| Corrected `npm run typecheck; npm test`                                                    |     0 | Typecheck passed; 84 tests passed                                           |
| `npm run test:update-visuals`                                                              |     0 | 4/4 baselines passed; manifests refreshed; PNG bytes unchanged              |
| First full `build; typecheck; lint; test; coverage` sequence                               | mixed | Build/typecheck/tests/coverage passed; lint found one unnecessary condition |
| First corrected `npm run lint`                                                             |     1 | Prettier identified four changed report/source/test files                   |
| `npx prettier --write audit/... src/renderer/index.ts tests/templates-and-quality.test.ts` |     0 | Changed files formatted                                                     |
| `npm run lint`                                                                             |     0 | ESLint, Prettier, security scan passed                                      |
| `npm run build`                                                                            |     0 | Corrected production output built                                           |
| Post-fix landscape/format/font probe                                                       |     0 | Four templates emitted SVG+PNG; GIF rejected; actual fonts recorded         |
| Post-fix Python runtime/JSON Schema comparison                                             |     0 | Valid/unknown cases agree; duplicate/quiet refinements remain runtime-only  |
| Two concurrent `node /tmp/glyphkiln-determinism-probe.mjs ...` processes                   |   0/0 | 192/192 passed each; exact summaries equal                                  |
| `npm pack --dry-run --json`                                                                |     0 | 122 files, 527,808 bytes; no tests/audit/Changeset included                 |
| `npm pack --pack-destination <temporary-directory>`                                        |     0 | Tarball created without publishing                                          |
| Fresh offline tarball install, `tsc -p tsconfig.json`, `node consumer.mts`                 |     0 | Public JS/TS SDK passed                                                     |
| Fresh installed `glyphkiln validate` and PNG render/manifest                               |     0 | Package binary and output valid                                             |
| Post-fix four-example SVG/PNG generation                                                   |     0 | Eight outputs/manifests valid; original pixel hashes preserved              |
| Final `npm ci`                                                                             |     0 | Lockfile-enforced clean dependency state                                    |
| Final `npm run build`                                                                      |     0 | Passed                                                                      |
| Final `npm run typecheck`                                                                  |     0 | Passed                                                                      |
| Final `npm run lint`                                                                       |     0 | Passed                                                                      |
| Final `npm test`                                                                           |     0 | 84/84 passed                                                                |
| Final `npm run test:coverage`                                                              |     0 | Coverage totals below                                                       |
| Final `npm audit --audit-level=low`                                                        |     0 | 0 vulnerabilities                                                           |
| Final `npm pack --dry-run --json`                                                          |     0 | Package contents still clean                                                |
| `git diff --check`                                                                         |     0 | No whitespace errors                                                        |

No package was published, and no commit, push, release, application API, or
cloud API action was performed.

## Test results

- Test files: 11 passed, 0 failed
- Tests: 84 passed, 0 failed, 0 skipped
- Statements: 90.75% (589/649)
- Branches: 76.55% (258/337)
- Functions: 91.85% (124/135)
- Lines: 91.55% (564/616)
- Visual regression: 4/4 exact PNG baselines passed
- Baseline failure proof: one-byte corruption in a temporary repository copy
  caused exactly the expected test failure
- Landscape smoke: 4/4 templates emitted SVG and PNG
- Post-fix determinism: 192/192 inputs per process; 384 outputs per process;
  two processes; 0 mismatches
- Post-fix determinism summary SHA-256:
  `f45c841fc001cffdb0ec0a627b0b175cc33200adc9a3e1109f21d2a33617ad8c`

## Findings

### F-001 — Generated JSON Schema rejects runtime-valid designs

- Severity: High
- Status: Resolved
- Area: Schema/public contract
- Initial evidence: Defaulted `visible`/other inputs were emitted as required,
  rejecting all four repository examples.
- Correction: `getDesignDocumentJsonSchema()` now requests Zod's input schema.
- Impact after correction: Four examples validate under AJV draft 2020-12 and
  runtime Zod.
- Fixed: Yes
- Regression test: Yes; all four examples compile/validate through AJV.

### F-002 — Unsupported SDK format produces mislabeled PNG

- Severity: High
- Status: Resolved
- Area: SDK/output validity
- Initial evidence: JavaScript `"gif"` returned PNG bytes labeled with invalid
  format metadata.
- Correction: Runtime validation accepts only `svg`/`png` before deduplication.
- Fixed: Yes
- Regression test: Yes; expects `UNSUPPORTED_OUTPUT_FORMAT`.

### F-003 — Minimum-size bug breaks advertised landscape formats

- Severity: High
- Status: Resolved
- Area: Typography/templates
- Initial evidence: Responsive preferred sizes below the minimum skipped the fit
  loop, causing 32 false-overflow landscape failures.
- Correction: Fitting starts at `max(preferredFontSize, minimumFontSize)`.
  Renderer contract bumped from `0.1.0` to `0.1.1`.
- Verification: All four examples rendered in LinkedIn landscape; all existing
  baseline PNG hashes remained unchanged.
- Fixed: Yes
- Regression tests: Yes; minimum-size unit test plus four-template landscape
  matrix.

### F-004 — Used fonts can be missing from provenance/cache identity

- Severity: High
- Status: Resolved
- Area: Fonts/fingerprints/provenance
- Initial evidence: Scene weights could be undeclared and absent from manifests;
  sorted bare hashes lost identity-to-hash assignment.
- Correction: Every rendered family/weight/style must match a declaration;
  actual unique scene faces are recorded; internal fingerprints receive
  structured face/hash records. Legacy public hash-only input remains supported.
- Fixed: Yes
- Regression tests: Yes; undeclared scene face rejection, actual manifest face
  list, and swapped font assignment fingerprint difference.

### F-005 — Several visible layer types are silently ignored

- Severity: High
- Status: Open; major product/architecture decision
- Area: Domain/templates/assets
- Evidence: `logo`, general `image`, `icon`, `shape`, `chart`, and design
  `footer` are schema-valid visible layers but no template consumes them.
- Impact: Valid user data can have no visual effect while changing fingerprints.
- Recommended correction: Implement explicit template behavior or reject
  unsupported layer types per template/version.
- Fixed: No
- Regression test: No

### F-006 — Raster content and dimensions are not decoded

- Severity: Medium
- Status: Open/documented limitation
- Area: Assets/security
- Evidence: Nine-byte PNG-like bytes and false 1×1 metadata were accepted.
- Impact: Silent missing images, inaccurate dimensions, decode/resource risk.
- Recommended correction: Bounded decode/dimension checks or a more explicit
  prevalidated-resource API plus enforced ingestion/worker limits.
- Fixed: No
- Regression test: No

### F-007 — SVG appearance depends on recipient fonts

- Severity: Medium
- Status: Open
- Area: SVG/typography
- Evidence: SVG retains `<text font-family="Inter">` without embedding/outlines.
- Impact: Bytes reproduce; displayed SVG pixels can differ without exact fonts.
- Recommended correction: Embed/subset/outline, or narrow/document the contract.
- Fixed: No
- Regression test: No

### F-008 — Three quiet-region algorithms do not reduce geometry

- Severity: Medium
- Status: Open/documented limitation
- Area: Procedural backgrounds
- Evidence: Waves, contours and subdivision use overlay-only quiet regions;
  flow fields additionally stop paths.
- Recommended correction: Versioned native attenuation and measurable density
  tests.
- Fixed: No
- Regression test: No

### F-009 — Declared brand controls are unused/partial

- Severity: Medium
- Status: Open
- Area: Brand/quality
- Evidence: Spacing scale, visual density, preferred/prohibited styles,
  monospace family and surface fields do not affect output/issues.
- Recommended correction: Implement them or mark/remove reserved fields.
- Fixed: No
- Regression test: No

### F-010 — Required fixtures and distributed examples are incomplete

- Severity: Medium
- Status: Open
- Area: Examples/testing/package
- Evidence: Edge fixtures are fragments, not renderable documents; only
  `examples/generated/.gitkeep` is tracked.
- Recommended correction: Complete render fixtures and decide tracked artifact
  or CI artifact distribution.
- Fixed: No
- Regression test: No

### F-011 — CI/release verification is incomplete

- Severity: Medium
- Status: Open
- Area: CI/release
- Evidence: CI omits pack, tarball consumer, CLI example render and manifest
  smoke checks; baseline environment is not fully identified.
- Recommended correction: Add those clean-checkout jobs.
- Fixed: No
- Regression test: No

### F-012 — CLI version/path/overwrite contract is incomplete

- Severity: Medium
- Status: Open
- Area: CLI
- Evidence: `--version` exits 1; resolved absolute paths appear in user errors;
  existing output is overwritten.
- Recommended correction: Version output, path redaction, explicit overwrite
  policy.
- Fixed: No
- Regression test: No

### F-013 — Quality-control model remains narrower than requested

- Severity: Medium
- Status: Open
- Area: Quality
- Evidence: Asset/font/version/output failures are mixed exceptions rather than
  uniform issues; glyph coverage, native quiet-density and reproduction checks
  are absent.
- Recommended correction: Specify issue-vs-exception policy and test every
  advertised issue code with a failing fixture.
- Fixed: No
- Regression test: No

### F-014 — Resource limits are incomplete

- Severity: High
- Status: Open; infrastructure/API design required
- Area: Security/denial of service
- Evidence: Recursive metadata, CLI input bytes, asset bytes and decoded image
  resources are not comprehensively bounded. Worker isolation is documented
  but outside this package.
- Impact: Core alone is not a hostile-resource sandbox.
- Recommended correction: Add cheap depth/byte guards and an explicit worker
  resource profile; retain process/network isolation.
- Fixed: No
- Regression test: No

### F-015 — Product claim is ambiguous with generated upstream assets

- Severity: Medium
- Status: Open
- Area: Provenance
- Evidence: Generated asset origin sets `generativeImageModelUsed: true`, while
  the unconditional product claim still says “without generative image models.”
- Recommended correction: Separate composition method from included asset
  origin in user-facing language.
- Fixed: No
- Regression test: No

### F-016 — Dependency notices need release/legal review

- Severity: Low
- Status: Review required
- Area: Licensing
- Evidence: Apache/OFL package facts are consistent; installed transitive
  metadata includes MIT, Apache-2.0, MPL-2.0, Python-2.0, BSD, ISC, BlueOak,
  0BSD, and one package-specific license reference.
- Recommended correction: Generate/review a release license inventory.
- Fixed: No
- Regression test: Not applicable

### F-017 — JSON Schema cannot express two runtime refinements

- Severity: Medium
- Status: Open/documented design limitation
- Area: Schema
- Evidence: Post-fix JSON Schema and runtime agree on valid examples and unknown
  fields. JSON Schema still accepts duplicate layer IDs and quiet regions where
  `x + width > 1`; runtime rejects both through `superRefine`.
- Impact: JSON Schema is a structural prevalidation contract, not a complete
  substitute for Core runtime validation.
- Recommended correction: Document this explicitly and publish shared negative
  conformance fixtures; do not falsely claim exact parity.
- Fixed: No
- Regression test: Runtime negative tests exist; JSON Schema mismatch is
  directly recorded by this audit.

## Verified public SDK

Directly tested from the post-fix tarball, using only public exports:

- `createDesignDocument`
- `validateDesignDocument`
- `DesignDocumentSchema`
- `getDesignDocumentJsonSchema`
- `inspectDesignDocument`
- `renderGraphic` for SVG and PNG
- `sha256`
- `RenderManifest`, `CreateDesignDocumentInput` and other imported types

Also directly verified:

- root and `./schema` ESM/type exports resolve;
- an internal renderer subpath is blocked;
- unsupported runtime format fails;
- unsupported/undeclared fonts fail clearly;
- caller input is not mutated;
- four concurrent independent renders do not leak state;
- temporary font directories are removed;
- no web server, Cloud service, auth, DB, or credential is required.

## Verified CLI

| Behavior                            | Result                                          |
| ----------------------------------- | ----------------------------------------------- |
| `glyphkiln validate design.json`    | Exit 0 valid; exit 1 invalid                    |
| `glyphkiln inspect design.json`     | Exit 0, structured JSON                         |
| SVG render/output                   | Exit 0, valid XML SVG                           |
| PNG render/output                   | Exit 0, valid exact-size PNG                    |
| Manifest output                     | Exit 0, hash/size verified                      |
| Fingerprint verify                  | Matching fingerprint exit 0                     |
| Missing file / invalid JSON         | Exit 1, no stack trace                          |
| Unsupported format / missing output | Exit 1, usage message                           |
| Unsupported font / missing asset    | Exit 1, actionable code/message                 |
| Remote URL field                    | Schema rejection, exit 1                        |
| Help                                | Exit 0                                          |
| Version                             | Not implemented, exit 1                         |
| Existing output                     | Overwritten; behavior not explicitly documented |

The requested product-announcement validation, PNG, SVG, and manifest commands
all passed both from the repository and the installed tarball.

## Output verification

Post-fix temporary output directory:
`/var/folders/r5/vtx2ztmn22s2q3nm340_vq480000gn/T/glyphkiln-postfix-output.apiLty5Ndl`

| Source                               | Output                     | Dimensions | Seed                     | Template                     | SHA-256                                                            | Fingerprint                                                        |
| ------------------------------------ | -------------------------- | ---------: | ------------------------ | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `examples/product-announcement.json` | `product-announcement.png` |   1200×627 | `launch-analytics-01`    | `product-announcement@1.0.0` | `1e76233366ed03b30c84f2e71b7d8ba49610bfb3be665386cf6fbbdfe63b85eb` | `ba6fd9318eed096e47cf77e314a63baf038af1c3d6b9858d720b94b9cc6f5246` |
| same                                 | `product-announcement.svg` |   1200×627 | same                     | same                         | `49bf5b51beadfb12fc41ddf5618fa80c61416c08b31aa6f59b76b08cf7ae64db` | `a19cdd6f669b97fcd98af71ce9b46b12085b6fed115dceecb3e13d452aa3a9ce` |
| `examples/statistic-card.json`       | `statistic-card.png`       |  1080×1080 | `metrics-retention-42`   | `statistic-card@1.0.0`       | `aaef6ca034574db418d1c79a5fdea3298c33008103b2475cef9d7e71fb633c31` | `e0547926bd13767e0058ffb6544374f3dcc3c575a0ae3760cdf27ffd600b645b` |
| same                                 | `statistic-card.svg`       |  1080×1080 | same                     | same                         | `8e32d7efa73688274485643182648ba98f278dbe5b3a624fa8d23b122c022c24` | `f9ba333103482039f73d69634e1cd6ee44c1cc6a2064ce9f48227cfe2c8750aa` |
| `examples/quote-card.json`           | `quote-card.png`           |  1080×1350 | `quote-systems-07`       | `quote-card@1.0.0`           | `98560f719b38d5d2ea10180680d18ab5b3854eb86984b727dec42ea6554a2af8` | `285f01e319a15cd1115f2220b9a60a2067934d55c9fcbb64448f79196ccfec4b` |
| same                                 | `quote-card.svg`           |  1080×1350 | same                     | same                         | `a9294d8bcf3b75ccfb68a3f4f22201d6a832ce76b12f56bb4b017e0148a18a4a` | `fb71863d98b731647f123532567205de1477a93d4caf9c3d952c10a3f93736d3` |
| `examples/article-cover.json`        | `article-cover.png`        |   1280×720 | `editorial-rendering-19` | `article-cover@1.0.0`        | `da635ae246027e1875f1a2a02ccf737fbaaff24eab6c8d16055a4f9ce68a13e0` | `7d7d25e643c4fc4962dac3f7c94970eabe2dbb088db1443f696f1af563cdd36c` |
| same                                 | `article-cover.svg`        |   1280×720 | same                     | same                         | `f54914c2255728fa737715b719b3b1fcf572c3020d658576c079683a19a1a2bf` | `9b71fbd5d397b90aab9803dcd3fd9c696a1224b5473a3db53deb2836b354a77e` |

The renderer-version/provenance changes changed fingerprints as intended. The
eight output byte hashes remained identical to the untouched audit, proving the
existing reviewed example pixels did not change. The new landscape cases
previously blocked by false overflow now produce pixels under renderer `0.1.1`.

## Architecture compliance

The intended boundaries are maintained:

- `glyphkiln-core` is independently installable and owns rendering contracts;
- `glyphkiln-app` is absent and can consume the public package;
- Glyphkiln Cloud is neither imported nor required.

No auth, team, billing, persistence, queue, publishing, collaboration, approval,
marketplace, analytics, live LLM/image generation, C2PA signing, or video
implementation was found. Fixed registries keep user input as data and no
model-generated code can execute.

The open ignored-layer/resource contracts should be resolved before App code
depends on them; otherwise App would have to compensate around Core semantics.

## Security assessment

Directly verified security properties:

- no `eval`, dynamic `Function`, Node `vm`, or user-selected module path;
- no renderer network client/fetch or arbitrary URL resolver;
- no document-supplied filesystem path or shell command;
- templates/procedural algorithms selected from fixed registries;
- generated SVG blocks script, foreignObject, event attributes, external/file/
  JavaScript references, DOCTYPE and ENTITY;
- raster references are embedded PNG/JPEG data URIs;
- untrusted document objects are strict and bounded in primary layer/text/
  collection/procedural fields;
- npm audit reports zero known advisories.

Unresolved boundary:

- malformed/oversized image resources depend on ingestion and Resvg behavior;
- metadata/input/resource byte/depth limits are incomplete;
- native parsing must be isolated by worker CPU/memory/network/wall-clock limits.

The core product claim is accurate for its vector/procedural composition path:
no diffusion, GAN, neural synthesis, text-to-image, image-to-image, or remote
generative-image service exists. Uploaded asset origin can still make the
unconditional human-facing claim ambiguous (F-015).

## Reproducibility assessment

Direct evidence supports this precise boundary:

> Identical validated pixel inputs produced identical SVG and PNG bytes,
> fingerprints, render IDs, and render-relevant manifest fields under Node
> v22.23.1, Darwin arm64, `@resvg/resvg-js@2.6.2`, renderer
> `glyphkiln-svg@0.1.1`, the exact declared font/asset bytes, fixed templates,
> procedural versions, dimensions, output format, and renderer configuration.

The post-fix matrix covered:

- 4 templates
- 4 procedural styles
- 3 formats (square, portrait, story)
- light and dark modes
- 2 seeds
- SVG and PNG
- 2 independent Node processes

That is 192 input combinations and 384 outputs per process, with zero
mismatches. Separate landscape renders for all four templates also passed.

Not established: cross-OS/native binary identity, displayed SVG pixels without
exact recipient fonts, or safety/reproducibility for hostile unbounded
resources.

## Documentation discrepancies

- JSON Schema is now accurate for structural/defaultable input, but docs should
  explicitly state that duplicate-ID and quiet-region sum refinements require
  runtime validation.
- README's “production-quality” wording remains broader than the ignored-layer,
  asset/resource and CI evidence.
- Asset lifecycle language can be read as decoded dimension validation, which
  is not implemented.
- SVG font portability requirements are not explicit.
- Reviewed baseline environment does not fully name OS/architecture/Node/native
  build provenance.
- Generated example outputs/manifests are locally generated but not tracked or
  included in the package.

## Remaining limitations

- Visible layer types accepted but ignored.
- Malformed/false-dimension raster assets accepted.
- No asset/font resource bundle in CLI.
- SVG text is not embedded or outlined.
- No glyph-coverage, bidi, vertical layout or advanced shaping diagnostics.
- Overlay-only quiet regions for waves/contours/subdivision.
- Unused/reserved brand fields and incomplete policy checks.
- Edge fixture files are not full renderable designs.
- Quality issues and hard exceptions are not a unified contract.
- No manifest-verification helper/signature/C2PA.
- No package/external-consumer/example render CI job.
- No CLI version or explicit overwrite behavior.
- Cross-platform exact PNG reproducibility is not proven.

## Final recommendation

**Requires another core implementation cycle**

Do not begin `glyphkiln-app` as a foundation dependency yet. Resolve F-005 and
F-014 first, then make explicit decisions on raster validation, SVG font
portability, complete fixtures, and CI packaging/example smoke coverage.

## Required closing statement

Directly verified: clean installation, production build, strict type checking,
lint/security scan, 84 tests, coverage, package contents, a fresh TypeScript
consumer, public SDK, CLI SVG/PNG/manifests, four templates, four procedural
styles, valid SVG/PNG structures, exact baseline failure behavior, provenance,
and a zero-mismatch two-process determinism matrix. Failed: the complete
ignored-layer, hostile-resource/asset, fixture, CLI, CI, SVG-portability, and
documentation acceptance criteria. Fixed: F-001 through F-004 with regression
tests, a renderer `0.1.1` contract bump, refreshed manifests, and unchanged
existing baseline pixels. Blocked: no same-environment required check; exact
cross-platform behavior remains unverified rather than passed. Work on
`glyphkiln-app` should not begin until the remaining high-severity core
findings are resolved.
