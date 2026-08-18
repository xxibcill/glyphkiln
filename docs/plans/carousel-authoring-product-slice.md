# Carousel authoring product slice

**Status:** Complete

**Started:** 2026-08-18

**Completed:** 2026-08-18

**Research basis:**
[`carousel-design-validation-2026-08-18.md`](../research/carousel-design-validation-2026-08-18.md)

## Product decision

Ship carousel authoring as one bounded Glyphkiln project slice and include a
project-local agent skill. The reusable value comes from Glyphkiln-specific
contracts—one document per slide, exact template versions, deterministic seeds,
campaign locks, Core render evidence, delivery profiles, and verified handoff—not
from a generic social-media prompt.

## TODO

- [x] Publish versioned Instagram and TikTok delivery profiles that distinguish
      native, API, organic, and paid-ad paths.
- [x] Label every platform constraint as a requirement, platform recommendation,
      or Glyphkiln advisory; keep direct source links and retrieval dates portable.
- [x] Add advisory, role-specific copy-length ranges without converting heuristics
      into schema failures or engagement promises.
- [x] Add a first-class carousel sequence contract with narrative roles, stable
      ordering, composition-rhythm review, aspect-ratio checks, source checks, and
      accessibility checks.
- [x] Add deterministic delivery sidecars containing reading order, image alt text,
      source notes, and selected delivery-profile metadata.
- [x] Extend render evidence with exact fitted font sizes and show representative
      delivered-phone-size equivalents in the App.
- [x] Add versioned, explicitly advisory platform-surface overlays to preview; do
      not claim an official TikTok organic safe zone.
- [x] Persist and display a narrative role for every campaign canvas so the option
      board reads as a sequence rather than a flat asset list.
- [x] Correct organic-versus-ad authoring documentation, especially TikTok slide
      counts, Smart Order, 9:16 geometry, and safe-zone language.
- [x] Create and validate `.agents/skills/create-glyphkiln-carousel` with an
      end-to-end author, proof, review, and handoff workflow.
- [x] Add a user-visible changeset and update public Core/App documentation.
- [x] Run focused tests and the repository build, typecheck, lint, full test, and
      coverage gates without overwriting unrelated worktree changes.

### Visual-feedback follow-up

- [x] Add `tiktok-carousel-slide@1.0.4` with a `1.08` headline-leading floor and
      an outline-level regression test for multiline collisions.
- [x] Replace the fixed empty content field with content-responsive heights and
      treat whitespace as intentional pacing rather than a blanket failure.
- [x] Keep slide numbering on every slide while making eyebrow/header and footer
      chrome optional; use the sample header only on the opener and footer only
      as a sequence bookend.
- [x] Add deterministic Core-owned pattern rails and alternate field alignment,
      then use them selectively across the middle of the sample sequence.
- [x] Regenerate and verify the sample, public example, visual baseline,
      campaign-workflow qualification, and all repository quality gates.

## Acceptance criteria

1. Instagram native, Instagram API, organic TikTok Photo Mode, TikTok Content
   Posting API, and TikTok carousel-ad rules cannot be accidentally treated as the
   same publishing path.
2. Numeric design guidance is inspectable and editable advisory metadata; only
   actual platform or Glyphkiln contract violations can block a workflow.
3. Reviewers can inspect sequence role, composition rhythm, readable delivered
   type size, alt text, claims/sources, and exact render evidence before handoff.
4. Existing saved documents remain exactly renderable. Deliberate new pixels use
   a new exact template version and never use unseeded randomness.
5. The shipped skill uses only public Glyphkiln contracts and instructs agents to
   keep inputs inert, render every slide, inspect evidence, and run the repository
   verification workflow.

## Initial slice verification

- Focused Core tests: 88 passed.
- Focused App tests: 116 passed.
- Full repository build, typecheck, and lint: passed.
- Full repository tests: 848 passed and 5 skipped across Core, App, and the example
  package.
- Full repository coverage: passed; Core 84.11% statements / 75.21% branches and
  App 87.70% statements / 80.34% branches.
- Examples, fixtures, schema conformance, Unicode text-layout data, identity,
  brand-fidelity qualification, and campaign-workflow qualification: verified.
- Fresh packed-package consumers and Core package dry run: passed.
- Project-local skill validation: passed.

## Visual follow-up verification

- Focused Core template, metadata, schema, and visual tests: 129 passed.
- Full repository tests: 852 passed and 5 skipped across Core, App, and the
  example package.
- Full repository coverage: passed; Core 84.36% statements / 74.34% branches,
  App 87.70% statements / 80.34% branches, and example package 92.27% lines /
  88.37% branches.
- Build, typecheck, lint, security, formatting, examples, fixtures, schema
  conformance, Unicode data, identities, brand and campaign qualifications,
  licenses, fresh packed-package consumers, and Core dry-run packaging: passed.
- Six-slide sample and Deliverables copy: exact-byte verification passed with no
  blocking sequence issue and one documented conservative composition-rhythm
  advisory.
