# Glyphkiln verification matrix

Run all commands from the repository root unless noted.

## Required for every handoff

```sh
npm run build
npm run typecheck
npm run lint
npm test
npm run test:coverage
```

These five gates are mandatory under `AGENTS.md`.

## Select by diff

| Changed area                                 | Additional verification                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Fixtures or fixture generators               | `npm run fixtures:verify`                                                                                     |
| Generated examples or renderer behavior      | `npm run examples:verify`                                                                                     |
| Unicode sources, tables, or text diagnostics | `npm run text-layout-data:verify`                                                                             |
| Core public exports or packaging             | `npm run test:package-consumer`; inspect `npm run pack:core:dry-run`                                          |
| Dependencies or licenses                     | `npm run licenses:verify`; `npm audit --audit-level=low`                                                      |
| Visual baselines                             | exact visual test; inspect every PNG, design, and manifest diff                                               |
| Schema conformance artifacts                 | run the schema conformance generator in verify mode if available; otherwise generate and require a clean diff |
| App runtime or standalone scripts            | App script tests and `npm run test:standalone --workspace @glyphkiln/app`                                     |
| Self-host Compose/config                     | `npm run test --workspace @glyphkiln/app`; validate Compose with an explicit safe env file when available     |
| SQL migrations                               | migration tests plus affected PGlite and PostgreSQL adapter tests                                             |
| Example consumer                             | `npm run verify --workspace @glyphkiln/example-style-showcase`                                                |
| Release preparation                          | every item in `docs/release-process.md` on supported Node/npm versions                                        |

## Focused Vitest examples

```sh
npm exec --workspace @glyphkiln/core vitest run tests/templates-and-quality.test.ts
npm exec --workspace @glyphkiln/core vitest run tests/visual-regression.test.ts
npm exec --workspace @glyphkiln/app vitest run src/server/app-workflow/workflow.test.ts
npm exec --workspace @glyphkiln/app vitest run src/server/persistence/migrations.test.ts
```

Use the owning path rather than these examples when another test is more
specific.

## Artifact policy

- Verify first.
- Update only when the requested behavior deliberately owns the artifact.
- Re-run the corresponding verify command after updating.
- Inspect `git diff --stat`, `git diff --check`, and the complete changed-file
  list.
- Never accept visual, schema, fixture, example, or lockfile churn without an
  explained source change.
