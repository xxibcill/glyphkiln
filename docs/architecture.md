# Architecture

Glyphkiln Core remains a single ESM package with internal module boundaries and
curated public entry points. It lives in the Glyphkiln npm workspace
beside the independently useful application runtime. The workspace coordinates
development, but the application consumes Core only through its package exports.
See [ADR 0010](adr/0010-glyphkiln-monorepo.md).

## Pipeline

```text
untrusted JSON
  → iterative byte/depth/entry resource preflight
  → strict DesignDocument 1.4.0 validation (plus supported legacy schemas)
  → format + template registry lookup
  → required-layer, brand, and pinned Unicode text-layout quality checks
  → bounded caller-supplied asset/font verification
  → explicit versioned template, focal crop, and closed image treatment
  → deterministic scene primitives plus bounded crop/contrast/layout proof
  → shaped glyph outlines + generated safe SVG
  ├─→ SVG bytes
  └─→ Resvg with explicit font files → PNG bytes
       → canonical fingerprint + provenance manifest
```

The renderer is vector-first. Templates operate on semantic layers and emit a
small renderer-neutral scene (`rect`, `circle`, `path`, `text`, and embedded
image). SVG serialization is owned by Core. PNG is a rasterization of those
same SVG bytes, not a separate layout implementation.

## Renderer recommendation

| Option             | Strength                                                        | Initial concern                                                                               |
| ------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Direct SVG + Resvg | Auditable output, deterministic geometry, shared SVG/PNG layout | Core owns layout and text wrapping                                                            |
| Satori + Resvg     | Familiar component layout                                       | HTML/CSS subset and Yoga behavior add an abstraction not needed by four constrained templates |
| Skia Canvas        | High-quality mature drawing                                     | Native surface, primarily raster, and harder SVG equivalence                                  |
| Browser rendering  | Broad CSS support                                               | Large nondeterministic runtime surface, sandboxing, and operational weight                    |
| Node Canvas        | Familiar canvas API                                             | Native dependencies, raster-first architecture, and platform font discovery                   |

Direct SVG scene generation plus pinned `@resvg/resvg-js` was selected. Font
measurement, shaping, coverage checks, and outlines use `fontkit`; successful
SVG contains glyph paths rather than recipient-dependent text. Resvg receives
only explicitly loaded font files and has system-font loading disabled. The
tradeoff is that Core owns text layout and
supports a deliberately small visual vocabulary. If richer layout becomes
necessary, a scene-to-Satori or scene-to-Skia adapter can be evaluated without
changing the design document, template metadata, asset interface, or manifest.

## Meaningful ownership boundaries

- `schema`: untrusted-data contract and JSON Schema export
- `resources`: iterative input guards and the public worker profile
- `isolation`: serialized, permission-limited child-process rendering
- `formats`: centralized immutable output dimensions
- `seed` and `cache`: stable randomness, canonical JSON, and fingerprints
- `campaigns`: browser-safe family capabilities and deterministic direction/canvas
  seed derivation; no campaign persistence or multi-canvas renderer
- `authoring`: browser-safe exact-template capabilities, bounded candidate
  validation through the normal schema/template/quality path, and a fixed
  quality-to-action mapping; no model adapter or creative-direction selection
- App `server/ai-authoring`: provider-neutral validation of unknown proposal
  envelopes plus server-owned lock comparison across Core-normalized base and
  candidate documents; proposal-only output, no model SDK, model-supplied lock
  paths, resource authority, persistence, rendering, or publication
- `browser`: browser-safe authoring/campaign metadata, canonical JSON,
  fingerprint payloads, actionable issue mapping, and pure focal crop geometry
  for independent response verification and App overlays
- `fonts`, `assets`, `typography`, `layout`: verified resources, focal-cover and
  composited-raster contrast policy, pinned
  Unicode 17 text-layout diagnostics, deterministic Thai segmentation and
  balanced wrapping, and geometry
- `backgrounds`: deterministic versioned algorithms
- `templates`: concrete composition policy
- `renderer`: scene, SVG serialization, PNG rasterization, quality gating
- `provenance`: externally serializable manifest
- `cli`: filesystem adapter over the SDK

The package has no Cloud client, authentication, persistence, queue, billing, or
LLM dependency.

## App Alpha architecture

App Alpha remains inside the existing Next.js workspace. Thin Route Handlers
translate HTTP into closed commands/queries; the deep `AppWorkflow` module owns
authentication, authorization ordering, workspace qualification, immutable
resolution, transactions, and Core error mapping. A separate API workspace
would not yet add an independently useful boundary.

```text
browser
  ├─ closed JSON command/query
  │    → same-origin + session/CSRF evidence
  │    → AppWorkflow
  │    → workspace-qualified PostgreSQL state
  │    ├─→ synchronous isolated Core preview/export
  │    └─→ opaque durable render-job identity
  │           → fair PostgreSQL claim + bounded lease
  │           → worker reload + authorization/integrity checks
  │           → exact admitted bytes + isolated Core render
  │           → immutable filesystem artifacts + metadata
  └─ bounded binary resource upload
       → authorize before body read
       → signature/size/dimension preflight
       → fail-closed host malware scan
       → full Core decode validation
       → immutable blob + selectable admission metadata
```

Every workspace-owned table contains `workspace_id`; lookups include it in the
predicate and composite foreign keys reject cross-workspace relationships.
Sessions store a hash of a CSPRNG token. Mutations add same-origin and
session-bound CSRF checks. Roles are resolved from current membership state on
every request, not cached in a token. Membership revocation is soft so
provenance foreign keys survive, and the worker repeats authorization after it
claims a queued job.

Brand snapshots and design revisions are append-only. A revision stores the
exact normalized `DesignDocument`, canonical hash, brand snapshot, parent,
actor, and provenance-relevant metadata. Append-only, workspace-qualified
revision-resource rows pin the exact selected admissions and are verified
against the canonical document on reopen and worker load. Reopening does not
reinterpret the draft or consult a newer brand. Browser drafts contain manual
controls and resource IDs only; the server supplies trusted versions, hashes,
origins, licenses, and complete resource declarations.

A resource blob is immutable content-addressed bytes. A resource admission is a
separate immutable, selectable origin/license/scanner assertion. Duplicate
admissions share a same-workspace blob but do not overwrite metadata, and
cross-workspace blobs never share an application key. PostgreSQL serializes
durable admission and distinct-byte quotas. Scanner/decode work is also guarded
by process-global and per-workspace fail-fast concurrency limits. Exact
admission IDs, hashes, origins, and licenses live in app-owned document metadata;
the Core manifest binds the document hash without changing pixel fingerprints.

The PostgreSQL render queue persists idempotency, leases, attempts, retries, and
terminal metadata. Enqueue is bounded by a durable per-workspace outstanding
quota. Claims choose the oldest eligible job per workspace and rotate persisted
claim order across workspaces. The supported Alpha storage adapter is a shared
POSIX filesystem; the provider boundary can gain a multi-host adapter later
without putting a URL or path into Core.

See [ADR 0011](adr/0011-app-alpha-workflow-and-trust-seams.md),
[ADR 0012](adr/0012-postgres-render-queue-and-filesystem-storage.md), and
[ADR 0014](adr/0014-app-alpha-lifecycle-and-capacity-invariants.md).

## Security boundary

Design documents contain data, never executable code. Core does not interpret
expressions, dynamically import modules, fetch URLs, or read paths named inside
a document. Cyclic, accessor-backed, non-JSON, oversized, or excessively nested
SDK values fail before recursive schema validation. The CLI reads only a bounded
input file and, when explicitly requested, a validated local
[resource bundle](resource-bundles.md). It may write an explicit command-line
output. Design data never names those paths; all filesystem roots and outputs
are operator intent.

Text-layout classification imports generated range tables compiled from
checksum-verified Unicode 17.0.0 files. Runtime classification does not consult
host ICU, locale, the filesystem, or the network. It diagnoses a narrow known
unsupported set and does not normalize, reorder, strip, or echo user text.

[`RENDER_RESOURCE_LIMITS`](resource-limits.md) defines the in-process boundary.
`renderGraphicIsolated` applies `RENDER_WORKER_PROFILE` for process memory,
timeout, concurrency, filesystem, and subprocess restrictions. Hosts may add a
container policy for kernel-level tenant, credential, and network separation.

The App admits only PNG/JPEG rasters and individual TTF/OTF faces after host
malware scanning and full validation. It does not accept uploaded active SVG,
remote resource locations, arbitrary coordinates/code, generated code, or
user-controlled imports. Core does not replace host scanning. Non-loopback App
operation remains closed until HTTPS public origin, trusted-proxy handling,
database authentication, and secure cookies are explicit.

LLM interpretation, Cloud billing/orchestration, managed multi-tenancy, and a
freeform design editor are outside App Alpha. If a later LLM adapter is added,
its output remains unknown inert data that must pass the same closed manual
workflow and Core validation boundary.

See [SECURITY.md](../SECURITY.md) for boundaries across Core, App, Cloud,
ingestion, workers, and optional LLM adapters.
