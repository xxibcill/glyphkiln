# Architecture

Glyphkiln Core is a single ESM package with internal module boundaries and one
intentional public entry point. A monorepo would add release and dependency
coordination without giving this milestone a second independently useful
package, so it is deferred.

## Pipeline

```text
untrusted JSON
  → strict DesignDocument 1.0.0 validation
  → format + template registry lookup
  → caller-supplied asset/font verification
  → explicit versioned template
  → deterministic scene primitives
  → generated safe SVG
  ├─→ SVG bytes
  └─→ Resvg with explicit font files → PNG bytes
       → canonical fingerprint + provenance manifest
```

The renderer is vector-first. Templates operate on semantic layers and emit a
small renderer-neutral scene (`rect`, `circle`, `path`, `text`, and embedded
image). SVG serialization is owned by Core. PNG is a rasterization of those
same SVG bytes, not a separate layout implementation.

## Renderer recommendation

| Option             | Strength                                                        | Initial concern                                                                               |
| ------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Direct SVG + Resvg | Auditable output, deterministic geometry, shared SVG/PNG layout | Core owns layout and text wrapping                                                            |
| Satori + Resvg     | Familiar component layout                                       | HTML/CSS subset and Yoga behavior add an abstraction not needed by four constrained templates |
| Skia Canvas        | High-quality mature drawing                                     | Native surface, primarily raster, and harder SVG equivalence                                  |
| Browser rendering  | Broad CSS support                                               | Large nondeterministic runtime surface, sandboxing, and operational weight                    |
| Node Canvas        | Familiar canvas API                                             | Native dependencies, raster-first architecture, and platform font discovery                   |

Direct SVG scene generation plus pinned `@resvg/resvg-js` was selected. Font
measurement uses `fontkit`; Resvg receives only explicitly loaded font files and
has system-font loading disabled. The tradeoff is that Core owns text layout and
supports a deliberately small visual vocabulary. If richer layout becomes
necessary, a scene-to-Satori or scene-to-Skia adapter can be evaluated without
changing the design document, template metadata, asset interface, or manifest.

## Meaningful ownership boundaries

- `schema`: untrusted-data contract and JSON Schema export
- `formats`: centralized immutable output dimensions
- `seed` and `cache`: stable randomness, canonical JSON, and fingerprints
- `fonts`, `assets`, `typography`, `layout`: verified resources and geometry
- `backgrounds`: deterministic versioned algorithms
- `templates`: concrete composition policy
- `renderer`: scene, SVG serialization, PNG rasterization, quality gating
- `provenance`: externally serializable manifest
- `cli`: filesystem adapter over the SDK

The package has no Cloud client, authentication, persistence, queue, billing, or
LLM dependency.

## Security boundary

Design documents contain data, never executable code. Core does not interpret
expressions, dynamically import modules, fetch URLs, or read paths named inside
a document. The CLI may read an explicit command-line input and write an
explicit command-line output; those paths are operator intent, not document
data. Rendering workers should add process-level resource and network isolation.

See [SECURITY.md](../SECURITY.md) for boundaries across Core, App, Cloud,
ingestion, workers, and optional LLM adapters.
