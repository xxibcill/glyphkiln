# Type and color craft controls (DesignDocument 1.7.0)

These are the P1 controls from the
[design-quality plan](plans/design-quality-improvement-plan.md) (W3–W6), open
work item B2 without the font library. They are all closed, bounded data. They
ship only in new exact template versions:

| Template version           | Uses                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `quote-card@1.3.0`         | emphasis (headline), OpenType (headline, attribution), size setting, color roles, accent budget, decoration with a job only                     |
| `statistic-card@1.3.0`     | emphasis (headline), OpenType (headline; tabular lining trend by default), size setting, color roles, accent budget, decoration with a job only |
| `image-led-campaign@1.2.0` | emphasis (headline, subtitle), OpenType, size setting, color roles, accent budget, `subjectRegion`, local scrims                                |

All three require DesignDocument `1.7.0`. Earlier versions, including
`quote-card@1.2.0`, `statistic-card@1.2.0` and `image-led-campaign@1.0.x/1.1.x`,
keep their exact pixels. A visible layer that uses a 1.7.0 field on a version
that does not implement it fails with the error
`TEMPLATE_FEATURE_UNSUPPORTED`. The field is never silently ignored. The App
still defaults to the earlier template versions.

Each new version pins these policies. Changing any of them needs a new template
version: `emphasis-runs@1.0.0`, `opentype-settings@1.0.0`, `size-setting@1.0.0`,
`color-roles@1.0.0`, `accent-coverage-grid@1.0.0` and `local-copy-scrim-v1`.
The shared renderer, procedural algorithms and manifest schema do not change.
Path elements gain an optional `glyphRun` provenance field, which does not
change serialized SVG. Emphasis faces are recorded in the manifest font list
like any other used face.

## Rich-text emphasis

```json
"emphasis": [{ "phrase": "a place to rest.", "style": "accent" }]
```

- At most 8 phrases per text layer. Each phrase is unique and 1–200 characters,
  with no leading or trailing whitespace and no line break. After whitespace
  normalization it must occur inside one paragraph of the layer's text; this
  runtime refinement is `EMPHASIS_PHRASE_IN_TEXT`.
- Styles: `strong` (base weight + 200, at least 700, at most 900), `accent`
  (accent role), `strong-accent`, `italic` (the same weight in an italic face),
  and `muted` (text role). Each face must be declared in `fonts` and supplied.
  Core never synthesizes an italic or bold face; a missing face fails with the
  error `TEXT_EMPHASIS_FACE_UNAVAILABLE`.
- Emphasis phrases are kept together, so a phrase is never split across lines.
  Matching runs left to right. The earliest match wins; at the same start the
  longer phrase wins. A phrase edge that is a Latin, Greek or Cyrillic letter or
  a digit must not touch another such character, so "art" does not match inside
  "start".
- Each emphasized run is set in its own face on the line's baseline, and the
  wrapper measures runs at their real widths. Kerning does not apply across a
  run boundary.
- The layer stays one text element with the full accessible label. Runs are
  drawn as hidden glyph paths.

## OpenType settings

```json
"openType": { "numerals": "tabular-lining", "caseSensitiveForms": true }
```

| Setting              | Tags                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `kerning`            | `kern`                                                                                                                     |
| `ligatures`          | `liga`, `clig`                                                                                                             |
| `numerals`           | `proportional-lining` / `tabular-lining` / `proportional-oldstyle` / `tabular-oldstyle` → `pnum`/`tnum` with `lnum`/`onum` |
| `caseSensitiveForms` | `case`                                                                                                                     |
| `smallCaps`          | `smcp`                                                                                                                     |

Shaping goes through fontkit. Without settings, the default fontkit layout runs
unchanged. If a requested feature is missing from the face, the warning
`OPENTYPE_FEATURE_UNAVAILABLE` names the tag and nothing is faked. The bundled
Inter has `kern`, `tnum`, `pnum`, `case` and `calt`, but no `onum`, `smcp` or
`liga`.

## Size-dependent tracking and leading

`size-setting@1.0.0` interpolates two fixed curves. The curves are keyed by the
type's size on a 1080 px short side, so every format gets the same setting:

- `text`: +0.01 em / 1.42 at 16 px, down to −0.035 em / 0.94 at 220 px and above.
- `label`: +0.10 em / 1.30 at 14 px, down to +0.04 em / 1.12 at 64 px.

In these template versions, a brand typography role supplies the family and
weight only. Its fixed `lineHeight` and `tracking` are replaced by the curve,
because one value cannot suit both a 20 px label and a 160 px headline.

## Brand color roles and the accent budget

```json
"colorRoles": {
  "light": { "ground": "#F9FAFB", "figure": "#111827", "text": "#4B5563", "accent": "#7C3AED", "signal": "#0E7490" },
  "dark":  { "ground": "#111827", "figure": "#F9FAFB", "text": "#D1D5DB", "accent": "#FBBF24", "signal": "#67E8F9" },
  "accentAreaBudget": 0.08
}
```

The roles are: ground (canvas), figure (display type and the dominant form),
text (supporting copy), accent (one key element or emphasis), and signal
(trend, CTA). If a brand declares no roles, they are derived: background, text,
muted text, palette accent, text. Role colors are checked against
`prohibitedColors`.

`accentAreaBudget` (0.01–0.3, default 0.08) bounds the share of the canvas
covered by accent ink. Coverage is the union of accent-colored shapes, sampled
on a grid with a 1/270 short-side pitch using the nonzero winding rule. The
templates respond as follows:

- `statistic-card@1.3.0` puts the accent on the value only if the value's ink
  fits the budget. Otherwise it sets the value in the figure color under an
  accent rule. A headline accent phrase takes the accent from both.
- `quote-card@1.3.0` gives the accent to an accent phrase and sets the
  hanging mark in the text role.
- Accent emphasis that would exceed the budget is set in the figure color, from
  the last run backwards (warning `ACCENT_BUDGET_APPLIED`). A fixed accent that
  is still over budget is reported with the warning
  `ACCENT_AREA_BUDGET_EXCEEDED`.

## Procedural decoration off by default

A procedural-decoration layer in `1.7.0` may declare `job: "atmosphere"` or
`"identity"`. In these template versions, a layer without a job is not drawn
(warning `DECORATION_WITHOUT_JOB`), and the copy field becomes the safe area.
A layer with a job is drawn as before, and its quiet region holds the copy.

## Local image darkening

`image-led-campaign@1.2.0` sets copy over a full-bleed photograph again, but
next to the product rather than on it, and darkens only where the copy is:

- `subjectRegion` is a normalized rectangle in source-image coordinates around
  the product. The copy column takes the largest side of the safe area that
  keeps a 64-unit margin from the subject and is at least 34% of the safe width
  and 28% of its height. If no side fits, the default column is used with the
  warning `COPY_OVER_SUBJECT`.
- `local-dark-scrim` (60%) and `local-light-scrim` (80%) composite 24 stacked
  layers to the full opacity over the copy block. Each layer fades out over
  176 units on open sides, and stops 12 units short of the subject on a side
  that faces it. Every layer is masked out of the subject, so product pixels
  are identical to the untreated photograph (tested). A CTA far from the copy
  stack gets its own scrim.
- Global `dark-scrim` and `light-scrim` keep their 1.0.x meaning. Composited
  contrast is checked at the local scrim's full opacity.

## Known limits

- Kerning does not apply across emphasis run boundaries. Emphasis needs the
  declared faces; there is no fallback.
- Keeping an emphasis phrase together can leave a short line in the middle of
  a paragraph. Orphan avoidance only checks the final line, and there is no
  rag-evenness score yet.
- The local scrim is made of stepped layers. Faint banding can show in long
  fades, and the edge toward a nearby subject is short.
- `subjectRegion` is author-declared. Core does not detect products.
- Optical size (Inter has an `opsz` axis) is not yet used by the size curve.
