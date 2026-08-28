# Release process

1. Ensure every user-visible pull request contains a Changeset.
2. Run `npm run verify:release` locally with npm 10.9.8 on the minimum
   supported Node 22.22.2 release and the current Node 24 release: clean
   install, build, typecheck, lint/security
   scan, tests, standalone runtime, isolation, text-layout data verification,
   diagnostic determinism, design and Scene Kernel fixtures, dependency
   licenses, audit, packing, and coverage.
3. Review deterministic-output changes and visual baselines.
4. Run `npx changeset version` on a release branch.
5. Review changelog, package version, renderer/version contracts, and lockfile.
6. Run the complete local validation sequence from a clean clone, including
   `npm run scene-kernel-fixture:verify`, `npm run examples:verify`,
   `npm run test:package-consumer`, and `npm audit --audit-level=low`.
7. Inspect `npm run pack:core:dry-run`, then install the local archive in a fresh
   consumer and verify strict TypeScript, public exports, CLI, and
   direct/isolated rendering.
8. Create a signed Git tag, verify it against
   `.github/release-allowed-signers`, and create the GitHub source release. This
   establishes source and local-tarball readiness even when registry
   publication is paused.

   The tag must contain `.github/release-allowed-signers` and a release
   verification script. The existing `v0.5.0` tag predates those files and is
   intentionally ineligible for registry publication; do not move or recreate
   it. `v0.6.0` contains the legacy verification-script location supported by
   the local publisher.

9. GitHub Actions is disabled for this repository. If npm publication is
   approved by the owner, authenticate interactively on the release machine
   with `npm login`, run a dry run, then set the single-command approval flag:

   ```sh
   npm run publish:core -- --dry-run vX.Y.Z
   GLYPHKILN_APPROVE_NPM_PUBLISH=1 npm run publish:core -- vX.Y.Z
   ```

   The publisher verifies the annotated tag against the allowed-signers file
   stored in that tag, requires the tagged commit to be in `origin/main`,
   rejects mismatched versions and unmaterialized Changesets, creates an
   isolated detached worktree, repeats the release checks, and verifies the
   installed package after registry publication. Local publication explicitly
   omits CI provenance because no supported CI identity is involved. Never
   place npm credentials in the repository or command history.

This repository does not publish on push or release creation. The publish
script is local and owner-gated; npm publication remains optional and is not
required for a signed source release or verified local tarball.
