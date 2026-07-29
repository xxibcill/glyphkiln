# Procedural backgrounds

The initial algorithms are:

- `flow-field@1.1.0`: seeded vector-field streamlines
- `layered-waves@1.1.0`: stacked closed sinusoidal fields
- `topographic-contours@1.1.0`: bounded irregular contour rings
- `recursive-subdivision@1.1.0`: seeded rectangular binary subdivision

Each accepts width, height, seed, palette, intensity, density, complexity,
contrast, normalized quiet region, and light/dark mode. Inputs are bounded by
the document schema. All randomized decisions come from a namespaced seeded
PRNG; geometry is clamped to the canvas.

Every generated primitive carries an exact exclusion mask for the normalized
quiet region. No procedural pixels are painted inside it; the brand theme
surface underneath becomes the copy panel. The brand visual-density setting
scales procedural density before generation. This behavior is raster-tested and
versioned as `1.1.0`.

Pixel-affecting changes require an algorithm-version bump, determinism tests,
all-canvas bounds tests, quiet-region tests, and visual review. Never seed from a
clock or use ambient randomness.
