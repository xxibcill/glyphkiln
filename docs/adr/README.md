# Architecture decision records

| ADR                                                          | Decision                                      |
| ------------------------------------------------------------ | --------------------------------------------- |
| [0001](0001-renderer-selection.md)                           | Direct SVG scene generation                   |
| [0002](0002-schema-validation.md)                            | Zod 4 strict schemas                          |
| [0003](0003-seeded-randomness.md)                            | xoshiro128** with SHA-256 seed expansion      |
| [0004](0004-template-versioning.md)                          | Explicit versioned template functions         |
| [0005](0005-font-handling.md)                                | Explicit hashed font bytes                    |
| [0006](0006-svg-png-export.md)                               | Safe generated SVG and pinned Resvg           |
| [0007](0007-provenance.md)                                   | Per-output JSON render manifests              |
| [0008](0008-package-public-api.md)                           | Single package with intentional exports       |
| [0009](0009-text-layout-support-diagnostics.md)              | Deterministic text-layout support diagnostics |
| [0010](0010-glyphkiln-monorepo.md)                           | Core and App in one npm workspace             |
| [0011](0011-app-alpha-workflow-and-trust-seams.md)           | App Alpha workflow and trust seams            |
| [0012](0012-postgres-render-queue-and-filesystem-storage.md) | PostgreSQL queue and filesystem storage       |
| [0013](0013-offline-cli-resource-bundles.md)                 | Validated offline CLI resource bundles        |
| [0014](0014-app-alpha-lifecycle-and-capacity-invariants.md)  | App lifecycle and capacity invariants         |

ADRs are immutable after acceptance. Superseding decisions add a new ADR and
link back to the old one.
