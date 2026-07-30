# Versioning policy

The npm package follows semantic versioning. Before package `1.0.0`, minor
versions may contain public-API changes, but changesets and release notes must
state them explicitly.

Independent embedded versions protect reproducibility:

- design schema: bump major/minor/patch according to contract compatibility
- template: bump whenever required rules or pixels change
- procedural algorithm: bump whenever pixels change for identical inputs
- renderer: bump for SVG serialization, geometry, typography, or rasterizer
  behavior changes
- manifest: bump when provenance fields or meanings change

Old document/template combinations must fail explicitly when unsupported; never
silently migrate during render. Migration belongs in an explicit pure utility
that produces a new reviewed document.

Public exports in `src/index.ts` are intentional. Internal file paths are not
public API. The `./schema` subpath is public for applications that need the
runtime schema and JSON Schema export.

Text-layout acceptance has the independent
`TEXT_LAYOUT_DIAGNOSTICS_VERSION`. Package `0.3.0` adds
`unicode-17.0.0/ltr-horizontal-v1` without changing design schema `1.0.0`,
manifest `1.1.0`, template or procedural versions, or renderer `0.2.0`.
Accepted documents retain identical output bytes and fingerprints; rejected
documents produce no output or manifest.
