# Glyphkiln Core map

## Source ownership

| Concern                                   | Primary path                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Public package exports                    | `packages/glyphkiln-core/src/index.ts`, `browser.ts`, `schema/index.ts` |
| Domain errors and renderer identity       | `packages/glyphkiln-core/src/domain/types.ts`                           |
| Strict design schema and JSON Schema      | `packages/glyphkiln-core/src/schema/`                                   |
| Input and worker resource limits          | `packages/glyphkiln-core/src/resources/`, `docs/resource-limits.md`     |
| Canonical JSON and fingerprints           | `packages/glyphkiln-core/src/cache/`                                    |
| Seeded randomness                         | `packages/glyphkiln-core/src/seed/`                                     |
| Formats and dimensions                    | `packages/glyphkiln-core/src/formats/`                                  |
| Raster and font verification              | `packages/glyphkiln-core/src/assets/`, `src/fonts/`                     |
| Text classification, shaping, and fitting | `packages/glyphkiln-core/src/typography/`, `src/layout/`                |
| Procedural algorithms                     | `packages/glyphkiln-core/src/backgrounds/`                              |
| Template registry and compositions        | `packages/glyphkiln-core/src/templates/`                                |
| Scene, quality, SVG, and PNG              | `packages/glyphkiln-core/src/renderer/`                                 |
| Manifests and reproduction                | `packages/glyphkiln-core/src/provenance/`                               |
| Isolated rendering                        | `packages/glyphkiln-core/src/isolation/`                                |
| CLI and offline bundles                   | `packages/glyphkiln-core/src/cli/`                                      |

## Version owners

- Renderer: `RENDERER_VERSION` in `src/domain/types.ts`.
- Procedural algorithms: `PROCEDURAL_ALGORITHM_VERSIONS` in
  `src/backgrounds/index.ts`.
- Templates: each definition in `src/templates/*.ts`; keep the version type in
  `src/templates/types.ts` synchronized.
- Design schema: `DESIGN_DOCUMENT_VERSION` and supported versions in
  `src/domain/types.ts`; versioned unions in `src/schema/design-document.ts`.
- Text-layout diagnostics: `TEXT_LAYOUT_DIAGNOSTICS_VERSION` in typography.
- Manifest: `MANIFEST_VERSION` in `src/domain/types.ts`; serialized contract in
  `src/provenance/`.

Read `docs/versioning.md` before selecting a version owner. Pixel changes do
not automatically imply a design-schema version change.

## Test routing

| Change                            | Start with                                           |
| --------------------------------- | ---------------------------------------------------- |
| Schema or JSON Schema             | `tests/schema.test.ts`, schema conformance verifier  |
| Template or composition policy    | `tests/templates-and-quality.test.ts`                |
| Layout, shaping, glyphs, text fit | `tests/layout-typography.test.ts`, text-layout tests |
| Background algorithm              | `tests/backgrounds.test.ts`                          |
| Seed behavior                     | `tests/seed.test.ts`                                 |
| Canonicalization or fingerprints  | `tests/canonical-and-fingerprint.test.ts`            |
| Render, manifest, reproduction    | `tests/rendering-and-manifest.test.ts`               |
| Exact pixels                      | `tests/visual-regression.test.ts`                    |
| Assets or fonts                   | `tests/assets.test.ts`                               |
| Resource limits                   | `tests/resources.test.ts`                            |
| CLI or bundle                     | `tests/cli.test.ts`, `tests/resource-bundle.test.ts` |
| Isolation or security             | `tests/security.test.ts`, isolation script           |
| Public package surface            | README test and package-consumer test                |

## Generated and exact artifacts

- `npm run fixtures:verify` / `npm run fixtures:update`
- `npm run examples:verify` / `npm run examples:generate`
- `npm run text-layout-data:verify` / `npm run text-layout-data:update`
- `npm run test:update-visuals`
- Core-only schema conformance:
  `npm run schema-conformance:update --workspace @glyphkiln/core`

Prefer verify commands. Use update commands only for deliberate source-owned
changes, then inspect the diff.

## Essential docs

- `docs/architecture.md`
- `docs/design-document.md`
- `docs/determinism.md`
- `docs/rendering-lifecycle.md`
- `docs/quality-policy.md`
- `docs/template-authoring.md`
- `docs/visual-regression.md`
- `docs/versioning.md`
- `docs/resource-bundles.md`
- `SECURITY.md`
