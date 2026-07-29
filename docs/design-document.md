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

Templates decide where semantic layers are placed. Version `1.0.0` deliberately
does not expose arbitrary coordinates, CSS, markup, expressions, or scripts.
That constraint keeps composition quality predictable and prevents a document
from becoming a programming language.

String lengths, collection sizes, normalized values, dimensions, colors,
hashes, identifiers, and semantic versions are bounded. Layer and asset IDs
must be unique. A schema-valid document can still fail template or quality
rules, such as a missing required semantic layer or insufficient contrast.
