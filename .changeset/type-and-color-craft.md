---
"@glyphkiln/core": minor
---

Add DesignDocument 1.7.0 type and color craft controls: rich-text `emphasis`
phrases, closed `openType` settings shaped through fontkit, a procedural
decoration `job`, an image `subjectRegion` with `local-dark-scrim` and
`local-light-scrim` treatments, and brand `colorRoles` with an
`accentAreaBudget`. The new opt-in templates `quote-card@1.3.0`,
`statistic-card@1.3.0` and `image-led-campaign@1.2.0` use them, along with the
`size-setting@1.0.0` tracking and leading curve. Older template versions
reject the new fields with `TEMPLATE_FEATURE_UNSUPPORTED`. Their SVG, PNG and
fingerprints are unchanged. `DESIGN_DOCUMENT_VERSION` is now `1.7.0` and authoring
metadata is `1.8.0`. Because `DesignDocument` is now a union of eight schema
versions, TypeScript may report "union type that is too complex" when code
pushes into `document.layers`. Cast it to `DesignLayer[]` first.
