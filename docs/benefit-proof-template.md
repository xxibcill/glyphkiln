# Benefit / feature proof static ads

`benefit-proof@1.0.0` implements the next slice from the [static-ad research](research/static-ad-design-research-2026-09-25.md): lead with a benefit, show an optional product, then supply one to three supporting facts.

## Authoring

Select **Benefit / feature proof** in the manual editor. Supply a headline and at least one benefit title; each benefit can have an optional explanation. Add or remove benefits up to the three-item limit. Optional controls cover an eyebrow, call to action, source/qualification, admitted product image and brand logo. The template does not invent evidence or establish whether a claim is true.

The editor creates inert manual drafts. The workflow resolves the exact current template and schema, immutable brand snapshot and admitted resources, then stores an immutable revision. Reopening preserves benefit order, titles, explanations, source and asset roles. Revising creates another revision. Existing render/export handling consumes the stored document. No HTTP endpoint, database schema, resource admission rule or network capability was added.

## Closed document contract

Design schema **1.5.0** adds the `benefit-proof` template ID and `benefit-list` layer. Older schema branches remain closed and reject this new layer/ID.

```json
{
  "id": "benefits",
  "type": "benefit-list",
  "visible": true,
  "items": [{ "title": "Ceramic base", "description": "Sculptural by day." }]
}
```

- `items`: one to three strict objects, in supplied order.
- `title`: 1–80 characters, including a non-whitespace character.
- `description`: optional; if supplied, 1–180 characters including a non-whitespace character.
- Required visible roles: `headline`, `benefit-list`.
- Optional roles: `background`, `eyebrow`, `product-screenshot`, `logo`, `cta`, `footer`.
- Images and logos require `contain`; procedural decoration is not supported.

Character bounds are input limits, not promises that every maximum-length string fits. Typography fitting, unsupported-script diagnostics, missing-glyph checks and quality errors apply. Overflow blocks a deliverable. Text evidence identifies each item as `<layer-id>-<index>-title` and `<layer-id>-<index>-description`.

Authoring metadata **1.6.0** describes the collection and its item fields. Copy locks include item text and order; composition locks include item count. This extends the existing proposal-only validator and grants no persistence or publication authority.

## Composition and compatibility

| Output             | Dimensions  | Composition                                     |
| ------------------ | ----------- | ----------------------------------------------- |
| Instagram square   | 1080 × 1080 | Headline, product, horizontal fact strip        |
| Instagram portrait | 1080 × 1350 | Taller product region and horizontal fact strip |
| Instagram story    | 1080 × 1920 | Headline, product and stacked facts             |
| LinkedIn landscape | 1200 × 627  | Headline/product columns with fact strip below  |

Without an image, facts stack below the headline. Optional source and action occupy separate bottom regions. The supplied image is preserved in full, including source padding; tightly framed artwork improves product prominence.

These are existing canvas presets, not newly qualified placement profiles. LinkedIn's researched recommendation is 1200 × 628; interface overlays and account acceptance need separate qualification. This template produces complete artwork, not Google's clean responsive image assets.

The new template owns its pixels at version 1.0.0. Shared renderer 0.5.0, manifest 1.2.0, procedural algorithms and existing template versions are unchanged. New document factories now use schema 1.6.0, so new drafts have a different schema identity; persisted documents retain their pinned versions and output.

## Reviewed proofs

Six fixture documents, PNG baselines and manifests cover four product formats, a software brief and a dark travel brief. The briefs are illustrative; the latter two are image-free. This is layout evidence, not campaign performance or full family qualification.

| Proof              | PNG                                                    | Reproducible document                                            |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------- |
| Kilnform square    | [PNG](../Deliverables/png/benefit-proof-square.png)    | [JSON](../Deliverables/json/benefit-proof-square.design.json)    |
| Kilnform portrait  | [PNG](../Deliverables/png/benefit-proof-portrait.png)  | [JSON](../Deliverables/json/benefit-proof-portrait.design.json)  |
| Kilnform story     | [PNG](../Deliverables/png/benefit-proof-story.png)     | [JSON](../Deliverables/json/benefit-proof-story.design.json)     |
| Kilnform landscape | [PNG](../Deliverables/png/benefit-proof-landscape.png) | [JSON](../Deliverables/json/benefit-proof-landscape.design.json) |
| Glyphkiln software | [PNG](../Deliverables/png/benefit-proof-software.png)  | [JSON](../Deliverables/json/benefit-proof-software.design.json)  |
| Northline travel   | [PNG](../Deliverables/png/benefit-proof-travel.png)    | [JSON](../Deliverables/json/benefit-proof-travel.design.json)    |

Matching SVGs are in `Deliverables/svg/`; manifests are in `Deliverables/json/`. Generate with `node scripts/generate-benefit-proof-review.mjs` and reproduce with `--verify` after building Core. A complete Core example is `packages/glyphkiln-core/examples/benefit-proof.json`.

Visual review checked hierarchy, product/text separation, complete image visibility, light/dark legibility and source placement. Remaining work includes independent human acceptance, campaign testing, platform safe-zone qualification and aspect-appropriate assets. The [remaining four starter families](static-ad-starter-set.md) are now implemented.

## Verification at initial implementation

Repository build, typecheck, lint, tests and coverage passed. The suite includes 457 Core tests, 540 App tests and four example tests; five database-dependent App tests retain their existing skip conditions. Standalone packaging, fresh tarball consumers, package dry-run, schema conformance and generated-example verification also passed. All six review deliverables reproduce byte for byte. Existing committed example outputs are unchanged.

The new renderer has 100% statement, branch, function and line coverage. Focused cases exercise one to three facts, optional descriptions and assets, all four formats, light/dark modes, deterministic bytes, text separation, overflow rejection, closed legacy schemas, immutable revisions and authoring locks. These checks establish implementation behavior, not advertising effectiveness.
