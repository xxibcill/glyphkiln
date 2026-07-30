# Core 0.3 milestone plan: deterministic text-layout diagnostics

Status: implementation complete; local release gates passed

Target package release: `0.3.0`

Predecessor: signed `v0.2.0` source release and passed independent audit

Registry publication: intentionally out of scope while npm publication is paused

## Recommendation

The next Core milestone should add deterministic, script-aware text-layout
diagnostics.

Core already shapes and outlines text with `fontkit`, but wrapping is an
explicitly horizontal, whitespace-driven algorithm and the document schema
exposes alignment rather than direction or writing mode. Consequently, RTL or
vertical-primary input can currently reach rendering without a clear statement
that the requested layout is unsupported.

This milestone should detect that condition deterministically and refuse
misleading output. It directly addresses the first item in
[the roadmap](../roadmap.md) and the most consequential remaining rendering
limitation in [known limitations](../known-limitations.md), while preserving the
independently audited `0.2.0` pixel baseline.

Relevant implementation evidence:

- `src/fonts/index.ts` already uses `fontkit` for layout and glyph outlines.
- `src/typography/index.ts` implements horizontal whitespace-based wrapping.
- `src/schema/design-document.ts` exposes `align`, but no `direction` or writing
  mode.
- `src/renderer/index.ts` has an existing aggregated quality gate before
  asset/font resolution.
- `src/inspect.ts` has a stable place to expose additive document diagnostics.
- `src/cli/index.ts` already prints nested quality issues without stack traces.
- The independent audit closure records a complete pass for the documented
  `0.2.0` boundary.

## Why this milestone comes first

### Offline CLI resource bundle

This is the recommended next milestone after text-layout diagnostics. It solves
a real CLI gap, but introduces a filesystem, packaging, hashing, licensing, and
resource-resolution trust surface. Incorrect script layout is an existing
silent correctness risk and can be addressed first without widening inputs.

### Color-profile and malware-scanner adapters

These primarily belong at App or ingestion boundaries. Core should continue to
verify already-resolved bytes, hashes, bounded raster structure, decoded
dimensions, and pixel limits. Scanner policy and color normalization should not
be pulled into the pure render path.

### Charts and templates

The schema already includes bar and sparkline chart primitives. Further
additions should follow demonstrated product demand because each addition
creates intentional pixel, template-version, fixture, and baseline obligations.

### Browser-compatible SVG-only adapter

The accepted renderer architecture deliberately avoids browser variability.
A browser adapter creates a second runtime and packaging boundary and should
wait until the text capability contract and offline resource path are stable.

### Signed provenance and C2PA

The current provenance ADR deliberately defers signing and assigns key custody
to a trusted service or worker. C2PA can build on existing manifests later
without changing the pure renderer now.

## Goals

- Detect text that the current LTR-horizontal renderer cannot faithfully lay
  out.
- Return stable, machine-readable SDK diagnostics with bounded evidence.
- Add document-level text diagnostics to `inspectDesignDocument`.
- Block rendering of unsupported visible text before asset/font resolution.
- Preserve current behavior for accepted LTR-horizontal documents.
- Make classification reproducible from pinned, licensed Unicode data without
  runtime network or filesystem access.
- Propagate identical errors through direct rendering, isolated rendering, and
  the CLI.

## Non-goals

- Implement the Unicode Bidirectional Algorithm.
- Add RTL or vertical rendering.
- Add `direction`, `writingMode`, language, hyphenation, fallback-stack, or
  OpenType-feature fields to `DesignDocument`.
- Normalize, reorder, strip, or rewrite user text.
- Add fonts, templates, chart types, browser support, resource bundles, C2PA,
  scanning, or color normalization.
- Change successful SVG or PNG bytes.

## User stories

- As an SDK caller, I can preflight copy before resolving fonts or assets.
- As a CLI user, I can inspect a document and identify the exact layer and field
  that needs revision.
- As a renderer consumer, I receive a stable failure instead of plausible but
  incorrectly ordered output.
- As a maintainer, I can regenerate and verify Unicode classification tables
  offline.
- As an application author, I can branch on stable codes rather than parse
  human-readable messages.

## Trust and security boundaries

- User text remains inert data.
- The analyzer does not execute code, import paths from input, fetch resources,
  normalize text, or mutate documents.
- Runtime classification uses compiled, pinned tables rather than host
  ICU/Unicode behavior.
- Unicode source files are maintainer-controlled build inputs verified by
  expected SHA-256 values.
- The CLI continues to read only its existing bounded design input.
- Diagnostic messages never interpolate raw user text or invisible bidi
  controls.
- Evidence and document-level records are capped to prevent diagnostic
  amplification.
- Font coverage remains a separate check; text-layout analysis requires no
  font or asset bytes.
- Untrusted rendering continues to use `renderGraphicIsolated` and the existing
  resource/worker profiles.

## Public SDK contract

Add the following curated root exports:

```ts
export const TEXT_LAYOUT_DIAGNOSTICS_VERSION = "unicode-17.0.0/ltr-horizontal-v1";

export type TextLayoutDiagnosticCode =
  | "BIDI_CONTROL_UNSUPPORTED"
  | "BIDI_LAYOUT_UNSUPPORTED"
  | "VERTICAL_LAYOUT_UNSUPPORTED";

export type TextLayoutMatchProperty =
  | "Bidi_Control"
  | "Bidi_Class=R"
  | "Bidi_Class=AL"
  | "Script=Mongolian"
  | "Script=Phags_Pa"
  | "Decomposition_Type=Vertical";

export type TextLayoutMatch = {
  codePoint: number;
  scalarIndex: number;
  property: TextLayoutMatchProperty;
};

export type TextLayoutDiagnostic = {
  code: TextLayoutDiagnosticCode;
  message: string;
  totalMatches: number;
  matches: readonly TextLayoutMatch[];
  truncated: boolean;
};

export type TextLayoutAnalysis = {
  version: typeof TEXT_LAYOUT_DIAGNOSTICS_VERSION;
  supported: boolean;
  diagnostics: readonly TextLayoutDiagnostic[];
};

export function analyzeTextLayoutSupport(text: string): TextLayoutAnalysis;
```

Contract rules:

- For well-formed UTF-16, `scalarIndex` counts Unicode scalar values rather than
  UTF-16 code units.
- Each unpaired surrogate advances `scalarIndex` once, is accepted by this
  diagnostic policy, and never emits a match.
- Evidence `property` values map exactly as follows:
  - `Bidi_Control` for the `Bidi_Control` binary property;
  - `Bidi_Class=R` and `Bidi_Class=AL` for the corresponding assigned strong
    bidi class;
  - `Script=Mongolian` and `Script=Phags_Pa` for the corresponding script
    property; and
  - `Decomposition_Type=Vertical` for that exact decomposition type.
- Messages are fixed and do not contain raw user input.
- Evidence is capped at 16 matches per diagnostic.
- Diagnostic codes are emitted in union order.
- Matches are emitted in source order.
- A scalar cannot emit duplicate codes; bidi-control classification takes
  precedence for that scalar.
- A non-string runtime call throws `GlyphkilnError` with
  `INVALID_TEXT_INPUT`.

## Design inspection contract

Extend `DesignInspection` with:

```ts
textLayout: {
  version: typeof TEXT_LAYOUT_DIAGNOSTICS_VERSION;
  renderable: boolean;
  totalDiagnostics: number;
  diagnostics: readonly DesignTextLayoutDiagnostic[];
  truncated: boolean;
};
```

Each design diagnostic adds:

```ts
type DesignTextLayoutDiagnostic = TextLayoutDiagnostic & {
  layerId: string;
  layerType: DesignLayer["type"];
  fieldPath: string;
  visible: boolean;
  blocksRender: boolean;
};
```

`fieldPath` is an RFC 6901 JSON Pointer rooted at the complete validated
`DesignDocument`. Examples:

- a text layer at document layer index 0: `/layers/0/text`;
- a statistic at document layer index 3: `/layers/3/value`,
  `/layers/3/label`, and, when present, `/layers/3/trend`; and
- chart value index 2 in document layer index 5:
  `/layers/5/values/2/label`.

Inspect these semantic text fields:

- `headline.text`
- `subtitle.text`
- `eyebrow.text`
- `cta.text`
- `footer.text`
- `attribution.text`
- `badge.text`
- `statistic.value`
- `statistic.label`
- optional `statistic.trend`
- every `chart.values[index].label`

Asset `alt` text is not renderer text and must not block rendering.

Inspection includes hidden layers so an editor can warn before they become
visible. Hidden-layer diagnostics set `blocksRender: false`. Document
diagnostics are capped at 128 records while retaining `totalDiagnostics` and
setting `truncated`.

Collection order is:

1. document layer order;
2. schema field order;
3. chart-value index;
4. diagnostic-code order.

The collector must use an exhaustive `DesignLayer` switch with a compile-time
`never` check so future layer variants cannot silently escape analysis.

## Rendering contract

Unsupported visible-field diagnostics map in collection order to
error-severity `QualityIssue` records with the same stable code:

- `BIDI_CONTROL_UNSUPPORTED`
- `BIDI_LAYOUT_UNSUPPORTED`
- `VERTICAL_LAYOUT_UNSUPPORTED`

The outer render error remains:

```text
QUALITY_VALIDATION_FAILED
```

Its `details.issues` retains at most 128 visible text-layout issues with stable
inner codes and bounded diagnostic details. `details.textLayout` reports
`totalDiagnostics`, `retainedDiagnostics`, and `truncated`, so omitted records
are explicit. Text-layout checks run in the existing document-quality phase
before asset/font resolution.

Hidden unsupported text does not block rendering. Unsupported visible text does
block both SVG and PNG before output bytes, fingerprints, or manifests are
created.

## CLI contract

- `glyphkiln validate <design>` remains structural schema validation.
- A schema-valid document containing unsupported text still validates.
- `glyphkiln inspect <design>` exits zero and includes `textLayout` in its JSON.
- Automation reads `textLayout.renderable`.
- `glyphkiln render <design>` exits nonzero for unsupported visible text.
- Render errors continue to use the existing `QUALITY_VALIDATION_FAILED` header
  and nested issue lines.
- No new command or flag is introduced.

## Unicode classification policy

Generate internal range tables from pinned Unicode `17.0.0` data:

- `DerivedBidiClass.txt`: assigned strong `R` and `AL` ranges;
- `PropList.txt`: `Bidi_Control`;
- `Scripts.txt`: reviewed vertical-primary script ranges;
- `DerivedDecompositionType.txt`: scalars whose `Decomposition_Type` is exactly
  `Vertical`.

Initial policy:

- `BIDI_CONTROL_UNSUPPORTED`: Unicode `Bidi_Control` scalars.
- `BIDI_LAYOUT_UNSUPPORTED`: assigned strong `R` or `AL` scalars.
- `VERTICAL_LAYOUT_UNSUPPORTED`: Mongolian and Phags-pa script scalars and
  scalars whose `Decomposition_Type` is exactly `Vertical`.
- Ordinary horizontal CJK without one of those classifications, emoji, accented
  Latin, and standalone Arabic-Indic digits are not rejected by this policy.

This is a renderer capability diagnostic, not a general Unicode-validity or
shaping-conformance test.

## Unicode data layout

```text
vendor/unicode/LICENSE.txt
vendor/unicode/17.0.0/source-checksums.json
scripts/generate-text-layout-data.mjs
src/typography/text-layout-data.generated.ts
```

The generator must:

- operate only on caller-supplied or local source data;
- perform no fetching;
- validate expected SHA-256 values;
- reject malformed, overlapping, or unsorted ranges;
- produce sorted, compact, byte-stable TypeScript;
- support `--verify` for CI;
- preserve source version/checksum metadata in the generated file;
- carry Unicode attribution into `NOTICE` and the packed tarball.

Runtime code imports compiled tables and does not read vendor files dynamically.

## Compatibility and versioning

- Package: minor Changeset targeting `0.3.0`.
- Design schema: remains `1.0.0`.
- Templates: unchanged.
- Procedural algorithms: unchanged.
- Manifest: remains `1.1.0`; blocked renders produce no manifest.
- Renderer: remains `0.2.0` if every accepted document produces byte-identical
  output and fingerprints.
- Diagnostic acceptance policy: independently identified by
  `TEXT_LAYOUT_DIAGNOSTICS_VERSION`.

If any accepted SVG or PNG bytes change, stop the milestone, identify the
owning renderer/template/algorithm contract, bump it, and review regenerated
baselines.

The milestone does not depend on npm registry publication. Release readiness is
proved through `npm pack`, a fresh local tarball consumer, and a signed GitHub
source release. npm can remain paused.

## Ordered PR slices

### PR 1: ADR and contract decisions

Status: complete

Dependencies: none

Work:

- Add ADR 0009.
- Lock the capability boundary, codes, classification semantics, visibility
  behavior, evidence caps, document cap, ordering, CLI behavior, and version
  policy.
- Add ADR 0009 to the ADR index.
- Resolve the release-blocking decisions listed below.

Acceptance criteria:

- [x] ADR uses the repository's accepted ADR format.
- [x] It states that the milestone diagnoses unsupported constructs rather than
      proving all accepted text correct.
- [x] It states that no user text is normalized or rewritten.
- [x] It defines the exact three codes and precedence.
- [x] It defines the exact evidence-property vocabulary.
- [x] It defines lone-surrogate indexing behavior.
- [x] It defines the JSON Pointer root and examples.
- [x] It defines visible versus hidden behavior.
- [x] It defines the 16-match and 128-record caps.
- [x] It defines the Unicode source/version policy.
- [x] It defines package/schema/manifest/renderer version impact.
- [x] It records that npm publication is not a release dependency.
- [x] ADR index links to ADR 0009.
- [x] Documentation-only gates pass.

### PR 2: Unicode data and offline generation

Status: complete

Dependencies: PR 1

Work:

- Add Unicode license and source checksum records.
- Add the offline generator and generated range tables.
- Add `text-layout-data:update` and `text-layout-data:verify` scripts.
- Include required Unicode attribution in package/license verification.

Acceptance criteria:

- [x] Regeneration is byte-identical.
- [x] Verification detects stale generated output.
- [x] Checksum, malformed-range, overlap, and ordering negatives pass.
- [x] Generated vertical ranges exactly match
      `Decomposition_Type=Vertical`.
- [x] No runtime or generator network fetching exists.
- [x] Required license material is included by `npm pack --dry-run`.

### PR 3: Public string analyzer

Status: complete

Dependencies: PR 2

Work:

- Implement `analyzeTextLayoutSupport`.
- Export the diagnostics version, types, and function from the root API.
- Add focused unit tests.

Acceptance criteria:

- [x] Classification corpus passes.
- [x] Scalar indexes are correct with astral prefixes.
- [x] Lone surrogates advance the scalar index once without emitting matches.
- [x] Evidence property values match the public union exactly.
- [x] Ordering, precedence, deduplication, and truncation are exact.
- [x] Messages contain no raw controls or user text.
- [x] Invalid runtime input throws `INVALID_TEXT_INPUT`.
- [x] Strict TypeScript and package export checks pass.

### PR 4: Document collector and inspection

Status: complete

Dependencies: PR 3

Work:

- Add the exhaustive semantic text collector.
- Add `DesignInspection.textLayout`.
- Cover every text-bearing schema field and hidden-layer behavior.

Acceptance criteria:

- [x] Every semantic field has a positive and negative test.
- [x] Field paths are exact document-rooted JSON Pointers, including text,
      statistic, and chart examples.
- [x] Layer and field ordering is deterministic.
- [x] The 128-record cap and total count are correct.
- [x] New layer variants fail compilation until handled.

### PR 5: Quality, rendering, CLI, and isolation integration

Status: complete

Dependencies: PR 4

Work:

- Map visible diagnostics into document quality issues.
- Block before asset/font resolution.
- Verify existing CLI reporting.
- Verify direct and isolated error propagation.

Acceptance criteria:

- [x] Unsupported visible text fails with outer
      `QUALITY_VALIDATION_FAILED`.
- [x] Nested issues retain exact diagnostic codes and paths.
- [x] Hidden unsupported text does not block rendering.
- [x] Diagnostics run before missing asset/font resolution.
- [x] Direct, isolated, and CLI paths agree.
- [x] No SVG, PNG, fingerprint, or manifest is created for blocked input.

### PR 6: Fixtures, determinism, security, and package consumption

Status: complete

Dependencies: PRs 3–5

Work:

- Add LTR success and bidi/control/vertical failure fixtures.
- Add a committed two-process diagnostic determinism probe.
- Extend Node 22/24 CI and packed-package consumption.
- Run visual, example, security, isolation, and full resource regressions.

Acceptance criteria:

- [x] Fixture verification includes exact expected inner codes.
- [x] Two fresh processes produce byte-identical diagnostic JSON and SHA-256.
- [x] Node 22 and 24 agree.
- [x] Existing exact PNG baselines remain unchanged.
- [x] Existing tracked SVG/PNG examples and fingerprints remain unchanged.
- [x] Fresh tarball JavaScript, strict TypeScript, CLI, and isolated consumers
      pass.
- [x] Security-negative and worst-case bounded-input tests pass.

### PR 7: Release metadata and documentation reconciliation

Status: complete

Dependencies: PRs 1–6

Work:

- Add the minor Changeset.
- Update README, architecture, lifecycle, quality policy, fonts, limitations,
  roadmap, versioning, and release process.
- Reconcile the full implementation plan with actual `0.2.0` state.
- Clarify historical audit-version wording without rewriting audit evidence.

Acceptance criteria:

- [x] Every public export and diagnostic code is documented.
- [x] CLI validation/inspection/render semantics are explicit.
- [x] Unicode source/version/licensing policy is documented.
- [x] The next roadmap item becomes the offline CLI resource bundle.
- [x] npm publication remains optional and owner-controlled.
- [x] All stale planning claims listed below are addressed.

## Test matrix

### Unit

- [x] ASCII is supported.
- [x] Accented LTR text is supported.
- [x] Emoji is supported.
- [x] Ordinary horizontal CJK without a rejected classification is supported.
- [x] Standalone Arabic-Indic digits follow the locked policy.
- [x] Hebrew and Arabic strong-direction text are rejected.
- [x] Mixed LTR/RTL text is rejected.
- [x] Every bidi-control family is rejected.
- [x] Mongolian, Phags-pa, and `Decomposition_Type=Vertical` scalars are
      rejected.
- [x] Astral-prefix scalar indexes are correct.
- [x] Empty input is supported.
- [x] Lone surrogates advance `scalarIndex` once, emit no match, and do not
      crash the analyzer.
- [x] Ordering, precedence, deduplication, and caps are exact.

### Integration

- [x] Every semantic text field is collected.
- [x] Multiple fields and codes aggregate deterministically.
- [x] Hidden versus visible behavior is correct.
- [x] Text diagnostics run before missing resource errors.
- [x] Existing quality aggregation and warning behavior remain intact.

### Fixtures

- [x] LTR render-success fixture.
- [x] Strong-bidi quality-failure fixture.
- [x] Bidi-control quality-failure fixture.
- [x] Vertical-primary quality-failure fixture.
- [x] Fixture metadata records exact expected inner codes.

### Determinism

- [x] Fixed corpus serialized in two fresh processes.
- [x] Result bytes and SHA-256 match exactly.
- [x] Node 22 and Node 24 results agree.

### Visual and pixel

- [x] Existing four exact PNG baselines pass without update.
- [x] Existing eight tracked SVG/PNG examples remain byte-identical.
- [x] Existing successful fingerprints remain unchanged.
- [x] Any unexpected pixel difference stops the milestone for version review.

### Security-negative

- [x] No network or dynamic-execution primitive is introduced.
- [x] Invisible controls are not emitted raw in messages or CLI output.
- [x] Maximum-sized accepted documents remain bounded.
- [x] Diagnostic evidence cannot grow without limit.
- [x] Unicode generator rejects unexpected checksums and corrupt ranges.
- [x] Runtime never reads Unicode source files.

### Isolation

- [x] Direct and isolated rendering retain the outer error code.
- [x] Nested diagnostic details survive child-process serialization.
- [x] Timeout, memory, permissions, and serialization behavior remain unchanged.

### Package consumer

- [x] Fresh tarball install succeeds.
- [x] Strict TypeScript imports all new public types.
- [x] JavaScript imports and runs the public analyzer.
- [x] CLI inspect exposes text-layout JSON.
- [x] CLI render rejects unsupported visible text.
- [x] Internal module paths remain inaccessible.

### Documentation

- [x] README example typechecks.
- [x] Public names and diagnostic codes match source.
- [x] CLI behavior matches tests.
- [x] Unicode version and policy match generated data.
- [x] Limitations do not imply RTL or vertical rendering support.

## Risks

### False positives

Script membership does not always imply desired writing direction. Keep the
initial vertical policy narrow and do not classify all CJK as vertical.

### False negatives

This is not a complete bidi or shaping-conformance engine. Documentation must
say "known unsupported constructs detected", not "all accepted text is proven
correct".

### Unicode drift

Runtime behavior must depend on pinned generated tables rather than the host
ICU or Unicode version.

### Diagnostic amplification

The 16-match and 128-record caps are mandatory. Total counts remain available
without retaining every record.

### Control-character spoofing

Use numeric code points and fixed messages. Never echo raw controls.

### Schema field drift

The exhaustive semantic-layer collector must make future variants a compile
failure until explicitly classified.

### Version ambiguity

The ADR must distinguish the successful-output renderer version from the
diagnostic acceptance-policy version.

## Release-blocking decisions for PR 1

- [x] Confirm Unicode `17.0.0` as the initial pinned data version.
- [x] Confirm Mongolian, Phags-pa, and exact
      `Decomposition_Type=Vertical` scalars as the initial narrow
      vertical-primary policy.
- [x] Confirm that ordinary horizontal CJK without a rejected classification is
      accepted.
- [x] Confirm that standalone Arabic-Indic digits are accepted.
- [x] Confirm bidi-control precedence over other classifications for the same
      scalar.
- [x] Confirm 16 evidence matches per diagnostic.
- [x] Confirm 128 document diagnostic records.
- [x] Confirm inspection of hidden layers with `blocksRender: false`.
- [x] Confirm `inspect` exits zero and automation reads `renderable`.
- [x] Confirm no design-schema or manifest version bump.
- [x] Confirm renderer remains `0.2.0` if successful output bytes and
      fingerprints do not change.
- [x] Confirm package minor release `0.3.0`.
- [x] Confirm npm publication is not a milestone exit criterion.

## Milestone exit gates

- [x] ADR 0009 and the diagnostic-code contract are accepted.
- [x] No release-blocking decision remains open.
- [x] Unicode generation and licensing verification are reproducible offline.
- [x] Unit, integration, fixture, determinism, visual, security-negative,
      isolation, CLI, and packed-consumer tests pass on Node 22 and 24.
- [x] Existing accepted SVG/PNG bytes and fingerprints are unchanged, or the
      work has been explicitly re-scoped with appropriate version bumps.
- [x] `npm ci` passes.
- [x] `npm run build` passes.
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes, including the security scan.
- [x] `npm test` passes.
- [x] `npm run test:coverage` passes existing thresholds.
- [x] `npm run fixtures:verify` passes.
- [x] `npm run examples:verify` passes.
- [x] `npm run licenses:verify` passes.
- [x] `npm audit --audit-level=low` passes.
- [x] `npm pack --dry-run` passes.
- [x] A fresh local tarball consumer passes strict TypeScript, SDK, CLI, and
      isolated-render checks.
- [x] A minor Changeset describes the public exports and new rejection
      behavior.
- [x] Documentation and roadmap are reconciled.
- [x] Registry publication is not required.

## Stale planning claims to update in PR 7

- [x] Replace `pnpm` with the repository's actual npm workflow in
      `docs/full-implementation-plan.md`.
- [x] Replace the old TypeBox recommendation with the accepted Zod 4 decision.
- [x] Replace the aspirational SDK and CLI lists with actual exports and
      commands.
- [x] Mark the Core `0.1.0` milestone and immediate backlog as
      historical/completed.
- [x] Insert this `0.3.0` milestone after the audit closure.
- [x] Update the old product claim to the current asset-origin-aware
      `PRODUCT_CLAIM`.
- [x] Separate signed source/local-tarball release readiness from optional npm
      publication in `docs/release-process.md`.
- [x] Preserve accepted ADR history; use ADR 0009 or a dated note to explain
      that ADR 0005's old glyph-coverage limitation is historical.
- [x] Preserve audit metrics as historical evidence while clarifying that its
      "package remains 0.1.0" statement predates the signed `v0.2.0` release.

## Tracking summary

- [x] PR 1: ADR and contract decisions
- [x] PR 2: Unicode data and offline generation
- [x] PR 3: Public string analyzer
- [x] PR 4: Document collector and inspection
- [x] PR 5: Quality, rendering, CLI, and isolation integration
- [x] PR 6: Fixtures, determinism, security, and package consumption
- [x] PR 7: Release metadata and documentation reconciliation
- [x] Milestone exit gates complete
- [ ] Signed source release prepared
- [ ] npm publication considered separately by the owner
