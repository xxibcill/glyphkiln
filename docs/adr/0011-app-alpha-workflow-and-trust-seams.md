# ADR 0011: App Alpha workflow and trust seams

Status: accepted

## Context

The signed Core `v0.3.0` release establishes the deterministic renderer,
resource limits, isolated render lifecycle, and browser-verifiable preview
contract. Glyphkiln App currently exposes that contract as a loopback-first,
anonymous, non-persistent local preview.

App Alpha must add accounts, workspace roles, immutable brand history, saved
design revisions, resource ingestion, and self-hosted worker infrastructure
without letting browser input choose trusted identities, resource bytes,
versions, storage paths, or executable behavior.

Splitting these rules across route handlers would make authorization ordering,
workspace qualification, immutable resolution, and error non-disclosure easy to
bypass. Conversely, extracting independent API, worker, and application
packages before a second runtime needs them would add shallow interfaces.

## Decision

### Deep application workflow module

Keep the first App Alpha vertical slice in `apps/glyphkiln-app` and place one
deep `AppWorkflow` module behind a two-entry-point interface:

```ts
interface AppWorkflow {
  execute(input: CommandEnvelope): Promise<AppResult>;
  read(input: QueryEnvelope): Promise<AppResult>;
}
```

The interface accepts closed, runtime-validated command and query unions. HTTP
adapters supply opaque request evidence; callers never supply an authenticated
user ID, role, membership, trusted resource hash, or storage key.

The manual editor submits a `ManualDraft`, not a complete trusted
`DesignDocument`. The implementation resolves the exact same-workspace brand
snapshot, template version, admitted assets, and immutable font versions,
constructs the document, and validates it through public `@glyphkiln/core`
exports.

The module owns the security-sensitive ordering:

1. Bound and validate inert input.
2. Authenticate the server-side session and mutation proof.
3. Resolve current workspace membership.
4. Enforce the centralized role policy.
5. Resolve every target with `workspace_id` in the lookup predicate.
6. Resolve exact immutable snapshots and admitted resource versions.
7. Construct and validate the Core document.
8. Commit append-only state and provenance-relevant metadata atomically.
9. Queue only opaque stored-job identities.
10. Return stable, sanitized results.

### Authentication and authorization

- Passwords use Argon2id with bounded input.
- Sessions use CSPRNG bearer tokens stored only as SHA-256 hashes.
- The session cookie is `HttpOnly`, `SameSite=Strict`, path-scoped, and
  `Secure` whenever the configured public origin is HTTPS.
- Mutations require a separate session-bound CSRF token plus same-origin
  request validation.
- Registration defaults to one bootstrap owner. Later users join through
  expiring, single-use, email-bound invitations.
- Workspace roles are `owner`, `admin`, `editor`, and `viewer`.
- Cross-workspace or unauthorized object identifiers are reported as the same
  not-found result.
- Memberships are provenance records and are never deleted. Revocation records
  `revoked_at` and the workspace-qualified revoking member, and every
  authorization/list/worker lookup requires `revoked_at IS NULL`.
- Revoking a member invalidates all of that user's installation sessions.
  Role changes are not cached in sessions, so demotion takes effect on the
  next request.

Role capabilities are centralized:

- viewer: read snapshots, designs, revisions, and completed exports;
- editor: viewer capabilities plus preview, brand-version creation, design
  creation, revision creation, and export requests;
- admin: editor capabilities plus invitations for admin/editor/viewer roles;
- owner: all Alpha capabilities and workspace administration.

Only owners may list members, change a member to `admin`, `editor`, or
`viewer`, or revoke a member. App Alpha deliberately has no owner-grant or
ownership-transfer command. A current owner may demote or revoke themselves
only when another active owner already exists; self-revocation also clears the
current browser session. The workflow serializes membership administration on
the workspace row and refuses any operation that would remove the final active
owner.

### Persistence

Use PostgreSQL from the first persistent slice. Every workspace-owned row
contains `workspace_id`, every object lookup is workspace-qualified, and
composite foreign keys make cross-workspace references structurally invalid.

Brand snapshots and design revisions are immutable, append-only rows. New
revisions use optimistic head comparison. A stored revision contains the exact
normalized `DesignDocument`, its canonical hash, its exact brand-snapshot
foreign key, its parent revision, the creating actor, and source metadata.
Reopening returns this stored document rather than rebuilding it from current
brand state.

SQL migrations have checked-in forward and rollback files. Tests run the same
PostgreSQL SQL through a local-substitutable PostgreSQL engine; production uses
the network PostgreSQL adapter.

### Provider seams

Introduce a seam only when two real adapters exist:

- database: PostgreSQL production adapter and local PostgreSQL test adapter;
- queue: inline adapter and Redis/BullMQ adapter;
- object storage: filesystem adapter and S3-compatible adapter;
- malware scanning: explicit reject-by-default adapter and operator-configured
  scanner adapter;
- render execution: inline isolated adapter and queued worker adapter.

Core rendering itself is not abstracted. The App consumes the fixed public
`@glyphkiln/core` interface and always supplies explicit validated bytes. Render
jobs contain stored identities, never documents, callbacks, module names,
remote URLs, or storage paths supplied by a user.

### Network posture

Loopback remains the default binding. A non-loopback hostname is rejected at
startup unless all of the following are explicit:

- an HTTPS `GLYPHKILN_PUBLIC_ORIGIN`;
- trusted reverse-proxy mode;
- database-backed authentication;
- secure-cookie operation.

Reverse-proxy and TLS configuration remain operator responsibilities and are
documented. The App does not treat a hostname environment variable as an
authentication control.

## Consequences

- Route handlers stay thin and tests exercise the same workflow interface as
  production callers.
- Authorization, non-disclosure, immutable resolution, transactions, and Core
  error mapping have locality in one module.
- The browser can no longer edit snapshot IDs or trusted version/hash fields.
- App Alpha can start with the existing synchronous isolated preview while the
  same stored-revision contract later feeds an async worker.
- PostgreSQL and composite keys add setup and migration work, but avoid a later
  tenancy rewrite.
- The closed command/query unions are less open-ended than entity repositories;
  that is intentional. New use cases require an explicit reviewed command.
- Uploaded SVG, remote fetching, arbitrary coordinates/code, LLM interpretation,
  Cloud billing, and managed multi-tenancy remain outside this decision.

## Rejected alternatives

- **Authorization in each route:** too shallow; ordering and non-disclosure
  would be duplicated.
- **Browser-submitted complete trusted documents:** lets untrusted input choose
  snapshots, versions, and hashes.
- **Stateless JWT authorization:** makes immediate session revocation and
  current membership enforcement harder.
- **SQLite first:** would defer PostgreSQL concurrency, JSON, tenancy, and
  constraint behavior until after product code depends on weaker semantics.
- **One repository interface per table:** exposes transaction orchestration and
  creates many shallow seams.
- **Uploaded active SVG:** exceeds the current raster-only ingestion and Core
  trust boundary.
