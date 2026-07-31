# Glyphkiln Ecosystem: Full Implementation Plan

## 1. Executive summary

Glyphkiln will be developed as three related but independently deployable products:

1. **`glyphkiln-core`**
   An Apache-2.0 open-source TypeScript package containing deterministic rendering, schemas, templates, procedural graphics, export logic, provenance, an SDK, and a CLI.

2. **`glyphkiln-app`**
   A self-hostable web application built on `glyphkiln-core`. App Alpha provides
   authentication, workspaces, immutable brand snapshots, safe resource
   admission, constrained manual design controls, saved revisions, previews,
   and synchronous/asynchronous export. Optional LLM-based brief interpretation
   is a later milestone.

3. **Glyphkiln Cloud**
   A managed commercial service built around the same application and rendering contracts. It will add hosted infrastructure, teams, billing, usage limits, managed storage, asynchronous rendering, enterprise security, collaboration, integrations, and support.

The implementation should proceed in that order:

```text
glyphkiln-core
→ independent verification
→ glyphkiln-app
→ self-hosted verification
→ Glyphkiln Cloud
→ commercial beta
```

Do not begin cloud-specific work until the public Core API and design-document contract have stabilized.

**Current execution status (2026-07-31):** signed Core `v0.3.0` and the bounded
offline resource-bundle milestone are complete. App Alpha feature code is
substantially complete in the existing Next.js workspace. Its remaining gate is
integrated release qualification against real PostgreSQL and the documented
Compose topology, including migration, scanner, TLS, and backup/restore drills.
See [the App Alpha execution plan](plans/app-alpha.md).

---

# 2. Product objective

Glyphkiln should turn structured content and creative direction into reproducible business graphics using conventional code-rendering techniques.

The core rendering flow is:

```text
Manual controls or optional LLM interpretation
→ validated DesignDocument
→ versioned template
→ deterministic procedural geometry
→ brand and asset resolution
→ vector scene
→ SVG
→ PNG rasterization
→ quality report
→ provenance manifest
```

The accurate product claim is:

> Composed without generative image models and rendered deterministically from
> code; included asset origins are reported separately.

The system must not:

- Generate final pixels with diffusion models, GANs, text-to-image systems, or image-to-image systems
- Execute arbitrary user JavaScript
- Execute model-generated rendering code
- Fetch arbitrary remote resources during rendering
- Remove or falsify provenance
- Advertise classifier evasion or platform-detection avoidance
- Claim that uploaded assets were not AI-generated when their origin is unknown

---

# 3. Guiding architecture principles

## 3.1 Determinism

The same rendering inputs must produce identical output within a pinned renderer environment.

The determinism boundary includes:

- Design-document contents
- Design-document schema version
- Seed and seed-algorithm version
- Template ID and version
- Procedural algorithm IDs and versions
- Renderer name and version
- Font files and hashes
- Asset files and hashes
- Canvas dimensions
- Export options
- Relevant renderer configuration
- Native rasterizer version

Timestamps, database IDs, user IDs, and other non-pixel metadata must not affect the render fingerprint.

## 3.2 Structured generation

The renderer accepts validated data rather than arbitrary code.

```text
Untrusted input
→ runtime validation
→ normalized internal representation
→ fixed template registry
→ fixed procedural registry
→ render
```

An optional LLM adapter may create a candidate `DesignDocument`, but the result must pass exactly the same validation path as manually authored input.

## 3.3 Vector-first output

Use SVG as the canonical intermediate format.

Advantages:

- Inspectable output
- Natural support for geometry and typography
- Scalable exports
- Straightforward procedural graphics
- Content-addressed caching
- Consistent PNG rasterization
- Easier security inspection than browser-rendered HTML

PNG is generated from the validated SVG output.

## 3.4 Stable contracts, replaceable infrastructure

Core domain contracts must not depend on:

- Authentication
- Databases
- Cloud storage
- Billing
- Job queues
- HTTP frameworks
- Browser frameworks
- A specific hosting provider

The application and cloud products should consume Core through its public API rather than import private modules.

## 3.5 Constrained design quality

Glyphkiln should prioritize a focused library of approved composition systems.

Version one should not attempt to become a fully freeform graphic-design editor.

The system should generate a narrower range of graphics reliably rather than a broad range inconsistently.

---

# 4. Product and workspace boundaries

Core and App now share the public Glyphkiln npm-workspaces repository. They
remain independently deployable products with explicit package boundaries.
Glyphkiln Cloud remains private and outside this repository.

## 4.1 Workspace: `packages/glyphkiln-core`

**Visibility:** Public
**Recommended license:** Apache-2.0
**Primary package:** `@glyphkiln/core`
**CLI:** `glyphkiln`

### Responsibilities

- Design-document schemas
- Format registry
- Brand snapshot model
- Seeded randomness
- Canonical JSON serialization
- Render fingerprints
- Renderer-neutral scene primitives
- SVG construction
- PNG rasterization
- Typography measurement
- Font resolution
- Asset resolution interfaces
- Procedural background algorithms
- Versioned templates
- Quality checks
- Render manifests
- CLI
- Public SDK
- Fixtures
- Visual baselines
- Documentation

### Explicit non-responsibilities

- User accounts
- Workspaces
- Database persistence
- Hosted storage
- Upload endpoints
- Billing
- API rate limits
- Job queues
- Social publishing
- Team collaboration
- Live LLM APIs
- Cloud deployment logic

---

## 4.2 Workspace: `apps/glyphkiln-app`

**Visibility:** Public
**Recommended license:** AGPL-3.0 with legal review
**Possible commercial license:** Offered separately

### Responsibilities

- Browser interface
- Authentication
- Users and workspaces
- Brand-kit management
- Safe raster/font admission with independent host scanning
- Font registration
- Design creation and editing
- Structured control editor
- Saved designs
- Render requests
- Local render workers
- Render and export history
- Self-hosted object storage adapters
- Optional LLM adapters
- Local deployment
- Administration
- Workspace permissions

### Internal structure

```text
apps/glyphkiln-app/
  src/
    app/
    features/
    lib/

# Added as later milestones justify independent runtimes:
apps/glyphkiln-api/
apps/glyphkiln-worker/
packages/app-auth/
packages/app-database/
packages/app-storage/
packages/app-queue/
packages/app-core-adapter/
packages/app-ui/
packages/app-config/
packages/app-testing/
```

The initial application is one Next.js workspace. API, worker, and reusable
application packages should be extracted only when they become independently
useful. Every application workspace should import only documented exports from
`@glyphkiln/core`.

---

## 4.3 External repository: `glyphkiln-cloud`

**Visibility:** Private
**License:** Proprietary

### Responsibilities

- Managed multi-tenant deployment
- Subscription plans
- Billing
- Usage metering
- Render quotas
- Hosted object storage
- Managed job queues
- Autoscaling workers
- Team subscriptions
- Enterprise identity
- SAML SSO
- SCIM
- Audit exports
- Data-retention controls
- Regional deployment
- SLA monitoring
- Private templates
- Approval workflows
- Webhooks
- Public API keys
- Integrations
- Customer support tools
- Feature entitlements

### Boundary rule

Glyphkiln Cloud must not maintain a private fork of the Core renderer.

Cloud-specific capabilities should integrate through:

- Public Core APIs
- Application provider interfaces
- Feature-entitlement checks
- Private service packages
- External service adapters

---

# 5. Selected technical architecture

## 5.1 `glyphkiln-core`

### Language and tooling

- TypeScript
- Node.js LTS
- ESM package output
- npm with a committed `package-lock.json`
- Vitest
- ESLint
- Prettier
- Changesets
- GitHub Actions
- Exact direct dependency versions
- Committed lockfile

### Schema validation

**Accepted:** Zod 4 strict runtime schemas with draft 2020-12 JSON Schema export.

Zod owns runtime validation and TypeScript inference. Ajv remains a development
conformance consumer for the exported JSON Schema rather than a second runtime
schema implementation. See ADR 0002.

Requirements:

- JSON Schema 2020-12
- `additionalProperties: false`
- Discriminated layer unions
- Explicit schema version
- Explicit template version
- Useful validation paths
- Cross-field validation after structural validation
- Generated schema committed for external consumers
- Schema-drift test in CI

### Rendering

**Recommended:** direct SVG scene generation followed by `resvg-js` for PNG output.

`resvg-js` exposes the Rust-based resvg renderer through Node.js and WebAssembly backends, providing a focused SVG-to-raster boundary.

Rendering pipeline:

```text
DesignDocument
→ normalized render model
→ template layout
→ scene graph
→ serialized SVG
→ SVG safety validation
→ resvg
→ PNG bytes
```

### Typography

Initial implementation:

- Explicit font-file registration
- Font-family registry
- Font hash calculation
- Width measurement
- Line wrapping
- Explicit line-break support
- Long-token splitting
- Font-size fitting
- Text-to-path conversion for production SVG
- Structured layout records
- Overflow issues
- Safe-area checks

Default production SVG should outline text.

A future editable-SVG mode may preserve `<text>` elements only when font embedding and licensing are handled explicitly.

### Seeded randomness

Use:

- SHA-256 for string-seed normalization
- Versioned xoshiro or SplitMix-derived PRNG
- Named random namespaces
- Independent streams per algorithm and layer

Example namespaces:

```text
template/product-announcement
background/flow-field
background/flow-field/particle/0042
layer/decorative-grid
variant/0002
```

Named streams prevent unrelated template changes from altering every downstream random choice.

---

## 5.2 `glyphkiln-app`

### Web frontend

**Recommended:** Next.js App Router with TypeScript.

The App Router provides file-based routing and supports server and client component boundaries.

Use Next.js for:

- Application shell
- Project and design pages
- Authentication UI
- Brand editor
- Graphic editor
- Render galleries
- Export UI
- Administration
- Server-rendered public pages

The manual path may request a synchronous preview/export, but Core rendering
still runs through the isolated child-process contract. Durable exports use the
separate worker entry point.

### API

**App Alpha selection:** Next.js Route Handlers in the existing application
workspace.

Routes remain thin adapters over a deep `AppWorkflow` module with closed,
application-owned runtime-validated command and query unions. Authentication,
authorization ordering, workspace-qualified resolution, persistence
transactions, and Core error mapping live behind that boundary. Extract a
separate API workspace only when it becomes independently deployable or useful.

Important security rule:

Route schemas must be application-owned static schemas. Never allow users or
LLM output to supply executable validation schemas.

### Database

**App Alpha selection:** PostgreSQL with checked-in SQL migrations and a narrow
query/transaction interface.

The production adapter uses the PostgreSQL driver. Tests use PGlite as a
PostgreSQL-compatible local substitute while running the same migration SQL.
Real PostgreSQL migration, concurrency, and isolation runs remain release gates;
PGlite success must not be represented as production-database verification.

Use PostgreSQL from the beginning of `glyphkiln-app` rather than starting with SQLite and later rewriting tenancy, locking, JSON querying, and job state.

### Queue

**App Alpha selection:** PostgreSQL durable queue, plus an in-memory adapter for
focused workflow tests.

The PostgreSQL provider owns idempotent enqueue, per-workspace outstanding-job
capacity, persisted fair workspace scheduling, atomic claims, leases, bounded
attempts/retries, exhaustion, attempt history, and terminal output metadata.
Queue rows contain opaque stored identities, never documents, bytes, paths,
callbacks, modules, or URLs.

Redis and BullMQ are not dependencies of the supported Alpha topology. A later
Cloud or high-throughput deployment can add an adapter only when its operational
need is demonstrated.

### Object storage

Resource blobs and render blobs use separate narrow immutable-storage
interfaces. App-generated workspace-partitioned content-addressed keys are the
only keys accepted; callers cannot request deletion, arbitrary paths, remote
URLs, or signed URLs through the render boundary.

The supported Alpha adapter is a shared local POSIX filesystem, with in-memory
test adapters. Reads are bounded and verify type, length, and SHA-256; writes
publish immutable bytes atomically and reject symlink path components. A later
multi-host deployment may add an S3-compatible adapter, but MinIO/S3 is not a
hidden Alpha dependency.

---

## 5.3 Glyphkiln Cloud

### Runtime topology

```text
CDN
  ↓
Web application
  ↓
API service
  ├── PostgreSQL
  ├── Redis
  ├── Object storage
  ├── Billing provider
  └── Event/webhook system
         ↓
Render queues
         ↓
Isolated CPU workers
         ↓
Immutable exports and manifests
```

### Observability

Use OpenTelemetry for traces and metrics across the API, queue, and workers. OpenTelemetry provides JavaScript instrumentation for traces, metrics, and logs, and can export through a collector to different observability backends.

Required trace linkage:

```text
HTTP request
→ render request
→ queue job
→ worker attempt
→ Core render
→ object-storage writes
→ database completion
```

---

# 6. Core domain model

## 6.1 Design document

```ts
interface DesignDocument {
  schemaVersion: "1.0.0";
  id: string;
  name: string;
  format: FormatId;
  dimensions: Dimensions;
  seed: string;
  brand: BrandSnapshot;
  template: TemplateReference;
  layers: DesignLayer[];
  metadata?: DesignMetadata;
}
```

## 6.2 Brand snapshot

```ts
interface BrandSnapshot {
  id: string;
  version: string;
  name: string;
  defaultMode: "light" | "dark";
  palette: BrandPalette;
  typography: BrandTypography;
  spacing: SpacingScale;
  radii: RadiusScale;
  density: number;
  safeArea: SafeArea;
  preferredStyles: ProceduralStyleId[];
  prohibitedColors: string[];
  prohibitedStyles: string[];
}
```

The design stores an immutable snapshot, not only a mutable brand ID.

## 6.3 Layer types

Initial layer union:

- Background layer
- Procedural layer
- Text layer
- CTA layer
- Logo layer
- Asset layer
- Icon layer
- Badge layer
- Shape layer
- Statistic layer
- Chart layer
- Footer layer
- Attribution layer

Each layer requires:

- Stable ID
- Discriminator
- Visibility
- Z-order or document order
- Optional normalized bounds
- Layer-specific properties

## 6.4 Template reference

```ts
interface TemplateReference {
  id: "product-announcement" | "statistic-card" | "quote-card" | "article-cover";
  version: string;
}
```

Template versions are immutable.

A rendering behavior change requires a new template version.

## 6.5 Render manifest

```ts
interface RenderManifest {
  manifestVersion: string;
  renderId: string;
  designDocumentId: string;
  designDocumentHash: string;
  renderFingerprint: string;
  seed: string;
  template: TemplateReference;
  renderer: RendererReference;
  proceduralAlgorithms: AlgorithmReference[];
  assets: AssetProvenance[];
  fonts: FontProvenance[];
  dimensions: Dimensions;
  outputs: OutputProvenance[];
  qualityIssues: QualityIssue[];
  generativeImageModelUsed: false;
  renderingMethod: "deterministic-code-rendering";
  claim: string;
  createdAt: string;
}
```

---

# 7. Application domain model

App Alpha entities:

- User
- Session
- Workspace
- WorkspaceMembership
- WorkspaceInvitation
- BrandKit
- BrandSnapshot
- ResourceBlob
- ResourceAdmission
- ResourceIngestionEvent
- Design
- DesignRevision
- RenderJob
- RenderAttempt
- RenderOutput
- AuditEvent

Prompt interpretations, API keys, webhook endpoints, billing/usage records,
managed entitlements, and Cloud tenant records are later product entities, not
placeholder App Alpha tables.

## Important relationships

```text
Workspace
├── Members
├── Invitations
├── Brand kits
│   └── Immutable brand snapshots
├── Resource admissions
│   ├── Immutable raster/font metadata
│   ├── Ingestion events
│   └── Content-addressed blobs
├── Designs
│   └── Immutable revisions + exact resource-admission pins
└── Render jobs
    ├── Attempts
    └── Immutable outputs + manifests
```

Brand snapshots, design revisions, resource admissions, ingestion events, render
attempts, and completed output metadata are append-only. A membership remains
as a provenance record after terminal soft revocation. See
[the domain language](../CONTEXT.md) and
[ADR 0014](adr/0014-app-alpha-lifecycle-and-capacity-invariants.md).

---

# 8. Implementation milestones

## Current Core state

Milestones 0–6 and the original Core `0.1.0` backlog are historical and
complete. Signed `v0.2.0` and `v0.3.0` releases passed independent
verification. Package `0.3.0` added deterministic Unicode 17.0.0 text-layout
diagnostics while preserving accepted output bytes, renderer `0.2.0`, schema
`1.0.0`, manifest `1.1.0`, and all template and procedural versions. The
validated offline CLI resource-bundle milestone was completed next without
changing those render-version contracts. Current Core work is tracked in
`docs/roadmap.md`.

## Milestone 0: Governance and repository foundation

### Objective

Create the project boundaries, licensing model, naming, contributor process, and release conventions before implementation expands.

### Work

#### `glyphkiln-core`

- Create public repository
- Add Apache-2.0 license
- Define trademark policy separately
- Reserve npm organization and package name
- Add contribution guidelines
- Add security policy
- Add code of conduct
- Configure branch protection
- Configure automated dependency updates
- Configure Changesets
- Configure CI
- Define supported Node versions
- Add ADR template
- Add issue templates
- Add pull-request template

#### Ecosystem

- Create architecture-boundary document
- Define Core/App/Cloud dependency direction
- Define compatibility policy
- Define public versus private packages
- Decide contributor-license strategy with legal review
- Register domains and official organization accounts

### Exit criteria

- Repositories exist
- Licensing is explicit
- CI skeleton passes
- Package naming is reserved
- Architectural boundaries are documented

---

## Milestone 1: `glyphkiln-core` foundation

### Objective

Establish the package, schema, determinism utilities, and public contracts.

### Workstreams

#### Tooling

- Initialize TypeScript
- Configure strict compiler settings
- Configure ESM output
- Configure package exports
- Configure CLI binary
- Add linting and formatting
- Add Vitest
- Add coverage
- Add lockfile
- Add package dry-run test
- Add temporary-consumer package test

#### Format registry

Implement:

- LinkedIn landscape: 1200 × 627
- Instagram square: 1080 × 1080
- Instagram portrait: 1080 × 1350
- Instagram story: 1080 × 1920
- X landscape: documented default
- YouTube thumbnail: 1280 × 720

#### Determinism

- Seed normalization
- Versioned PRNG
- Named random streams
- Variant-seed derivation
- Canonical JSON
- SHA-256 fingerprints
- Stable numerical serialization
- Test vectors

#### Schema

- DesignDocument 1.0.0
- Strict nested schemas
- Layer discriminators
- Brand snapshot
- Asset references
- Template references
- Procedural parameters
- Quality issues
- Render manifest
- Generated JSON Schema

### Exit criteria

- Design documents can be created and validated
- Unknown fields are rejected
- Seed test vectors pass across processes
- Fingerprints are stable
- Generated schema matches source schema
- Package can be imported from a temporary consumer

---

## Milestone 2: SVG renderer foundation

### Objective

Produce deterministic SVG and PNG for basic compositions.

### Work

#### Scene model

Implement primitives for:

- Group
- Rectangle
- Rounded rectangle
- Circle
- Ellipse
- Line
- Polyline
- Polygon
- Path
- Gradient
- Clip path
- Mask
- Image
- Outlined text
- Transform

#### SVG serializer

Requirements:

- Stable attribute ordering
- Stable element ordering
- Deterministic numeric precision
- Deterministic IDs
- XML escaping
- No active content
- No external references
- Correct dimensions and viewBox
- Output validation

#### Rasterization

- Integrate resvg-js
- Configure fonts explicitly
- Validate output dimensions
- Validate PNG signature
- Record rasterizer version
- Add malformed-SVG tests

#### Asset resolver

- Caller-provided bytes
- Asset hash verification
- MIME verification hooks
- Dimension metadata
- No URL fetching
- No arbitrary paths

### Exit criteria

- Basic SVG and PNG export succeeds
- Same input produces identical bytes
- Unsupported fonts fail clearly
- Missing assets fail clearly
- SVG active-content tests pass
- PNG dimensions are correct

---

## Milestone 3: Typography and layout

### Objective

Make business copy render reliably within template constraints.

### Work

- Load font files
- Hash font files
- Measure text
- Preserve explicit line breaks
- Wrap words
- Split oversized tokens
- Fit text within min/max font sizes
- Enforce maximum line counts
- Calculate text boxes
- Detect overflow
- Detect safe-area violations
- Calculate contrast
- Preserve logo aspect ratio
- Produce structured layout reports

### Required fixtures

- Short headline
- Long headline
- Very long word
- Explicit line breaks
- Missing subtitle
- Empty optional copy
- Unsupported font
- Unicode text
- Low-contrast palette
- Maximum text length

### Exit criteria

- No fixture escapes the canvas
- Overflow produces structured errors or warnings
- Unsupported fonts never silently fall back
- Line-count limits are enforced
- Contrast failures are reported
- Typography tests are deterministic

---

## Milestone 4: Procedural background engine

### Objective

Implement four polished, deterministic procedural systems.

### Algorithms

1. Flow fields
2. Layered waves
3. Topographic contour lines
4. Recursive rectangular subdivision

### Shared API

```ts
interface ProceduralInput {
  width: number;
  height: number;
  seed: string;
  palette: string[];
  mode: "light" | "dark";
  intensity: number;
  density: number;
  complexity: number;
  contrast: number;
  quietRegion?: NormalizedBox;
}
```

### Required behavior

- Stable algorithm version
- Seeded output
- Separate random namespace
- Quiet-region attenuation
- Finite coordinates
- Canvas clipping
- Palette compliance
- Light and dark modes
- Parameter-effect tests

### Exit criteria

For every algorithm:

- Same input produces identical output
- Seed changes output
- Intensity changes output
- Density changes output
- Complexity changes output
- Contrast changes output
- Quiet region measurably reduces detail
- Algorithm version appears in manifest and fingerprint

---

## Milestone 5: Initial template set

### Objective

Implement the four MVP composition systems.

## Template 1: Product announcement

Content:

- Eyebrow
- Headline
- Subtitle
- CTA
- Logo
- Product screenshot or mock
- Procedural background
- Footer

Layout branches:

- Landscape
- Square
- Portrait
- Story

## Template 2: Statistic card

Content:

- Eyebrow
- Large statistic
- Statistic label
- Delta
- Supporting copy
- Optional chart
- Source
- Logo

## Template 3: Quote card

Content:

- Quote
- Attribution
- Role or company
- Optional portrait or logo
- Decorative quotation mark
- Procedural background

## Template 4: Article cover

Content:

- Category
- Headline
- Description
- Author or publication
- Optional image
- Logo
- Publication date

### Every template requires

- Stable ID
- Semantic version
- Supported formats
- Required-layer rules
- Format-specific layouts
- Safe areas
- Headline limits
- Optional-layer behavior
- Light and dark fixtures
- Determinism tests
- Visual baselines
- Documentation

### Exit criteria

- All four templates produce valid SVG and PNG
- Each has a visibly distinct composition
- Landscape and portrait branches are reviewed
- Required fixtures pass
- Template versions affect fingerprints
- Visual baselines are committed

---

## Milestone 6: Core SDK, CLI, provenance, and release candidate

### Public SDK

Current primary exports include:

```ts
analyzeTextLayoutSupport;
createDesignDocument;
inspectDesignDocument;
renderGraphic;
renderGraphicIsolated;
validateDesignDocument;
verifyRenderReproduction;
```

### CLI

Commands:

```text
glyphkiln validate <design>
glyphkiln inspect <design>
glyphkiln render <design> --format <svg|png> --output <path>
glyphkiln --version
```

### Provenance

- Generate manifest
- Verify file hashes
- Preserve asset-origin metadata
- Verify design-document hash
- Record font hashes
- Record procedural versions
- Record renderer versions
- Record output sizes and hashes

### Documentation

- README
- Architecture
- Determinism contract
- Schema specification
- Template guide
- Background guide
- Font guide
- Asset guide
- Provenance guide
- Security guide
- Visual-regression guide
- Versioning policy
- Release process
- Known limitations
- Roadmap
- ADRs

### Historical exit criteria for Core 0.1.0

```text
npm ci
npm run build
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run examples:verify
npm pack --dry-run
```

Also required:

- External consumer package succeeds
- CLI examples succeed
- Four example designs regenerate
- Manifest verification succeeds
- Independent verification report reaches at least “pass with minor findings”

---

# 9. `glyphkiln-app` implementation

Active implementation began from the signed Core `v0.3.0` state. The detailed,
current status is maintained in
[the App Alpha execution plan](plans/app-alpha.md).

## Milestone 7: Application foundation

Feature status: complete. Operational Compose verification: pending.

- The existing Next.js workspace contains the UI, thin API Route Handlers,
  `AppWorkflow`, PostgreSQL adapters/migrations, and a separately compiled worker
  entry point. No Fastify workspace was extracted.
- Bootstrap and email/password invitation registration use Argon2id. Sessions
  and invitations use CSPRNG tokens stored only as hashes.
- Same-origin and session-bound CSRF checks protect mutations. Password work is
  bounded by concurrent/global/trusted-source admission budgets.
- Users can create workspaces and issue/accept expiring, single-use invitations.
- A centralized owner/admin/editor/viewer capability matrix protects every
  workspace command, query, binary upload, download, and worker reload.
- Owner-only membership listing, role changes, and soft revocation preserve
  provenance, protect the final active owner, and invalidate the target user's
  sessions.
- Closed command/query results provide structured errors without disclosing
  foreign object existence.
- Web and worker import only public `@glyphkiln/core` exports and require the
  migration registry to be current.

OAuth and OpenAPI output are not App Alpha requirements. Owner grant/transfer
and membership reactivation are explicitly deferred.

---

## Milestone 8: Brand and asset management

### Brand features

- A brand kit is a named lineage.
- Every publication appends a server-identified, Core-validated immutable
  snapshot.
- Light/dark palette, typography, spacing, safe-area, style, and logo metadata
  are whatever the pinned Core `BrandSnapshot` schema admits.
- Editing never mutates an existing snapshot; old revisions retain the exact
  snapshot and canonical hash they used.
- Saved revisions append workspace-qualified pins to the exact selected resource
  admissions. App-owned document metadata binds their IDs, hashes, origins, and
  licenses into the canonical document and manifest without changing pixels.

### Asset ingestion

- Direct upload only
- File-signature verification
- MIME verification
- Full PNG/JPEG decode validation
- Uploaded SVG rejected; no sanitizer boundary
- Dimension limits
- Pixel-count limits
- File-size limits
- Workspace-partitioned SHA-256 blob addressing
- Immutable selectable admission identity separate from blob identity
- Same-workspace duplicate relationship without provenance overwrite
- Append-only exact revision-resource pins with workspace/kind constraints
- Fail-closed host malware-scanner interface and ClamAV `INSTREAM` adapter
- Scanner-signature freshness validation
- Immutable origin, license, actor, and scan metadata
- Per-workspace scan concurrency, admission-count, and stored-byte limits
- Workspace-qualified ownership and resolution

### Font ingestion

- TTF and OTF/CFF individual faces only
- Owner/admin/editor-controlled registration
- License metadata
- Immutable font versions
- Font hashes
- Complete parser/metrics validation
- Explicit byte resolution during render

Font collections, WOFF/WOFF2, remote font URLs, and deletion/deactivation of
referenced versions remain outside Alpha.

Feature status: complete with focused upload, quota, storage-integrity,
duplicate-provenance, and workspace-isolation tests. Live ClamAV and real
PostgreSQL qualification remain pending.

---

## Milestone 9: Design creation flow

### Required UX

1. Authenticate and select or create an authorized workspace
2. Select or publish an immutable brand snapshot
3. Select format
4. Enter content
5. Select admitted raster/font resources when needed
6. Manually construct a bounded structured draft
7. Inspect Core validation and preview proof
8. Save an immutable revision
9. Reopen the exact revision
10. Revise from the expected head
11. Export PNG, SVG, and per-output manifests synchronously, or enqueue the
    stored revision for the durable worker

### Manual mode

Works with no LLM integration or key.

Controls:

- Template
- Format
- Theme
- Procedural style
- Quiet region
- Intensity
- Density
- Complexity
- Contrast
- Seed
- Headline
- Subtitle
- CTA
- Assets
- Logo
- Attribution
- Statistic
- Footer

### Optional LLM adapter

Deferred until after Alpha qualification. If later implemented, retain this
contract:

```ts
interface BriefInterpreter {
  interpret(input: BriefInput): Promise<unknown>;
}
```

Rules:

- Output is treated as unknown
- Validate with Core
- Reject unknown template versions
- Never execute generated code
- Store input, provider, model, response hash, validation result, and accepted normalized document
- Manual mode remains first-class

### Current result

- The browser completes create → preview → save → reopen → revise →
  SVG/PNG/manifest without an LLM.
- Draft, saved revision, and rendered proof are visually distinct states.
- Invalid structured output and foreign resources cannot reach the renderer.
- Reopen returns stored normalized bytes instead of reconstructing from current
  brand state.
- Synchronous output/manifest relationships and the complete HTTP workflow have
  focused automated coverage.

---

## Milestone 10: Self-hosted application release

### Self-hosting package

Implemented topology:

- Web and worker Dockerfiles
- Docker Compose
- PostgreSQL queue and application state
- Shared POSIX filesystem resource/render storage
- ClamAV scanner with an independently updating signature service
- Next.js API and web
- Separate worker runtime
- Migration command
- Health checks
- Backup guide
- Upgrade guide
- Environment reference
- Reverse-proxy example
- TLS guidance

Redis, BullMQ, MinIO, and S3 are not required by the supported Alpha topology.
Web, worker, and migration paths use distinct database roles.

Compose configuration validation and a narrow local-PostgreSQL role/grant smoke
have passed. The images and fresh-volume workflow have not been exercised
because a Docker daemon was unavailable; that operational gate remains open.

### Deferred administration

- Cross-workspace installation administration
- Storage use
- Queue dashboards
- Failed render inspection
- Font management
- Template registry
- Data export
- Data deletion

The product workflow includes workspace creation, invitations, member listing,
role changes, and revocation. The broader operator console and retention/deletion
features above are post-Alpha work.

### Remaining exit criteria for App Alpha

- [ ] Fresh Compose installation succeeds with a ready scanner.
- [ ] Complete queued create-to-export E2E passes against real PostgreSQL.
- [x] Worker retry, exhaustion, lost-lease, and authorization behavior has
      focused automated coverage.
- [ ] Stopped-writer PostgreSQL-plus-filesystem backup and restore is exercised.
- [ ] Real-PostgreSQL workspace isolation and queue/admission concurrency tests
      pass.
- [ ] Reverse-proxy HTTPS and non-loopback startup checks pass.
- [ ] The integrated repository build/typecheck/lint/test/coverage/Core
      verification matrix passes.
- [ ] Security review has no unresolved critical finding and documentation
      still matches the tested deployment.

---

# 10. Glyphkiln Cloud implementation

Start Cloud after real users have validated the self-hosted application workflow.

## Milestone 11: Cloud control plane

### Infrastructure

- Managed PostgreSQL
- Managed Redis
- S3-compatible object storage
- CDN
- API autoscaling
- Dedicated render-worker pools
- Secret manager
- Container registry
- Infrastructure as code
- Staging and production environments
- Automated migrations
- Rollback procedure

### Multi-tenancy

- Workspace tenant ID on every tenant-owned row
- Authorization at service layer
- Database constraints
- Tenant-aware storage keys
- Tenant-aware queue payloads
- Audit events
- Cross-tenant access tests

### Render processing

Job lifecycle:

```text
queued
→ claimed
→ validating
→ rendering
→ validating output
→ uploading
→ completed
```

Failure states:

```text
validation_failed
asset_failed
font_failed
render_failed
output_failed
storage_failed
cancelled
exhausted
```

### Worker isolation

- No public inbound access
- Outbound network disabled by default
- Read-only container filesystem
- Temporary writable directory
- CPU limits
- Memory limits
- Job timeout
- Asset size limits
- Process recycling
- Dependency and container scanning

---

## Milestone 12: Billing and usage

### Initial plans

#### Community

- Self-hosted
- Core templates
- Local rendering
- Community support

#### Creator

- Managed hosting
- Individual account
- Limited brand kits
- Included render allowance
- Premium templates
- Cloud history

#### Studio

- More brands
- Batch generation
- API access
- Private templates
- Higher usage allowance

#### Team

- Multiple members
- Shared assets
- Roles
- Approvals
- Audit history
- Higher limits

#### Enterprise

- SSO
- SCIM
- Dedicated infrastructure
- Data residency
- SLA
- Custom retention
- Support
- Private deployment

### Metering events

- Render requested
- Render completed
- Render failed
- Export downloaded
- Storage bytes
- API request
- Batch row processed
- User seat
- Premium-template use

Usage events must be idempotent and separate from billing calculations.

### Entitlements

Use an internal entitlement model rather than scattering plan-name checks.

```ts
interface Entitlements {
  maxMembers: number;
  maxBrandKits: number;
  monthlyRenders: number;
  batchGeneration: boolean;
  apiAccess: boolean;
  privateTemplates: boolean;
  approvalWorkflow: boolean;
  auditLogs: boolean;
  sso: boolean;
}
```

---

## Milestone 13: Team workflow

Implement:

- Comments
- Review requests
- Approval status
- Locked revisions
- Approved-template versions
- Brand-rule enforcement
- Role-based publishing permission
- Audit history
- Shareable previews
- Expiring external review links

A design approved at revision 12 must not silently change when revision 13 is created.

---

## Milestone 14: API, batch, and integrations

### Public API

- API keys
- Scoped permissions
- Idempotency keys
- Rate limits
- Render creation
- Status lookup
- Export retrieval
- Webhook delivery
- Webhook signing
- Retry policy
- Usage reporting

### Batch generation

Inputs:

- CSV
- JSON
- Spreadsheet import
- API collection

Features:

- Row validation
- Preview sample
- Dry run
- Partial failure handling
- Retry failed rows
- Export archive
- Per-row manifest

### Initial integrations

Prioritize:

1. Webhooks
2. Zapier or generic automation adapter
3. CMS integration
4. Scheduling-platform integration
5. Figma asset import
6. Direct social publishing

Direct publishing should come after stable export and approval workflows.

---

# 11. Testing strategy

## 11.1 Core

### Unit tests

- Schemas
- Seeded randomness
- Canonical JSON
- Fingerprints
- Color functions
- Geometry
- Layout
- Typography
- Contrast
- Asset resolution
- Manifest verification

### Determinism tests

Matrix:

- Four templates
- Four procedural styles
- Three formats
- Light and dark themes
- Two seeds

Run in separate processes and compare:

- SVG hashes
- PNG hashes
- Fingerprints
- Render-relevant manifest fields

### Visual regression

- Baselines generated in pinned container
- Exact hash checks in same environment
- Explicit baseline-update command
- Baseline design and manifest stored together
- Pull-request artifact showing old and new outputs
- Human review required before updates

### Security tests

- Unknown schema properties
- Active SVG content
- External references
- Remote asset URL
- Path traversal
- Dynamic execution scan
- Unsupported fonts
- Oversized dimensions
- Excessive procedural complexity
- Malformed asset bytes

---

## 11.2 Application

- Closed command/query and HTTP adapter unit tests
- PGlite-backed workflow and repository integration tests
- Migration registry, forward/rollback, and append-only constraint tests
- Real-PostgreSQL migration, concurrency, and isolation qualification
- Resource/render storage integrity and symlink-boundary tests
- PostgreSQL and in-memory queue behavior tests
- Durable outstanding-capacity and fair workspace-scheduling tests
- Workspace-isolation and indistinguishable foreign/missing tests
- Authentication admission, CSRF, session, invitation, role, final-owner, and
  soft-revocation tests
- Upload signature/MIME/decode/limit/scanner/quota/duplicate-provenance tests
- Worker retry, exhaustion, lease loss, requester revocation, disabled-user, and
  archived-workspace tests
- Complete no-LLM create/save/reopen/revise/export HTTP flow
- Fresh Compose create-to-queued-export smoke test
- Stopped-writer PostgreSQL-plus-filesystem backup-and-restore drill

PGlite is useful for fast PostgreSQL-compatible tests but does not satisfy the
real-PostgreSQL or container release gates by itself.

---

## 11.3 Cloud

- Tenant-isolation penetration tests
- Billing-event idempotency tests
- Entitlement tests
- Queue-failure tests
- Worker-timeout tests
- Regional-storage tests
- Disaster-recovery exercises
- Load tests
- Webhook replay tests
- API rate-limit tests
- SSO and SCIM tests
- Audit-log completeness tests

---

# 12. Security plan

## Core security boundary

Core receives:

- Parsed design data
- Explicit font files
- Explicit asset bytes
- Renderer options

Core must not:

- Fetch URLs
- Read user-selected filesystem paths
- Run subprocesses based on document values
- Load modules based on template IDs
- Evaluate code
- Resolve external SVG resources
- Execute scripts

## Application security boundary

Application is responsible for:

- Authentication
- Authorization
- Workspace ownership
- Upload validation
- Independent host malware scanning
- Authentication and expensive-work admission control
- Durable workspace resource and outstanding-job quotas
- CSRF protection
- Session security
- File limits
- Database isolation
- Workspace-qualified authenticated downloads
- Worker reauthorization
- Immutable object-path and hash verification

App Alpha accepts only PNG/JPEG rasters and individual TTF/OTF faces. It rejects
uploaded SVG instead of claiming a sanitizer boundary. A clean Core decode is
not a malware-scanner verdict. In-process authentication/scan concurrency limits
must not be represented as globally distributed rate limiting when more than one
web replica is deployed.

## Cloud security boundary

Cloud additionally owns:

- Secret rotation
- Tenant isolation
- Encryption
- Worker sandboxing
- Audit trails
- Abuse prevention
- Billing integrity
- Operational security
- Incident response
- Data retention
- Regional controls

---

# 13. Provenance roadmap

## MVP

JSON render manifest with hashes.

## Version 1

- Manifest verification command
- Signed application-level manifest
- Asset-origin declarations
- Optional inspection of existing content credentials
- Provenance UI

## Later

- C2PA signing
- Protected signing keys
- Certificate lifecycle
- Verification service
- Credential display
- Preservation of uploaded credentials
- Export policies by workspace

C2PA should enhance the manifest system rather than replace it.

---

# 14. Versioning and compatibility

## Core package

Use semantic versioning.

### Patch

- Bug fix with unchanged rendering output
- Documentation
- Error-message improvement
- Non-rendering performance improvement

### Minor

- New template
- New procedural style
- New optional schema property
- New output format
- New public SDK function

### Major

- Schema-breaking change
- Public API break
- Seed-algorithm change
- Existing template behavior change without a retained old version
- Manifest-breaking change

## Renderer behavior

Do not silently change pixels under the same combination of:

```text
template ID
template version
renderer version
algorithm version
seed version
```

Old template versions may be deprecated but must remain available while saved designs depend on them.

## App compatibility

`glyphkiln-app` should declare an explicit compatible Core range.

CI should test:

- Minimum supported Core version
- Current Core version
- Next Core release candidate where practical

---

# 15. Deployment strategy

## Local Core development

No external services.

```text
Node.js
font fixtures
asset fixtures
resvg
```

## Self-hosted application

Supported App Alpha Docker Compose topology:

```text
reverse proxy (operator profile)
  → Next.js web + API routes
     ├─ PostgreSQL application state + durable queue
     ├─ shared POSIX resource/render storage
     └─ internal ClamAV scanner
worker
  ├─ PostgreSQL claims + authorization state
  └─ shared POSIX resource/render storage

one-shot migration service → PostgreSQL
signature updater → ClamAV signature volume
```

Migration, web, and worker use distinct database roles. Redis and a remote
object store are not required. The topology is feature-complete but remains
subject to the fresh-install, live-scanner, TLS, and backup/restore release
qualification in the App Alpha plan.

## Cloud

Containers deployed independently:

```text
web
api
worker-small
worker-large
webhook-delivery
billing-consumer
scheduler
migration-job
```

Render workers should scale based on:

- Queue depth
- Oldest queued-job age
- Average job duration
- Worker CPU
- Worker memory

Do not scale only on API traffic.

---

# 16. Observability requirements

## Logs

Structured JSON logs containing:

- Request ID
- Trace ID
- Workspace ID
- User ID
- Render ID
- Variant ID
- Job ID
- Template ID and version
- Renderer version
- Duration
- Cache result
- Error code

Avoid logging:

- Full design copy by default
- Asset bytes
- Font bytes
- Authentication tokens
- Signed URLs
- Private API keys

## Metrics

- Render duration
- Queue wait time
- Queue depth
- Render success rate
- Render failure rate by code
- Cache-hit rate
- PNG and SVG sizes
- Worker memory
- Worker CPU
- Asset upload failures
- API latency
- Webhook delivery success
- Usage-event lag

## Traces

Trace complete render lifecycles from API through storage.

---

# 17. Performance and caching

## Core cache key

Include:

- Canonical design document
- Seed
- Template version
- Renderer version
- Algorithm versions
- Asset hashes
- Font hashes
- Dimensions
- Relevant export configuration

## Application cache layers

Potential later optimizations:

1. In-process font cache
2. In-process parsed-asset cache
3. Content-addressed render-result cache
4. Multi-host object-storage pixel cache
5. CDN immutable export cache

App Alpha does not depend on Redis or a CDN cache. Any cache remains
workspace-qualified and must verify immutable hashes before use.

## Immutable output paths

Use content-addressed keys:

```text
renders/{fingerprint}/graphic.png
renders/{fingerprint}/graphic.svg
renders/{fingerprint}/manifest.json
```

Render database records may have unique IDs while referencing shared immutable export objects.

---

# 18. Suggested delivery sequence

## Phase A: Core alpha

Deliver:

- Schemas
- Seed system
- SVG primitives
- One procedural style
- Product-announcement template
- SVG export
- PNG export
- CLI

Purpose:

Prove the complete vertical rendering path early.

## Phase B: Core beta

Add:

- Remaining templates
- Remaining procedural styles
- Typography hardening
- Quality checks
- Provenance
- SDK stabilization
- Visual baselines

## Phase C: Core release candidate

Complete:

- Packaging
- Consumer test
- Security review
- Determinism matrix
- Independent verification
- Documentation

## Phase D: App alpha

Deliver:

- Authentication, invitations, roles, and membership revocation
- Workspace isolation
- Immutable brand snapshots
- Safe raster/font admission
- Manual no-LLM design flow
- Append-only saved revisions
- Synchronous isolated preview/export
- Durable PostgreSQL queue and async worker
- Shared-filesystem self-hosting topology
- Deployment and backup/restore guidance

Feature implementation is substantially complete. Integrated real-PostgreSQL,
Compose, TLS, scanner-readiness, and restore qualification remains open.

## Phase E: App beta

Add:

- Optional LLM adapter
- Installation administration and retention controls
- Richer revision/history navigation
- A multi-host storage adapter when deployment evidence requires one
- Broader constrained composition workflows
- Security hardening

## Phase F: Cloud private beta

Add:

- Managed infrastructure
- Multi-tenancy
- Billing
- Usage
- Hosted rendering
- Monitoring
- Support tools

## Phase G: Paid launch

Launch:

- Creator
- Studio
- Team plans
- Premium templates
- Batch generation
- API access

Enterprise capabilities should follow demonstrated demand.

---

# 19. Illustrative staffing and schedule

This is a planning range, not a delivery commitment.

## Small focused team

- One senior graphics/Core engineer
- One full-stack application engineer
- One backend/platform engineer
- Part-time product designer
- Part-time security or DevOps support

## Approximate phases

| Phase                                   | Typical range |
| --------------------------------------- | ------------: |
| Repository and governance               |        1 week |
| Core alpha                              |     3–5 weeks |
| Core beta                               |     3–5 weeks |
| Core verification and release candidate |     2–3 weeks |
| App alpha                               |     5–7 weeks |
| App beta and self-hosting               |     4–6 weeks |
| Cloud private beta                      |     5–8 weeks |
| Paid-launch hardening                   |     3–5 weeks |

Several application and design tasks can overlap after the Core public API stabilizes.

A single engineer should keep the same milestone order but reduce parallel scope rather than attempt all three products simultaneously.

---

# 20. Risk register

## Risk: Typography differs between environments

Mitigation:

- Immutable font files
- Font hashes
- Pinned renderer container
- Outlined SVG
- Exact visual baselines

## Risk: Core API changes while App is being built

Mitigation:

- Release Core 0.1 candidate first
- Use public package exports only
- Add compatibility tests
- Preserve template versions

## Risk: Procedural art overwhelms text

Mitigation:

- Quiet regions
- Density measurements
- Contrast checks
- Template overlays
- Reviewed parameter bounds

## Risk: Open-source hosted competitor

Mitigation:

- Strong trademark control
- Superior hosted operations
- Premium templates
- Collaboration
- Integrations
- Enterprise features
- Commercial support
- AGPL application licensing with legal review

## Risk: Render-worker abuse

Mitigation:

- Schema limits
- Asset limits
- Complexity limits
- Job timeout
- Memory limits
- Isolated workers
- No outbound network
- Rate limits

## Risk: Uploaded asset provenance is inaccurate

Mitigation:

- Preserve declared origin
- Use “unknown” when unknown
- Inspect credentials where available
- Never infer human authorship
- Distinguish final renderer from source-asset origin

## Risk: Cloud work begins before product validation

Mitigation:

- Release Core first
- Obtain self-hosted users
- Manually onboard early customers
- Build paid features only after repeated requests

---

# 21. Commercial launch strategy

## Open-source adoption

Release publicly:

- Core renderer
- CLI
- Four templates
- Four backgrounds
- Schema
- Dockerized examples
- Documentation
- Example gallery

## Early revenue

Prioritize:

- Managed Glyphkiln hosting
- Custom template services
- Brand onboarding
- Premium template packs
- Batch generation
- API access

## Later revenue

- Team workflows
- Enterprise SSO
- Dedicated workers
- Managed private deployments
- Template marketplace
- OEM licensing
- Direct publishing
- C2PA signing
- Compliance controls

The product should monetize operational convenience, scale, workflow, governance, support, and design expertise—not cripple the open renderer.

---

# 22. Release gates

## Core release gate

Do not couple the application to unversioned Core internals. The monorepo may
link the local Core workspace during development, but the same commit must pass
the packed-package consumer test and declare an explicit compatible Core range.

Core must have:

- Published or locally installable release candidate
- Frozen schema version
- Frozen seed version
- Four templates
- Four backgrounds
- Valid SVG and PNG
- Manifest verification
- Determinism matrix
- External consumer test
- Independent audit

## App release gate

App must have:

- Workspace isolation
- Safe uploads
- Manual no-LLM flow
- Saved designs
- Asynchronous render path
- Self-hosted deployment
- Backup and restore
- E2E export verification
- No critical security findings

Feature code now covers the first six items, including the durable worker path
and a supported self-hosting topology. The gate remains closed until the
integrated final matrix, real-PostgreSQL checks, fresh Compose E2E,
reverse-proxy/scanner readiness, and backup/restore drill pass. Do not infer
production verification from focused PGlite-backed tests.

## Cloud launch gate

Cloud must have:

- Multi-tenant isolation tests
- Billing-event idempotency
- Usage enforcement
- Worker isolation
- Monitoring
- Alerting
- Incident response
- Data deletion
- Support process
- Restore test
- Customer-facing status mechanism

---

# 23. Historical initial backlog

The initial Core implementation cycle completed these items in order. Current
work is tracked in `docs/roadmap.md` and dated milestone plans.

1. Initialize `glyphkiln-core`
2. Add Apache-2.0 licensing and governance files
3. Configure TypeScript, npm, linting, testing, and CI
4. Write renderer-selection ADR
5. Write schema-selection ADR
6. Implement format registry
7. Implement canonical JSON
8. Implement versioned seed algorithm
9. Add seed test vectors
10. Define DesignDocument 1.0.0
11. Generate JSON Schema
12. Add strict schema-negative tests
13. Define scene primitives
14. Implement deterministic SVG serializer
15. Add SVG security checks
16. Integrate resvg PNG output
17. Define font provider
18. Implement text measurement and wrapping
19. Define asset provider
20. Implement flow fields
21. Implement product-announcement template
22. Add first CLI render command
23. Add render fingerprint
24. Add render manifest
25. Add first visual baseline
26. Implement remaining backgrounds
27. Implement remaining templates
28. Add full determinism matrix
29. Add package-consumer test
30. Run independent implementation audit

Only after issue 30 passes should `glyphkiln-app` begin active implementation.

---

# 24. Final definition of done

The Glyphkiln ecosystem reaches its initial product objective when:

- `glyphkiln-core` is independently usable from Node.js
- Core renders four business templates
- Core implements four procedural systems
- Core exports valid SVG and PNG
- Identical inputs reproduce identical output in the pinned environment
- Render manifests verify exported files
- `glyphkiln-app` works without an LLM key
- A user can create a brand, add assets, create a design, generate variants, save it, and export it
- The self-hosted application has documented deployment and backup processes
- Glyphkiln Cloud runs the same Core renderer without a private fork
- Cloud usage and billing are auditable
- Uploaded asset origins are preserved honestly
- No arbitrary code runs in the rendering path
- The product can accurately claim:

> Composed without generative image models and rendered deterministically from
> code; included asset origins are reported separately.
