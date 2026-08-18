# Campaign workflow product qualification — started 2026-08-13

Status: **PENDING HUMAN VISUAL APPROVAL**

The implementation, automated trust-boundary tests, and one real product brief
now satisfy the machine-verifiable parts of the campaign product gate. The
generated exact revision remains in review, so production and self-host defaults
continue to keep `GLYPHKILN_CAMPAIGN_WORKFLOW=disabled`. The runtime also rejects
the `product-qualified` assertion while this checked-in record remains pending;
an operator string cannot substitute for project-owner approval.

## Approved brief candidate

**Product:** published `@glyphkiln/core@0.6.0`

**Campaign:** Glyphkiln Core 0.6 launch

**Selected direction:** Proof, not promises

**Primary claim:** `Same brief. Same pixels.`

Launch the published package as one coherent product campaign that explains the
deterministic rendering contract without inventing a customer, brand, or market
claim. Deliver LinkedIn landscape, Instagram square, Instagram portrait, and a
four-slide TikTok photo carousel. All resources must be explicit local bytes;
every canvas must reproduce from a versioned document, pinned resources, and a
fixed creation timestamp without browser screenshots, Figma repair, model calls,
or network access.

The four-slide series is a compact proof sequence:

1. Same brief, different pixels?
2. Inputs remain explicit data.
3. SVG and PNG ship with exact hashes.
4. Reproduce before handoff.

## Selected controls

All seven canvases use the same immutable Glyphkiln brand snapshot, dark theme,
palette, five Inter weight declarations, typography roles, campaign seed, and
direction seed. The direction closes the `typography` lock through the App's
server-owned lock validator. That lock covers the immutable font declarations,
brand roles, and text controls while copy remains free to progress across the
four-slide narrative.

The selected family deliberately varies the remaining creative controls:

- copy varies by carousel slide;
- image and crop apply only to the three image-led members;
- composition varies by format, template, canvas seed, and member role;
- palette remains identical through one immutable brand snapshot on every
  revision, rather than being mislabeled as a cross-template layer lock.

The exact checked-in documents are tested through
`validateAuthoringLocks`. All seven preserve the selected typography lock, and a
controlled role-weight mutation fails with `TYPOGRAPHY_LOCK_VIOLATED`.

## Automated evidence

The controlled generator produced seven strict schema `1.4.0` documents:

| Ordinal | Canvas key                | Template                      | Format                   |
| ------: | ------------------------- | ----------------------------- | ------------------------ |
|       0 | `linkedin-hero`           | `image-led-campaign@1.0.1`    | LinkedIn landscape       |
|       1 | `instagram-square-hero`   | `image-led-campaign@1.0.1`    | Instagram square         |
|       2 | `instagram-portrait-hero` | `image-led-campaign@1.0.1`    | Instagram portrait       |
|       3 | `carousel-01`             | `tiktok-carousel-slide@1.0.3` | TikTok photo carousel 01 |
|       4 | `carousel-02`             | `tiktok-carousel-slide@1.0.3` | TikTok photo carousel 02 |
|       5 | `carousel-03`             | `tiktok-carousel-slide@1.0.3` | TikTok photo carousel 03 |
|       6 | `carousel-04`             | `tiktok-carousel-slide@1.0.3` | TikTok photo carousel 04 |

- 7/7 documents validate and render.
- 14/14 SVG and PNG artifacts are exact and manifest-backed.
- 4/4 required formats are present.
- 4 carousel slides share one direction and ordered series.
- 7/7 canvases return zero quality issues and no text overflow.
- Every text bound remains inside the Core-reported safe area.
- Every composited contrast check meets its policy floor.
- Each image-led canvas records one bounded `focal-cover-v1` crop.
- All seven canvases share one direction seed and have independently derived
  canvas seeds.
- The canonical handoff contains 49 stably sorted files: each exact design,
  resource-pin record, review record, SVG, PNG, and both manifests.
- Repeated generation verifies byte-identical assets, designs, outputs,
  manifests, board, index, and handoff archive.

The machine-readable source of truth is
[qualification-index.json](campaign-workflow-2026-08-18/generated/qualification-index.json).
The campaign mark uses the [current official Glyphkiln identity](../brand-identity.md):
the project owner's exact transparent and warm-ivory SVG masters under
`assets/brand/glyphkiln/`. Their checked-in SHA-256 hashes, respectively,
`31c8729c0ba2512d9ef8697fa8da711ac6337d6f63b80bf7aa92dfc34bc13ba9` and
`2514f06f1a74f9d8f1ec826602ceb2dd339f498674cd1e7ca14961674e3732a3`,
match the supplied source files byte for byte. Core receives only the
deterministically rasterized PNG bytes of the warm-ivory variant. The proof
artwork is also a project-authored vector asset. No generative image model,
third-party logo, active SVG render input, or external runtime fetch is
involved.

## Handoff state

The current candidate handoff is intentionally and accurately labeled
**unapproved**. Its seven approval records say `in-review`, all 49 files carry
`approvalStatus: unapproved`, and its summary reports zero approved and seven
unapproved canvases. This prevents generation from fabricating the human step.

After the project owner approves the exact review board, one reviewed change
must bind approval receipts to the exact document hashes, resource pins,
fingerprints, output hashes, and manifest hashes; regenerate the canonical
handoff; change this record to **PASS**; and change the runtime qualification
status to `pass`.

## Repository verification

The candidate passed the complete local handoff gate on Node `24.16.0` with npm
`10.9.8`:

```text
npm run build                                  PASS
npm run typecheck                              PASS
npm run lint                                   PASS
npm test                                       PASS
npm run test:coverage                          PASS
npm run text-layout-data:verify                PASS
npm run fixtures:verify                        PASS
npm run schema-conformance:verify              PASS
npm run examples:verify                        PASS
npm run licenses:verify                        PASS
npm run test:package-consumer                  PASS
npm run qualification:brand-fidelity:verify    PASS
npm run qualification:campaign-workflow:verify PASS
```

Core passed 321 tests with 84.19% statement coverage. The App passed 517 active
tests with five intentional skips and 87.71% statement coverage. The showcase
passed four tests with 92.27% line coverage. The checks also verified the
standalone App, isolated rendering, deterministic text layout and wrapping,
Unicode 17 data, 16 full design fixtures, five schema-conformance vectors, all
generated examples, 31 production dependency license records, the fresh packed
consumer, the previously approved nine-output brand board, and this exact
seven-canvas campaign revision.

## Human visual checkpoint

Review
[campaign-review-board.png](campaign-workflow-2026-08-18/generated/campaign-review-board.png)
at full size and confirm all of the following:

- [ ] The three image-led outputs form one coherent launch set.
- [ ] The four TikTok slides read as one ordered story.
- [ ] The Glyphkiln mark, palette, and typography remain consistent.
- [ ] Headline, supporting copy, and CTA hierarchy are publishable in every
      format.
- [ ] No output needs Figma or other manual pixel repair.
- [ ] The complete seven-canvas exact revision is approved.

Reviewer: pending

Approval date: pending

## Reproduction

```sh
npm run qualification:campaign-workflow:verify
```

The generator lives at
[`scripts/generate-campaign-workflow-qualification.mjs`](../../scripts/generate-campaign-workflow-qualification.mjs).
It uses only explicit local bytes and the public `@glyphkiln/core` API. It does
not fetch resources or execute user-provided code. The generated candidate
handoff is available under `Deliverables/json/campaign-workflow/`; preview PNGs
and exact SVGs are grouped under the matching `Deliverables` directories.

Optional AI proposals remain gated as a dependent campaign capability and are
not exercised by this manual qualification.
