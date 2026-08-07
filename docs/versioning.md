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

Public exports in `packages/glyphkiln-core/src/index.ts` are intentional.
Internal file paths are not
public API. The `./schema` subpath is public for applications that need the
runtime schema and JSON Schema export.

Text-layout acceptance has the independent
`TEXT_LAYOUT_DIAGNOSTICS_VERSION`. Package `0.3.0` adds
`unicode-17.0.0/ltr-horizontal-v1` without changing design schema `1.0.0`,
manifest `1.1.0`, template or procedural versions, or renderer `0.2.0`.
Accepted documents retain identical output bytes and fingerprints; rejected
documents produce no output or manifest.

Typography algorithm `2.0.0` is the first explicit shared wrapping-policy
version. It introduces pinned Thai segmentation and balanced Thai lines.
Renderer `0.3.0` owns the pixel change, design schema `1.2.0` owns the optional
`keepTogether` text-layer field, and manifest `1.2.0` records the full policy.
The policy is also included in fingerprint renderer configuration. Legacy
schemas remain readable and keep their original field surface.

Design schema `1.3.0` adds the `tiktok-photo-carousel` format without changing
the renderer or manifest contracts. Template `tiktok-carousel-slide@1.0.3`
owns the new 3:4 organic-photo composition. Versions `1.0.1` and `1.0.2` retain
their exact 9:16 `tiktok-carousel` pixels and remain available for saved ad
documents.

Design schema `1.4.0` adds bounded brand typography roles plus focal-point and
closed treatment fields for image layers. `image-led-campaign@1.0.0` owns the
first adaptive image-led composition. Renderer `0.4.0` owns scaled role
tracking, focal clipping, and pinned focal/treatment/contrast configuration.
Legacy SVG and PNG bytes remain exact; their renderer identity and fingerprints
deliberately change. Manifest `1.2.0` remains unchanged.

Campaign-family metadata `1.0.0` identifies exact template members, compatible
formats, semantic roles, closed composition variants, and safe-area behavior.
Campaign seed derivation `sha256/canonical-scope-v1` separates a shared
art-direction stream from exact canvas streams. These App-coordination
contracts do not change documents, pixels, fingerprints, renderer identity,
templates, or manifests.

Authoring metadata `1.0.0` describes every supported exact template version as
browser-safe static data. Actionable issue metadata `1.0.0` supplies a bounded
designer-action vocabulary, candidate validation `1.0.0` preserves supplied
order while returning normalized documents and canonical JSON only for strict
schema/template/document-quality successes, and quality-to-action mapping
`1.0.0` converts bounded proof issues to fixed guidance without copying runtime
messages or details. These contracts do not change the design schema,
templates, renderer, procedural algorithms, manifest, fingerprints, SVG, or
PNG output.
