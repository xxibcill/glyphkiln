# Release process

1. Ensure every user-visible pull request contains a Changeset.
2. Verify CI with npm 10.9.8 on the minimum supported Node 22.13 release and
   the current Node 24 release: clean install, build, typecheck, lint/security
   scan, tests, standalone runtime, isolation, text-layout data verification,
   diagnostic determinism, fixtures, dependency licenses, audit, packing, and
   coverage.
3. Review deterministic-output changes and visual baselines.
4. Run `npx changeset version` on a release branch.
5. Review changelog, package version, renderer/version contracts, and lockfile.
6. Run the complete local validation sequence from a clean clone, including
   `npm run examples:verify`, `npm run test:package-consumer`, and
   `npm audit --audit-level=low`.
7. Inspect `npm run pack:core:dry-run`, then install the local archive in a fresh
   consumer and verify strict TypeScript, public exports, CLI, and
   direct/isolated rendering.
8. Create a signed Git tag and GitHub source release. This establishes source
   and local-tarball readiness even when registry publication is paused.
9. If approved by the owner, publish `@glyphkiln/core` manually with npm
   provenance and repeat the installed-package checks against the published
   archive.

This repository does not automatically publish from CI. npm publication is an
optional, owner-controlled step and is not required for a signed source release
or a verified local tarball.
