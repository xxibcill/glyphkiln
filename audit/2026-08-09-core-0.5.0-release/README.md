# Core 0.5.0 release qualification

Date: 2026-08-09

Release payload commit: `e03744d91e6c58ae31cb33dc306b473dfb141382`

Release payload tree: `4b7d5b5cef3be950467c0b72c7a97662495ff99a`

Target source release: signed tag `v0.5.0`

## Scope

The release materializes `@glyphkiln/core@0.5.0`,
`@glyphkiln/app@0.0.3`, and `@glyphkiln/example-style-showcase@0.0.2` from the
merged brand-fidelity vertical slice. It also refreshes patched transitive
lockfile resolutions for `brace-expansion`, `fast-uri`, `js-yaml`, and
`nanoid` after new advisories appeared during release qualification.

The release-only changes do not alter renderer behavior or output pixels.
Schema `1.4.0`, renderer `0.4.0`, `image-led-campaign@1.0.0`, manifest `1.2.0`,
typography algorithm `2.0.0`, and text-layout diagnostics
`unicode-17.0.0/ltr-horizontal-v1` remain the embedded contracts qualified in
the merged feature slice.

## Supported runtime matrix

The complete required repository gates passed locally with npm `10.9.8` on:

- Node.js `22.13.0`; and
- Node.js `24.16.0`.

The merged feature pull request also passed GitHub CI on Node.js `22.13.0` and
the current Node.js 24 line.

## Required gates

- `npm ci`
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:coverage`

Both local runtime passes completed 239 Core tests, 391 App tests, and four
showcase tests. Core coverage was 87.8% statements, 76.2% branches, 87.92%
functions, and 89.21% lines. App coverage was 86.94% statements, 80.9%
branches, 91.51% functions, and 88.91% lines. Showcase coverage was 92.27%
lines, 88.37% branches, and 100% functions.

The existing non-blocking Next.js NFT trace warning from `next.config.ts`
remained unchanged. The standalone App smoke passed on both runtimes.

## Deterministic and packaging gates

The following checks passed:

- focused CLI, schema, image-fidelity, template-quality, and exact visual tests
  (100 tests);
- 16 full fixture documents;
- exact Core examples and the standalone style showcase;
- Unicode 17.0.0 text-layout data;
- five schema-conformance documents with a clean generated diff;
- Kilnmaker Seal symbol, horizontal, and monochrome identity files;
- 30 production dependency license records;
- fresh packed JavaScript, strict TypeScript, CLI, and isolated consumers;
- Core dry-pack inspection: 208 files, 619.9 kB packed, 1.7 MB unpacked; and
- `npm audit --audit-level=low` with zero vulnerabilities on both runtimes.

## Visual review

The reviewed set included the image-led campaign landscape, square, and
portrait design/PNG/manifest combinations plus the Kilnmaker Seal symbol,
horizontal, and monochrome SVG/PNG outputs. Crop intent, safe areas, text
hierarchy, CTA placement, contrast treatment, transparency, and format
adaptation were consistent with the accepted vertical-slice design.

No baseline was regenerated during release preparation.
