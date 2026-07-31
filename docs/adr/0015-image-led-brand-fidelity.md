# ADR 0015: Image-led brand-fidelity primitives

Status: proposed for visual and product review

## Context

Core 0.4 can verify and embed raster assets, but its cover fit is centered, its
contrast check assumes one flat color, and its brand type settings do not
express reviewed hierarchy roles. The App needs deterministic primitives it can
preview and explain without placing asset selection, designer interaction, or
mutable campaign state inside Core.

## Decision

### Typography roles

Schema 1.4 keeps the existing headline/body family fields for compatibility
and adds optional `display`, `body`, and `label` roles. Each role contains an
explicit family, 100–900 weight, line height from 0.85–1.8, and tracking from
-0.05–0.2 em. Templates decide which semantic layer uses which role. Documents
cannot supply font features, CSS, fallback stacks, or shaping code.

### Focal cover

An image layer may supply a normalized focal point `(x, y)`, each in `[0, 1]`,
plus one treatment ID. Focal cover scales the source uniformly until it covers
the destination. The visible source rectangle is centered on the focal point,
then clamped to the source edges. SVG positions the exact source raster at that
scale inside a destination clip; PNG rasterizes those SVG bytes.

The policy is `focal-cover-v1`. It exposes calculated source, rendered, and
destination bounds as proof. No arbitrary matrix, crop rectangle, CSS object
position, filter graph, or freeform mask is accepted.

### Treatments

The first closed treatment policy is `image-treatment-v1`:

| ID            | Composition                                      |
| ------------- | ------------------------------------------------ |
| `none`        | source image only                                |
| `dark-scrim`  | `#000000` at 0.56 over the composed source pixel |
| `light-scrim` | `#FFFFFF` at 0.78 over the composed source pixel |

The treatment covers the exact destination crop and is serialized as an owned
scene rectangle. Adding or changing treatment pixels requires a new treatment
and renderer/template version review.

### Composited contrast

The first scene-aware contrast policy is
`composited-srgb-grid-5x5-v1`. It samples a fixed 5 × 5 grid at cell centers
inside a text bounding box. Each canvas point maps through the focal-cover
geometry to the nearest source pixel. Source alpha is composited over the scene
background, then the selected treatment is composited, all in encoded sRGB
8-bit channels. The WCAG relative-luminance ratio is calculated for each sample.

The worst ratio must be at least 4.5. Evidence contains policy version,
foreground, threshold, minimum/maximum ratio, and at most 25 ordered sample
records with canvas point, source pixel, composed color, and ratio. The box is
conservative: it samples the text bounds rather than only glyph-covered pixels.

### Proof and provenance

`renderGraphic` returns `render-evidence@1.0.0` containing the safe area,
semantic text bounds and overflow state, image crop records, and contrast
records. Evidence is bounded by the strict layer schema and fixed sample count
and is derived from the same template scene used for both outputs.

Core embeds and renders the exact supplied raster bytes. The asset declaration,
pixel fingerprint, and manifest all bind the supplied source SHA-256; in this
slice the render-asset hash equals the source-asset hash. `renderGraphic` never
normalizes or rewrites a supplied asset. A future pure normalizer must return
new canonical sRGB bytes, both hashes, dimensions, and a report before a caller
creates a design document; it requires a separate accepted policy and negative
profile fixtures.

## Consequences

- Crop, treatment, and proof behavior is deterministic, reviewable, and safe
  for an App overlay.
- Real raster color is assessed where copy is actually composed instead of
  being represented by a guessed flat color.
- Nearest-pixel encoded-sRGB sampling is intentionally simple and pinned; it is
  not color-profile normalization or a claim of perceptual-uniform analysis.
- The first image-led family is concrete composition policy, not a freeform
  editor or template language.
- Active SVG, URLs, paths, network access, dynamic execution, and automatic
  brand inference remain prohibited.

## Review gate

Approve the crop behavior at edge focal points, the three treatment results,
the conservative contrast threshold, the generated campaign photo, and the
three supported format adaptations. The Kilnmaker Seal direction was selected
on 2026-07-31 and deterministically redrawn as flat vector geometry with an
outlined wordmark; its selected pixels and one-color reproduction are reviewed.
Revisit this ADR before marking it accepted if later review changes any pixel or
policy meaning.
