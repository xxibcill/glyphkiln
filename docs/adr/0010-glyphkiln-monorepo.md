# ADR 0010: Glyphkiln monorepo

Status: accepted

## Context

ADR 0008 deferred a workspace until the repository had a second independently
useful runtime. Glyphkiln App now provides that runtime and must develop against
Core without private imports or source-checkout coupling.

## Decision

Use one npm-workspaces repository named Glyphkiln:

```text
apps/glyphkiln-app
packages/glyphkiln-core
```

`@glyphkiln/core` remains a single, independently versioned and publishable ESM
package. `@glyphkiln/app` is private and consumes only documented Core exports.
Root scripts coordinate builds and verification, with Core built before the
application.

## Rationale

The workspace gives the application fast, tested integration with the exact
Core contract while preserving Core's package boundary. It also centralizes
dependency installation, CI, changesets, and contributor workflows.

## Consequences

- Core commands run with `packages/glyphkiln-core` as their working directory.
- Core's package-consumer test still validates a packed tarball outside the
  workspace.
- Application services may be added beneath `apps` or as application-owned
  packages without exposing Core internals.
- Deployment and licensing remain product-specific concerns even though source
  development is coordinated.

## Supersedes

This ADR activates the migration condition described by
[ADR 0008](0008-package-public-api.md). It does not change ADR 0008's decision
to keep Core itself a single package with intentional public exports.
