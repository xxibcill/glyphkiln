# G-TH: Thai line-breaking gold set (draft)

The gold set for plan test T10
([typography plan](../../../../../docs/plans/typography-engine-plan.md) §2.1, M3).
The owner chose its source on 5 November 2026 (Q3): the workspace's own Thai
copy, annotated in-house, rather than a licensed corpus. See the
[licence research](../../../../../docs/research/thai-gold-corpus-2026-11/README.md).

**Status: draft `0.1.0-draft`.** A machine pass plus Claude's correction of every
line. It becomes the gold set only after a native Thai reader has corrected it
and the owner has accepted it. M3's exit gate must not be claimed on the draft.

## What it holds

`g-th.json` has 318 lines with 2,230 acceptable break points, against the plan's
floor of 2,000.

| Source                                        | Lines | Notes                                                                      |
| --------------------------------------------- | ----: | -------------------------------------------------------------------------- |
| PPRS (เพื่อนไร่เพื่อนสวน) published post copy |    98 | Captions and alt text from `posts/*/output`                                |
| PPRS published video subtitles                |   176 | Short subtitle lines from `videos/*/output/*.srt`; many end mid-sentence   |
| Repository fixtures                           |    24 | Brief A and B fixed copy, C-EDGE and C-PROBE Thai lines (plan probes)      |
| Written for coverage                          |    20 | Prices, `%`, `฿`, units, dates, ranges, ฯ, quotes; the source copy has few |

Links, affiliate IDs, hashtags and duplicates were left out.

## Annotation scheme

Each line keeps the exact `text` and a `gold` annotation of the same text:

| Marker    | Meaning                                                                           |
| --------- | --------------------------------------------------------------------------------- |
| `/`       | A line break is acceptable here                                                   |
| `\|`      | A line break is preferred here (reserved; the draft marks none)                   |
| space     | A space where a line break is acceptable                                          |
| `_`       | A space where a line break is **not** acceptable (`499_บาท`, `ค่อย_ๆ`, `31_ต.ค.`) |
| no marker | No line break is acceptable between the two characters                            |

Removing `/` and `|` and turning `_` back into a space must give `text` exactly.
`tests/typography-gth.test.ts` checks this and the rest of the structure.

"Acceptable" means a break a careful Thai designer would accept in display or
body copy. Between independent words: yes. Inside a word, a loanword, a name or
a fixed compound (รายละเอียด, ผลไม้, ต้นกล้า, วันนี้, กรุงเทพมหานคร): no.

## How the draft was made

1. **Machine pass** (`machine` field). Node's `Intl.Segmenter('th')` (ICU 78.3)
   gives word boundaries. Fixed rules then keep things together: no break
   before ๆ, ฯ or closing punctuation, after an opening quote, or between a
   number and its unit, `%` or `฿`.
2. **Claude's correction** (`gold` field; `review` is `claude-corrected` on 97
   lines and `claude-checked` on the rest). It removed 124 machine breaks and
   added the missing ones:
   - breaks inside a syllable, such as คอม/เมน/ต์, ลิ/งก์, ผลอ/ยู่, เป็นก/ระ/ถาง
     and โปร/โม/ชั่/นพิ/เศษ;
   - splits inside a word, such as ราย/ละเอียด, มะเขือ/เทศ and เครื่อง/มือ;
   - missed breaks (จะ/โต) and missed glue (`3–5_วัน`, `30_x_45_ซม.`).

## For the native reader

Correct the `gold` field only, and set `review` to `reader-corrected` on every
line you have checked, changed or not. Add a `note` field for anything unsure.
Look especially at:

- compounds: whether a break between their parts is acceptable (ค่า/คอมมิชชัน,
  การ/ศึกษา, ราคา/พิเศษ);
- the short subtitle fragments, which are cut where the video cut them;
- `|`: add preferred breaks where a phrase boundary is clearly better.

Run `npx vitest run tests/typography-gth.test.ts` from `packages/glyphkiln-core`
after editing.

## Not in the draft

- **No syllable layer.** T10 requires "0 breaks inside a Thai syllable". M3 can
  check part of this mechanically, because a break inside a Thai character
  cluster is always inside a syllable. A full syllable layer is an owner
  decision (scheme item 3 in the licence research).
