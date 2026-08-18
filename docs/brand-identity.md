# Glyphkiln brand identity

## Current official logo

The current official Glyphkiln logo is the project owner's interlocking GK
monogram, approved on 2026-08-18. The canonical source is
[`glyphkiln-mark.svg`](../assets/brand/glyphkiln/glyphkiln-mark.svg). It has a
transparent background and is the primary mark.

Use
[`glyphkiln-mark-on-ivory.svg`](../assets/brand/glyphkiln/glyphkiln-mark-on-ivory.svg)
when the surface is dark, photographic, or otherwise cannot provide reliable
contrast. Its warm-ivory background is part of the asset and must not be
cropped away.

The exact designation, byte sizes, and SHA-256 hashes are recorded in
[`identity.json`](../assets/brand/glyphkiln/identity.json). Run
`npm run identity:glyphkiln:verify` to confirm the canonical masters and their
deliverable copies remain exact.

## Usage rules

- Preserve the SVG view box and aspect ratio. Do not stretch, shear, redraw, or
  rearrange the monogram.
- Use the transparent primary mark wherever the surrounding surface provides
  sufficient contrast.
- Use the complete warm-ivory variant on dark or visually complex surfaces.
- Do not substitute qualification-only, generated, or third-party marks for
  the canonical masters.
- Glyphkiln Core receives an exact, deterministic rasterization when a logo is
  used in a render document; it does not admit active SVG as render input.

Changing the official logo requires an explicit owner decision and coordinated
updates to the identity manifest, verifier, documentation, and affected visual
artifacts.
