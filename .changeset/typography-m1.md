---
"@glyphkiln/core": minor
---

Add typography M1 on HarfBuzz (ADR 0019): `harfbuzzjs@1.6.4` / HarfBuzz 15.0.0 becomes a runtime dependency. It is loaded lazily, with its wasm SHA-256 checked, and used only by new policies.

New policies:

- `script-runs@1.0.0`: Unicode 17 script itemization.
- `cluster-tracking@1.0.0`: tracking between character units, sara am split before sara aa, optional ligatures off under tracking.
- `font-variation@1.0.0`: every `fvar` axis and named instance.
- `optical-size-auto@1.0.0`: opsz = 0.75 × px at the 1080 px reference, a provisional answer to Q6.
- `script-matching@1.0.0`: auto scale between Latin and Thai faces.

DesignDocument 1.8.0 adds `axes`, `namedInstance`, `opticalSizing` and `opsz` to text layers and roles, plus `fallback` stacks and `scriptFaces` to roles. SceneDocument 1.1.0 adds the same font model to scene text and sets it on M1.

The new template versions `quote-card@1.4.0`, `statistic-card@1.4.0` and `image-led-campaign@1.3.0` opt in; this is the provisional answer to Q1. Renderer 0.6.0, manifest 1.3.0 and Scene manifest 1.1.0 record font identity v2: coordinates, stack role, scale, scripts set and the stacks tried.

Legacy renders keep renderer 0.5.0, manifest 1.2.0 and Scene manifest 1.0.0, so their SVG, PNG, manifest and fingerprint bytes are unchanged.

New exports: `loadTypographyEngine`, the HarfBuzz identity constants, the M1 policy constants, `LEGACY_RENDERER_VERSION`, `LEGACY_MANIFEST_VERSION`, `LEGACY_SCENE_DOCUMENT_VERSION` and `LEGACY_SCENE_RENDER_MANIFEST_VERSION`. Authoring metadata moves to 1.9.0.
