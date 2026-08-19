---
name: create-glyphkiln-carousel
description: Create, review, and ship Instagram or TikTok carousel campaigns with Glyphkiln's exact templates, deterministic campaign seeds, narrative roles, platform delivery profiles, render evidence, alt text, source notes, and verified handoffs. Use for carousel concepts, slide copy, sequence planning, cross-platform adaptation, carousel design review, or implementation in this repository; do not use for generic social strategy with no Glyphkiln deliverable.
---

# Create a Glyphkiln carousel

Create a complete, proofed sequence—not isolated pretty slides.

## Establish the contract

1. Read the repository `AGENTS.md`, `docs/campaign-systems.md`, and the TikTok
   policy in `docs/template-authoring.md`.
2. Read `references/carousel-workflow.md` for the sequence and visual-review
   rubric.
3. Select one exact delivery profile from `DELIVERY_PROFILE_REGISTRY` before
   authoring. Never mix native Instagram, Instagram API, native TikTok Photo
   Mode, TikTok Content Posting API, and TikTok paid-ad rules.
4. State which profile facts are platform requirements and which are Glyphkiln
   advisories. Never promise engagement or encode an advisory as a validation
   error.

## Author the sequence

- Treat one `DesignDocument` as one slide. Keep ordering, narrative role, and
  delivery intent in campaign metadata.
- Assign every slide one role from `CAROUSEL_NARRATIVE_ROLE_IDS`: `hook`,
  `context`, `evidence`, `explanation`, `recap`, or `action`.
- Use an exact registered template and version. Use
  `image-led-campaign@1.0.1` for image-led Instagram work,
  `tiktok-carousel-slide@1.0.4` for organic TikTok 3:4 work, and preserved
  `tiktok-carousel-slide@1.0.2` only for 9:16 TikTok ads.
- Derive direction and canvas seeds with public campaign helpers. Never add
  randomness, hidden prompt state, URLs, paths, dynamic code, or network fetches
  to render input.
- Use authoring metadata's recommended character ranges as revision prompts.
  Schema bounds, template roles, and actual platform limits are the only hard
  constraints.
- Write specific alt text for every meaningful image. Add a portable source note
  for every statistic, quotation, or factual claim that needs verification.

## Review and ship

1. Run `reviewCarouselSequence()` and resolve every error. Review warnings with
   human judgment; do not suppress them by weakening the content.
2. Render every slide through Core. Inspect the complete sequence at once and
   each slide at representative phone widths.
3. Inspect Core safe-area, text-bound, overflow, crop, contrast, and fitted
   font-size evidence. Treat platform overlays as dated advisories and verify
   current live UI on target devices.
4. Check sequence rhythm: stable brand grammar, varied composition where useful,
   one dominant job per slide, no unexplained visual element, and a deliberate
   ending.
5. Create the deterministic delivery sidecar and include it with the exact design
   documents, resource pins, render bytes, manifests, and approval receipts.
6. For repository changes, invoke `verify-glyphkiln-change` and pass the required
   build, typecheck, lint, test, coverage, artifact, and changeset gates.

If a publishing path needs JPEG or another delivery transformation not produced
by Core, say so explicitly and preserve the PNG proof plus manifest. Never imply
that conversion was completed when it was not.
