# Architecture

Glyphkiln Core remains a single ESM package with internal module boundaries and
curated public entry points. It lives in the Glyphkiln npm workspace
beside the independently useful application runtime. The workspace coordinates
development, but the application consumes Core only through its package exports.
See [ADR 0010](adr/0010-glyphkiln-monorepo.md).

## Pipeline

```text
untrusted JSON
  → iterative byte/depth/entry resource preflight
  → strict DesignDocument 1.0.0 validation
  → format + template registry lookup
  → required-layer, brand, and pinned Unicode text-layout quality checks
  → bounded caller-supplied asset/font verification
  → explicit versioned template
  → deterministic scene primitives
  → shaped glyph outlines + generated safe SVG
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
measurement, shaping, coverage checks, and outlines use `fontkit`; successful
SVG contains glyph paths rather than recipient-dependent text. Resvg receives
only explicitly loaded font files and has system-font loading disabled. The
tradeoff is that Core owns text layout and
supports a deliberately small visual vocabulary. If richer layout becomes
necessary, a scene-to-Satori or scene-to-Skia adapter can be evaluated without
changing the design document, template metadata, asset interface, or manifest.

## Meaningful ownership boundaries

- `schema`: untrusted-data contract and JSON Schema export
- `resources`: iterative input guards and the public worker profile
- `isolation`: serialized, permission-limited child-process rendering
- `formats`: centralized immutable output dimensions
- `seed` and `cache`: stable randomness, canonical JSON, and fingerprints
- `fonts`, `assets`, `typography`, `layout`: verified resources, pinned
  Unicode 17 text-layout diagnostics, and geometry
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
a document. Cyclic, accessor-backed, non-JSON, oversized, or excessively nested
SDK values fail before recursive schema validation. The CLI reads only a bounded
input file and may write an explicit command-line output; those paths are
operator intent, not document data.

Text-layout classification imports generated range tables compiled from
checksum-verified Unicode 17.0.0 files. Runtime classification does not consult
host ICU, locale, the filesystem, or the network. It diagnoses a narrow known
unsupported set and does not normalize, reorder, strip, or echo user text.

[`RENDER_RESOURCE_LIMITS`](resource-limits.md) defines the in-process boundary.
`renderGraphicIsolated` applies `RENDER_WORKER_PROFILE` for process memory,
timeout, concurrency, filesystem, and subprocess restrictions. Hosts may add a
container policy for kernel-level tenant, credential, and network separation.

See [SECURITY.md](../SECURITY.md) for boundaries across Core, App, Cloud,
ingestion, workers, and optional LLM adapters.
