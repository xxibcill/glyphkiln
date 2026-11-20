# Reference-led design refinement

This pass translates the [120-project research collection](../Deliverables/graphic-design-reference-research-2026-09-25/README.md)
into two production capabilities and a prioritized backlog. References inform
composition requirements; client artwork, identities, and bespoke typefaces are
not incorporated into Glyphkiln.

## Implemented

| Research signal                                                                                                                                                                  | Product change                                                                                                                                                                         | Acceptance evidence                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [Nike Run / PORTO ROCHA](https://www.portorocha.com/nikerun): photography and typography work together across campaign placements.                                               | `image-led-campaign@1.1.1` separates focal imagery from copy. Landscape and square use columns; portrait uses a photograph above the message.                                          | Three reviewed exact PNG baselines; crop and text regions do not intersect.                                                        |
| [The Fendi Set / GTF](https://graphicthoughtfacility.com/fendi-set/): editorial hierarchy gives photography a deliberate place within a publication.                             | Image windows, consistent header alignment, an explicit caption region, and a separate action line replace the previous full-image text overlay as the default campaign composition.   | The same supplied photograph and copy rendered at three aspect ratios.                                                             |
| [Pollen / PORTO ROCHA](https://www.portorocha.com/pollen): imagery is part of the visual language. The earlier Kilnform benchmark also found its carousel never showed the lamp. | `tiktok-carousel-slide@1.1.1` accepts an optional admitted image with focal point, treatment, and alt text. Image-free slides share the header and action alignment with photo slides. | Image and metric-slide baselines; exact SVG/PNG compatibility check for image-free slides; editor and document-construction tests. |
| [LinkedIn Year in Review / BUCK](https://buck.co/work/linkedin-year-in-review): production systems must accommodate content variation.                                           | Image slides support optional header, subtitle or metric, CTA, and footer. Copy remains bounded and overflow blocks delivery.                                                          | Tests for optional content, crop changes, repeated rendering, and overflowing copy.                                                |

The visual review rejected the initial shallow square image window because it
cut through the lamp. The revised square composition uses a tall image column.
The landscape headline was enlarged after review. Focal points still require
subject-specific review: a point cannot describe a complete product silhouette.

## Using the refinement

In the authenticated App, choose **Image-led campaign** for the new separated
image/copy composition. Choose **TikTok carousel slide**, select an optional
**Campaign image**, describe it in alt text, and adjust the focal point. Leave
the image empty for a typography slide. Carousel slides do not require a logo.

In the SDK or CLI, use schema `1.4.0` and explicitly select either template at
version `1.1.1`. Images use `fit: "cover"`; campaign logos use `fit: "contain"`.
Only admitted PNG/JPEG bytes are accepted. The new template versions honor
brand typography roles and enforce a minimum `1.08` line height on image layouts.

Older exact versions remain registered. New manual drafts and campaign seed
plans select `1.1.1`; existing revisions retain their recorded template version.
The earlier `1.1.0` image-free carousel still reproduces `1.0.4` pixels. The new
`1.1.1` typography slide deliberately adopts the unified editorial system.

Authoring and campaign-family metadata advance to `1.4.0`. Carousel sequence
review advances to `1.4.0` so alternating image and typography layouts count as
different compositions. The design schema, renderer, procedural algorithms,
manifest schema, and delivery-sidecar schema do not change. No database
migration is needed: existing composition IDs are retained.

## Next priorities from the full collection

| Priority | Work represented in the research            | Required capability and acceptance target                                                                                                                                               |
| -------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Brand systems, advertising, digital content | Subject-region crop protection, additional composition choices, and delivered-size readability. Test a three-format campaign with complete product silhouettes and long localized copy. |
| 2        | Packaging, stationery, hospitality          | Physical units, bleed/trim, dieline and safe-zone contracts, production PDFs, and range/SKU data. Test a label family, two-sided business card, and multi-section menu.                 |
| 3        | Books, editorial, information design        | Multi-page flow, linked styles, tables, charts, legends, and semantic data provenance. Test a 12-page publication and a chart whose values can be verified against its source.          |
| 4        | Wayfinding, exhibitions, cultural events    | Viewing-distance checks, sign families, pictogram assets, and bounded variable identity systems. Test a sign family and a festival system across poster, ticket, and venue banner.      |
| 5        | Motion and broadcast                        | A timeline, interpolation contract, frame export, duration, and reduced-motion alternatives. Test an identity sequence with exact repeatable frames.                                    |

These are future requirements, not claims of present support. Arabic/Latin and
Korean references also make script coverage a priority; this pass does not add
new shaping systems or imply that every researched language is supported.

## Review artifacts

Run `node scripts/generate-reference-led-review.mjs` after building Core. It
renders the five reviewed compositions and a three-slide image/type sequence
under `Deliverables/png/`, `Deliverables/svg/`, and `Deliverables/json/`.
The review page is `Deliverables/html/reference-led-review.html`.

The assets are the repository's existing fictional Kilnform, Morrow Field, and
Northline Works imagery and marks, with their original generation provenance.
They demonstrate renderer behavior and are not commissioned campaigns or
evidence of commercial effectiveness.

## Second visual review: acceptance

The first iteration was not sufficient. The second iteration adds version
`1.1.1`, while preserving every `1.1.0` render path. It widens square image
windows, enlarges portrait display type, scales landscape typography from
width, and aligns image/type carousel headers and action lines.

Reviewed examples: 9 brand/format combinations (Kilnform, Morrow Field,
Northline Works; landscape, square, portrait), 5 semantic composition cases,
and a 3-slide story. Brand assets are original fictional qualification assets.
Inter, Fraunces, and Space Grotesk retain their supplied font bytes and roles.
The Northline focal point was corrected after the square crop cut the bag.

| Criterion           | Final review                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Subject visibility  | Lamp, bottle, and bag silhouettes remain visible in the nine reviewed campaign outputs. Crops were inspected individually.                                                     |
| Hierarchy           | Main message and product read first. Landscape supporting copy is larger after width-based scaling. Portrait display size rises from 70 to 104 preferred pixels at 1080 width. |
| Space and alignment | Larger image windows and stronger type reduce accidental gaps; margins, header, and action stay coherent. Quiet skincare layouts retain intentional breathing room.            |
| Brand distinction   | Serif botanical, warm ceramic, and dark utilitarian directions retain different tone through supplied type, palette, subject, and language.                                    |
| Sequence            | Photo/type/photo changes emphasis while retaining the same header, numbering, and action positions.                                                                            |
| Content resilience  | Longer supported headlines fit; excessive copy is rejected. Image and text do not overlap.                                                                                     |
| Repeatability       | Exact versioned PNG baselines, manifest hashes, legacy compatibility, and byte comparison of the three-brand outputs protect the result.                                       |

**Agent design assessment:** satisfied with this campaign/carousel refinement
as a usable production starting point. This is a scoped assessment, not a claim
that Glyphkiln matches bespoke studio work across all 120 references or replaces
a designer's art direction. The research catalogue contains 120 individually
source-text-reviewed projects; only 7 had additional visual inspection during
research. No independent human approval or commercial effectiveness test is
claimed. Small campaign labels remain secondary text; long copy should still be
edited for the chosen delivery size.

Reproduce the three-brand proofs after building Core:

```sh
node scripts/review-editorial-brands.mjs --deliver
node scripts/review-editorial-brands.mjs --deliver --verify
node scripts/generate-reference-led-review.mjs
```

Inputs and review evidence: `docs/qualification/reference-led-2026-09-25/`.
The review gallery contains 17 current examples. Original version 1.1.0
artifacts and baselines remain available for comparison.

## Verification

- Required root gates passed: `npm run build`, `npm run typecheck`,
  `npm run lint`, `npm test`, and `npm run test:coverage`.
- Full tests: **421 Core + 532 App + 4 showcase = 957 passed**;
  5 existing App tests skipped. Standalone packaging, isolated rendering,
  installed-package consumption, README execution, and fresh-process
  text-layout/wrapping determinism also passed.
- All **19 exact PNG baselines** passed: 8 original, 5 for version 1.1.0,
  and 6 for version 1.1.1. All newly added designs, PNGs, and manifests were
  reviewed together; original committed baselines did not change.
- `npm run examples:verify`: passed with existing output hashes unchanged.
- The nine brand proofs reproduced exactly with
  `node scripts/review-editorial-brands.mjs --deliver --verify`.
- Statement coverage: Core **87.26%**, App **87.62%**. Showcase line coverage
  **92.27%**. All configured coverage thresholds passed.
- The App starter SVG hash was updated only after its deliberate new layout
  was visually inspected. An initial coverage timeout was resolved by using a
  smaller still-overflowing rejection fixture; the rejection assertion remains.
- `git diff --check` passed. No new dependency, production deployment, or
  database migration was introduced.
