# Roadmap

## Current execution status

As of 2026-08-29, Core `v0.7.0` is the tagged baseline on `main`, and App
`v0.1.0-alpha` remains the qualified application release. Core `0.7.0` adds the
versioned carousel composition and delivery/review evidence on top of the
campaign coordination, explicit color normalization, and AI-ready authoring
contracts delivered in `0.6.0`. The next Core milestone is `0.8.0`: Scene
Kernel v1. App remains unchanged for that release.

On `main`, the App implements immutable resource selectors, image-led
focal/treatment controls, admitted font-family and typography-role binding,
Core-owned proof overlays, workspace-qualified campaigns/directions/canvases/
locks, option boards, branching and comparison, deterministic campaign bundles,
a disabled-by-default provider-neutral AI proposal adapter with stored human
decisions, cross-boundary lock enforcement, and exact-revision review/comments/
approval receipts. A controlled two-brief, three-brand image-led board now
identified a shared fixed-slot logo alignment defect. The versioned
`image-led-campaign@1.0.1` correction and regenerated board pass automated proof
and reproduction checks, and the project owner approved the board on 2026-08-18.
The real Glyphkiln Core 0.6 brief now has a project-owner-approved four-format,
four-slide, seven-canvas exact revision with zero Core quality issues, exact
approval receipts, and a deterministic approved handoff. The manual campaign
product gate passed on 2026-08-19. The separate real-brief AI
interaction/threat-model gate remains.

The Core `0.6.0` release passed clean Node `24.16.0` and minimum Node `22.22.2`
qualification with npm `10.9.8`, including build, typecheck, lint/security,
tests, standalone packaging, coverage, generated-artifact verification, packed
consumption, license inventory, and a zero-vulnerability npm audit. The signed
tag, source release, and owner-approved local npm publication are complete; no
GitHub Actions workflow was used. Exact release evidence is recorded in the
[post-Alpha execution plan](plans/post-alpha-next-milestones.md#verification-snapshot-2026-08-12).

The active application sequence is tracked in the
[post-Alpha execution plan](plans/post-alpha-next-milestones.md). Designer
control, brand fidelity, the manual campaign workflow, and exact-revision review
and approval are complete. Optional AI proposals against a real brief remain an
independent App gate. They do not block or broaden Core `0.8.0`. Multilingual
work now follows Scene Kernel and still starts only after a real market brief
selects the first horizontal script slice.

## Core `0.5.0`

Core `0.5.0` advances the signed `v0.4.0` baseline with the first brand and
asset-fidelity vertical slice. It adds schema `1.4.0` typography roles,
deterministic focal crops and closed image treatments, composited contrast and
bounded layout evidence, and `image-led-campaign@1.0.0` with reviewed
landscape, square, and portrait outputs. Renderer `0.4.0` owns the shared pixel
changes; manifest `1.2.0` remains unchanged.

The implementation and contract choices are tracked in the
[brand-fidelity slice plan](plans/core-0.5-brand-fidelity-vertical-slice.md) and
[ADR 0015](adr/0015-image-led-brand-fidelity.md). The package release is a
bounded vertical slice rather than completion of the broader product milestone:
color-profile normalization and three-brand product acceptance remain follow-up
brand-fidelity work.

## Core after `0.7.0`

1. `0.8.0`: ship Scene Kernel v1 as the one bounded expert geometry and render
   seam described below.
2. Prove a later semantic illustration compiler against that seam before
   considering a separate `@glyphkiln/book` package. It must not add coordinates
   to `DesignDocument` or widen the App trust boundary.
3. Resume market-led horizontal multilingual production, prioritizing RTL or
   CJK from real campaign demand. Vertical typography remains a separate track.
4. Add specialized campaign content and accessible publication only when real
   briefs justify concrete domain and output contracts.
5. Complete compatibility and capability tooling before a feature-frozen
   `1.0.0`.

Browser SVG parity may progress in parallel when it materially improves preview
and comparison speed. Signed provenance/C2PA remains outside the pure renderer
and must not displace creative-production value.

## Core `0.8.0` — Scene Kernel v1

Scene Kernel gives expert callers one supported route for deterministic,
reviewed explicit geometry without turning the semantic `DesignDocument` into a
canvas format. The public `@glyphkiln/core/scene` subpath owns a strict
`SceneDocument 1.0.0` and one deep `renderScene` operation. It produces SVG and
PNG plus a scene-specific manifest and fingerprint.

The v1 vocabulary is deliberately closed: primitives, nested groups, closed
translate/rotate/scale transforms, closed clips, explicit-route connectors with
validated semantic endpoints, reading order, and Core-laid-out text in `outline`
or `outline-with-selectable-text` mode. Core owns validation, bounds, text and
closed marker geometry, safe serialization, rasterization, provenance, and
deterministic ordering. Callers supply inert scene data, explicit connector
routes, and explicit admitted resources.

Scene document, Scene Kernel, and scene manifest versions start at `1.0.0`.
Shared renderer identity advances from `0.4.0` to `0.5.0`; existing semantic
SVG/PNG bytes stay exact, while their fingerprints and manifest bytes
intentionally update to record the renderer identity. The semantic manifest
schema remains `1.2.0`.

Release acceptance requires schema and runtime-refinement fixtures, public
package-consumer coverage, deterministic SVG/PNG and manifest/fingerprint
proofs, malformed/adversarial scene rejection, resource-limit coverage, and
deliberate review of every new pixel baseline. Those checks are release gates,
not claims that documentation alone satisfies them.

Scene Kernel does not add arbitrary CSS, SVG import, general matrices,
callbacks, expressions, plugins, runtime component registration, automatic
layout, or domain interpretation. It does not change Glyphkiln App. A future
semantic `@glyphkiln/book` compiler, multilingual layout, PDF/tagged-PDF output,
and publication workflows remain later milestones. See
[Scene Kernel](scene-kernel.md) and
[ADR 0018](adr/0018-expert-scene-kernel.md).

## Glyphkiln App Alpha

The manual App Alpha vertical slice is implemented in the existing Next.js
workspace:

- bootstrap/invited authentication, hashed sessions, CSRF, trusted-source
  password-work admission, and owner/admin/editor/viewer authorization;
- workspace invitations plus owner-only member listing, role changes, terminal
  soft revocation, final-owner protection, and worker reauthorization;
- immutable versioned brand snapshots and append-only design revisions;
- no-LLM create → preview → save → reopen → revise → SVG/PNG/manifest flow;
- authenticated PNG/JPEG/TTF/OTF admission with fail-closed ClamAV scanning,
  immutable selectable provenance records, content-addressed filesystem blobs,
  exact revision-resource pins, scan concurrency bounds, and durable workspace
  quotas;
- a durable PostgreSQL render queue with idempotency, leases, bounded retries,
  per-workspace outstanding capacity, fair workspace scheduling, and an async
  worker that reloads and reauthorizes exact stored state;
- the supported PostgreSQL/shared-filesystem/ClamAV self-hosting topology and
  operator documentation.

App Alpha is release-qualified for the documented single-host topology. The
2026-08-09 pass covered the full repository matrix, real PostgreSQL 17.6
migration/concurrency/isolation, fresh Compose create-to-export, live scanner
update/readiness, reverse-proxy HTTPS, and a stopped-writer
database-plus-filesystem restore. Exact evidence is recorded in the
[App Alpha qualification](qualification/app-alpha-2026-08-09.md); scope and
limitations remain tracked in [the App Alpha plan](plans/app-alpha.md).

## App work after Alpha qualification

1. Designer-control foundation: make admitted fonts, logos, images, crop intent,
   typography roles, template variants, and proof overlays practical in the
   manual workflow. Resource selectors, focal/treatment controls, immutable
   typography-role binding, and evidence overlays are implemented; multi-brand
   qualification and human visual acceptance are complete.
2. Campaign systems: option boards, duplicate/branch, side-by-side comparison,
   lock/vary controls, coordinated format/carousel packs, and batch proof/export
   bundles while retaining one immutable design revision per canvas. The
   workspace-qualified persistence, interaction, exact-revision canvas, lock
   enforcement, and bundle layers are implemented; real-brief product
   qualification passed on 2026-08-19.
3. Optional LLM brief interpretation as an untrusted producer of several
   structured candidate directions. Manual mode remains first-class; every
   candidate passes Core validation, and selective regeneration preserves human
   locks independently of model claims. The disabled-by-default adapter and
   stored decision boundary are implemented; real-brief acceptance remains.
4. Review and approval: comments or annotations, exact visual revision
   comparison, approval state tied to a fingerprinted revision, and an approval
   receipt in the campaign handoff. The exact-revision comments, transitions,
   comparison, immutable approval evidence, and handoff inclusion are
   implemented.
5. Operator administration and retention controls for completed jobs, artifacts,
   resource admissions, and audit export.
6. A multi-host object-storage adapter only when a supported deployment needs
   it; Core will still receive explicit bytes and no remote URL.

Glyphkiln Cloud, billing, managed multi-tenancy, autoscaling orchestration, a
freeform editor, uploaded active SVG, and render-time network fetching are not
part of App Alpha.
