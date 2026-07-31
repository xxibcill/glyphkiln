# Roadmap

## Core completed after `0.3.0`

- A validated `1.0.0` CLI
  [resource-bundle format](resource-bundles.md) for bounded offline raster
  assets and fonts. Bundle paths are explicit operator intent, never design
  data, and the adapter adds no network or dynamic-execution capability.

## Core next

1. Broader bidi/vertical-script shaping support with explicit document controls.
2. Optional color-profile normalization. Malware scanning remains a host/App
   responsibility, not a Core feature.
3. Additional chart primitives and template versions driven by real product
   requirements.
4. A browser-compatible SVG-only adapter that preserves the same contracts.
5. Optional signed provenance/C2PA integration outside the pure renderer.

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

1. Operator administration and retention controls for completed jobs, artifacts,
   resource admissions, and audit export.
2. A multi-host object-storage adapter only when a supported deployment needs
   it; Core will still receive explicit bytes and no remote URL.
3. Broader composition systems driven by observed manual-workflow needs.
4. Optional LLM brief interpretation only as an untrusted producer of candidate
   structured data, never generated rendering code.

Glyphkiln Cloud, billing, managed multi-tenancy, autoscaling orchestration, a
freeform editor, uploaded active SVG, and render-time network fetching are not
part of App Alpha.
