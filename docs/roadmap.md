# Roadmap

## Core `0.4.0` candidate

Changesets versioning has materialized Core `0.4.0`, App `0.0.2`, and the style
showcase `0.0.1` in release commit `52fbd04`. There is no signed `v0.4.0` tag at
`HEAD`, so this remains an unreleased candidate. It contains:

- deterministic Thai segmentation and balanced wrapping, schema `1.2.0`
  `keepTogether`, renderer `0.3.0`, and manifest `1.2.0` typography provenance;
- preserved 9:16 TikTok carousel-ad templates plus the schema `1.3.0`, 3:4
  organic-photo composition; and
- a validated `1.0.0` CLI [resource-bundle format](resource-bundles.md) for
  bounded offline raster assets and fonts. Bundle paths are explicit operator
  intent, never design data, and the adapter adds no network or
  dynamic-execution capability.

Feature scope is frozen until release qualification is complete. See the
[Core next-feature release plan](plans/core-next-features.md) for the release
blockers, version ownership, and exit gates.

## Core after `0.4.0`

Implementation of the first `0.5.0` vertical slice is tracked in the
[brand-fidelity slice plan](plans/core-0.5-brand-fidelity-vertical-slice.md) and
[ADR 0015](adr/0015-image-led-brand-fidelity.md). It covers schema 1.4 type
roles, focal crops/treatments, composited contrast proof, and one reviewed
image-led campaign family. Color-profile normalization and three-brand product
acceptance remain milestone work; this is not yet the complete `0.5.0` exit
gate.

1. Brand and asset fidelity: real font roles, logo/image slots, deterministic
   focal crops and treatments, color normalization, composited contrast, and an
   image-led campaign family.
2. Campaign systems: machine-readable template families, named composition
   variants, content-length profiles, deterministic seed derivation, and layout
   evidence for multi-format and carousel coordination in the App.
3. AI-ready production contracts: browser-safe authoring metadata, strict
   candidate-document validation, and designer-actionable quality evidence.
   The first Core-only slice now publishes exact-template metadata, bounded
   issue actions, and deterministic candidate validation. Model calls,
   resource-backed proof, lock/vary interaction, and acceptance workflows
   remain App responsibilities.
4. Market-led horizontal multilingual production, prioritizing RTL or CJK from
   real campaign demand. Vertical typography remains a separate later track.
5. Specialized campaign content and accessible output, including charts only
   when real data-story briefs justify a concrete template family.
6. Compatibility and capability tooling before a feature-frozen `1.0.0`.

Browser SVG parity may progress in parallel when it materially improves preview
and comparison speed. Signed provenance/C2PA remains outside the pure renderer
and must not displace creative-production value.

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

The implementation does not make App Alpha released or production-verified.
The remaining gate is integrated qualification: the full repository matrix,
real-PostgreSQL migration/concurrency/isolation tests, a fresh Compose
create-to-export run, live scanner readiness/update checks, reverse-proxy HTTPS,
and a stopped-writer database-plus-filesystem backup/restore drill. Status and
the exact gate are tracked in [the App Alpha plan](plans/app-alpha.md).

## App work after Alpha qualification

1. Designer-control foundation: make admitted fonts, logos, images, crop intent,
   typography roles, template variants, and proof overlays practical in the
   manual workflow.
2. Campaign systems: option boards, duplicate/branch, side-by-side comparison,
   lock/vary controls, coordinated format/carousel packs, and batch proof/export
   bundles while retaining one immutable design revision per canvas.
3. Optional LLM brief interpretation as an untrusted producer of several
   structured candidate directions. Manual mode remains first-class; every
   candidate passes Core validation, and selective regeneration preserves human
   locks independently of model claims.
4. Review and approval: comments or annotations, exact visual revision
   comparison, approval state tied to a fingerprinted revision, and an approval
   receipt in the campaign handoff.
5. Operator administration and retention controls for completed jobs, artifacts,
   resource admissions, and audit export.
6. A multi-host object-storage adapter only when a supported deployment needs
   it; Core will still receive explicit bytes and no remote URL.

Glyphkiln Cloud, billing, managed multi-tenancy, autoscaling orchestration, a
freeform editor, uploaded active SVG, and render-time network fetching are not
part of App Alpha.
