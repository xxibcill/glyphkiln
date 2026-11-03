# Product and offer static ads

`product-announcement@1.2.0` adds a reusable static-ad composition for product
launches, retail offers, and software screenshots. It implements a bounded
F11/F12 slice of the [graphic-design roadmap](plans/graphic-design-capability-roadmap.md).
This is not completion of M2 or qualification of the entire advertising family.

The information order is brand cue → offer → benefit → supporting copy →
product → action → terms. Landscape uses two columns; square, portrait, and
story stack the copy and product. The product region starts after the actual
fitted copy, so short messages leave more image space. The CTA and terms keep
their own reserved regions. All content uses the brand safe area.

## Authoring

Choose **Product announcement** in the manual editor. Supply a headline and,
optionally, an eyebrow, offer or price, subtitle, CTA, and offer terms. Choose
immutable product and logo admissions with alt text. Product images and logos
use `contain`; crop controls are intentionally absent. Product images can be
cutouts or screenshots. Tight source framing helps the product fill its region;
source padding is preserved. Unsupported cover fitting and overflowing copy
fail validation; shorten copy or select a larger format rather than dropping
required terms. Blank optional fields omit their regions.

Supported formats: LinkedIn landscape, Instagram square, portrait and story,
X landscape, and YouTube thumbnail. These are canvas formats, not claims of
current advertising-platform compliance. Review text at intended display size
and set the brand safe area for the placement's actual interface overlays.

In SDK/CLI documents, select `{ "id": "product-announcement", "version": "1.2.0" }`.
Use existing `badge`, `footer`, `product-screenshot`, and `logo` layers. Only
`headline` is required. Unlike 1.1.1, badge and eyebrow can coexist. No schema
change is needed. The old exact version remains registered and its baseline
is unchanged; rendering never upgrades a saved document. Browser proof integrity
checks the registered exact version and its supported schema/format, retaining
old-proof verification while rejecting unknown versions. The existing manual
revision workflow selects the current template for newly authored revisions.

## Proofs and reproducibility

Four Kilnform concept proofs reuse the repository's admitted lamp fixture:

- [Square](../Deliverables/png/product-offer-square.png)
- [Portrait](../Deliverables/png/product-offer-portrait.png)
- [Story](../Deliverables/png/product-offer-story.png)
- [Landscape](../Deliverables/png/product-offer-landscape.png)

Matching SVGs live in `Deliverables/svg/`; editable semantic documents and
both output manifests live in `Deliverables/json/` under the same basenames.
These documents reference the existing `kilnform-lamp-campaign.png` asset in
`packages/glyphkiln-core/examples/assets/` and pinned development Inter font.
They are reproducible repository examples, not a standalone resource bundle.
The campaign wording is illustrative and makes no price or performance claim.

Run `npm run build --workspace @glyphkiln/core`, then
`node scripts/generate-product-offer-review.mjs` to render, or add `--verify`
to compare delivered bytes. Exact PNG baselines cover square, portrait, story,
and landscape. Tests cover all six formats, deterministic rerenders, longer
copy, dark mode, optional roles, contain enforcement, missing assets, rejected
overflow, and manual form round-tripping.

Engine and authoring implementation are complete for this slice. Agent visual
review covers the four supplied digital proofs; independent human acceptance,
real campaign performance, multilingual qualification, and platform-specific
production qualification remain open.
