# Scene Kernel

Scene Kernel is Glyphkiln Core's expert rendering interface for reviewed
geometry. It is intended for authors of deterministic illustration compilers,
versioned fixtures, diagrams, and editorial spreads that cannot be expressed by
one of Core's fixed semantic templates.

The public entry point is:

```ts
import { renderScene, type SceneDocument } from "@glyphkiln/core/scene";

const scene: SceneDocument = buildReviewedSceneData();
const result = await renderScene(scene, {
  formats: ["svg", "png"],
  assets: resolvedAssets,
  fonts: resolvedFonts,
});
```

`buildReviewedSceneData()` in this example is ordinary trusted authoring code
that returns inert data. It is not code embedded in the document. The caller
resolves explicit asset and font bytes; Core independently verifies them against
the document declarations and resource limits before rendering. The scene cannot
name a path or URL.

## Choose the correct authoring interface

Use the root `@glyphkiln/core` `DesignDocument` API when authors should provide
semantic copy, a template, a brand snapshot, and resource declarations. That
interface intentionally has no freeform coordinates, and exact versioned
templates own its composition.

Use `@glyphkiln/core/scene` only when explicit geometry is a reviewed input and
the caller accepts responsibility for composition quality. Scene Kernel can
reproduce a weak layout as faithfully as a strong one.

Do not send browser-authored scenes to Glyphkiln App. App commands remain closed
manual or campaign commands; the server continues to resolve trusted template,
brand, resource, and revision identities.

## `SceneDocument 1.0.0`

The scene document is strict, bounded, JSON-compatible data. Unknown fields,
non-finite numbers, accessors, cycles, excessive depth or entries, duplicate
identities, invalid references, and out-of-policy geometry fail before output.
Explicit geometry must lie on Core's `0.001` serialization grid. Path data uses
a closed SVG command grammar with bounded resolved coordinates, while text and
labels must contain XML 1.0-compatible characters. Canvas dimensions are
limited independently from total canvas area.

The v1 vocabulary is deliberately closed:

- vector primitives and paths;
- verified embedded-raster references;
- Core-laid-out text;
- nested groups;
- closed translate, rotate, and scale transforms;
- closed clips;
- connectors with declared semantic source/target element references and an
  explicit bounded route; and
- explicit semantic reading order.

Paint order and semantic reading order are separate. Children retain explicit
array order for painting. Reading order is an ordered set of stable semantic
element identities and must not be inferred from coordinates, object insertion
order, or host accessibility heuristics.

Connectors name existing source and target elements as semantic endpoints and
supply their route as an explicit bounded point sequence. Core validates those
references and serializes the route and closed arrow-marker geometry
deterministically. It does not find attachment points or route around obstacles
in v1. Documents do not supply callbacks, routers, selectors, or executable path
logic.

## Text modes

Scene text is live input data but Core owns its complete visual layout: coverage
checks, segmentation, wrapping, shaping, fitting, glyph positioning, and
outlines use explicit verified font bytes and versioned policies.

`outline` makes glyph paths the complete visual text representation. Plaintext
may still appear in escaped title, description, label, and accessibility
attributes; there is no live `<text>` element for the outlined text itself.

`outline-with-selectable-text` retains the same outline geometry as the visual
source of truth and adds selectable text derived from the same Core-owned line
layout. A host may substitute a local face for that transparent companion if the
declared face is unavailable, but it does not become a second visual layout path
and cannot alter the reviewed outline pixels.

Semantic reading order plus selectable text improves SVG review and extraction,
but it is not tagged PDF, PDF/UA conformance, or a substitute for human review
of descriptions and reading sequence.

## Render result

`renderScene` is the only public rendering operation for a scene. A successful
call returns:

- safe generated SVG bytes;
- PNG bytes rasterized from that exact SVG;
- a versioned scene manifest for each output;
- a canonical scene render fingerprint; and
- bounded quality issues defined by the Scene contract.

The scene manifest binds the normalized scene, exact resource hashes, scene and
renderer policy versions, output format, output hash, and fingerprint. SVG and
PNG have different output bytes and therefore distinct per-output evidence,
while retaining the same resolved geometry.

The initial scene document, Scene Kernel, and scene manifest versions are all
`1.0.0`. Core `0.8.0` also advances the shared renderer identity to `0.5.0`.
Existing semantic `renderGraphic` SVG and PNG bytes remain exact, while their
fingerprints and manifest bytes intentionally update because they include that
renderer identity.

Request IDs, creation timestamps, output paths, and non-rendering metadata do
not affect pixels. See [Determinism](determinism.md) and
[Versioning](versioning.md).

## Security and resource resolution

Scene Kernel accepts data, never behavior. It does not accept or perform:

- scripts, expressions, callbacks, dynamic imports, or user-selected modules;
- CSS, HTML, template expressions, or runtime component registration;
- URLs, network fetching, document-selected filesystem paths, or host fonts;
- uploaded or externally referenced SVG;
- malformed or unbounded transforms, coordinates, paths, canvases,
  collections, text, or resources;
  or
- implicit resource discovery.

Raster and font bytes remain explicit caller inputs and must match declared
identities and hashes. Services should isolate Scene rendering at the process or
container boundary and retain their own authorization, admission,
malware-scanning, storage, and tenant controls for untrusted work.

## Reproducibility rules

- Preserve element, child, reading-order, and connector order explicitly.
- Use the document seed and Core's seeded streams for every procedural choice.
- Pin the exact scene schema, renderer, manifest, font, asset, and rasterizer
  versions used for a locked result.
- Never depend on locale collation, filesystem order, host fonts, object-key
  insertion order, wall-clock time, or network state.
- Treat any shared geometry, typography, serialization, or rasterization change
  as a reviewed renderer-version decision.

`verifySceneReproduction` validates the manifest structure and all
document/resource/output identities available from a locked scene and its
bytes. Quality-issue entries are structurally validated but must be rederived by
a fresh `renderScene` call when a reviewer needs to attest the diagnostics
themselves.

## Non-goals

Scene Kernel v1 is not:

- a semantic concept graph or teaching-content model;
- an automatic layout solver or composition scorer;
- a visual-grammar plugin system;
- a book, chapter, spread, citation, or page-master model;
- a PDF, print, CMYK, ICC, bleed, imposition, or font-subsetting pipeline;
- an App authoring endpoint or mutable drawing canvas; or
- a claim that generated illustrations are beautiful, truthful, or
  comprehensible.

A later `@glyphkiln/book` module may compile semantic illustration input into
validated scenes and assemble publication/review packages. It must use the
public Scene Kernel rather than private renderer files, and it remains subject
to the same inert-data, deterministic-resource, and offline-render boundaries.
