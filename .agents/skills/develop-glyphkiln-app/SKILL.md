---
name: develop-glyphkiln-app
description: Implement or review Glyphkiln App changes across Next.js UI and Route Handlers, AppWorkflow commands and queries, authentication and workspace authorization, PostgreSQL persistence and migrations, resource ingestion, render queues and workers, immutable storage, runtime configuration, and self-hosting. Use for work under apps/glyphkiln-app or deploy/self-host where browser trust, tenancy, resources, jobs, or Core integration are involved.
---

# Develop Glyphkiln App

Preserve the App as a thin HTTP/UI shell around a deep, closed workflow and
immutable, workspace-qualified state. Treat browser input, uploads, sessions,
and queued work as untrusted.

## Prepare

1. Read `AGENTS.md`, `SECURITY.md`, and the relevant source and tests.
2. Read [references/app-map.md](references/app-map.md) for ownership boundaries,
   security ordering, source paths, tests, migrations, and operational docs.
3. Inspect the working tree before editing. Preserve unrelated user changes.
4. Trace the complete path for the requested behavior:

   `UI or client -> Route Handler -> closed schema -> AppWorkflow -> database,
resource, queue, storage, worker, or Core boundary`.

## Preserve the architecture

- Keep Route Handlers thin. Parse bounded input, establish request evidence,
  call the workflow or resource service, and map a sanitized response.
- Extend the closed command/query unions for new use cases. Do not expose
  table-shaped repositories or let the client choose authenticated identity,
  roles, trusted versions, hashes, storage keys, or resource bytes.
- Consume only public `@glyphkiln/core` exports. Never import Core source or
  bypass Core validation.
- Keep browser drafts manual and inert. The server resolves exact templates,
  brands, admissions, hashes, licenses, and immutable versions.
- Preserve workspace qualification in every owned lookup and relationship.
- Keep revisions, snapshots, admissions, provenance pins, attempts, and
  artifacts immutable or append-only according to their existing contracts.

## Apply security-sensitive ordering

For commands and queries:

1. Bound and validate inert input.
2. Authenticate the server-side session and mutation proof.
3. Resolve current, non-revoked workspace membership.
4. Enforce the centralized capability policy.
5. Resolve targets with `workspace_id` in the predicate.
6. Resolve exact immutable snapshots and admitted resources.
7. Construct and validate the Core document when rendering is involved.
8. Commit state and provenance atomically.
9. Queue only opaque stored identities.
10. Return stable, sanitized results.

Return the same not-found shape for foreign-workspace and unauthorized object
identifiers where non-disclosure policy applies. Never log documents, resource
bytes, tokens, database URLs, secrets, or private filenames.

## Implement by subsystem

### Persistence and migrations

- Add timestamped forward and rollback SQL files as a pair.
- Enforce tenancy with workspace-qualified keys and constraints, not service
  convention alone.
- Put multi-row invariants, quotas, idempotency, leases, and ownership changes
  in one transaction with the required locks.
- Update the database interface, PGlite test adapter, PostgreSQL adapter, and
  migration tests together.
- Test both migration directions and behavior through the production-shaped
  interface.

### Authentication and authorization

- Use existing password, token, session, CSRF, same-origin, and role-policy
  modules.
- Resolve roles from current membership state for every authorized request.
- Preserve immediate revocation, final-owner, invitation-authority, and
  non-disclosure invariants.
- Add negative tests for missing, revoked, cross-workspace, downgraded, and
  replayed authority relevant to the change.

### Resource ingestion and storage

- Authorize and reserve bounded expensive work before reading or decoding the
  body.
- Keep uploaded content inert: PNG/JPEG and supported individual font faces
  only; never URLs, active SVG, paths, modules, or callbacks.
- Preserve fail-closed scanning, complete Core validation, immutable
  publication, defensive byte copies, content hashes, provenance admissions,
  and durable quota transactions.
- Keep path generation server-owned and reject links or non-regular files.

### Queue and worker

- Persist only revision/job/resource identities, never user-supplied documents,
  callbacks, URLs, module names, or paths.
- Preserve durable fairness, idempotency, outstanding quotas, leases, bounded
  retries, and fencing against late workers.
- Reload immutable state and recheck current authorization and integrity after
  claim and before Core sees bytes.
- Classify validation, authorization, and integrity failures as terminal;
  retry only the existing transient categories.

### UI and browser contract

- Treat server responses as unknown until parsed.
- Keep trusted fields out of editable client state.
- Preserve accessible labels, keyboard behavior, focus, and error recovery.
- Test user-visible behavior through the component or route boundary, not
  implementation details.

## Test and hand off

Run the narrowest relevant App test while iterating. Every changed trust seam
needs both an allowed case and the closest denied or failure case.

Before handoff, invoke `$verify-glyphkiln-change` and complete its full
repository gate. Add a Changeset for user-visible behavior unless the repository
policy clearly exempts the change.

Report the complete request-to-storage/worker path, trust-boundary impact,
migration behavior, tests, and verification results.
