# Design-document specification

`DesignDocument` is strict, JSON-compatible, and explicitly versioned at
`1.0.0`. Unknown properties are rejected at every structural object. The Zod
schema provides TypeScript inference, discriminated unions, actionable paths,
and draft 2020-12 JSON Schema through `getDesignDocumentJsonSchema()`.

Top-level fields:

- `schemaVersion`, `id`, `seed`, and `mode`
- exact `template.id` and semantic `template.version`
- a format registry ID
- immutable `brand` snapshot
- asset and font declarations
- semantic `layers`
- optional JSON `metadata` that cannot affect rendering

Brand snapshots contain a stable ID/version, core palette, light and dark
themes, explicit font families, spacing, radii, visual density, procedural
preferences, normalized safe-area insets, and prohibited colors/styles. The
snapshot is embedded so an old document does not change when a mutable brand kit
in an application is edited.

All declared controls have an explicit `1.1.0` behavior: the theme surface owns
procedural quiet regions, spacing controls decorative radii, visual density
scales procedural density, monospace typography is used for compact CTA/trend
copy, non-preferred procedural styles warn, and prohibited template/procedural
styles block rendering.

## Layer union

| Type                                     | Role                                                   |
| ---------------------------------------- | ------------------------------------------------------ |
| `background`                             | Optional solid canvas override                         |
| `procedural-decoration`                  | Versioned procedural style and normalized quiet region |
| `headline`, `subtitle`, `eyebrow`, `cta` | Primary composition copy                               |
| `logo`, `product-screenshot`, `image`    | Reference a declared resolved raster asset             |
| `icon`                                   | One of a bounded built-in icon ID set                  |
| `badge`, `shape`                         | Constrained supporting visual                          |
| `statistic`, `chart`                     | Structured business data                               |
| `footer`, `attribution`                  | Supporting source or author copy                       |

Templates explicitly declare which semantic layers they implement:

| Template               | Accepted visible layers                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `product-announcement` | `background`, `procedural-decoration`, `eyebrow` or `badge`, `headline`, `subtitle`, `cta`, `product-screenshot` |
| `statistic-card`       | `background`, `procedural-decoration`, `headline`, `statistic`                                                   |
| `quote-card`           | `background`, `procedural-decoration`, `headline`, `attribution`                                                 |
| `article-cover`        | `background`, `procedural-decoration`, `eyebrow`, `headline`, `attribution`                                      |

A template accepts at most one visible layer of each type. Unsupported,
duplicate, or mutually exclusive visible layers are error-level quality issues
and block rendering; they are never silently ignored. The larger schema union
allows future versioned templates to adopt additional semantics without adding
freeform code or layout instructions.

Version `1.0.0` deliberately does not expose arbitrary coordinates, CSS,
markup, expressions, or scripts. That constraint keeps composition quality
predictable and prevents a document from becoming a programming language.

String lengths, collection sizes, normalized values, dimensions, colors,
hashes, identifiers, semantic versions, metadata depth, and encoded input size
are bounded. Layer and asset IDs must be unique. A schema-valid document can
still fail template or quality rules, such as a missing required semantic layer
or insufficient contrast. See [Resource limits](resource-limits.md).

Standard JSON Schema cannot express uniqueness by an object property portably.
`DESIGN_DOCUMENT_RUNTIME_REFINEMENTS` publishes the exact uniqueness and quiet
region sum rules that `validateDesignDocument` applies after draft 2020-12
validation.
