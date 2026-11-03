# P1 remainder (B2, without fonts) — Kilnform re-render

**3 November 2026. Status: rendered and inspected by Claude at full size and at
360 px phone width. This is an internal craft review only. There is no viewer,
expert-panel or commercial evidence.**

This is open-work item B2 without the font library: rich-text emphasis,
OpenType control, size-dependent setting, brand color roles with an accent
budget, decoration off by default, and local image darkening. Every change
ships in a new exact template version on DesignDocument `1.7.0`. The Kilnform
set uses the same copy, palette, photograph and Inter font as
[P1](../p1-craft-2026-10/README.md).

Files: [`designs/`](designs/), [`outputs/`](outputs/) (SVG and PNG),
[`phone-width/`](phone-width/) (360 px previews), and
[`craft-comparison.json`](craft-comparison.json), which lists the advisory
findings at P1 and after B2 (policy `craft-review 1.1.0`) and the output
hashes. The announcement and the six carousel slides have no B2 template
version. The generator re-renders them from their P1 designs and checks that
their SVG and PNG bytes are identical to the P1 files, so they are not copied
here.

| Graphic           | P1 → B2                                                       | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                   | Advisory findings (P1 → B2) | Still open, as seen at 360 px                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quote             | `quote-card@1.2.0` → `@1.3.0`                                 | The topographic layer declares no job, so it is not drawn (warning `DECORATION_WITHOUT_JOB`), and the quote sits on the plain ground instead of a panel. "a place to rest." carries the accent, so the hanging mark takes the text role. The quote is set tighter by the size curve. The attribution uses case-sensitive forms.                                                                                                                | 0 → 0                       | It still has no light or object in it (QU-3). The emphasis line reads clearly at phone width. The mark is now cream, not gold, and less noticeable. Whether that is better is a judgment call.                                                                                                                                                                                                                                      |
| Statistic         | `statistic-card@1.2.0` → `@1.3.0`                             | The subdivision layer is not drawn because it has no job. "03" fills the field in the figure color. Its ink would cover more than the 8% accent budget, so the accent becomes a short rule above it. "three places" is set in Inter 900. The trend uses tabular lining numerals. The overhang of the figures is reserved, so the label no longer crowds the trend.                                                                             | 0 → 0                       | 900 against a 700 headline is hard to see at phone width, so the emphasis is weak. The content problem ST-1 remains: headline, value, label and trend all say "three".                                                                                                                                                                                                                                                              |
| Photo campaign ×3 | `image-led-campaign@1.1.1` (split) → `@1.2.0` (copy on photo) | This goes back to the 25 September idea of copy over the full photograph, with the lamp's region declared (`subjectRegion`, measured from the photo). The copy column goes beside the lamp. `local-dark-scrim` darkens only a feathered field behind the copy, masked out of the lamp, so the cobalt glaze is at full strength, unlike the 1.0.1 global scrim (CA-3). "glow." / "the glow." carries the accent, and the accent bar is dropped. | 1 → 1 each (mark)           | The scrim reads as a soft dark panel, not a natural shadow. Its edge on the lamp side is short and fairly hard, and faint step banding shows in the fade. The cobalt mark on the dark scrim is still weak (CA-2: needs an owner-supplied light mark). The portrait leaves its lower half as bare wall. The landscape mark is about 12 px at 360 px. The split layout (P1) remains the better choice when the product must dominate. |

Quality warnings: quote and statistic report `DECORATION_WITHOUT_JOB` on
purpose, because the P1 documents keep their texture layers without a job. The
unchanged carousel slides 02 and 05 still report `ORPHAN_LINE`, as in P1.

## What changed in the engine

- **DesignDocument `1.7.0`** adds: text-layer `emphasis` (up to 8 phrases,
  each in a closed style: strong, accent, strong-accent, italic, muted);
  `openType` settings (kerning, ligatures, numeral style, case-sensitive
  forms, small caps); a procedural-decoration `job`; an image `subjectRegion`
  and the `local-dark-scrim` / `local-light-scrim` treatments; and brand
  `colorRoles` (ground, figure, text, accent, signal, per mode) with an
  `accentAreaBudget`. Earlier schemas reject all of these fields. Template
  versions that do not implement a field reject it with
  `TEMPLATE_FEATURE_UNSUPPORTED`.
- **Emphasis** phrases stay on one line and are matched on whole words. Each
  emphasized run is set in its own face, on the line's baseline. An italic or
  heavier face must be declared and supplied; Core never synthesizes one.
- **OpenType** settings map to a fixed set of tags shaped by fontkit. A
  requested feature the face lacks (Inter has no `onum` or `smcp`) produces a
  warning and is not faked.
- **Size setting** (`size-setting@1.0.0`) interpolates tracking and leading
  by delivered size. Display sizes are tighter, small labels are more open.
- **Accent budget** (`accent-coverage-grid@1.0.0`) measures the union of
  accent ink on a fixed grid. Accent emphasis is demoted to the figure color
  when it would exceed the budget, and anything still over is reported.

## Honest reading

The measured craft findings did not move. Quote and statistic were already at
0, and the campaign's remaining finding is the brand mark, which code cannot
fix without a light mark from the owner. What B2 adds is mechanism: internal
emphasis, a role-based color system that keeps the accent rare, decoration
that has to justify itself, and photo copy that no longer dims the product. In
the reviewer's judgment the clearest visible gain is the campaign: the cobalt
lamp keeps its color with copy on the photograph. The quote also gains from
the plain ground and the accent phrase. The local scrim is a workable
mechanism but not yet an elegant one. None of this has been compared with a
professional designer's work.

Regenerate or verify from the repository root after building Core:

```sh
node Deliverables/benchmarks/p1-craft-2026-10-b2/generate.mjs --verify
```
