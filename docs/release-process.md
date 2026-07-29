# Release process

1. Ensure every user-visible pull request contains a Changeset.
2. Verify Node 22 and 24 CI: build, typecheck, lint/security scan, tests, and
   coverage.
3. Review deterministic-output changes and visual baselines.
4. Run `npx changeset version` on a release branch.
5. Review changelog, package version, renderer/version contracts, and lockfile.
6. Run the complete local validation sequence from a clean clone.
7. Create a signed Git tag and GitHub release.
8. Publish `@glyphkiln/core` manually with npm provenance after inspecting
   `npm pack --dry-run`.
9. Verify installation, package exports, CLI, and one SVG/PNG render from the
   published tarball.

This repository does not automatically publish from CI in the initial
milestone. That conservative choice prevents an incomplete credential or
approval model from releasing packages. The package metadata is ready for a
future protected release workflow.
