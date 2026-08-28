# Visual regression

Reviewed PNG baselines live in
`packages/glyphkiln-core/tests/visual/baselines`. Each baseline has:

- `<name>.design.json`: complete versioned source
- `<name>.png`: reviewed bytes
- `<name>.manifest.json`: renderer and output provenance

Normal tests render with the pinned font and renderer, compare exact output
SHA-256 to the manifest, and compare exact PNG bytes. To propose a deliberate
change:

1. Explain the intended pixel change and bump the affected renderer, template,
   or algorithm version.
2. Run all non-visual tests.
3. Run `npm run test:update-visuals`.
4. Inspect every changed PNG at full size and common thumbnail size.
5. Review source-design and manifest diffs together with the image.
6. Commit all three files after approval.

Never refresh a baseline merely because an environment differs. When migrating
Resvg, Node, platform, or font versions, generate candidates in a pinned
environment and use perceptual comparison only to help review the migration.
The accepted baseline remains exact for that pinned environment.

## Scene Kernel editorial fixture

`packages/glyphkiln-core/fixtures/scene-kernel` contains the reviewed Direction
A decoder spread used to qualify Scene Kernel v1. The source scene and
expectations pin the semantic IDs, connector endpoints, reading order, palette,
contrast floors, version identities, and exact SVG/PNG hashes. The generated
directory tracks the reviewed PNG and both output manifests; SVG bytes are
regenerated from the scene rather than duplicated in the repository.

Run:

```bash
npm run scene-kernel-fixture:verify
```

Use `npm run scene-kernel-fixture:update` only for an intentional reviewed
renderer or fixture change. Inspect the generated PNG at full size and confirm
that the mechanism corrections in the expectations still hold before accepting
new hashes.
