# Design-quality improvement plan: from reproducible graphics to graphic design

**Drafted 20 October 2026. Status: proposed plan, nothing implemented.**

Author: Claude (Opus 5.5) for the project owner. Sources: the owner's
assessment ("the output is useful but not yet graphic design; it cannot beat an
expert human designer"), visual inspection of the
[Kilnform stress-test boards](../../Deliverables/designer-stress-test-2026-09-25/README.md),
the [portfolio benchmark](../../Deliverables/designer-stress-test-2026-09-25/portfolio-benchmark.md),
current Core template code, and the reviewed graphic-design knowledge base
(`ai-business/Knowledge Base/Graphic Design/`: playbook, GD01–GD19 reviewed
methods, GD20 synthesis).

This plan is about **depth of design quality**. The existing
[capability roadmap](graphic-design-capability-roadmap.md) is about **breadth**
(16 work families, print, motion). Breadth built on today's composition model
would multiply the same quality ceiling, so this plan should come first. Its
outputs become M1 ("Composition and type foundation") of that roadmap.

---

## 1. Diagnosis: why the output is not yet "graphic design"

The knowledge base defines the core of graphic design in one sentence:

> Make a specific visual relationship carry the message, then make it
> convincing through composition, typography, imagery, color and finish.
> (Playbook / GD20)

Glyphkiln is very good at the **second half's engineering**: exact text
shaping, fitting, contrast, provenance and byte-identical reproduction. It
currently has **no layer for the first half**. Nothing in the pipeline knows
what the graphic is trying to say, and nothing judges whether it says it well.

### 1.1 Critique of the actual outputs (GD19 rubric, reviewed at board size)

| Dimension | Observation in the Kilnform outputs | Consequence | KB reference |
| --- | --- | --- | --- |
| **Concept / message fit** | Announcement, quote, statistic and article cover would all be unchanged if "Studio Lamp" became any other product. Waves, flow fields and contours carry no subject meaning. | Fails the substitution test, so it reads as a template rather than a Kilnform idea. | GD20 card 1; GD01–02 |
| **Composition** | Every semantic template uses the same structure: a dark rectangle placed on a textured field, top-left. The quote panel is about two-thirds empty. Carousel slides leave the lower 40–50% unused. Panels have no grouping job. | The hierarchy looks flat and the eye has no entry point. Empty space reads as unfinished, not as intentional quiet. | GD03 supplement: "a container without a communication role adds clutter"; GD20 card 2 |
| **Typography** | One family (Inter) for all roles. Headline-to-body scale contrast is modest. Most labels sit at roughly 9–11 px at board size. There is no emphasis inside a headline, no display behavior and no typographic idea. | The type is "polished but anonymous" and nothing in it expresses the premise. | GD20 card 3; GD04 |
| **Imagery** | All three campaign formats use the same photo, crop logic and type position. The cobalt mark disappears on the dark scrim, and the scrim dims the product's defining blue. | The adaptations shrink one design instead of recomposing it. The image's own color fights the treatment. | GD17 adaptation; GD06 "include the image's colors"; GD20 card 7 |
| **Color** | A gold accent appears everywhere as decorative bars, ticks and frames. No color has a role, and area is not budgeted. | The accent stops signaling anything. | GD06 color by role, adjacency and area |
| **Coherence / finish** | The family is consistent, but it shows consistency of the *template*, not of the *brand*. The benchmark found the same thing: "a template family more than a distinctive Kilnform identity". | Routine production value, no portfolio value. | GD10 identity contract |

**The strongest output, the Scene Kernel process diagram, is the evidence for
the fix.** It is the only piece whose geometry was designed for its subject:
stage drawings, a real left-to-right relationship and restrained role-based
color. Quality appeared where composition was allowed to respond to content.

### 1.2 Root causes in the system

| # | Root cause | Where it lives |
| --- | --- | --- |
| R1 | **Each template has one hard-coded composition.** `product-announcement` is "left-weighted copy with optional right image", built from fixed multipliers (`safe.width * 0.52`, `22 * unit` …). The document is intentionally coordinate-free, so the author cannot change it either. Every design is the same design with different words. | `packages/glyphkiln-core/src/templates/*.ts` |
| R2 | **No representation of intent.** The document has layers (headline, subtitle, cta …), not a message, a visual relationship, an image job or a dominant element. The system cannot choose a composition for a reason. | `DesignDocument` schema |
| R3 | **Quality gates measure correctness, not design.** Contrast, overflow, orphans, glyph coverage and safe areas are all necessary, and none is a design judgment. A design can pass every gate and still be weak. The KB is explicit on this: "a contrast calculation does not qualify the layout or its beauty." | `quality-policy.md` |
| R4 | **Thin typographic material.** One bundled font, no rich-text emphasis, no OpenType feature control, no size-dependent tracking or leading, and no display behaviors. | `fonts.md`, `typography/` |
| R5 | **The only graphic vocabulary is generic procedural texture.** Decoration is on by default and has no job. | `backgrounds/`, `procedural-backgrounds.md` |
| R6 | **No exploration step and no external judgment.** One brief produces one layout. There are no competing premises, no delivered-size critique loop and no comparison with expert work for the same brief. | Workflow |

---

## 2. Target and honest definition of "beat an expert"

"Beat an expert human designer" needs a measurable definition. Otherwise
"better" can be claimed from taste.

**Definition (proposed):** for a fixed brief, fixed copy, fixed assets and
a fixed time box, a panel judges Glyphkiln output against output from a
professional designer **blind**. "Beat" means:

1. **Pairwise preference ≥ 50%** in blind A/B judging by a panel of at least five working designers, scored per GD19 dimension and overall.
2. **Comprehension ≥ expert:** target viewers correctly state the message and the action at delivery size (for example 360 px phone width).
3. **Zero mandatory defects:** exact copy, qualifications, readability and the subject identity are all preserved.
4. **Speed and consistency win:** time to first acceptable direction, revision cost and family consistency across 10+ assets. Glyphkiln should win here decisively.

**Realistic staging.** Craft parity on **routine work** (social posts,
announcements, quotes, covers, adaptations, carousels) is reachable. Parity on
**concept originality for hero/identity work** is a long-term target. In the
near term, Glyphkiln wins by pairing *expert-level craft at scale* with a human
choosing the concept. The plan measures both separately and does not blend
them into one score.

---

## 3. Architecture principle: put a designer in front of the kiln

Keep everything that makes Glyphkiln trustworthy: inert data, determinism,
pinned resources, versioned pixels and provenance. Add the missing judgment
**before** rendering, and add design critique **after** it.

```text
Brief ─► Intent ─► Directions (≥3 premises) ─► Composition solve ─► Craft pass ─► Render (existing Core/Scene) ─► Critique at delivery size ─► Repair ─► Handoff
          W1            W8                           W2                  W3–W6           (unchanged)                      W7                     W8
```

Key decision: **semantic templates stop drawing directly. They compile to
Scene Kernel geometry through a composition solver.** The `DesignDocument`
stays coordinate-free and safe. The author chooses *intent, archetype and
parameters*. A deterministic, seeded solver produces the reviewed geometry.
The roadmap already anticipated this ("semantic domain compilers produce
reviewed geometry"). This plan makes it the center of the work.

---

## 4. Workstreams

### W1 — Design intent layer (concept before layout)

Add an inert, bounded `DesignIntent` object (schema 1.7.0) beside the layers.
It turns the GD20 "Concept/reference" template into data:

| Field | Closed vocabulary or bound | Purpose |
| --- | --- | --- |
| `viewerTask` | notice / understand / compare / decide / feel | What the graphic must achieve |
| `message` | ≤ 140 chars | One-sentence takeaway |
| `relationship` | object↔feature, before↔after, input↔output, price↔condition, image↔title, scale-comparison, process, contrast, metaphor, type-as-image, atmosphere | The visual relationship that carries the idea |
| `dominant` | layer ID | The one element that wins first attention |
| `imageJob` | identity / action / construction / context / atmosphere | What the photo or illustration must prove |
| `avoid` | ≤ 140 chars | The wrong interpretation to prevent |
| `tone` | quiet / confident / urgent / playful / editorial / technical | Drives type and color defaults |

The solver (W2) uses `relationship` and `dominant` to pick archetypes and
scale ratios. Critique (W7) uses `viewerTask` and `avoid` as its rubric.

**Acceptance:** for the GD20 A/B briefs and Kilnform, two intents with
identical copy produce materially different, defensible compositions. A
product swap fails the substitution test, because a product-specific
relationship is now visible.

### W2 — Composition grammar and solver (replaces fixed templates)

Replace one-composition-per-template with **archetypes** solved on a grid.

1. **Grid system.** Columns, modular rows, a baseline grid and margins derived from format and density. Every element snaps to the grid, so alignment edges are few and deliberate.
2. **Archetype library (first 10).** Full-bleed image with type in a measured quiet region · split field · oversized type poster · type behind subject (cutout) · object plus annotation callouts · big number / data hero · editorial spread (image + black field + headline, GD20 Pentagram case) · centered symmetric · stacked sequence frame · collage/overlap. Each archetype declares which `relationship` values it serves.
3. **Hierarchy solver.** Element priority comes from intent. The solver assigns a **modular type scale** with real contrast (for example ≥ 3:1 display-to-body for posters, tunable by tone), proximity groups and occupied area per role. It never makes everything "medium".
4. **Subject-aware image regions.** Use a supplied **subject mask or must-keep polygon**, not only a focal point. Crops must keep the whole defining silhouette. Type may overlap the image only in measured quiet regions, or deliberately behind a cutout.
5. **Deterministic candidate generation.** With a seed, the solver enumerates N candidate layouts per archetype. It prunes those that fail W7 heuristics and returns the top K for directions (W8).
6. **Adaptation as recomposition.** Each format is solved separately with the same intent and invariants. It is never a reflow of one master (GD17).

**Acceptance:** re-render the Kilnform set. The three campaign formats show
three different compositions with the same relationship. No panel exists
without a grouping job. Fixed-template documents keep reproducing their old
bytes under their old versions.

### W3 — Typography craft

- **Curated, licensed font library with role pairings.** At least one display serif, one grotesk, one condensed display, one mono, and Thai partners with Thai–Latin optical matching (for example IBM Plex Sans Thai, Noto Sans/Serif Thai, Anuphan). Store each with its license record and hash, per the existing resource model.
- **Rich-text spans** inside a headline: weight/color/italic emphasis on a bounded phrase list, so headlines can have an internal hierarchy.
- **Size-dependent setting:** tracking and leading curves by point size (tight display, open small caps and labels). Optical size where the font supports it.
- **Explicit OpenType features:** kerning, ligatures, tabular/oldstyle numerals, case-sensitive forms and small caps. This is already listed as a missing feature in `fonts.md`.
- **Rag and break quality:** semantic line breaks (extend `keepTogether` with preferred break points), a rag-evenness score and hanging punctuation for quotes.
- **Display behaviors** as closed options: oversize/cropped-at-edge, stacked, all-caps tracked label, outlined, and type masked by image.
- **Thai–Latin optical harmonization:** compare x-height/head height rather than point size (GD05).

**Acceptance:** the quote card becomes typographic. The quote is set as the
image, with a display serif and hanging marks. Thai/Latin GD20 brief A passes
mark-clearance and optical review at 400×400.

### W4 — Image and art direction

- Declare an **image job** per asset (from W1) and check it. For example, `identity` requires the full silhouette, and `construction` requires the detail region to be visible at delivery size.
- **Admitted subject masks** (PNG alpha supplied as a resource, so determinism holds; no in-render ML) enable type-behind-subject, cutout-on-color and grounded shadows with correct contact.
- **Treatments beyond scrims:** duotone/tritone from brand roles, color-field, gradient-map, controlled grain and local (not global) darkening. Each treatment is versioned.
- **Image-aware color:** deterministic, seeded palette extraction from the asset feeds W5, so the treatment protects the product's defining color (the cobalt problem).
- **Mark visibility check:** logo contrast against its local background, with automatic selection of the approved light/dark/mono variant.

### W5 — Color by role

- Brand palettes gain **roles**: ground, figure, text, accent, signal. Each role has an **area budget**, for example "accent ≤ 8% of canvas, only on the dominant or the action".
- Checks: an accent-area budget, a **grayscale value-structure test** (does the hierarchy survive without hue?), and harmony between image-extracted colors and brand roles.
- Contrast stays a required check. It is no longer the only color check.

### W6 — Meaningful graphic vocabulary

- **Turn decoration off by default.** Procedural backgrounds require a declared job (atmosphere/identity) and a density budget.
- **Subject-derived motifs:** compile motifs from the brand mark geometry or the product silhouette, for example the lamp's turned profile as a repeating rhythm or a crop device. This replaces generic waves (benchmark item 3).
- **Illustration and icon family kits** on Scene Kernel with shared geometry rules (stroke, corner radius, viewpoint, detail level, GD08), so diagrams like the process graphic can be built from the App and not only in code.
- **Information compilers** (process, comparison, chart) that preserve units, topology and arrow semantics (GD15). They connect to roadmap M3.

### W7 — Design critic (separate from technical QA)

Three tiers. They stay **reported separately** from correctness checks and
from each other, as the KB requires.

1. **Deterministic craft heuristics** (in Core, versioned, advisory): scale contrast of dominant vs. next element; count of competing focal elements (area × contrast weight map); **dead-space detection** (large unused regions inside containers); alignment-edge count; **delivered-size legibility** (minimum rendered x-height in px at the target display width, for example 360 px phone); mark and subject visibility; accent-area budget; grayscale hierarchy; carousel adjacency difference.
2. **Model critique adapter** (App-owned, optional, outside the render path, consistent with `ai-authoring-contracts.md`). A multimodal reviewer applies the GD19 rubric to the actual exports at delivery size and returns located findings: *version / size / region → observation → consequence → hypothesis → repair → preserved constraints*. Findings map to solver parameters, so repairs are concrete and never free-form pixel edits.
3. **Human expert panel** for benchmark rounds (§2). This is the only source of "beats expert" claims.

### W8 — Directions, revision and adaptation workflow (App)

- **Brief intake** creates the intent (W1). The App then shows **three materially different premises** with identical copy, side by side at delivery size (GD02, GD18).
- Selection and rejection reasons are recorded on the design revision. This fits the existing immutable revision and provenance model.
- **Repair loop with a stopping rule:** fix mandatory defects, then stop when remaining differences are preferences (GD19). Each repair names the failed layer: concept, hierarchy, type, image, color or finish.
- **Family view** checks a campaign or carousel as a set: adjacency, rhythm, and what is repeated vs. what advances (GD13).
- **Scene access for designers in the App:** today custom diagrams need code (benchmark item 4). Archetypes plus kits make this possible without exposing raw scenes.

### W9 — "Beat the expert" benchmark programme

- **Brief set (12):** Kilnform (announcement, quote, statistic, cover, 3-format campaign, carousel, process diagram); GD20 briefs A–E (Thai planning cover, notebook product, six-frame lesson, lever diagram, service states).
- **Expert baselines:** commission 2–3 professional designers to produce the same briefs with the same copy and assets in a stated time box, and record their hours.
- **Blind evaluation** per §2, after every phase. Keep results as dated evidence in `Deliverables/benchmarks/`.
- **Regression rule:** a phase is not done if win rate, comprehension or defect count regresses on any previously passed brief.

---

## 5. Phased delivery

| Phase | Scope | Exit gate (measured, not asserted) |
| --- | --- | --- |
| **P0 Baseline** (≈2 wks) | Full GD19 critique ledger of current outputs; W7 tier-1 heuristics as *advisory only*; commission expert baselines for the 12 briefs; first blind round | Baseline win rate, comprehension and defect counts recorded per brief. This is the "before" number. |
| **P1 Craft quick wins** (≈4–6 wks) | W3 font library, rich spans, OpenType and size curves; W5 color roles and accent budget; W6 decoration off by default; W4 mark visibility; re-render Kilnform | Visible improvement in a blind round on type/color dimensions. No mandatory-defect regressions. Legibility heuristic passes at phone width. |
| **P2 Composition engine** (≈8–10 wks) | W2 grid, 10 archetypes, hierarchy solver, subject masks, semantic→Scene compilation, per-format recomposition, seeded candidates | Kilnform campaign and announcement sets win ≥ 40% vs. experts on composition. Old template versions reproduce byte-exact. |
| **P3 Intent and directions** (≈6 wks) | W1 schema 1.7.0; W8 three-premise directions in the App; W7 tier-2 model critic with located repairs | Routine briefs reach ≥ 50% pairwise preference and expert-level comprehension. Time-to-first-acceptable-direction is below the expert baseline. |
| **P4 Vocabulary and systems** (≈8 wks) | W6 motifs, illustration kits, info compilers; W4 treatments/cutout grounding; W8 family view; Thai GD20 A/C | Diagram and carousel briefs reach ≥ 50%. The identity-consistency judgment improves across a 10-asset family. |
| **P5 Hero work** (ongoing) | Type-as-image, collage/material finish, concept exploration for identity/hero briefs | Tracked separately. Report concept-originality results honestly even while craft wins. |

The phases are sequential where they share the solver (P2 → P3 → P4). W3 and
W5 in P1 are independent and can run in parallel. Calendar estimates assume
one focused engineer plus design review, and need confirmation after P0.

---

## 6. Quick wins visible in the current outputs

These are concrete repairs to test in P1, each with a named symptom:

| Asset | Symptom | Repair |
| --- | --- | --- |
| Quote | Small quote floating in a mostly empty panel | Remove the panel; set the quote as the image in display serif, 2–3× larger, with hanging marks; let the attribution be a small tracked label |
| Statistic | "03" competes with the panel and background | Make the number dominant and edge-to-edge; drop the container; place the three places as a grid-aligned list |
| Announcement A/B | Box on waves; product never shown | Use the product (cutout or image) as the dominant; set the headline with internal emphasis; remove procedural texture |
| Campaign ×3 | Same composition shrunk; mark lost; cobalt dimmed | Square: type behind the lamp via mask. Portrait: oversized stacked headline above a full silhouette. Landscape: split field. Use the light mark variant, with local rather than global darkening |
| Carousel | Repeated panel structure, gold bars everywhere | Use 1.1.1 image slides for product frames; vary the archetype by frame task; restrict the accent to the frame's single key element |

---

## 7. What not to do

- **Do not add more fixed templates.** Each one adds another single composition with the same ceiling.
- **Do not let a passing contrast or overflow check stand in for quality.** Keep technical, craft, comprehension and commercial evidence as separate findings.
- **Do not hand text to an image model.** Text stays deterministic, shaped and editable. AI may propose intent, choose among solved candidates and critique, but it never paints the final typography.
- **Do not weaken the trust model.** Masks, fonts and palettes are admitted resources; solvers are versioned and seeded; model adapters stay outside the render path.
- **Do not claim "beats expert" from internal review.** Only the blind panel in W9 supports that claim.

---

## 8. Decisions needed from the owner

1. **AI in the loop.** Glyphkiln currently states it works "without relying on an LLM". Expert-level concept choice and critique (W7 tier 2, W8 directions) work much better with a multimodal model adapter, kept optional and outside the render path. Approve or reject that direction.
2. **Expert baseline budget.** Commissioning 2–3 designers for 12 briefs is the only way to measure "beat". Set the budget and time box.
3. **Font licensing.** Choose which font families to license or bundle (OFL options exist for every role listed in W3).
4. **Priority between this plan and the breadth roadmap.** This plan proposes depth first: P0–P3 before roadmap M2+.

**Next step:** after the owner decides on §8, start P0 by writing the critique
ledger for the current Kilnform outputs and the 12-brief benchmark pack.
