# Core next-feature release plan

**Status:** Proposed on 2026-07-31. Package-version targets after `0.4.0` are
planning labels, not release commitments. A milestone may move only at its
decision gate; deterministic-output, compatibility, and security gates do not
move with it.

## Outcome

Qualify and ship the current scope-frozen `0.4.0` candidate, then make
Glyphkiln useful as the deterministic production layer in an AI-assisted senior
designer's workflow:

> Brief → several credible on-brand directions → compare → lock what works →
> vary the rest → adapt across formats, slides, and locales → approve exact
> pixels → export the complete approved campaign.

The proposed sequence is:

1. `0.5.0`: brand and asset fidelity;
2. `0.6.0`: campaign systems and controlled variation;
3. `0.7.0`: AI-ready production contracts;
4. `0.8.0`: market-led horizontal multilingual production;
5. `0.9.0`: specialized campaign content and accessible output; and
6. `1.0.0`: compatibility, packaging, and release stabilization only.

Core owns deterministic primitives, versioned composition, validation, quality
evidence, exact outputs, and provenance. The App owns AI calls, option boards,
lock/vary interaction, campaign coordination, comments, approvals, and export
bundles. Determinism should feel like confidence to a designer, not like a task
of manually managing manifests.

## Baseline and `0.4.0` release-candidate scope

Changesets versioning has materialized Core `0.4.0`, App `0.0.2`, and the style
showcase `0.0.1` in release commit `52fbd04`. There is no signed `v0.4.0` tag at
`HEAD`, so this remains an unreleased candidate until its remaining
qualification and source tag are complete.

The candidate already contains:

- deterministic Thai segmentation, balanced line breaking, orphan warnings,
  blocking linguistic-word-break errors, and `keepTogether`;
- design schemas `1.1.0` through `1.3.0`, including the 9:16 TikTok carousel-ad
  format and the 3:4 TikTok organic-photo format;
- preserved TikTok template versions `1.0.1` and `1.0.2`, plus the current
  `1.0.3` organic-photo composition;
- validated offline CLI resource bundles `1.0.0`; and
- a deterministic consumer-style showcase.

The embedded contracts at this baseline are design schema `1.3.0`, renderer
`0.3.0`, manifest `1.2.0`, typography algorithm `2.0.0`, and text-layout
diagnostics `unicode-17.0.0/ltr-horizontal-v1`.

Do not add another feature to `0.4.0`. Qualification, compatibility repair, and
release metadata are the only remaining allowed changes.

### `0.4.0` compatibility repair

`createDesignDocument()` defaults to schema `1.3.0`, but its public
`CreateDesignDocumentInput` type was derived from the `1.2.0` schema. The
runtime accepted `tiktok-photo-carousel`, while a strict TypeScript consumer
could not author it through the helper without a cast.

Release commit `52fbd04` contains a focused repair that derives the helper input
from schema `1.3.0` and adds unit and strict packed-consumer coverage. Local
qualification confirms that strict consumers can author the current format and
that legacy helper inputs retain their normalization behavior.

Before tagging the release:

- review the compatibility repair as part of the complete release diff;
- repeat the supported Node-version qualification matrix; and
- complete the remaining visual, packaging, and source-release gates below.

### `0.4.0` exit gates

- [x] Verify and land the `CreateDesignDocumentInput` compatibility repair and
      regression coverage.
- [ ] Review every changed carousel design, PNG, SVG, and manifest together.
- [ ] Verify schema-conformance, fixtures, Unicode data, examples, licenses,
      isolation, deterministic text corpora, standalone App packaging, and the
      packed consumer.
- [ ] Run the full root build, typecheck, lint, test, and coverage gates.
- [x] Run `npx changeset version` and review Core/App/showcase versions,
      dependency ranges, changelogs, and lockfile changes.
- [ ] Repeat clean-install and packed-consumer qualification on Node `22.13`
      and the supported Node `24` line with npm `10.9.8`.
- [ ] Create a signed `v0.4.0` source release. npm publication remains a
      separate owner-controlled decision.

## Rules shared by every feature milestone

- Documents remain bounded, strict, inert JSON-compatible data.
- No user-selected code, expressions, imports, modules, paths, URLs, active
  SVG, host font fallback, or render-time network access.
- Every random render-path choice uses the existing seeded generator and an
  explicit stable stream.
- Existing document/template pairs retain their exact behavior. New behavior
  uses a new schema, template, renderer, procedural, diagnostic, or manifest
  version owned by the narrowest affected contract.
- SVG and PNG continue through one scene and SVG serialization path.
- Pixel changes require semantic tests, exact SVG/PNG tests, reviewed visual
  baselines, and a deliberate version bump.
- Rejection-policy changes require stable, bounded error or quality codes and
  negative tests before resource resolution.
- New public APIs are exported only through curated package entry points and
  exercised from a packed consumer.
- Update commands may be used only for artifacts intentionally owned by the
  milestone; generated churn is never accepted as a test fix.

## `0.5.0`: brand and asset fidelity

### User outcome

Use real brand fonts, logos, photography, product imagery, and AI-created raster
art without losing crop intent, color confidence, or recognizable brand
character. Three different brands must not look like recolored copies of the
same Glyphkiln template.

### Core scope

- Add bounded role-based typography controls for hierarchy that existing
  families, weights, and sizes cannot express safely, such as reviewed tracking
  and line-height ranges.
- Add explicit logo and image roles to one versioned image-led campaign family.
- Add normalized focal-point and crop intent, plus a small closed set of
  deterministic masks or treatments. Do not expose arbitrary transforms,
  filters, CSS, or coordinates.
- Add a versioned scene-aware contrast policy so text is assessed against the
  composed surface or raster region users actually see.
- Select a pinned color-normalization policy for image-led work. A pure bounded
  utility should return canonical sRGB bytes, dimensions, hashes, and a report;
  `renderGraphic` must not silently rewrite supplied assets.
- Return bounded layout-inspection evidence—safe areas, crop bounds, text
  bounds, overflow, and contrast samples—that the App can display as proof
  overlays.

### App scope

- Make admitted fonts, logos, photographs, and generated raster assets
  selectable in the design workflow.
- Provide a focal-point/crop preview and expose only the typography and image
  controls supported by the selected template version.
- Publish changes as new immutable brand snapshots or design revisions; never
  rewrite existing saved designs.

### Decision gate

Require two real image-led briefs, one real multi-weight brand font family, logo
variants, portrait and landscape photography, and three meaningfully different
brand snapshots. Approve an ADR for crop geometry, color normalization,
contrast sampling, treatment IDs, and source-versus-render asset hashes.

### Version and test ownership

- New typography, focal-point, accessibility, or treatment fields require a
  design-schema minor.
- New composition pixels use a new template ID/version; shared typography,
  asset, or serialization pixels require renderer review.
- Normalization and contrast policy meaning may require renderer, quality, and
  manifest version changes and fingerprint configuration updates.
- Tests cover crop extremes, aspect ratios, alpha, malformed/oversized color
  profiles, prohibited colors, contrast over raster/procedural surfaces, exact
  outputs, manifests, and legacy byte preservation.

### Non-goals

Uploaded active SVG, freeform masks, arbitrary blend/filter graphs, malware
scanning, license judgments, remote fetching, system fonts, or automatic brand
inference from an image.

### Exit gate

The same image-led campaign family produces publishable results for three
visually distinct brands; real logos and images retain intentional crops across
supported formats; and a senior designer would not need to repair the result in
Figma before publication.

## `0.6.0`: campaign systems and controlled variation

**Implementation status:** the first dependency-safe Core slice publishes
browser-safe `1.0.0` family metadata for the existing image-led composition and
stable `sha256/canonical-scope-v1` direction/canvas seed derivation. It is
non-pixel-affecting. Additional variants, evidence comparison, content profiles,
App persistence, option boards, lock/vary behavior, and bundles remain open and
must pass the decision gate below.

### User outcome

Choose one art direction and adapt it coherently across square, portrait,
story, landscape, and carousel outputs. Compare alternatives, lock the parts
that work, and vary only the rest.

### Boundary

Keep one `DesignDocument` equal to one canvas. Core exposes deterministic
campaign-ready contracts; the App coordinates option sets, series, formats,
slides, revisions, and bundles.

### Core scope

- Add machine-readable template-family metadata: compatible formats, content
  roles, asset roles, safe-area policy, and exact member template versions.
- Add a small template-specific set of named composition variants. Each variant
  is bounded data with explicit versioned behavior, not a generic layout
  language.
- Define short, medium, and long content profiles where real briefs show stable
  composition behavior. Overflow remains explicit; Core never silently deletes
  or rewrites copy.
- Provide deterministic seed-derivation helpers for a campaign family without
  making unrelated slides visually identical.
- Expose visual comparison evidence such as layout bounds, changed render
  inputs, output hashes, and fingerprints without embedding App revision IDs in
  the pixel fingerprint.

### App scope

- Add option boards, duplicate/branch, side-by-side visual comparison, and
  lock/vary controls.
- Coordinate multi-format campaigns and carousel packs while storing each
  canvas as its own immutable design revision.
- Generate batch proofs and an export bundle with predictable names, exact
  documents, SVG/PNG outputs, and per-output manifests.
- Keep the chosen brand snapshot, art direction, template family, and locked
  fields visible during adaptation.

### Decision gate

Use one approved campaign brief that requires at least four formats and a
multi-slide series. Decide which values are pixel-affecting document data and
which locks, grouping, ordering, and review state remain App metadata.

### Version and test ownership

Template-family or variant fields require a schema and template-version review.
Seed derivation requires stable test vectors. Every family member needs a
reviewed design, SVG, PNG, and manifest; legacy template versions remain
byte-identical. App tests cover branching, lock preservation, ordering, batch
naming, exact resource pins, and bundle completeness.

### Non-goals

A multi-page renderer, automatic resizing of one finished canvas, freeform
positions, mutable master templates, silent copy editing, or campaign state
inside Core manifests.

### Exit gate

One approved direction becomes a coherent four-format campaign and carousel
series; locked choices survive every adaptation; every canvas remains exactly
reproducible; and the complete campaign exports in one verified bundle with
stable naming.

## `0.7.0`: AI-ready production contracts

### User outcome

Turn a brief into several credible structured directions, understand why each
direction was proposed, choose one, and ask AI to vary only unlocked decisions.
The accepted result remains editable data, not model-generated rendering code.

### Core scope

- Publish a browser-safe, machine-readable authoring contract for every current
  template version: required and optional content roles, supported assets,
  named composition variants, format compatibility, hard bounds, and concise
  authoring guidance.
- Add pure candidate-document helpers only where they reduce unsafe duplication
  without choosing a creative direction on the user's behalf.
- Validate each candidate through the normal strict schema and quality path.
- Provide bounded, designer-actionable issue metadata for copy length, missing
  roles, asset suitability, crop risk, contrast, and safe areas.
- Keep candidate ordering and canonicalization deterministic after the App
  supplies the candidates; Core never invokes or trusts a model.

### App scope

- Add the `BriefInterpreter` adapter behind explicit operator configuration.
- Ask for three or four genuinely distinct candidate directions, not cosmetic
  seed or color variations.
- Treat every model response as unknown data, validate it with Core, and show
  invalid candidates as recoverable suggestions rather than renderer input.
- Let the designer lock copy, image, crop, typography, palette, or composition
  before regenerating only the unlocked fields.
- Store provider, model, prompt/response hashes, validation result, accepted
  normalized document, and the human decision. Manual authoring remains
  first-class.

### Decision gate

Approve a threat model and interaction prototype using real briefs. Confirm how
locked fields are enforced independently of model claims, how candidate
rationales are labeled as suggestions, and how provider data-retention policy
is disclosed to the operator.

### Non-goals

An LLM dependency in Core, generated JavaScript/SVG/CSS, model-selected file
paths or URLs, automatic publication, invisible prompt rewriting, or presenting
model output as provenance truth.

### Exit gate

One real brief yields at least three schema-valid, visibly distinct directions;
selective regeneration preserves every lock exactly; the designer can complete
the workflow without AI; and no model output bypasses Core validation.

## `0.8.0`: market-led horizontal multilingual production

### User outcome

Adapt an approved campaign to the languages and horizontal writing systems
required by real launch markets while preserving hierarchy, brand fonts,
layout quality, and exact reproducibility.

### Planning rule

Prioritize scripts from customer and campaign evidence, not Unicode
completeness. Thai is already supported. Horizontal RTL and CJK are independent
slices and may ship in either order. Vertical writing remains a later research
track until a funded brief requires it.

### Architecture prerequisite

Deepen the current split typography flow into one internal operation such as
`layoutText(request)`, owning direction resolution, segmentation, wrapping,
shaping, measurement, outlines, bounds, and issues. Templates express a text
box and semantic intent, not shaping implementation.

### Core scope

- Add explicit language/script and, for RTL, base-direction controls in a new
  schema. Never infer from host locale.
- Pin Unicode bidi or line-breaking data and algorithms with checksums and
  offline generation.
- Add direction-aware shaping, mixed-script runs, logical alignment, expansion
  and contraction evidence, and locale-specific font coverage checks.
- Preserve legacy schemas on the exact LTR-horizontal path and keep their
  existing rejection and pixel behavior.
- Continue rejecting bidi override controls in the first RTL release.

### App scope

- Coordinate locale variants as related immutable design revisions.
- Show source and translated copy together with expansion, overflow, missing
  glyph, and font-mapping evidence.
- Preserve art-direction locks across locale variants while allowing explicit
  locale-specific template versions when mirroring or composition changes.

### Version and test ownership

Expect schema, typography, diagnostics, renderer, manifest, and relevant
template versions. Require pinned conformance vectors, licensed fixture fonts,
mixed-script cases, fresh-process corpus hashes, exact new baselines, and exact
legacy parity across supported Node versions.

### Non-goals

Automatic translation, host `Intl`, automatic language detection, system-font
fallback, bidi overrides, simultaneous support for every non-space script, or a
claim of universal Unicode correctness.

### Exit gate

A real campaign ships in the selected target scripts with reviewed fonts and
layouts; locale variants remain recognizably one campaign; and all supported
legacy design/template baselines stay byte-identical.

## `0.9.0`: specialized campaign content and accessible output

### User outcome

Add advanced content types only after the core brand, asset, campaign, AI, and
localization workflows are proven. Export meaningful accessible SVG alongside
the production campaign.

### Scope

- Add deterministic bar or sparkline compositions only as part of a real
  report, case-study, or data-story campaign family.
- Record scale, zero-baseline, negative/mixed-sign, constant-domain, ordering,
  rounding, label-density, and summary rules in an ADR before rendering charts.
- Add bounded document title/description controls, embedded-image labels from
  asset alt text, and deterministic chart summaries.
- Add designer-facing quality evidence and App proof overlays for accessibility
  descriptions, composited contrast, and safe-area placement.
- Evaluate additional deterministic delivery formats only from channel or
  customer evidence. Do not add a lossy encoder without exact versioning and
  cross-platform byte tests.

### Version and test ownership

Charts use an explicit new template ID/version and remain concrete composition
policy, not a plugin framework. Accessibility fields require a schema minor;
SVG byte changes require renderer review and exact baselines; new provenance
meaning requires a manifest bump. Test pathological chart domains, summaries,
escaping, image labels, accessibility trees, exact outputs, and legacy parity.

### Non-goals

Arbitrary chart types, dashboards, D3/plugins, animation, user coordinates,
decorative sparklines, a chart language, or treating an automatically generated
description as a substitute for author review.

### Exit gate

At least two real data-story briefs produce truthful, legible, accessible
campaign outputs; every chart has a stable human-reviewable summary; and the
feature broadens publishable work without making existing brands look more
template-driven.

## `1.0.0`: stabilization, not another feature bundle

Cut `1.0.0` only after the planned pre-1.0 features have been used for real
campaigns and their contracts have survived at least one minor release. The
milestone is for:

- public-export and error/quality-code inventory;
- supported schema/template migration and deprecation policy;
- an explicit pure migration utility only where a real saved-document upgrade
  path exists—never automatic migration during render;
- a browser-safe capability report covering supported schemas, exact template
  versions, formats, outputs, policy versions, and public limits;
- designer-facing documentation organized around briefs, brand systems,
  campaigns, adaptation, review, and handoff rather than internal modules;
- dual-Node clean-clone qualification, package-size review, license/audit
  closure, and packed-consumer matrices; and
- final documentation of compatibility guarantees and the supported security
  boundary.

No new pixel feature enters the `1.0.0` stabilization train.

### Product acceptance gate

Before `1.0.0`, demonstrate all of the following with real reviewed work:

- one brief produces at least three credible directions rather than cosmetic
  color or seed variations;
- one selected direction becomes a coherent four-format campaign and
  multi-slide series;
- three brand systems remain visibly distinct rather than looking like
  recolored copies;
- real logos, photography, generated raster assets, fonts, focal crops, and
  safe areas work through the supported workflow;
- a selective AI revision preserves every human lock and cannot bypass
  validation;
- stakeholders can compare, comment on, and approve the exact fingerprinted
  revision that is exported; and
- a senior designer would publish the result without repairing its composition
  in Figma.

## Parallel research tracks without a version promise

### Browser SVG parity

Treat browser rendering as an iteration-speed enabler, not a designer-facing
feature by itself. Pursue it when it can make candidate comparison and proof
updates materially faster.

Separate platform-neutral validation, explicit-byte resource verification,
text layout, templates, scene creation, and SVG serialization from Node-only
filesystem, PNG, Resvg, isolation, and CLI adapters. A browser subpath must have
no `node:*` imports, no network or system-font dependency, and exact Node/browser
SVG and canonical fingerprint-payload parity. Browser PNG and a second
Canvas-based layout path remain out of scope.

### Review, approval, and handoff

The App should add comments or annotations, visual revision comparison,
`in-review`/`changes-requested`/`approved` states, and an approval receipt tied
to the exact design revision, output fingerprints, and resource pins. Export
bundles must make approval state explicit and must not misrepresent an
unapproved render as approved. These workflow records do not affect Core
pixels.

### Signed provenance and C2PA

Core may later expose a canonical statement or assertion payload derived from
the existing manifest. Key custody, certificates, trusted timestamps, C2PA
embedding, revocation, and signed-artifact storage remain in a trusted
App/worker or companion integration. Write an ADR before promising an artifact
format because signing changes output bytes and creates hash-ordering concerns.

### Vertical typography

Vertical writing changes line geometry, glyph orientation, metrics, template
composition, and quality bounds. Keep it behind a funded product brief,
licensed fonts, pinned conformance data, and its own milestone. Do not hold
horizontal RTL or CJK production hostage to a general vertical-layout promise.

### Additional fonts and scripts

Evaluate WOFF/WOFF2, font collections, hyphenation, and language-specific
segmentation only from concrete product inputs with licensed fixtures. Each
policy receives its own pinned data/version and must not depend on host locale.

### Additional templates and procedural styles

Require a concrete brief, a stable semantic layer contract, supported formats,
and reviewed examples. Keep each template explicit. Add a shared abstraction
only after two independently useful templates repeat the same policy.

## Permanently outside Core

- accounts, authentication, authorization, persistence, queues, storage, and
  billing;
- malware scanning, quarantine, license adjudication, or upload workflow;
- remote fetching or document-selected filesystem paths;
- LLM calls or model-generated rendering code;
- freeform coordinates, CSS, expressions, callbacks, or template languages;
- active uploaded SVG; and
- C2PA key custody and signing operations.

## Planning maintenance

At each release:

1. Re-run `npx changeset status` and reconcile the package target.
2. Move only completed items into `docs/roadmap.md`.
3. Record accepted contract choices in ADRs, not only this plan.
4. Replace provisional version labels when a decision gate changes sequencing.
5. Keep release qualification results in a dated record rather than checking a
   gate from intent alone.
