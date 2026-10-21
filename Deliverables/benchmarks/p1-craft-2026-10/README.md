# P1 craft repairs — first slice

**22 October 2026. Status: rendered and reviewed by Claude (Opus 5.5) at full
size and at 360 px phone width. Internal craft review only: no viewer,
expert-panel, or commercial evidence.**

Twelve graphics from the [P0 critique ledger](../p0-baseline-2026-10/critique-ledger.md)
were re-made with the same copy, palette, photograph, and Inter font. Files:
[`designs/`](designs/), [`outputs/`](outputs/) (SVG and PNG),
[`phone-width/`](phone-width/) (360 px previews), and
[`craft-comparison.json`](craft-comparison.json) (advisory findings before and
after, policy `craft-review 1.1.0`).

| Graphic           | Change                                                                                                                                                                                                                                                                                    | Ledger findings addressed                                                                                               | Advisory findings (360 px)                                                     | Still open                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Announcement B    | Same `product-announcement@1.2.0` engine the repository already had, now authored with the lamp photograph and without procedural waves; "Studio Lamp" and "cobalt ceramic." kept unbroken; subtitle moved to the post caption (brief K1 allows this; recorded)                           | AN-1 product never shown, AN-2 waves, AN-3 misregistered bar, AN-5 empty panel                                          | 3 → 2 (eyebrow, CTA still small)                                               | The 1.2.0 template's eyebrow and CTA boxes have fixed heights, so they cannot exceed ~19 px on a 1200 px canvas; the 3:2 photograph is letterboxed inside a darker card; the left column has an empty band between headline and CTA. These need the composition engine (P2).                                                       |
| Quote             | New `quote-card@1.2.0` "typographic quote"                                                                                                                                                                                                                                                | QU-1 quote floating in a bare panel, QU-4 unreadable attribution                                                        | 2 → 0                                                                          | QU-2 and QU-3: the topographic texture still has no subject job, and there is still no light or object in the graphic.                                                                                                                                                                                                             |
| Statistic         | New `statistic-card@1.2.0` "hero statistic, fitted to its field"                                                                                                                                                                                                                          | ST-2 bare panel, ST-3 headline off the panel, ST-4 unreadable trend                                                     | 2 → 0                                                                          | ST-1 is a content problem: headline, value, label, and trend still all say "three". The template now advises against restating the value, but the fixed brief copy is unchanged.                                                                                                                                                   |
| Photo campaign ×3 | Re-authored on the separated image/copy template the repository already had (`image-led-campaign@1.1.1`, from the reference-led refinement) instead of `1.0.1`'s copy-on-photo overlay; scrim removed because no copy sits on the photo; square focal point moved to keep the whole shade | CA-1 one layout resized (now column, tall column, and stacked), CA-3 dimmed cobalt glaze, CA-4 small landscape headline | 1 → 1 each (mark)                                                              | CA-2: the cobalt mark on near-black measures 1.91:1 and about 18 px across at 360 px. Only the cobalt mark exists; a light or one-color variant must come from the brand owner, not be redrawn here. The portrait leaves the lowest fifth empty.                                                                                   |
| Carousel ×6       | Re-authored on `tiktok-carousel-slide@1.1.1`, which accepts a photograph: the lamp now appears on slides 01, 03, and 06; procedural decoration removed from every slide; slide 05 keeps "Keep the lamp." and "Shift the mood." whole                                                      | CS-1 lamp never shown, CS-3 accent spread over 5–8 uses, CS-4 empty lower third on 01/06, CS-5 landscape waves          | 22 → 15 total (slide numbers small on every slide; small labels on 01, 03, 06) | The 1.1.1 typography slides top-align copy, so slide 05 leaves its lower half bare (flagged) and 02 ends on "first."; slide 03's "03" is now smaller than its headline (flagged as weak scale contrast); slide numbers and footers are ~8 px at phone width. Place-specific photographs (desk, bedside, entry) still do not exist. |

## What changed in the engine

`quote-card@1.2.0` and `statistic-card@1.2.0` respond to the amount of copy
instead of placing text at fixed sizes in a fixed panel:

- the copy field is the procedural quiet panel when one is declared, otherwise
  the safe area, and type is fitted to fill it;
- the content block is centered in the field, so remaining space becomes even
  margins rather than an empty lower half;
- display type steps down (to at most 80% of the first fit) to avoid an
  isolated final word, because the current fitter only avoids orphans on its
  balanced line-breaking path;
- the accent is used once: a hanging quotation mark (drawn from the font's own
  outline), or the statistic value. If the accent is not legible on the ground,
  the primary color or the text color is used instead;
- attribution and trend lines are larger and tracked so they survive a phone
  feed.

Both are new exact versions. `1.1.0` documents and baselines are unchanged and
the App's default remains `1.1.0` until the owner approves the new look. See
[docs/editorial-fill-templates.md](../../../docs/editorial-fill-templates.md).

## Honest reading

The craft heuristics improving from 2 findings to 0 shows only that the
measured symptoms (bare container fill, small text) are gone. The reviewer's
judgment is that the quote and statistic now read as designed typography
rather than a template panel, and that the announcement finally shows what it
announces. None of the three yet carries a Kilnform-specific visual idea, and
nothing here has been compared with a professional designer's work on the
same brief.

Regenerate or verify from the repository root after building Core:

```sh
node Deliverables/benchmarks/p1-craft-2026-10/generate.mjs --verify
```
