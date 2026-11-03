# Six-family static-ad starter set

The [static-ad research](research/static-ad-design-research-2026-09-25.md) now has six implemented creative families. Select the family in the App's manual editor, supply copy and admitted resources, review the proof, then save or revise through the existing workflow.

| Family                  | Exact template               | Content and image roles                                                                               |
| ----------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Product + Offer         | `product-announcement@1.2.0` | Product-led composition, optional offer, CTA and terms                                                |
| Benefit / Feature Proof | `benefit-proof@1.0.0`        | Benefit headline and one to three supporting facts                                                    |
| Testimonial / Evidence  | `testimonial-evidence@1.0.0` | Required quote, speaker and source; optional role, literal rating, portrait, product, logo and CTA    |
| Comparison              | `comparison@1.0.0`           | Required headline, two option names, one to three matched criteria and source; optional logo and CTA  |
| Problem / Solution      | `problem-solution@1.0.0`     | Required headline and labeled problem/solution titles and explanations; optional source, logo and CTA |
| Offer / Urgency         | `offer-urgency@1.0.0`        | Required headline, dominant offer and terms; optional supplied deadline/scope, product, logo and CTA  |

The four new templates have distinct fixed compositions. Comparison uses aligned criteria, and Problem / Solution stacks its panels for tall canvases. Offer / Urgency makes the price or discount dominant; Product + Offer remains the product-led alternative. Testimonial portrait and product are separate asset roles, both preserved when reopening.

## Formats and review files

All six families support these existing canvases:

| Preset             | Pixels      | Ratio                |
| ------------------ | ----------- | -------------------- |
| Instagram square   | 1080 × 1080 | 1:1                  |
| Instagram portrait | 1080 × 1350 | 4:5                  |
| Instagram story    | 1080 × 1920 | 9:16                 |
| LinkedIn landscape | 1200 × 627  | approximately 1.91:1 |

[Open the 24-proof gallery](../Deliverables/html/static-ad-template-gallery.html). It combines the existing Product + Offer and Benefit proofs with 16 new reviewed renders. Corresponding PNGs, SVGs, reproducible documents and manifests are in `Deliverables/png/`, `Deliverables/svg/` and `Deliverables/json/`.

The four new Core examples are `testimonial-evidence.json`, `comparison.json`, `problem-solution.json` and `offer-urgency.json` under `packages/glyphkiln-core/examples/`. Reproduce the new deliverables after building Core with `node scripts/generate-static-ad-review.mjs --verify`; omit `--verify` to regenerate this batch only.

These are canvas presets, not newly qualified placement profiles. In particular, the existing landscape height is 627 pixels, while the researched LinkedIn recommendation is 628. Platform overlays, safe zones and account acceptance still require placement qualification.

## Document and authoring contracts

DesignDocument **1.6.0** adds the four template IDs and two strict structured layers. Older branches remain closed and reject the new IDs and layers.

```json
{
  "id": "comparison",
  "type": "comparison-table",
  "visible": true,
  "leftLabel": "First option",
  "rightLabel": "Second option",
  "rows": [{ "label": "Criterion", "left": "First fact", "right": "Second fact" }]
}
```

Comparison requires one to three rows. Option names and criterion labels have a 60-character bound; each fact has a 100-character bound. Every field must contain a non-whitespace character. Row order is supplied data, not inferred scoring.

```json
{
  "id": "problem-solution",
  "type": "problem-solution",
  "visible": true,
  "problemTitle": "Rebuild every size",
  "problem": "Copy drifts across manually assembled exports.",
  "solutionTitle": "Pin the design",
  "solution": "Keep the copy and inputs in a versioned document."
}
```

Problem/solution titles have an 80-character bound and explanations have a 180-character bound. All four fields are required and nonblank. Character bounds do not promise that every string fits: overflow and unsupported scripts block rendering. Required visible roles are checked at render time; saving an incomplete but schema-valid draft retains the existing workflow behavior.

Testimonials reuse the existing text roles: quote as `headline`, speaker as `attribution`, role as `subtitle`, literal rating as `badge`, and source as `footer`. Portrait uses `image`; product uses `product-screenshot`. Logos, products and portraits use `contain`, preserving the complete supplied image. Comparison and Problem / Solution support logos but not product photography in this version.

Authoring metadata **1.7.0** publishes the new roles, field bounds and collection contracts. Copy locks include comparison headings, ordered row values and problem/solution text. Composition locks include comparison row count. Portraits continue through the existing image/crop lock projections. These remain proposal-only validators.

Each new template owns its pixels at **1.0.0**. Shared renderer **0.5.0**, manifest **1.2.0**, procedural versions and existing template versions remain unchanged. New factories use schema 1.6.0; saved older documents retain their pinned identity. The App resolves trusted versions, brand snapshots and resource admissions server-side and stores immutable revisions. No endpoint, database migration, resource fetching or publication capability was added.

## Evidence and limits

The examples label fictional testimonials, ratings and promotions explicitly. Templates do not invent or verify customer claims, comparison evidence, deadlines or scarcity. Replace sample copy with supplied, substantiated content before use.

Reviewed proofs check hierarchy, full-image visibility, text separation, source placement and readability in all four formats. Tests cover deterministic output, required-role rejection, bounded and malformed structured data, hidden roles, copy overrides, overflow, unsupported scripts, optional assets, dark mode, save/reopen/revise, and authoring locks. Exact baselines pin the 16 new PNGs.

This completes the bounded six-family implementation. It does not establish campaign effectiveness, independent designer acceptance, placement qualification, or completion of every family in the broader graphic-design roadmap.

## Verification results

Root build, typecheck, lint, test and coverage gates passed. The final coverage run passed 503 Core tests, 557 App tests and four example tests; five existing real-PostgreSQL qualification tests remain conditionally skipped. The four new renderers have 100% statement, branch, function and line coverage.

Standalone packaging, fresh tarball JavaScript/TypeScript/schema/CLI/isolated consumers, package dry-run, 15 schema-conformance fixtures and generated-example verification passed. The exact visual suite passed all 45 baselines, including the 16 new proofs. The new deliverables reproduce byte for byte, and existing committed generated examples and visual baselines are unchanged.

Component interaction tests exercise comparison row bounds and editing, independent portrait/product/logo selection, incompatible-role clearing, and structured copy error attribution. Workflow tests verify saved and revised documents separately without overwriting prior revisions.

## Campaign workflow follow-up

The [static-ad campaign workflow](static-ad-campaign-workflow.md) adds shared-brief
creation, atomic saved variants, batch review and approved-only ZIP downloads.
It includes a database migration and separate advisory placement policy; the
template/schema/pixel contracts above remain unchanged.
