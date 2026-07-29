# Procedural backgrounds

The initial algorithms are:

- `flow-field@1.0.0`: seeded vector-field streamlines
- `layered-waves@1.0.0`: stacked closed sinusoidal fields
- `topographic-contours@1.0.0`: bounded irregular contour rings
- `recursive-subdivision@1.0.0`: seeded rectangular binary subdivision

Each accepts width, height, seed, palette, intensity, density, complexity,
contrast, normalized quiet region, and light/dark mode. Inputs are bounded by
the document schema. All randomized decisions come from a namespaced seeded
PRNG; geometry is clamped to the canvas.

Every result records its algorithm version and adds a high-opacity canvas-color
overlay at the exact quiet region. Flow lines also stop before entering the
region. The overlay is a deliberately simple first-version readability
guarantee and can create a visible soft panel; future algorithm versions may
provide native spatial attenuation instead.

Pixel-affecting changes require an algorithm-version bump, determinism tests,
all-canvas bounds tests, quiet-region tests, and visual review. Never seed from a
clock or use ambient randomness.
