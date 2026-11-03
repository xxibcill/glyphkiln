# Editorial fill templates (1.2.0)

`quote-card@1.2.0` and `statistic-card@1.2.0` are the first templates built
from the [design-quality improvement plan](plans/design-quality-improvement-plan.md)
(P1, W3/W5). They were made because the P0 critique found the `1.1.0` versions
placing small copy in large, mostly bare panels.

| Template               | Composition variant   | Behavior                                                                                                                                                                                   |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `quote-card@1.2.0`     | `typographic-quote`   | The quotation is fitted to fill the copy field under a hanging accent quotation mark, with a tracked attribution. Maximum six lines. Do not include an opening quotation mark in the text. |
| `statistic-card@1.2.0` | `hero-statistic-fill` | The value grows to fill the field between an optional headline and its label; an optional trend line sits at the bottom. Only the value carries the accent.                                |

Shared rules:

- **Copy field:** the procedural decoration's quiet region, inset by 8% of its
  shorter side and clipped to the safe area; without procedural decoration, the
  safe area.
- **Fill and centering:** display type is fitted to the field, and the content
  block is centered vertically so leftover space becomes even margins.
- **No isolated final word:** display type steps down one pixel at a time, to at
  most 80% of its first fitted size, until the fitted copy has no
  `ORPHAN_LINE`. If none is found, the first fit is kept and the warning remains.
- **Accent once:** the accent is used on one element. If it does not reach 3:1
  (quotation mark) or 4.5:1 (value) on the ground, the brand primary is tried,
  then the text color.
- **Supporting copy** is set larger and tracked so it remains readable at a
  360 px phone width for portrait and square formats.

Both versions accept the same layers, formats, and schema versions as `1.1.0`.
They are exact, opt-in versions: `1.1.0` remains the current default for new App
drafts, and saved `1.1.0` documents render byte-identically. Visual baselines:
`tests/visual/baselines/quote-card-typographic.png` and
`statistic-card-hero.png`.

Known limits: the quotation mark uses the headline font's `“` glyph, so its
shape follows that typeface; the statistic template cannot detect when the
headline, label, and trend repeat each other, which remains an authoring
judgment. Before/after Kilnform proofs are in
[Deliverables/benchmarks/p1-craft-2026-10](../Deliverables/benchmarks/p1-craft-2026-10/README.md).

## 1.3.0: color roles and type craft

`quote-card@1.3.0` and `statistic-card@1.3.0` keep the 1.2.0 fill-the-field
geometry and require DesignDocument `1.7.0`. They add emphasis phrases in the
headline, size-dependent tracking and leading, OpenType settings, brand color
roles with an accent area budget, and decoration that is drawn only when it
declares a job. The statistic value carries the accent only if its ink fits the
budget; otherwise an accent rule sits above it. A quote's accent phrase takes
the accent from the hanging mark. Visual baselines:
`quote-card-roles.png` and `statistic-card-roles.png`. These are opt-in exact
versions, and the App default is unchanged. See
[Type and color craft controls](type-and-color-craft.md).
