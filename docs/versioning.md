# Versioning policy

The npm package follows semantic versioning. Before package `1.0.0`, minor
versions may contain public-API changes, but changesets and release notes must
state them explicitly.

Independent embedded versions protect reproducibility:

- design schema: bump major/minor/patch according to contract compatibility
- scene schema: bump when accepted `SceneDocument` data or its meaning changes
- template: bump whenever required rules or pixels change
- procedural algorithm: bump whenever pixels change for identical inputs
- renderer: bump for SVG serialization, geometry, typography, or rasterizer
  behavior changes
- manifest: bump when provenance fields or meanings change
- scene manifest: bump when Scene Kernel provenance fields or meanings change

Old document/template combinations must fail explicitly when unsupported; never
silently migrate during render. Migration belongs in an explicit pure utility
that produces a new reviewed document.

Public exports from the package root and the documented `./schema`, `./browser`,
and `./scene` subpaths are intentional. Internal file paths are not public API.
The `./schema` subpath is for applications that need the semantic-design runtime
schema and JSON Schema export. The `./scene` subpath is the expert Scene Kernel;
it does not make renderer internals public.

Core `0.8.0` adds that expert subpath as a new public capability. Scene document,
Scene Kernel, and scene manifest versions start at `1.0.0`; the subpath exposes
one deep `renderScene` lifecycle over a strict closed scene: nested groups,
closed transforms and clips, explicit-route connectors with validated semantic
endpoints, semantic reading order, and Core-laid-out `outline` or
`outline-with-selectable-text`. SVG and PNG results carry a scene manifest and
fingerprint. Adding the entry point is a package minor release.

The shared renderer advances from `0.4.0` to `0.5.0` for the new geometry and
serialization surface. Existing `DesignDocument` validation, template choices,
SVG bytes, and PNG bytes remain unchanged. Their fingerprints and manifest bytes
intentionally change because renderer identity is part of both contracts;
manifest schema `1.2.0` does not change. Glyphkiln App does not accept Scene
documents. A later semantic `@glyphkiln/book` compiler is a separate package and
release decision.

After the initial Scene Kernel release, accepted scene shape or field meaning is
owned by the scene schema version. Changes to geometry, text layout,
serialization, or raster output require renderer-version review and deliberate
pixel baselines. Changes to recorded Scene provenance require a scene-manifest
version review. A package bump never substitutes for those embedded versions.

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
owns the first 3:4 organic-photo composition. Versions `1.0.1` and `1.0.2` retain
their exact 9:16 `tiktok-carousel` pixels and remain available for saved ad
documents.

Template `tiktok-carousel-slide@1.0.4` raises organic headline leading to `1.08`,
uses content-responsive type-field heights, makes eyebrow/footer chrome truly
optional, and adds deterministic Core-owned pattern rails when a procedural
layer is present. The template version owns the deliberate pixel changes;
schema `1.4.0`, renderer `0.4.0`, manifest `1.2.0`, and existing procedural
algorithm versions remain unchanged. Version `1.0.3` stays exactly renderable.
Authoring metadata `1.2.0` publishes the new rules and campaign-family metadata
`1.2.0` selects `1.0.4` for new organic carousel work.

Design schema `1.4.0` adds bounded brand typography roles plus focal-point and
closed treatment fields for image layers. `image-led-campaign@1.0.0` owns the
first adaptive image-led composition. Renderer `0.4.0` owns scaled role
tracking, focal clipping, and pinned focal/treatment/contrast configuration.
Legacy SVG and PNG bytes remain exact; their renderer identity and fingerprints
deliberately change. Manifest `1.2.0` remains unchanged.

Template `image-led-campaign@1.0.1` corrects the compact logo geometry by sizing
the contained box from the admitted raster aspect ratio and anchoring it to the
safe-area column. The change is template-owned: renderer `0.4.0`, schema
`1.4.0`, and manifest `1.2.0` remain unchanged. Version `1.0.0` stays available
with its exact fixed-slot pixels. Authoring metadata `1.0.1` publishes both
versions, while campaign-family metadata `1.1.1` selects `1.0.1`.

Campaign-family metadata `1.0.0` identifies exact template members, compatible
formats, semantic roles, closed composition variants, and safe-area behavior.
Campaign seed derivation `sha256/canonical-scope-v1` separates a shared
art-direction stream from exact canvas streams. These App-coordination
contracts do not change documents, pixels, fingerprints, renderer identity,
templates, or manifests.

Campaign-family metadata `1.1.0` adds the existing
`tiktok-carousel-slide@1.0.3` template and `tiktok-photo-carousel` format to the
image-led family. Family members carry their own semantic roles, safe-area
guidance, and closed composition variant, so the carousel retains its
authoritative typography-first `organic-photo-editorial` contract rather than
inheriting image and logo requirements. Repeated carousel canvas keys remain
separate seed streams. No template, renderer, manifest, fingerprint, SVG, or
PNG behavior changes.

Authoring metadata `1.0.0` describes every supported exact template version as
browser-safe static data. Actionable issue metadata `1.0.0` supplies a bounded
designer-action vocabulary, candidate validation `1.0.0` preserves supplied
order while returning normalized documents and canonical JSON only for strict
schema/template/document-quality successes, and quality-to-action mapping
`1.0.0` converts bounded proof issues to fixed guidance without copying runtime
messages or details. These contracts do not change the design schema,
templates, renderer, procedural algorithms, manifest, fingerprints, SVG, or
PNG output.

Authoring metadata `1.1.0` adds explicitly advisory character ranges without
changing schema bounds or candidate validity. Delivery-profile metadata `1.0.0`
separates Instagram native/API and TikTok native/API/ad publishing paths with
portable dated sources and evidence levels. Carousel sequence review `1.0.0`
and delivery sidecars `1.0.0` add non-pixel coordination, accessibility, and
claim-source records. Render evidence `1.1.0` adds the exact fitted `fontSize`
for delivered-size proofing. None of these contracts changes template geometry,
renderer identity, manifests, fingerprints, SVG, or PNG bytes.

Authoring metadata `1.2.0` publishes the exact `tiktok-carousel-slide@1.0.4`
contract and its leading, optional-chrome, and purposeful-pattern guidance.
Campaign-family metadata `1.2.0` selects that template for new organic carousel
canvases. These metadata bumps identify the template-owned pixel change; they do
not alter saved documents or renderer behavior.

The App BriefInterpreter response contract and validator start at `1.0.0`.
They define a strict three-or-four-proposal envelope, bounded suggestion
rationales, stable response issues, Core candidate evaluation, and
proposal-only authority. They do not configure or call a model and do not
authorize workspace resources, persistence, rendering, export, or publication.

The App authoring lock contract and validator start at `1.0.0`. Six closed lock
IDs compare fixed projections of two Core-normalized documents and return only
bounded actionable issues. This App coordination contract has no effect on the
design schema, templates, renderer, procedural algorithms, manifest,
fingerprints, SVG, PNG, or legacy validation/render behavior.

Color-normalization policy `canonical-srgb-png-v1` pins the accepted byte,
profile, orientation, color-runtime, and canonical PNG encoding behavior. It is
an explicit pre-document utility, not part of rendering. Its source and output
hashes identify different immutable resources. Adding the utility does not
change the design schema, templates, renderer, procedural algorithms, manifest,
fingerprints, SVG, PNG render output, or legacy validation behavior. The first
implementation pins `@kittl/little-cms@1.0.3`, Glyphkiln raw-WASM adapter `v1`,
pngjs `7.0.0`, and jpeg-js `0.4.4`; it supports embedded RGB and grayscale ICC
profiles and rejects CMYK/other spaces with a stable error.
