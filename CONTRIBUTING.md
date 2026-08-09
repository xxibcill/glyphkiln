# Contributing

Contributions are welcome. By contributing, you agree that your contribution is
licensed under Apache-2.0.

## Workflow

1. Use npm 10.9.8 with Node.js 22.22.2 or newer in the Node 22 release line, or
   Node.js 24 or newer, and run `npm ci` at the repository root. If npm must be
   changed, install it from outside the checkout as described in the root
   README.
2. Create a focused branch.
3. Add tests before or with the behavior change.
4. Run `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, and
   `npm run test:coverage`.
5. Run `npx changeset` for user-visible behavior.
6. Open a pull request describing deterministic-output impact.

Commit messages use Conventional Commits, for example `feat: add a format`,
`fix: reject unresolved logos`, or `docs: clarify font licensing`.

The repository uses npm workspaces. Core lives in
`packages/glyphkiln-core`, the application lives in `apps/glyphkiln-app`, and
the runnable consumer example lives in `examples/style-showcase`. Root
verification commands cover every workspace with a relevant script.

## Pixel-affecting changes

Any deliberate pixel change must update the relevant renderer, template, or
procedural algorithm version. Explain why the old pixels changed. Update visual
baselines only after review using `npm run test:update-visuals`; never update a
baseline merely to make CI pass.

New templates should be explicit functions with stable IDs, semantic versions,
constraints, fixtures, and tests. Avoid introducing a generic evaluator or
user-programmable template language.

## Security

Treat design documents as untrusted data. Do not add dynamic code execution,
remote fetches in the render path, user-controlled imports, active SVG, or file
path resolution from document values. See [SECURITY.md](SECURITY.md).
