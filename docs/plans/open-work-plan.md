# Glyphkiln open-work plan

**Compiled 3 November 2026. Status: index of all work that is planned but not
yet implemented. Nothing here is newly approved or started.**

Glyphkiln's open work was spread across six planning documents. This plan
gathers it in one place, removes duplicates, and proposes one order. Detail stays
in the source documents; each item links back to its source.

| Source                                                                         | Covers                                                          |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [Design-quality improvement plan](design-quality-improvement-plan.md) (DQ)     | Depth: making output read as graphic design, P0–P5              |
| [Graphic-design capability roadmap](graphic-design-capability-roadmap.md) (CR) | Breadth: 16 kinds of design work, M0–M10, tickets GD-001–GD-010 |
| [Post-Alpha milestones](post-alpha-next-milestones.md) (PA)                    | App product slices 1–6                                          |
| [Roadmap](../roadmap.md) (RM)                                                  | Core after `0.8.0`, App after Alpha                             |
| [Reference-led refinement](../reference-led-refinement.md) (RL)                | Five next priorities from the 120-project study                 |
| [Known limitations](../known-limitations.md) (KL)                              | Current gaps that no plan yet schedules                         |

## 1. Where things stand

**In review, not merged:**

| Pull request                                                        | Contents                                                                                                                                                                                                                 | Open before merge                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [#68](https://github.com/xxibcill/glyphkiln/pull/68) → `main`       | Static-ad families (benefit proof, product offer, testimonial, comparison, problem-solution, offer urgency), schema 1.5.0/1.6.0, reference-led layouts, App static-ad campaign studio and migration, design-quality plan | Code review; `test:coverage` and `verify:release` on the branch alone |
| [#67](https://github.com/xxibcill/glyphkiln/pull/67) → #68's branch | DQ P0 internal work, advisory craft review 1.1.0, opt-in `quote-card@1.2.0` / `statistic-card@1.2.0`, Kilnform before/after proofs                                                                                       | Merge after #68; rebase onto `main` if GitHub does not retarget it    |

**Finished and not repeated here:** App Alpha, carousel authoring, Core 0.3 text
diagnostics, Core 0.5 brand fidelity, Scene Kernel `0.8.0`/`0.9.x`, PA slices
1–3 and 5.

## 2. Decisions needed from the owner

Several tracks cannot move without these. Each is listed once, with what it
unblocks.

| #   | Decision                                                                                                                                                                                                                                                                    | Unblocks                                          | Source         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------- |
| D1  | **Depth before breadth?** Recommended: finish DQ P1–P3 before CR M2 onward                                                                                                                                                                                                  | The whole sequence in §4                          | DQ §8.4        |
| D2  | **Budget for 2–3 professional designers** to produce the 12 benchmark briefs                                                                                                                                                                                                | DQ P0 blind round, every "beats the expert" claim | DQ §8.2        |
| D3  | **Which fonts to bundle or license**: Thai + Latin six-family set **approved 4 November 2026** ([research](../research/thai-latin-fonts-2026-11/README.md)); Latin-only six-family set **approved 4 November 2026** ([research](../research/latin-fonts-2026-11/README.md)) | DQ P1 typography, benchmark briefs A–D            | DQ §8.3        |
| D4  | **Allow an optional AI model in the loop** for concept choice and critique, outside the render path                                                                                                                                                                         | DQ P3 (AI critic, directions); relates to D5      | DQ §8.1        |
| D5  | **Accept the AI-authoring threat model** and supply one real brief                                                                                                                                                                                                          | PA slice 4 acceptance gate                        | PA slice 4     |
| D6  | **Approve the `1.2.0` quote and statistic look** as the App default                                                                                                                                                                                                         | Switching new App drafts to `1.2.0`               | #67            |
| D7  | **Supply a light or one-color Kilnform mark**                                                                                                                                                                                                                               | Closing the campaign mark finding                 | DQ P1 proofs   |
| D8  | **A funded campaign brief needing Arabic or Chinese/Japanese/Korean**, with licensed fonts                                                                                                                                                                                  | Multilingual production                           | PA slice 6, RM |

## 3. Open work, by track

Status values: **not started**, **partial** (some evidence exists), **blocked**
(needs a decision above).

### Track A — Merge and housekeeping

| Item                                               | Status  | Exit evidence                                                              |
| -------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| A1 Review and merge #68                            | partial | Coverage and `verify:release` pass on the branch; review comments resolved |
| A2 Merge #67 after #68                             | partial | Retargeted to `main`; full gate passes after rebase                        |
| A3 Keep this plan's status current when items land | ongoing | Status columns match the source documents                                  |

### Track B — Design quality (depth), from DQ

| Item                                                                                                                                                                                                                                                                                             | Status                                                                                                                                                                                                                                                                                                                                                                                         | Depends on                                            | Exit evidence                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| B1 **P0 remainder:** commission expert baselines, run the first blind round                                                                                                                                                                                                                      | blocked (D2)                                                                                                                                                                                                                                                                                                                                                                                   | —                                                     | Recorded win rate, comprehension and defect count per brief                                           |
| B2 **P1 remainder:** font library and pairings; rich-text emphasis inside headlines; OpenType features; size-dependent tracking and leading; brand color roles with an accent budget; procedural decoration off by default; local rather than global image darkening that protects product color | done except fonts (D3), 3 Nov 2026: schema `1.7.0`, `quote-card@1.3.0`, `statistic-card@1.3.0`, `image-led-campaign@1.2.0`; [Kilnform re-render](../../Deliverables/benchmarks/p1-craft-2026-10-b2/README.md); Thai + Latin fonts approved (D3) and **bundled 4 Nov 2026** (12 OFL families, 101 files in Core's `assets/fonts/`, hashes checked by `licenses:verify`; typography M1 draft PR) | Rich text and color roles need DesignDocument `1.7.0` | Re-rendered Kilnform set; no correctness regressions; visible gain in the next blind round            |
| B3 **P2 composition engine:** grid system; about 10 layout types; hierarchy solver; product cutout masks; per-format recomposition; seeded candidate layouts; semantic templates compiled to Scene geometry                                                                                      | not started                                                                                                                                                                                                                                                                                                                                                                                    | B2 for type                                           | Kilnform campaign and announcement reach ≥ 40% preference on composition; old versions byte-identical |
| B4 **P3 intent and concepts:** intent fields (`1.7.0`); three distinct concepts per brief in the App; recorded choice reasons; repair loop with a stopping rule; optional AI critic                                                                                                              | not started; AI critic blocked (D4)                                                                                                                                                                                                                                                                                                                                                            | B3                                                    | Routine briefs ≥ 50% preference and expert-level comprehension                                        |
| B5 **P4 visual vocabulary:** motifs from the product or logo; illustration and icon kits on Scene; process/comparison/chart builders; carousel family view                                                                                                                                       | not started                                                                                                                                                                                                                                                                                                                                                                                    | B3                                                    | Diagram and carousel briefs ≥ 50% preference                                                          |
| B6 **P5 hero work:** type as image, collage and material finish, concept exploration for identity work                                                                                                                                                                                           | not started                                                                                                                                                                                                                                                                                                                                                                                    | B4, B5                                                | Reported separately from routine-work results                                                         |
| B7 Craft-review gaps found in P0: detect un-recomposed formats; detect dimmed product color                                                                                                                                                                                                      | not started                                                                                                                                                                                                                                                                                                                                                                                    | —                                                     | Both fire on the 25 September Kilnform campaign                                                       |

### Track C — Breadth across design work, from CR

CR's milestones are all planned. Where DQ already covers the same ground, the CR
item is merged into the DQ item rather than built twice.

| Item                                                                                                                | Status      | Merged with                     | Exit evidence (from CR)                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| C1 **M0** evidence ledger: inspect the remaining 113 references; write the 48 family briefs; tickets GD-001, GD-002 | not started | DQ P0 briefs cover 12           | Every family has two inspected real cases                                                  |
| C2 **M1** composition and type foundation; GD-003 inventory                                                         | not started | **B2 + B3** (same work)         | Short/long copy, whole-subject crops and supplied fonts work across contrasting directions |
| C3 **M2** posters, stationery, identity, digital assets; GD-004–GD-006                                              | not started | —                               | Proofs created, saved, reopened and revised without code                                   |
| C4 **M3** charts, tables, diagrams with units and sources; GD-007                                                   | not started | **B5** builders                 | Data and domain meaning preserved; no invented claims                                      |
| C5 **M4** multi-page documents and decks; GD-008                                                                    | not started | RL priority 3                   | Proofs survive copy insertion and shared-style edits                                       |
| C6 **M5** print and PDF export; GD-009                                                                              | not started | RL priority 2; KL (no PDF/CMYK) | Supplier-reviewed print proof; unsupported profiles fail clearly                           |
| C7 **M6** packaging, labels, menus, merchandise                                                                     | not started | RL priority 2                   | Physical/mock assembly, variable data, scan tests                                          |
| C8 **M7** signage and exhibitions                                                                                   | not started | RL priority 4                   | Real-size/distance review                                                                  |
| C9 **M8** illustration and photo compositing                                                                        | not started | **B5** kits, B2 treatments      | Coherent assets, clean edges, honest editability                                           |
| C10 **M9** motion and broadcast                                                                                     | not started | RL priority 5                   | Frame review, exact timing, static alternatives                                            |
| C11 **M10** all-family qualification; GD-010 portfolio review                                                       | not started | —                               | Every family meets CR §5                                                                   |

RL priority 1 (subject-region crop protection, more composition choices,
delivered-size readability) is covered by B3 and the craft review in #67.

### Track D — Core platform, from RM, PA and KL

| Item                                                                                | Status              | Trigger                                 | Source             |
| ----------------------------------------------------------------------------------- | ------------------- | --------------------------------------- | ------------------ |
| D-1 AI-assisted authoring acceptance on a real brief                                | built; gate pending | D5                                      | PA slice 4         |
| D-2 Arabic or CJK text, after unifying the typography layout path                   | blocked             | D8                                      | PA slice 6, RM, KL |
| D-3 Semantic illustration compiler on the Scene Kernel (possible `@glyphkiln/book`) | not started         | Real illustration brief                 | RM                 |
| D-4 Accessible publication output                                                   | not started         | Real brief; follows C6                  | RM, KL             |
| D-5 Scene authoring and review in the App (today SDK-only)                          | not started         | B4/B5 need it                           | Stress test, DQ W8 |
| D-6 Hyphenation, font fallback stacks, more script wrapping models                  | not started         | Part of B2/D-2                          | KL                 |
| D-7 ICC color-profile control and C2PA signing                                      | not started         | Outside the pure renderer; low priority | RM, KL             |
| D-8 Feature-frozen `1.0.0`: compatibility and capability tooling                    | not started         | After contracts survive real use        | RM                 |

D-6 is staged in the [typography engine plan](typography-engine-plan.md): font
fallback stacks in M1, script wrapping models in M3 and hyphenation in M5. That
plan also supplies the unified layout path D-2 waits for.

### Track E — App operations, from RM

| Item                                                                                                     | Status      | Trigger                                   |
| -------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------- |
| E1 Operator administration and retention controls for jobs, artifacts, resource admissions, audit export | not started | Before wider self-hosting                 |
| E2 Multi-host object-storage adapter                                                                     | not started | Only when a supported deployment needs it |

## 4. Proposed order

Assumes D1 is answered "depth first".

1. **Now:** A1–A2 merge; owner decisions D1–D3 and D6–D7; finish B2 except
   fonts; B7.
2. **Next:** B2 fonts once D3 is made; B3, which also completes CR M1 (C2); B1
   blind round once D2 is funded, run before and after B3.
3. **Then:** B4 (needs D4 for the AI critic) with D-5 Scene in the App; B5,
   which also delivers most of CR M3 and M8 (C4, C9).
4. **After depth is measured:** CR M0 ledger (C1), then M2 (C3), M4 (C5) and
   M5 print (C6), then M6–M9, then M10.
5. **When triggered:** D-1 on a real brief (D5); D-2 on a funded brief (D8);
   D-3, D-4, E1, E2 on real demand; D-8 last.

B6 (hero work) runs alongside steps 3–4 and is reported separately.

## 5. Rules that apply to every item

From the repository and source plans; listed so this plan does not drop them:

- Deterministic output, seeded randomness, no network fetching in render paths;
  every pixel change gets tests, a version change and reviewed baselines; old
  exact versions stay byte-identical (`AGENTS.md`, CR §5.D).
- Full gate before handoff: build, typecheck, lint, tests, coverage, plus the
  relevant fixture, example and generated-output checks.
- Technical correctness, craft judgment, viewer comprehension and commercial
  results are separate kinds of evidence. Only the blind panel supports a
  "beats the expert" claim (DQ §2, §7).
- Agent review and human acceptance are recorded separately; human acceptance is
  needed before a family is called production-qualified (CR §5.A).
- Text stays shaped and editable in Core; no image model paints final
  typography (DQ §7).
