# Glyphkiln App Alpha execution plan

Status: feature and automated qualification complete; real-topology qualification active

Starting point: signed Core `v0.3.0` (`47764de`)

Primary product track: `apps/glyphkiln-app`

Last reconciled with code: 2026-07-31

## Outcome

Deliver a self-hostable, manual workflow:

```text
authenticate
→ enter an authorized workspace
→ publish an immutable brand snapshot
→ construct a bounded manual draft
→ save an append-only design revision
→ reopen the exact revision
→ preview synchronously or request a durable render
→ export SVG, PNG, and per-output manifests
→ verify reproduction
```

Core remains offline and receives only validated structured data plus explicit
admitted bytes.

## Trust boundary and non-goals

All browser, database, queue, scanner, and stored-object input is treated as
untrusted data. Browser commands cannot choose an authenticated user, role,
trusted hash, storage key, filesystem path, module, callback, or rendering
implementation. Workers reload immutable state by opaque IDs and independently
reauthorize it before supplying explicit bytes to Core.

App Alpha does not include:

- LLM or prompt interpretation;
- Glyphkiln Cloud, billing, managed multi-tenancy, or cloud orchestration;
- arbitrary user code, generated rendering code, dynamic evaluation, or
  user-controlled imports;
- render-time network fetching;
- uploaded active SVG or a purported SVG sanitizer boundary;
- a freeform design editor;
- owner grants, ownership transfer, or membership reactivation.

## Slice 1: identity and workspace authorization

Implementation: complete.

- [x] PostgreSQL forward/rollback migrations cover users, hashed sessions,
      workspaces, memberships, invitations, audit events, brand kits/snapshots,
      designs, revisions, resources, and render jobs.
- [x] Bootstrap registration, invited registration, login, logout, expiry, and
      revocation use Argon2id plus CSPRNG tokens stored only as hashes.
- [x] First-owner registration additionally requires an
      operator-provisioned bootstrap token, so the first public request cannot
      claim a fresh installation.
- [x] Closed registration/invitation failures and blocked login partitions fail
      before memory-hard password work.
- [x] Password work has bounded concurrent, global, and trusted-source admission
      budgets. Proxy-derived source evidence is accepted only in explicit trusted
      proxy mode.
- [x] Same-origin validation and session-bound CSRF proof protect mutations.
- [x] Workspace creation, expiring single-use email-bound invitations, and the
      owner/admin/editor/viewer capability matrix are centralized.
- [x] Invitation acceptance rechecks the issuer's current authority, and
      capability-losing demotion or revocation closes their pending invitations.
- [x] Per-user and installation-wide workspace creation limits prevent
      workspace fan-out from bypassing durable resource and queue policy.
- [x] Owner-only membership listing, demotion, and soft revocation preserve the
      membership row, protect the final active owner, and revoke every target-user
      session when access is removed.
- [x] Role changes take effect on the next request; queued workers also recheck
      active user, workspace, membership, and export capability.
- [x] All object lookups are workspace-qualified and missing/foreign resources
      share a non-disclosing result.
- [x] Non-loopback startup remains closed unless HTTPS public origin, trusted
      proxy mode, PostgreSQL authentication, and secure cookies are explicit.

The authorization matrix, membership lifecycle, route ordering, session
failure, invitation replay, and cross-workspace behavior have focused automated
coverage. Production PostgreSQL and reverse-proxy behavior remain release
qualification items below.

## Slice 2: immutable brand snapshots and revisions

Implementation: complete.

- [x] Publishing brand changes appends a server-identified snapshot; snapshot
      rows cannot be updated or deleted.
- [x] The browser submits a bounded `ManualDraft`, not snapshot IDs, versions,
      trusted hashes, or a complete trusted `DesignDocument`.
- [x] The workflow resolves the exact same-workspace snapshot and admitted
      resources, constructs a complete document through public Core APIs, and saves
      its canonical hash.
- [x] Design revisions are append-only and retain their normalized document,
      exact brand snapshot, parent, actor, source, resource declarations, and
      change note.
- [x] Append-only, workspace-qualified revision-resource rows pin the exact
      selected admission IDs. Document metadata repeats their hashes, origins,
      and licenses, and reopen/worker loading verifies both representations agree.
- [x] Revision creation requires the expected current head and rejects a stale
      base.
- [x] Reopen returns the stored exact document rather than rebuilding it from
      current brand state.
- [x] Database composite keys prevent cross-workspace snapshot, design,
      revision, actor, and resource relationships.

No deliberate Core pixels changed in this slice, so renderer, schema, template,
and procedural versions remain unchanged.

## Slice 3: authenticated manual workflow

Implementation: complete.

- [x] The Next.js workshop supports bootstrap, invited registration, login,
      logout, workspace selection/creation, invitation issue/accept, brand
      publication, and saved-design navigation.
- [x] Structured controls create a Core-backed preview without an LLM key.
- [x] Save, reopen exact/head revision, revise with optimistic concurrency, and
      synchronous SVG/PNG/manifest export are wired through the authenticated
      workflow.
- [x] Draft, saved revision, and last rendered proof are distinct UI states.
- [x] API error parsing preserves validation issues and rejects non-success HTTP
      responses.
- [x] The full HTTP-level create → save → reopen → revise → render/export path
      has automated coverage.

The manual UI is deliberately constrained. It is not an asset-layout canvas or
freeform editor.

## Slice 4: safe resource ingestion

Implementation: complete.

- [x] The authenticated binary route authorizes the workspace and CSRF proof
      before reading request bytes or invoking the scanner.
- [x] Only PNG, JPEG, TTF, and OTF/CFF are admitted. Active SVG, collections,
      WOFF/WOFF2, URLs, paths, and unsupported MIME/signature combinations fail.
- [x] Bounded envelope checks precede scanning; clean bytes then receive full
      pinned Core raster/font decode validation.
- [x] The ClamAV `INSTREAM` adapter bounds protocol work, checks signature
      database freshness, records a clean receipt, and fails closed. With no
      scanner configured, ingestion remains disabled.
- [x] Workspace-partitioned filesystem blobs are immutable, content-addressed,
      bounded on read, symlink-resistant, and hash-verified.
- [x] Every clean upload creates an immutable selectable resource admission
      with its own origin, license, actor, and scanner metadata. Duplicate
      admissions may share bytes but never overwrite provenance.
- [x] PostgreSQL serializes and durably limits per-workspace and
      installation-wide admission count and distinct stored bytes.
- [x] Request-body acquisition, copying, scanning, and decode work share
      fail-fast process-global and per-workspace concurrency bounds.
- [x] Manual drafts resolve only admitted same-workspace resource IDs and pass
      metadata aggregate preflight before explicit immutable bytes reach
      synchronous or queued rendering.
- [x] Synchronous preview bounds the entire resolve-to-render lifetime with a
      fail-fast admission slot rather than retaining legal-size bundles in a
      memory wait queue.
- [x] Saved revisions pin the exact selected asset/font admission, including a
      later same-bytes admission with corrected origin or license metadata.

See [the ingestion boundary](../app-resource-ingestion.md) and
[ADR 0014](../adr/0014-app-alpha-lifecycle-and-capacity-invariants.md).

## Slice 5: async worker and genuine self-hosting

Feature implementation: complete. Operational release qualification: pending.

- [x] A PostgreSQL queue persists idempotent requests, leases, attempts,
      deterministic retry times, exhaustion, terminal output metadata, and
      workspace-qualified inspection.
- [x] Workspace creation and enqueue have durable per-user/workspace and
      installation-wide quotas. Claims preserve oldest-job order within a
      workspace, rotate persisted claim priority across workspaces, and place a
      newly active workspace at the tail.
- [x] Workers receive only stored identities, reload the exact revision,
      reauthorize the requester, verify immutable revision/snapshot/resource state,
      call Core isolation with a fixed job timestamp, and verify outputs before
      publication.
- [x] Queue, resource-blob storage, render-blob storage, scanner, resource
      resolution, and worker execution have narrow provider seams plus focused
      in-memory/test implementations.
- [x] PostgreSQL and a shared POSIX filesystem are the supported Alpha queue and
      storage adapters. Redis, BullMQ, MinIO, S3, and multi-host workers are not
      hidden requirements.
- [x] Web and worker runtime paths require current migrations instead of
      performing runtime DDL.
- [x] Dockerfiles, migration/worker entry points, health endpoints, a Compose
      topology, and operator guidance are present for the supported topology.

The code has focused PGlite-backed queue, retry, lost-lease, authorization,
workspace-isolation, storage-integrity, and worker tests. Compose configuration
validation and a narrow local-PostgreSQL least-privilege role smoke also passed.
Those checks are not evidence that the built containers, full PostgreSQL
concurrency semantics, ClamAV updates, TLS proxying, or a filesystem/database
restore have been exercised on this integrated branch. Those release gates
remain open.

## Slice 6: bounded Core resource bundle

Implementation: complete independently of the App path.

- [x] `glyphkiln render --resource-bundle <directory>` accepts one
      operator-selected local directory with manifest version `1.0.0`.
- [x] Bundle manifests and files are byte/count bounded and must exactly match
      document asset/font declarations.
- [x] Traversal, absolute paths, symlinks, non-regular files, realpath escape,
      file-identity changes, remote input, and dynamic execution are rejected.
- [x] Core's existing registries still own full asset/font validation and
      resources are returned in document order.
- [x] Bundle evolution is independent of renderer/schema/template/algorithm
      versions; existing output bytes did not change.
- [x] CLI, resource-bundle, package-consumer, and documentation coverage landed.

See [the resource-bundle contract](../resource-bundles.md) and
[ADR 0013](../adr/0013-offline-cli-resource-bundles.md).

## Remaining release qualification

Before App Alpha is called releasable:

- [x] Run the complete integrated repository command matrix after all App,
      self-hosting, and documentation changes settle.
- [ ] Run migration forward → rollback → forward against supported real
      PostgreSQL, not only the local PGlite-compatible test engine.
- [ ] Run workspace-isolation and concurrent queue/admission checks against real
      PostgreSQL.
- [ ] Build both images and complete a fresh documented Compose
      bootstrap → upload → create → save → reopen → revise → queued export flow.
- [ ] Exercise ClamAV signature update/readiness and the reverse-proxy HTTPS
      configuration.
- [ ] Perform and verify a stopped-writer PostgreSQL-plus-filesystem backup and
      restore.
- [x] Confirm no unresolved critical security finding and reconcile any final
      operational limitations.

The final automated pass completed on 2026-07-31: Core ran 190 tests, App ran
363 tests, App coverage remained above the repository thresholds, the
standalone artifact smoke passed, all deterministic fixture/example/data,
license, package-consumer, and package-dry-run checks passed, and the dependency
audit reported zero vulnerabilities. An independent read-only review found no
P0/P1 correctness or security issue and no renderer trust-boundary or deliberate
pixel change.

An isolated native PostgreSQL 14 cluster also completed migration forward →
rollback → forward, idempotent reapplication, and the checked-in runtime/worker
grant smoke. The supported Compose topology pins PostgreSQL 17, so this evidence
does not close the fresh-Compose or supported-version concurrency gates above.
The Compose file itself parses successfully; the local Docker daemon was not
available for image or live-service qualification.

The required integrated command matrix is:

```text
npm run build
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run fixtures:verify
npm run examples:verify
npm run text-layout-data:verify
npm run licenses:verify
npm run test:package-consumer
npm run pack:core:dry-run
npm audit --audit-level=low
```

## Scope ledger

| Scope                                             | Implementation | Release qualification     |
| ------------------------------------------------- | -------------- | ------------------------- |
| Identity, roles, invitations, and soft revocation | Complete       | Automated matrix complete |
| Workspace isolation                               | Complete       | Real PostgreSQL pending   |
| Immutable brand snapshots                         | Complete       | Automated matrix complete |
| Persisted designs and revisions                   | Complete       | Automated matrix complete |
| Manual create/save/reopen/revise/export flow      | Complete       | Compose E2E pending       |
| Safe raster/font ingestion                        | Complete       | Live ClamAV pending       |
| Durable async worker                              | Complete       | Real PostgreSQL pending   |
| Supported Docker Compose topology                 | Present        | Fresh-install pending     |
| Backup/restore and deployment guidance            | Present        | Restore drill pending     |
| Core offline CLI resource bundle                  | Complete       | Integrated matrix pending |
