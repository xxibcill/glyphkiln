# Typography engine: progress and handoff

**Read this first if you are continuing the typography work.** It is the
running record of the [typography engine plan](typography-engine-plan.md):
what is done, where it lives, what is verified, what the owner has decided, and
what to do next. The plan says _what_ to build. This file says _where things
stand_.

Last updated: 11 November 2026, after M3 (head `d8e616d`).

**Keep it current.** At the end of every slice or milestone, update the
milestone table, the branch stack, the version ledger and "Next step", in the
same push as the work.

## Status at a glance

| Milestone                                | Status                            | Branch / PR                            | Head      | Detail                                                                          |
| ---------------------------------------- | --------------------------------- | -------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| M0 Harness, `Shaper`, one text path      | Done; exit gate met               | `claude/typography-m0` / #72           | `230dc5c` | [ADR 0019](../adr/0019-harfbuzz-shaper-qualification.md) accepted               |
| M1 Font model on HarfBuzz, bundled fonts | Done; **baselines await review**  | `claude/typography-m1` / #73           | `6af27d0` | [typography-m1.md](../typography-m1.md)                                         |
| M2 Shaper-switch close-out               | Done; exit gate met               | `claude/typography-m2` / #75           | `1631052` | [typography-m2.md](../typography-m2.md)                                         |
| Housekeeping, Q3 research, G-TH draft    | Done; **G-TH awaits Thai reader** | `claude/typography-housekeeping` / #76 | `5a5ad56` | [gold/README.md](../../packages/glyphkiln-core/tests/typography/gold/README.md) |
| M3 Line breaking, Thai segmentation      | Done; **T10 not claimed**         | `claude/typography-m3` / #77           | `d8e616d` | [typography-m3.md](../typography-m3.md)                                         |
| M4 Paragraph composer, justification     | **Next**                          | —                                      | —         | Plan §5 M4                                                                      |
| M5 Hyphenation                           | Not started                       | —                                      | —         | Needs Q5 for non-English languages                                              |
| M6 Microtypography, run-aware shaping    | Not started                       | —                                      | —         |                                                                                 |
| M7 Style system, paragraph furniture     | Not started                       | —                                      | —         |                                                                                 |
| M8 Text flow and shaped layout           | Not started                       | —                                      | —         | Priority depends on Q7                                                          |
| M9 Output and accessibility              | Not started                       | —                                      | —         |                                                                                 |
| M10 Professional-parity qualification    | Not started                       | —                                      | —         | Needs Q4 (InDesign reference set)                                               |

Every PR above is a **draft**. Nothing is merged. Do not merge or mark a PR
ready; the owner decides.

## Branch stack

Each milestone branches from the one before it, so the newest branch contains
everything below it.

```text
main
└─ codex/reference-led-design-refinement   #68  (static-ad families)
   └─ claude/design-quality-p0             #67  (craft review, P0/P1)
      ├─ claude/craft-review-b7            #69  (parallel, not in this stack)
      ├─ claude/typography-engine-plan     #71  (the plan; already contained in typography-base)
      └─ claude/p1-craft-b2                #70  (B2 type and color craft)
         └─ claude/typography-base         (no PR: #70 merged with the plan, 91ebda6)
            └─ claude/typography-m0        #72
               └─ claude/typography-m1     #73
                  └─ claude/typography-m2  #75
                     └─ claude/typography-housekeeping  #76
                        └─ claude/typography-m3         #77  ← start new work here
```

**Start the next milestone from `origin/claude/typography-m3`** on a new branch
`claude/typography-m4`, and open its draft PR with base `claude/typography-m3`.

## Verification record

| Branch | Linux x64 (cloud)                                            | macOS arm64 (owner's Mac)                                            |
| ------ | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| M0     | Full gate, Node 22 (timeouts only); determinism on 22 and 24 | Full gate, Node 24.16.0: pass                                        |
| M1     | Full gate, Node 22 (timeouts only)                           | Full gate, Node 24.16.0: pass, after the readability fix (`6af27d0`) |
| M2     | Full gate, Node 22; digest on Node 22 and 24                 | Full gate and digest, Node 22.23.1: pass                             |
| #76    | Lint only (docs)                                             | Lint, typecheck, `typography-gth` test (data + docs)                 |
| M3     | Full gate, Node 22 (timeouts only; see below)                | **Not run yet.** Reproduce the 3 new Thai PNGs in `tests/visual/m3/` |

M1 HarfBuzz output is byte-identical on Linux x64 and macOS arm64 under Node
22 and 24 (`npm run typography-m1-digest` →
`8aef70cfe3a1d671c04a6dd5854b8ba1adff471c687641407d446dc298e72007`).

## Version ledger

| Milestone | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | Nothing versioned. All baselines byte-identical.                                                                                                                                                                                                                                                                                                                                                                                                            |
| M1        | DesignDocument **1.8.0**, Scene **1.1.0**, renderer **0.6.0**, manifest **1.3.0**, Scene manifest **1.1.0**, authoring metadata 1.9.0. Policies `script-runs`, `cluster-tracking`, `font-variation`, `optical-size-auto`, `script-matching` (all `@1.0.0`) and the HarfBuzz shaper identity. Templates `quote-card@1.4.0`, `statistic-card@1.4.0`, `image-led-campaign@1.3.0`. Legacy renders keep renderer 0.5.0, manifest 1.2.0 and Scene manifest 1.0.0. |
| M2        | Nothing versioned. Tests and docs only.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| M3        | DesignDocument 1.8.0 **extended** (still unreleased) with `lexicon`, brand `typography.lexicon` and `keepTogether.preferBreakAfter`. Policies `line-break-uax14@17.0.0`, `line-break-tailoring@1.1.0`, `thai-segmentation-hybrid@1.0.0`, `prefer-break-after@1.0.0`. Manifest **1.4.0** for M3 renders. Templates `quote-card@1.5.0`, `statistic-card@1.5.0`, `image-led-campaign@1.4.0`. Renderer stays 0.6.0.                                             |

None of 1.8.0, Scene 1.1.0, renderer 0.6.0 or manifests 1.3.0/1.4.0 is
released, so later milestones may still extend 1.8.0 instead of adding a new
schema version. Check `docs/versioning.md` before relying on that.

## Owner decisions

**Answered:**

| Date       | Decision                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 Nov 2026 | Approved the plan; run milestones one at a time.                                                                                                  |
| 4 Nov 2026 | Approved six Thai + Latin and six Latin font families (D3); bundled in M1.                                                                        |
| 4 Nov 2026 | Accepted ADR 0019 (HarfBuzz for new policies, fontkit kept for legacy) and Q2 (about 530 KB runtime cost).                                        |
| 5 Nov 2026 | M1 baselines must read at phone size: the craft review gates every new baseline (`<name>.craft.json`).                                            |
| 5 Nov 2026 | Q3: build G-TH from the owner's own copy; publishing the PPRS copy in this public repository under Apache-2.0 is approved.                        |
| 5 Nov 2026 | M3: extend unreleased 1.8.0; no line starts with an em or en dash; numeric ranges never break; keep the bounded Thai unit list for reader review. |

**Pending** (none blocks M4's code; changing one later means regenerating baselines):

1. **Review the M1 baselines**
   ([review sheet](../research/typography-m1-baselines/README.md)) and the M3
   candidates in `packages/glyphkiln-core/tests/visual/m3/`.
2. **The six Thai–Latin pairings** (provisional, listed in
   [typography-m1.md](../typography-m1.md)).
3. **Package size:** fonts inside `@glyphkiln/core` (8.9 MB packed), or a
   separate fonts package.
4. **Q1** (fixes only in new template versions) and **Q6** (optical size from
   the 1080 px reference): both applied provisionally.
5. **G-TH:** name the native Thai reader; they also review the Thai unit list
   and the segmenter's 47-word supplement. **T10 cannot be claimed until this
   is done.** A syllable layer was not requested.
6. Plan **Q4, Q5, Q7, Q8** (plan §10).
7. Optional: raise the inline timeouts of the slow render tests (below).

## Next step: M4

Plan §5 M4: a Knuth–Plass composer (`composer-total-fit@1.0.0`), a single-line
composer for headlines, ragged modes `auto`, `balance` and `pretty`, `justify`
with spacing limits and Thai clustered-script justification, `fitText` on the
composer, and the diagnostics `HJ_SPACING_VIOLATION`, `HJ_RUNT` and
`HJ_CONSECUTIVE_HYPHENS`. Exit gate: T11, T12, T13, the in-frame part of T15,
and T30. It bumps the typography algorithm to 3.0.0.

Build it on M3's break opportunities, not on the old wrapper. Use the M0 C-PARA
corpus and metrics (adjustment ratio, runts, rag) for before-and-after numbers,
and work in verified, pushed slices as M3 did.

## Working rules

- **Repository rules** are in [`AGENTS.md`](../../AGENTS.md) and the skills
  `develop-glyphkiln-core` and `verify-glyphkiln-change`. Deterministic output,
  no network in render paths, a version bump plus tests plus candidate
  baselines for every pixel change.
- **Legacy stays byte-identical.** New behaviour is opt-in through new
  template versions (provisional Q1). Prove it with `examples:verify`,
  `fixtures:verify` and both visual suites.
- **New baselines** are review candidates, not reviewed: write a review sheet
  with 360 px previews, and pin a `.craft.json` beside each one.
- **Full gate before handoff:** `npm ci`, `build`, `typecheck`, `lint`, `test`,
  `test:coverage`, `examples:verify`, `fixtures:verify`,
  `typography-harness:verify`, `licenses:verify`, `text-layout-data:verify`,
  `test:package-consumer`, `scene-kernel-fixture:verify`,
  `scene-thai-fixture:verify`, `schema-conformance:verify`. The verification
  matrix lists the typography-specific checks.
- **Toolchain:** Node 22 or 24, npm exactly 10.9.8. The owner's Mac has both
  Node versions under nvm (`~/.nvm/versions/node/v22.23.1`, `v24.16.0`).
- **Commits:** Conventional Commits, each ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR bodies end with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Known environment problems

| Problem                                                                                                                                                          | What to do                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud containers time out in `image-editorial`, `product-offer`, `static-ad-families` and `templates-and-quality`; two `static-ad-families` tests hard-code 60 s | Rerun with `--testTimeout=600000`; report exactly what timed out. It also happens on base commits. On the owner's Mac the full gate passes with default timeouts. |
| The cloud container's global npm is 10.9.9, which `devEngines` rejects                                                                                           | Install npm 10.9.8 into a scratch prefix and put it first on `PATH`.                                                                                              |
| unicode.org is blocked in cloud containers                                                                                                                       | Use `unicode-org/unicodetools` at commit `3ff0e2bb` (Unicode 17.0.0), as M0 and M3 did.                                                                           |
| `git push` sometimes returns GitHub "Internal Server Error"                                                                                                      | Retry with backoff. As a last resort, create the commit through the GitHub Git data API with a tree identical to the local one.                                   |
| `gh pr edit` fails with a "Projects (classic) is being deprecated" GraphQL error                                                                                 | Use `gh api -X PATCH repos/xxibcill/glyphkiln/pulls/<n> -F body=@file`.                                                                                           |
| zsh on the owner's Mac aborts a command on an unmatched glob, and does not word-split `$var`                                                                     | Run multi-step gate loops from a `bash` script.                                                                                                                   |
