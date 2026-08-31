# ADR 0018: Public expert Scene Kernel

Status: accepted

## Context

Glyphkiln Core's `DesignDocument` interface deliberately accepts semantic
layers and delegates composition to exact versioned templates. That is the
right default for the App and repeatable campaign production, but it does not
support expert-authored editorial illustrations whose geometry is itself the
reviewed source.

The internal renderer-neutral scene has already proved useful as the common
SVG/PNG layout boundary. Importing an internal `dist` renderer file to reach it
is not a supported solution: it bypasses the package export map, can bypass
normal validation and provenance, and can break in any package release.

## Decision

Core `0.8.0` adds one intentional expert rendering seam at
`@glyphkiln/core/scene`:

```ts
renderScene(sceneDocument, options);
```

The seam accepts strict, bounded, inert `SceneDocument 1.0.0` data and returns
SVG and PNG outputs together with a versioned scene manifest and scene render
fingerprint. Supporting types and runtime validation are public through the
same subpath; internal renderer files remain private.

### Two authoring levels

`DesignDocument` remains coordinate-free. It continues to describe semantic
content, an exact template, a brand snapshot, and resolved resources. Templates
continue to own composition for ordinary product and App authoring.

`SceneDocument` is the expert escape hatch. It may contain explicit bounded
geometry, but only through a closed versioned union. Version `1.0.0` covers:

- primitive shapes, paths, embedded verified raster references, and text;
- nested groups with closed translate, rotate, and scale transforms;
- closed clipping geometry;
- connectors with validated semantic source/target element references and an
  explicit bounded route;
- a semantic reading order independent of paint order; and
- Core-laid-out text in `outline` or `outline-with-selectable-text` mode.

There is no CSS, markup, callback, expression, arbitrary matrix, runtime
registration, user-selected module, or uploaded SVG in the contract.

### One owned render lifecycle

`renderScene` owns the complete validation-to-output path. It validates the
scene, verifies caller-resolved assets and fonts, lays out and shapes text,
resolves groups and clips, validates connector endpoint references, serializes
explicit routes and safe SVG, rasterizes those exact SVG bytes with the pinned
rasterizer, and constructs the scene manifest and fingerprint. Core owns closed
arrow-marker geometry; automatic attachment and route finding belong to a later
semantic layout compiler.

The public seam is not a mutable canvas API and does not expose a
serializer-only shortcut. SVG and PNG continue to share one geometry and SVG
serialization path.

### Text and accessibility semantics

Core remains the text-layout authority in both text modes. `outline` emits the
reviewed visual glyph outlines. `outline-with-selectable-text` keeps those
outlines as the visual source of truth and adds a selectable text companion
derived from the same Core-owned line layout. Recipient font discovery or text
reflow cannot change the outline pixels.

The semantic reading order is explicit scene data, validated against stable
element identities, and serialized independently of paint order. It is useful
accessibility evidence, not a tagged-PDF claim.

### Version and reproduction boundaries

`SceneDocument`, the Scene Kernel, the scene manifest, and the public package
surface have their own explicit versions. They start at `1.0.0`. Changes to
accepted scene meaning require a scene-schema version review. Changes to shared
geometry, text layout, SVG serialization, or PNG rasterization require the
applicable renderer version and reviewed exact baselines. Changes to
scene-manifest fields or meanings require a scene-manifest version.

The scene fingerprint binds every output-affecting scene value, resolved
resource identity, renderer policy, and output format. Request identity,
timestamps, and explicitly non-rendering metadata stay outside the pixel
fingerprint.

The shared renderer identity advances from `0.4.0` to `0.5.0` for this new
geometry and serialization surface. Existing `DesignDocument` validation,
templates, SVG bytes, and PNG bytes remain unchanged, but their fingerprints
and manifest bytes intentionally change because they record that renderer
identity. Manifest schema `1.2.0` remains valid.

### Product boundary

Glyphkiln App does not accept `SceneDocument` from the browser in this
milestone. Its closed manual workflow and server-owned template/resource
resolution remain unchanged.

A later `@glyphkiln/book` package may compile teaching goals, claims, sources,
and semantic concept graphs into validated scenes. That compiler, its layout
search, book structure, citations, and publication workflow are not part of
Scene Kernel v1.

## Consequences

- Expert consumers can build supported editorial, diagram, and spread fixtures
  without importing private package files.
- The normal authoring interface stays semantic and constrained; adding an
  expert seam does not turn `DesignDocument` into a coordinate language.
- Core takes on a public compatibility contract for the closed scene schema,
  manifest, fingerprint, and one deep render operation.
- Explicit geometry can reproduce a poor composition exactly. Scene Kernel is
  rendering infrastructure, not a layout solver, art director, or truth
  validator.
- The new seam extends [ADR 0001](0001-renderer-selection.md),
  [ADR 0006](0006-svg-png-export.md), and
  [ADR 0008](0008-package-public-api.md); it does not supersede their shared
  SVG/PNG or curated-export decisions.

## Non-goals

Dynamic plugins, runtime grammar loading, browser/App freeform editing,
render-time network access, remote assets, active SVG, PDF, CMYK, page
imposition, semantic illustration compilation, automatic composition search,
and scientific or pedagogical correctness certification.
