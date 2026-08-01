# Core 0.5 brand-fidelity vertical slice

Status: implemented and verified on `codex/core-0.5-brand-fidelity` from release
candidate `52fbd04`; visual/product acceptance remains the ADR review gate.

## Outcome

Ship the first complete Core 0.5 path for an image-led campaign: a strict
schema 1.4 document selects exact raster image and logo bytes, supplies a
normalized focal point and a closed treatment, applies bounded brand type-role
controls, renders one versioned campaign family, reports composited-raster
contrast and crop proof, and emits exact SVG, PNG, and provenance artifacts.

The App remains responsible for admitting and selecting assets, presenting crop
and proof overlays, and saving immutable revisions. Core receives only inert
data and already-resolved bytes.

## Included contract

- Design schema `1.4.0` adds bounded display/body/label typography roles and
  image-layer focal-point/treatment fields. Schemas `1.0.0` through `1.3.0`
  retain their exact field surfaces.
- `image-led-campaign@1.0.0` requires one `image`, one `logo`, and one
  `headline`, supports a bounded set of optional copy roles, and adapts across
  LinkedIn landscape, Instagram square, and Instagram portrait.
- A pure focal-cover geometry helper clamps the focal point only as much as is
  necessary to fill the destination. It never accepts arbitrary transforms or
  coordinates outside normalized image space.
- Treatments are limited to `none`, `dark-scrim`, and `light-scrim`, with
  versioned fixed color/opacity behavior.
- A pinned scene-aware policy samples a fixed grid beneath each text box after
  source alpha and the selected treatment are composed. It returns bounded
  evidence and blocks text whose worst sampled contrast is below the policy
  threshold.
- `renderGraphic` returns versioned safe-area, text-bound, crop, and contrast
  evidence. The evidence is derived from the same scene used for SVG and PNG.
- Exact supplied source bytes remain the render asset bytes. Their SHA-256 is
  already bound by the document, fingerprint, and manifest; no normalizer runs
  implicitly.

## Compatibility and version ownership

- Bump the design schema minor to `1.4.0` for new authoring controls.
- Add a new template ID at `1.0.0`; do not repoint any existing template.
- Bump the shared renderer to `0.4.0` because focal clipping and scaled
  tracking extend shared scene/SVG behavior. Existing SVG and PNG output bytes
  must remain exact; renderer identity and fingerprints deliberately change.
- Keep manifest `1.2.0`: no serialized manifest field or meaning changes.
- Publish a minor Changeset for `@glyphkiln/core`.

## Tests and artifacts

- Schema and JSON Schema coverage for current fields, bounds, defaults, and
  rejection by legacy schemas.
- Exact focal geometry vectors for aspect-ratio and edge cases.
- PNG/JPEG/alpha contrast sampling, treatment, low-contrast, and evidence
  bounds tests.
- Template requirement, deterministic-render, packed-consumer, and old-output
  byte-parity tests.
- One reviewed AI-created campaign raster and one reviewed raster logo, with
  exact source declarations and generated design/SVG/PNG/manifest artifacts.
- All generated artifact verifiers plus the root build, typecheck, lint, full
  tests, and coverage gates.

## Deferred Core 0.5 work

- A pure color-profile normalizer that emits canonical sRGB bytes plus
  source/output hashes and rejects malformed or oversized profiles.
- More real multi-weight brand fonts and two additional, visually distinct
  brand acceptance campaigns.
- More masks/treatments only when real briefs justify them.
- App asset pickers, crop interaction, proof overlays, immutable snapshot
  publication, and designer review workflows.

These are explicit remaining milestone work, not hidden behavior in this slice.
