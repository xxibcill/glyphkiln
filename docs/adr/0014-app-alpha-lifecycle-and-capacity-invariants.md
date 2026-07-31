# ADR 0014: App Alpha lifecycle and capacity invariants

Status: accepted

## Context

App Alpha has three boundaries where a convenient implementation would lose
security or provenance: deleting a revoked membership would break historical
foreign keys, collapsing duplicate uploads into one resource row would discard
later origin or license assertions, and unbounded scan/render work would let one
workspace consume shared capacity. These decisions extend the workflow boundary
in [ADR 0011](0011-app-alpha-workflow-and-trust-seams.md) and the PostgreSQL
queue in [ADR 0012](0012-postgres-render-queue-and-filesystem-storage.md).

## Decision

### Membership lifecycle

A workspace membership is retained after access ends. Revocation records
`revoked_at` and the workspace-qualified revoking member; every authorization
and worker reauthorization query requires an active membership. Revocation
invalidates all installation sessions for the target user, while a role change
takes effect on the next request because roles are never cached in sessions.
Owner-only membership administration locks the workspace and cannot demote or
revoke its final active owner. Pending invitations are not detached authority:
acceptance locks and rechecks the issuer's active membership and current invite
capability, while capability-losing demotion or revocation closes that issuer's
outstanding invitations.

Owner grants, ownership transfer, and membership reactivation are outside App
Alpha. A revoked row is not deleted or silently reused.

The unauthenticated first-registration path requires a high-entropy
operator-provisioned bootstrap token. The application stores only its configured
digest in process memory, compares the presented token in constant time, fails
closed when it is absent, and still serializes the one successful bootstrap in
PostgreSQL.

### Resource identity

A resource blob and a resource admission have different identities:

- the blob is workspace-partitioned, content-addressed immutable bytes;
- the admission is an immutable, selectable provenance record containing its
  own origin, license, scanner receipt, actor, and font face when applicable;
- the ingestion event records the accepted upload and, for a duplicate, points
  to the earlier same-workspace admission.

Every clean upload creates a new resource admission even when an existing blob
can be reused. Duplicate raster identity is the same content hash; duplicate
font identity additionally requires the same family, weight, and style. Font
faces with different declarations may share bytes without being the same
admission. No blob or duplicate relationship crosses a workspace boundary.

Each saved design revision appends workspace-qualified resource-pin rows for the
exact selected admission IDs. Composite foreign keys enforce workspace and
resource kind. App-owned document metadata repeats each selected admission ID,
hash, origin, and license, and revision load verifies that the pins still match
the canonical stored document. This binds application provenance into the
document hash and render manifest without adding paths, URLs, bytes, or new
trusted behavior to Core. Existing revisions are backfilled deterministically;
an ambiguous legacy font face/hash selects the earliest matching admission.

PostgreSQL serializes admission accounting across the installation and within
each workspace. Durable quotas bound the number of admission records and the
distinct stored blob bytes at both scopes; a duplicate consumes admission
capacity but not additional blob-byte capacity.

### Expensive-work and queue capacity

Request-body acquisition, metadata parsing, scanning, decoding, and immutable
publication pass through one fail-fast in-process gate with both global and
per-workspace concurrency limits. It deliberately retains no
attacker-controlled waiting queue. Rendering performs metadata-only count,
byte, dimension, and pixel-total preflight before reading any resource blob, so
Core's aggregate resource bounds also protect the host that resolves bytes.
Synchronous rendering holds one fail-fast admission from resolution through the
isolated render result, so concurrent legal-size selections cannot accumulate
while waiting for Core's serialized renderer.
PostgreSQL quotas remain the cross-process authority for durable resource
growth. The supported single-web-process Alpha topology makes the concurrency
gate topology-wide; a multi-web deployment must add a distributed or ingress
admission control before claiming the same bound.

Authenticated workspace creation has per-user and installation-wide bounds.
The PostgreSQL render queue enforces durable per-workspace and
installation-wide outstanding-job limits while holding the corresponding
capacity locks. An exact idempotent replay is returned before consuming new
capacity. Claims select the oldest eligible job within each workspace, then
rotate across workspaces by persisted last-claim order; a newly active
workspace enters at the tail instead of claim order zero. Leases, attempts,
retries, and terminal outputs remain workspace-qualified.

## Consequences

- A corrected origin or license assertion for existing bytes remains a
  selectable record instead of silently rewriting the earlier admission, and a
  saved revision pins which assertion it used.
- Content-addressing saves blob space without conflating provenance records.
- Soft revocation preserves historical referential integrity and makes queued
  work fail authorization after access is removed.
- One account or busy workspace cannot multiply workspaces without bound, fill
  every outstanding queue slot, exceed installation resource storage policy,
  or gain priority by activating a new queue. App Alpha still needs operator
  retention for completed job history and artifacts.
- These limits are self-hosted Alpha safeguards, not Cloud billing, managed
  multi-tenancy, or a promise of horizontally distributed rate limiting.
