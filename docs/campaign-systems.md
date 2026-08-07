# Campaign-system contracts

Glyphkiln keeps one `DesignDocument` equal to one canvas. Core publishes the
deterministic facts needed to coordinate related canvases; the App owns
campaigns, directions, slides, ordering, locks, revisions, review state, and
export bundles.

## Family metadata

`CAMPAIGN_FAMILY_REGISTRY` is an immutable, browser-safe catalog with metadata
version `1.0.0`. Its first family, `image-led-campaign`, records:

- exact member template IDs and versions;
- compatible output formats;
- required and optional content and asset roles;
- supported asset fits, focal-point support, and closed treatments;
- named composition variants; and
- safe-area and render-evidence behavior.

The first named variant, `focal-editorial`, describes the existing
`image-led-campaign@1.0.0` composition. It does not add a document field or
change pixels. Metadata drift is tested against the authoritative template and
treatment registries.

The registry is exported from both `@glyphkiln/core` and
`@glyphkiln/core/browser`. The browser export contains static data only and
does not import the Node renderer, hashing, raster decoding, or filesystem
adapters.

## Seed derivation

`deriveCampaignSeeds()` accepts a bounded campaign seed plus stable App-owned
direction and canvas keys. It validates that the selected template version,
format, and composition variant belong to the requested family, then returns:

- `directionSeed`, shared by related canvases in one art direction; and
- `canvasSeed`, separated by canvas key, exact template version, format, and
  composition variant.

```ts
import { deriveCampaignSeeds } from "@glyphkiln/core";

const seeds = deriveCampaignSeeds({
  campaignSeed: "kiln-launch-2026",
  familyId: "image-led-campaign",
  directionKey: "direction-a",
  canvasKey: "hero-square",
  template: { id: "image-led-campaign", version: "1.0.0" },
  format: "instagram-square",
  compositionVariantId: "focal-editorial",
});
```

Derivation policy `sha256/canonical-scope-v1` hashes explicit canonical scope
objects. Unknown fields are rejected so an ignored slide index or grouping
value cannot accidentally create identical streams. Seed inputs never enter a
manifest unless the caller places the returned `canvasSeed` in a document.

## Version and pixel impact

Campaign-family metadata and seed derivation have independent version labels.
This contract slice does not change the design schema, templates, renderer,
procedural algorithms, manifest, fingerprints, SVG, or PNG output.

Content-length profiles, additional composition variants, comparison helpers,
and App campaign persistence remain gated on a reviewed brief requiring at
least four formats and a multi-slide series. Locks, grouping, ordering, review
state, and revision identity remain App metadata and must not enter Core pixel
fingerprints.
