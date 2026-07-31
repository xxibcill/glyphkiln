# ADR 0012: PostgreSQL render queue and filesystem object storage

Status: accepted

## Context

ADR 0011 identified queue and object-storage seams and anticipated Redis/BullMQ
and S3-compatible adapters. App Alpha needs a genuine durable worker path, but
adding Redis and MinIO to the first supported installation would add two
operational dependencies before their scale or availability characteristics
are needed.

Render jobs must contain stored identities only. A worker must reload an exact
immutable revision, recheck the active user, workspace, membership role, and
workspace-qualified resource ownership, render through Core's isolated process,
and publish immutable output without trusting a queued document or path.

## Decision

App Alpha uses PostgreSQL as its durable render queue. The provider owns:

- idempotent enqueue of a stored workspace/design/revision request;
- atomic claims with `FOR UPDATE SKIP LOCKED`;
- bounded leases, attempt counts, deterministic retry scheduling, exhaustion,
  and non-retryable failure;
- append-only attempt history;
- atomic terminal state and immutable output metadata;
- workspace-qualified inspection.

The application queue interface also has an in-memory adapter for focused
workflow tests. PostgreSQL is the supported self-hosted adapter. Redis is not a
hidden or optional requirement for App Alpha.

App Alpha stores admitted resources and rendered artifacts on a shared local
filesystem volume. Both storage adapters generate workspace-partitioned,
content-addressed keys. Writes publish immutable bytes atomically; reads are
bounded, reject symlinks/non-regular files, and verify hashes. Every existing
path component below the configured root is checked as a non-symlink
directory, and a published object's parent directory is synced before success
is returned. An in-memory render-blob adapter supports focused tests.

Queue rows never contain a document, byte payload, callback, module name,
remote URL, or caller-selected storage path. A claimed row contains only
server-created job, workspace, design, revision, requester, attempt, and lease
identities. The worker:

1. joins those identities back to the claimed database row;
2. requires an active user, workspace, design, and export-capable membership;
3. validates canonical revision and brand-snapshot hashes;
4. resolves scanner-admitted resources using workspace-qualified store reads;
5. calls `renderGraphicIsolated` with explicit bytes and a fixed manifest
   timestamp stored on the job;
6. verifies Core's output and manifest relationship;
7. writes content-addressed output and canonical manifest bytes;
8. commits terminal output metadata.

PostgreSQL stores job state and object metadata. The filesystem volume stores
bytes. Backups must capture both while application writers are stopped.

## Consequences

- The supported Compose topology needs Node, PostgreSQL, a shared durable
  volume, and ClamAV; it does not need Redis or MinIO. ClamD is isolated on an
  internal app-scanner network, while a separate FreshClam process is the only
  service with signature-update egress.
- Web, worker, and migration services use distinct PostgreSQL roles. The
  worker can read only required authorization/render inputs and can mutate
  only queue scheduling, attempts, and outputs.
- Job creation and application state share one ACID system, reducing partial
  enqueue failure modes.
- PostgreSQL queue throughput is intentionally sized for an Alpha manual
  workflow, not an unbounded hosted render fleet.
- Filesystem storage requires app and worker containers to share one POSIX
  volume. Multi-host workers require a later S3-compatible adapter; they must
  not mount arbitrary remote URLs into Core.
- An expired final lease is exhausted, and a late worker cannot publish after
  another attempt takes ownership.
- Content-addressed partial writes are safe to leave after a failed attempt;
  retries deduplicate them, and a later maintenance policy may remove
  unreferenced objects.

This decision supersedes ADR 0011's Redis/BullMQ and S3-compatible adapter
expectations for the App Alpha supported topology only. The provider interfaces
remain the extension point for a later independently useful deployment.
