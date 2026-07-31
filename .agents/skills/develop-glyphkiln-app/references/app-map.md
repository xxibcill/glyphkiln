# Glyphkiln App map

## Request and domain ownership

| Concern                                  | Primary path                                               |
| ---------------------------------------- | ---------------------------------------------------------- |
| App shell                                | `apps/glyphkiln-app/src/app/`                              |
| Site-wide security headers               | `apps/glyphkiln-app/next.config.ts`                        |
| API response security headers            | `src/server/http/app-response.ts`, `src/app/api/`          |
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

## Trust-boundary sources

| Boundary                                      | Authoritative guidance                                          |
| --------------------------------------------- | --------------------------------------------------------------- |
| Closed workflow ordering and non-disclosure   | `docs/adr/0011-app-alpha-workflow-and-trust-seams.md`           |
| Durable queue, worker, and render storage     | `docs/adr/0012-postgres-render-queue-and-filesystem-storage.md` |
| Membership, admission, provenance, and quotas | `docs/adr/0014-app-alpha-lifecycle-and-capacity-invariants.md`  |
| Upload authorization and resource ingestion   | `docs/app-resource-ingestion.md`                                |
| Non-loopback startup and proxy controls       | `docs/app-self-hosting-security.md`, `docs/self-hosting.md`     |
| Core validation and isolated rendering        | `SECURITY.md`, `docs/architecture.md`                           |

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
