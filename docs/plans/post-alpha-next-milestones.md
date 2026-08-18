# Post-Alpha next-milestone execution plan

Status: active

Started: 2026-08-12

Baseline: `origin/main` at `60919f5`

Primary tracks: `packages/glyphkiln-core`, `apps/glyphkiln-app`

## Outcome

Turn the qualified manual Alpha into a campaign-production workflow without
weakening the deterministic renderer or App trust boundary:

```text
admit exact brand resources
-> author and prove one canvas
-> branch and coordinate a campaign
-> optionally request proposal-only AI directions
-> preserve human locks
-> review and approve exact revisions
-> export a verified campaign handoff
```

Each slice must remain useful without an LLM. One `DesignDocument` remains one
canvas, Core receives explicit verified bytes, and campaign/review state remains
workspace-qualified App metadata.

## Release 1: Core 0.6.0 contract foundation

Status: signed source release complete; npm publication pending

- [x] Publish immutable campaign-family metadata for exact template versions.
- [x] Publish deterministic direction/canvas seed derivation with stable scope
      keys.
- [x] Publish exact-template authoring and actionable-issue metadata.
- [x] Validate bounded candidate documents through the normal Core boundary.
- [x] Map bounded render evidence to designer-facing actions.
- [x] Add provider-neutral proposal-response and normalized lock validators in
      the App.
- [x] Prepare Core `0.6.0`, App `0.0.5`, and showcase `0.0.3` package metadata
      and changelogs.
- [x] Reconcile package-lock workspace versions and dependency ranges.
- [x] Complete Node `24.16.0` build, typecheck, lint/security, test, coverage,
      generated-artifact, packed-consumer, tarball-content, license, and audit
      qualification with npm `10.9.8`.
- [x] Repeat from a clean install on the minimum supported Node `22.22.2`
      release with npm `10.9.8`.
- [x] Create and verify the signed source tag. Signed `v0.6.0` points to
      qualified commit `60919f5` and is published as a GitHub source release.
- [ ] Publish to npm only through the owner-approved protected workflow.

This release deliberately changes no design schema, template pixels, renderer,
manifest, fingerprint, SVG, or PNG output.

## Slice 2: designer-control and brand-fidelity closure

Status: started

### Core

- [x] Accept an ADR for a bounded explicit color-normalization policy.
- [x] Add a pure normalizer that accepts explicit PNG/JPEG bytes, applies
      orientation and a pinned sRGB policy, returns canonical PNG bytes, and
      reports source/output hashes and dimensions.
- [x] Reject malformed, conflicting, duplicate, or oversized color-profile
      declarations before unbounded profile work.
- [x] Keep normalization outside `renderGraphic`; callers opt in before creating
      a new immutable resource admission and document.
- [x] Run focused unit, security, license, build, and fresh packed-consumer
      verification for the Node child-process boundary.
- [x] Qualify the exact normalization vectors on the supported Node/platform
      release matrix; CMYK remains an explicit stable rejection until a bounded
      decoder exposes raw CMYK samples. Evidence is recorded in the
      [color-normalization qualification](../qualification/color-normalization-2026-08-16.md);
      the record passed reviewer sign-off on 2026-08-18.
- [x] Finalize crop, safe-area, contrast, and text-bound evidence needed by the
      App overlay.

### App

- [x] Add explicit raster-upload normalization that retains source and output
      hashes in a new immutable admission without rewriting prior resources.
- [x] Query selectable immutable font, logo, and image admissions without
      exposing storage paths or bytes.
- [x] Add explicit resource selectors to the manual draft.
- [x] Add keyboard-accessible focal-point controls and closed image treatments.
- [x] Bind admitted font families and bounded display/body/label roles through
      immutable brand snapshots while preserving the legacy default path.
- [x] Show proof overlays derived from Core evidence rather than recomputing
      geometry in the browser.
- [x] Publish every resource or brand change as a new admission, brand snapshot,
      or design revision.

### Gate

Two reviewed image-led briefs, three visibly different brand snapshots, real
multi-weight fonts, logo variants, and portrait/landscape photography must
produce approved landscape, square, and portrait outputs without Figma repair.

## Slice 3: manual campaign workflow

Status: implementation complete; runtime and product gates closed pending a
reviewed qualification record

- [ ] Approve one campaign brief requiring at least four formats and a
      multi-slide series.
- [x] Add workspace-qualified campaigns, directions, canvases, ordering, and
      lock metadata with forward/rollback migrations.
- [x] Add option boards, duplicate/branch, and side-by-side proof comparison.
- [x] Persist canonical closed server-owned lock IDs separately from documents.
- [x] Enforce those locks at every future adaptation or proposal-acceptance
      boundary.
- [ ] Add brief-backed composition variants and content-length profiles only
      where the selected campaign demonstrates repeatable behavior.
- [x] Coordinate exact format and carousel canvases while retaining one immutable
      revision per canvas.
- [x] Generate a deterministic batch proof and export bundle with stable names,
      exact documents, resource pins, SVG/PNG outputs, and manifests.

Gate: one selected direction becomes a coherent four-format campaign and
multi-slide series; locks survive every adaptation; every canvas reproduces;
the verified bundle is complete and stably named.

## Slice 4: optional AI-assisted authoring

Status: implementation complete; real-brief acceptance gate pending

- [ ] Accept the implemented [AI-authoring threat model](../ai-authoring-threat-model.md)
      and an interaction prototype against a real brief.
- [x] Add one operator-configured provider adapter with server-owned credentials,
      model selection, limits, timeout, and retention disclosure.
- [x] Ask for three or four proposal-only directions using the published Core
      authoring contract.
- [x] Resolve only operator/human-selected admitted resources; never accept a
      model URL, path, trusted hash, provenance value, or storage identity.
- [x] Produce resource-backed Core proofs before a proposal can be accepted.
- [x] Persist provider/model IDs, prompt/response hashes, validation results,
      human decisions, and closed locks as App metadata.
- [x] Recheck locks at regeneration, save, queued render, and export boundaries.
- [x] Preserve the complete manual path and allow the adapter to remain disabled.

Gate: one real brief yields at least three schema-valid, visibly distinct
directions; selective regeneration preserves every lock; no model output
bypasses admission, authorization, Core validation, or human acceptance.

## Slice 5: review, approval, and handoff

Status: exact-revision state and evidence foundation implemented

- [x] Add revision-bound comments or bounded annotations.
- [x] Add exact visual revision comparison.
- [x] Add `in-review`, `changes-requested`, and `approved` transitions with
      capability and stale-head checks.
- [x] Bind approval to the exact revision, resource pins, fingerprints, and
      output hashes.
- [x] Include an approval receipt in the campaign bundle and label unapproved
      output accurately.

## Slice 6: market-led multilingual production

Status: blocked by product input, not implementation

Choose horizontal RTL or CJK only from a funded/approved campaign brief with
licensed fonts. Before adding either, deepen the split typography path into one
internal layout operation owning direction, segmentation, shaping, measurement,
outlines, bounds, and issues. Require explicit language/script data, pinned
offline conformance data, exact new baselines, and byte-identical legacy output.

## Verification required at every handoff

```text
npm run build
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run text-layout-data:verify
npm run fixtures:verify
npm run schema-conformance:verify
npm run examples:verify
npm run licenses:verify
npm run test:package-consumer
```

Pixel-affecting work additionally requires the narrowest renderer, template, or
algorithm version bump plus reviewed design/SVG/PNG/manifest baselines. App
schema work requires paired forward/rollback migrations, workspace-qualified
constraints, allowed/denied workflow coverage, and production-shaped
PostgreSQL tests where concurrency or SQL semantics matter.

## Verification snapshot: 2026-08-12

Node `24.16.0` and npm `10.9.8` passed the five mandatory root gates. The full
run covered 296 Core tests plus isolation/determinism/README consumers, 453 App
tests with four intentional real-environment skips, the standalone App package,
and four showcase tests. Coverage completed at 83.10% Core statements, 87.36%
App statements, and 92.27% showcase lines.

Text-layout data, fixtures, schema conformance, identity assets, reviewed
examples, 31 production-license records, the fresh packed consumer, and the
Core tarball dry run all verified. `npm audit --audit-level=low` reported zero
vulnerabilities. No render baseline changed. PGlite migration and PostgreSQL
adapter/queue tests passed in the App suite. At that earlier snapshot, the
destructive opt-in real PostgreSQL qualification remained a release-environment
check because no `GLYPHKILN_REAL_POSTGRES_DATABASE_URL` was configured.

The completed campaign/review slice's automated software gates were then
qualified on both Node `24.16.0` and an exact disposable Node `22.22.2` runtime
with npm `10.9.8`. This does not satisfy the still-pending real-brief product
qualification. A clean
`npm ci`, build, typecheck, security/lint/format, full tests, coverage,
text-layout data, fixtures, schema conformance, identity, reviewed examples,
licenses, packed consumer, and Core tarball dry run passed on the minimum
runtime. The current suite covers 316 Core tests, 466 App tests with four
intentional real-environment skips, and four showcase tests. Coverage completed
at 84.13% Core statements, 86.75% App statements, and 92.27% showcase lines.
Four destructive opt-in concurrency and isolation checks also passed against a
disposable loopback PostgreSQL 15 qualification database.
