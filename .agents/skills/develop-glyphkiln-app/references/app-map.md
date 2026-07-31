# Glyphkiln App map

## Request and domain ownership

| Concern                                  | Primary path                                               |
| ---------------------------------------- | ---------------------------------------------------------- |
| App shell and security headers           | `apps/glyphkiln-app/src/app/`                              |
| Preview API                              | `src/app/api/preview/`, `src/lib/project-preview/`         |
| Closed App API routes                    | `src/app/api/app/`                                         |
| AppWorkflow contracts and schemas        | `src/server/app-workflow/contracts.ts`, `schemas.ts`       |
| Security-sensitive orchestration         | `src/server/app-workflow/workflow.ts`                      |
| Workflow state and document construction | `src/server/app-workflow/state.ts`, `document-factory.ts`  |
| Identity, sessions, passwords, roles     | `src/server/security/`                                     |
| Database contract and adapters           | `src/server/persistence/`                                  |
| SQL migrations                           | `src/server/persistence/migrations/`                       |
| Resource admission and validation        | `src/server/resources/`                                    |
| Render queue                             | `src/server/render-queue/`                                 |
| Worker authorization and resolution      | `src/server/render-worker/`                                |
| Immutable render storage                 | `src/server/storage/`                                      |
| HTTP bounds and response mapping         | `src/server/http/`                                         |
| Runtime composition and configuration    | `src/server/runtime.ts`                                    |
| Browser features                         | `src/features/app-alpha/`, `src/features/project-preview/` |
| Standalone packaging and startup         | `apps/glyphkiln-app/scripts/`                              |
| Self-host topology                       | `deploy/self-host/`                                        |

Paths without an `apps/glyphkiln-app/` prefix above are relative to that
workspace.

## Trust rules

- Browser envelopes provide request evidence, not identity or authority.
- The workflow authenticates, resolves current membership, authorizes, and
  performs workspace-qualified lookup in that order.
- Foreign-workspace and unauthorized identifiers must not disclose existence.
- The server owns brand/template/resource versions, hashes, storage keys, and
  the complete Core document.
- Every render path calls public Core validation and uses isolated rendering for
  untrusted jobs.
- Revisions and brand snapshots are immutable. Resource admissions remain
  distinct from content-addressed blobs.
- Queue rows carry opaque stored identities. Workers reload state and recheck
  authorization and integrity.
- Resource ingestion authorizes before body read, fails closed on scanner
  health, fully validates bytes, and publishes immutably.
- Non-loopback service exposure stays behind the explicit production,
  HTTPS-origin, trusted-proxy, database, and secure-cookie startup gate.

## Test routing

Start with the colocated `*.test.ts` or `*.test.tsx`. Also include:

- Route changes: the route test plus `src/app/api/app/app-alpha-e2e.test.ts`
  when the workflow contract changes.
- Workflow changes: `src/server/app-workflow/workflow.test.ts`.
- Migration changes: `src/server/persistence/migrations.test.ts` and affected
  database-adapter tests.
- PostgreSQL concurrency or SQL changes:
  `src/server/persistence/postgres-database.test.ts` or the owning PostgreSQL
  queue tests.
- Resource changes: admission, ingestion, validation, blob storage, and
  provenance tests relevant to the full path.
- Worker changes: render admission, resolver, and worker tests.
- UI changes: component tests plus API-client/response-parser tests at the
  network boundary.
- Runtime or packaging changes: runtime tests, script tests, and the standalone
  test included by the App workspace suite.
- Self-host configuration changes:
  `apps/glyphkiln-app/scripts/self-hosting-config.test.mjs`.

## Essential docs

- `docs/architecture.md` — App Alpha architecture
- `docs/adr/0011-app-alpha-workflow-and-trust-seams.md`
- `docs/adr/0012-postgres-render-queue-and-filesystem-storage.md`
- `docs/adr/0014-app-alpha-lifecycle-and-capacity-invariants.md`
- `docs/app-resource-ingestion.md`
- `docs/app-self-hosting-security.md`
- `docs/self-hosting.md`
- `SECURITY.md`
