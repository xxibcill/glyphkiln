# Typography engine plan: from correct wrapping to professional typesetting

**Drafted 4 November 2026 by Claude (Opus 5.5) for the project owner. Status:
in progress. M0 is complete (ADR 0019 accepted 4 November 2026). M1 is
implemented on branch `claude/typography-m1` (draft PR), with the new
baselines awaiting the owner's review. M2 is closed out on branch
`claude/typography-m2` (draft PR); its exit gate is met, including macOS +
Node 22 (5 November 2026). M3 is next.**

This plan stages the upgrade of Core's text engine to the level of the software
professional designers use (Adobe InDesign and Illustrator, Figma). It turns
"professional" into a capability parity matrix with measurable acceptance tests
(§2), records the current state with code references (§3), recommends the engine
technology (§4), and orders the work into milestones with exit gates, tests and
version owners (§5–§7). §8 maps it onto the [open-work plan](open-work-plan.md),
and §9 says plainly what is out of reach.

**Research basis.** The workspace Knowledge Base subtopic _Graphic Design /
Typography engines_ (`Knowledge Base/Graphic Design/typography-engines/` in the
owner's Obsidian workspace), researched 4 November 2026. It holds 22 dated source
notes (Adobe, Figma, CSS Fonts/Text 4, OpenType, W3C/r12a Thai, Microsoft Thai
OpenType, HarfBuzz, ICU/ICU4X, Typst, TeX, Pango/libthai, SkParagraph, CoreText,
DirectWrite, BudouX, fontkit, OFL, WCAG), a 33-row capability matrix, a Thai
engine guide and a deterministic-engine design guide. Local probes on the same
day measured the defects quoted in §3.1. Documented facts and inference are kept
apart there; this plan marks its own judgments as recommendations.

## 1. Summary

The engine is trustworthy but thin. Bytes are exact, inputs are inert, fonts are
hash-bound and every wrapping policy is versioned. But the engine shapes each line
as one fontkit call, sets only the weight axis, uses one face per element, breaks
Latin greedily, and has no justification, hyphenation, microtypography, style
system or text flow. Two correctness defects affect mixed Thai–Latin text today.

**Top five recommendations**

1. **Fix correctness before craft** (M1). Shape per script run and apply tracking
   per grapheme cluster. Today a Latin-first line loses Thai contextual mark forms,
   and nonzero tracking pushes Thai tone marks off their bases.
2. **Start the font model with all variable axes, automatic optical size and
   per-script font mixing** (M1). This unlocks the approved fonts' `opsz` and
   `wdth`, lets a Latin display face pair with a Thai face in one line, and removes
   the "one family must contain both scripts" constraint behind the 4 November
   font choice.
3. **Put a shaper interface in front of fontkit now and qualify HarfBuzz
   (harfbuzzjs, wasm) behind it** (M0 decision, M2 switch). fontkit 2.0.4 has had
   no release since August 2024, has no Thai shaper and picks one script per
   string. HarfBuzz is the reference shaper used by Chromium, Firefox,
   LibreOffice, Pango, SILE and Scribus.
4. **Replace ad-hoc breaking with UAX #14 plus a hybrid Thai segmenter, then a
   Knuth–Plass composer with bounded justification** (M3–M4). In the probes,
   BudouX-th 0.7.0 broke กรุงเทพมหานคร inside syllables, NBSP was treated as a
   break, and `499 บาท` and `ๆ` could split. A total-fit composer is what
   InDesign, Illustrator, TeX and Typst use by default.
5. **Measure "professional" instead of asserting it** (M0, M10). Build a typography
   corpus, oracle tests (HarfBuzz `hb-shape`, Unicode `LineBreakTest.txt`, Liang
   pattern tests, an offline variable-font instancer) and quality metrics
   (adjustment ratios, runts, hyphens, rag, Thai in-cluster breaks). Finish with a
   designer reference comparison that reuses the B1 blind-round programme.

## 2. Definition of "professional level"

"Professional level" means all **P** rows below pass their acceptance tests, and
the reference comparison in §2.3 passes. Rows marked **G** are deliberately
"the Glyphkiln way" (same outcome, inert data). **X** rows are out of scope (§9).
Reference behaviour comes from the KB capability matrix; "ID", "AI" and "FG" are
InDesign, Illustrator and Figma.

### 2.1 Parity matrix

| ID  | Capability                                     | Reference behaviour                                                                                                        | Class | Acceptance test (all must pass)                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 | Script-run shaping                             | All three shape mixed text correctly; HarfBuzz requires one script per run                                                 | P     | On corpus C-MIX (≥ 200 Thai/Latin/digit lines), each line's glyph IDs and positions equal the concatenation of each script run shaped alone with its script tag, as produced by the pinned oracle `hb-shape`; 100 % of lines, 0 font-unit difference                                                                                                       |
| T02 | OpenType feature control                       | FG: all font features incl. stylistic sets and character variants; ID/AI: OpenType menu                                    | P     | For each closed setting (kern, liga, clig, dlig, calt, tnum, pnum, lnum, onum, case, smcp, c2sc, frac, sups, subs, zero, ss01–ss20, cv01–cv99, salt) on a face that has it, glyph IDs equal `hb-shape` with the same features; on a face without it, `OPENTYPE_FEATURE_UNAVAILABLE` and output identical to default                                        |
| T03 | All variable axes and named instances          | FG: Variable tab; CSS high-level axis properties                                                                           | P     | For every `fvar` axis of the 12 approved families and Inter, outlines at min, default and max equal an offline reference instancer within 0.5/1000 em per point; named instances resolve by name; explicit out-of-range values are rejected with a stable code                                                                                             |
| T04 | Automatic optical size                         | CSS `font-optical-sizing: auto`; OpenType: select from text size, clamp, allow override                                    | P     | Under policy `optical-size-auto@1.0.0`, the chosen `opsz` equals the documented size mapping (§5, M1) for the test sizes, is clamped at axis limits, and is overridden by an explicit value; Inter headlines at a reference size ≥ the documented threshold render with `opsz` 32                                                                          |
| T05 | Font fallback and composite fonts by script    | ID: composite fonts (per-range font, size, baseline); CSS §5.3 cluster matching                                            | P     | With a stack [Latin face, Thai face], every Thai cluster comes from the Thai face and every Latin cluster from the Latin face; no grapheme cluster is split across faces; `MISSING_GLYPH` only when no face in the stack covers a whole cluster; the manifest lists each face actually used                                                                |
| T06 | Cross-script optical matching                  | ID composite fonts: relative size and baseline shift per range                                                             | P     | With `auto` matching, rendered Latin x-height to Thai body height (measured on ink of x and น) is 1.00 ± 0.03 for each approved Thai–Latin pairing; explicit per-pair scale and shift reproduce exactly                                                                                                                                                    |
| T07 | Kerning across style runs                      | ID: metrics kerning default; kerning independent of colour/paint                                                           | P     | A paint-only emphasis (accent, muted) gives glyph positions identical to the unstyled line; pair kerning is kept across a paint-only run boundary                                                                                                                                                                                                          |
| T08 | Tracking per character unit                    | CSS: between typographic character units, never at line ends, optional ligatures off; Thai: sara am splits around nikhahit | P     | For C-TH at tracking −0.02, 0.05 and 0.1 em, every mark's offset to its base equals the offset at tracking 0; line width = untracked width + (clusters − 1) × tracking; no trailing tracking; with tracking > 0 the nikhahit stays over its consonant and the gap falls before sara aa; optional ligatures off unless explicitly requested                 |
| T09 | Unicode line-break opportunities               | UAX #14 via ICU in every reference stack                                                                                   | P     | 100 % of `LineBreakTest.txt` (Unicode 17.0.0) for untailored rules; NBSP, NNBSP and WJ never break; ZWSP and SHY allow a break; a break is allowed after a hard hyphen; each documented tailoring (Thai, number + unit, Thai line edges) has its own fixtures                                                                                              |
| T10 | Thai segmentation quality                      | ID: dictionary line breaking (World-Ready composer); CSS: must analyse SA text                                             | P     | On gold set G-TH (≥ 2,000 annotated boundaries; source and licence approved by the owner), ≥ 99 % of chosen line breaks at 5 widths fall on gold-acceptable boundaries; 0 breaks inside a Thai syllable; every probe regression (กรุงเทพมหานคร, โปรโมชั่นพิเศษ, Static Ads T04) passes; ๆ never starts a line; currency or amount plus unit stays together |
| T11 | Total-fit paragraph composer                   | ID Paragraph Composer (default); AI Every-line Composer; TeX/Typst Knuth–Plass                                             | P     | On C-PARA (≥ 100 Latin and ≥ 50 Thai paragraphs, 3 widths), total demerits ≤ greedy for 100 % of cases; byte-identical in fresh processes; a 2,000-character paragraph composes in < 50 ms p95 on CI with active nodes ≤ the configured cap                                                                                                                |
| T12 | Ragged modes: balance and pretty               | ID Balance Ragged Lines; FG Balance and Pretty; CSS `text-wrap-style`                                                      | P     | Balance: for ≤ 5 lines the line count equals greedy, and slack standard deviation ≤ greedy's in 100 % of cases. Pretty: no one-word final line whenever an alternative exists within the rag limit (100 %). Applies to Latin and Thai alike                                                                                                                |
| T13 | Justification with limits                      | ID: word 80/100/133 %, letter ±, glyph scaling 97–103 %; Thai: stretch phrase spaces first                                 | P     | Justified lines are flush within 0.001 px; Latin word spaces stay within [min, max] or `HJ_SPACING_VIOLATION` is reported with its line; Thai stretches spaces first, uses inter-cluster spacing only when spaces are insufficient, never inside a cluster, and ignores ZWSP; last-line modes left, center, right and all                                  |
| T14 | Hyphenation (en-US first)                      | ID/AI hyphenation settings; TeX Liang patterns                                                                             | P     | Pinned en-US patterns reproduce the TeX reference hyphenation of the pattern package's test words (100 %); limits enforced (word ≥ 5, ≥ 2 before, ≥ 3 after by default; ≤ 2 consecutive hyphenated lines; capitalized and last-word switches); SHY honoured; Thai never hyphenated                                                                         |
| T15 | Widows, orphans, runts and keeps               | ID Keep Options; Typst costs                                                                                               | P     | `keepTogether` honoured in 100 % of cases; runt cost removes single-word final lines whenever an alternative exists; across frames (M8), widow and orphan minimums are honoured or reported with locators                                                                                                                                                  |
| T16 | Protrusion and hanging punctuation             | ID optical margin alignment; AI Roman Hanging Punctuation; FG hanging quotes and lists; TeX protrusion                     | P     | With protrusion on, each glyph listed in the pinned table hangs by table value × size exactly; on fixture columns the ink-edge deviation between lines starting with “ ' - T A V and plain letters is ≤ 0.5 % of the font size; off by default                                                                                                             |
| T17 | Glyph scaling in justification                 | ID Glyph Scaling (advised ±3 %); TeX font expansion                                                                        | G     | Off by default; when on, horizontal outline scale stays within [min, max] (default 98–102 %), is recorded per line in evidence, and is never applied to Thai unless a separate switch is on                                                                                                                                                                |
| T18 | Paragraph and character styles                 | ID paragraph/character styles with Based On; FG text styles                                                                | P     | Resolution is a pure function of data; `basedOn` cycles are rejected; depth ≤ 8; a table test covers every inherited property; resolved styles appear in render evidence                                                                                                                                                                                   |
| T19 | Pattern styles                                 | ID GREP and nested styles                                                                                                  | G     | Closed pattern kinds only (literal phrase, number + unit, first N words, first line, digits run); no regex; each kind has fixtures and is bounded in count and length                                                                                                                                                                                      |
| T20 | Tabs, lists, indents, spacing                  | ID tabs with leaders; AI/FG lists; FG hanging lists                                                                        | P     | Decimal tabs align decimal separators within 0.01 px; hanging list text aligns with the frame edge; space before and after collapse per documented rule                                                                                                                                                                                                    |
| T21 | Drop caps and initials                         | ID drop caps (N lines, M characters)                                                                                       | P     | An N-line drop cap's cap-height top aligns with line 1 cap height and its baseline with line N's baseline, both within 0.5 px                                                                                                                                                                                                                              |
| T22 | Vertical metrics, leading trim, first baseline | ID First Baseline Offset; FG vertical trim; Typst top/bottom edge                                                          | P     | First-baseline modes (ascent, cap height, x-height, fixed) place the baseline as specified within 0.01 px; cap-height trim leaves the box top within 0.5 px of measured cap-height ink; Thai uses script-specific trim edges                                                                                                                               |
| T23 | Baseline grid                                  | ID Align to Baseline Grid, first line only                                                                                 | P     | With the grid on, every baseline is an integer multiple of the grid increment from the frame origin; Thai lines with larger leading snap to the next grid line                                                                                                                                                                                             |
| T24 | Columns, threaded frames, span/split           | ID frames, threading, Span/Split Columns, vertical justification                                                           | P     | Text concatenated across frames equals the source with no loss or duplication; balanced columns differ by ≤ 1 line; spanning paragraphs balance the text before them                                                                                                                                                                                       |
| T25 | Text wrap around shapes and images             | ID text wrap (bounding box, object shape, alpha)                                                                           | P     | No glyph ink pixel falls inside the exclusion shape plus offset (raster check at 2×); the composer receives per-line measures                                                                                                                                                                                                                              |
| T26 | Text on a path                                 | ID/AI Type on a Path                                                                                                       | P     | Glyph origins lie on the path within 0.01 px and rotate to its tangent; overflow is reported                                                                                                                                                                                                                                                               |
| T27 | Font identity and provenance                   | ID packages fonts with documents; Glyphkiln hashes faces                                                                   | P     | The manifest records the file hash, named instance or axis coordinates, features, the fallback stack used, and the hashes of segmentation data and hyphenation patterns; fingerprints change when any of them changes                                                                                                                                      |
| T28 | Selectable, searchable, accessible output      | ID tagged PDF; WCAG 1.4.5 prefers real text                                                                                | P     | The SVG text companion places each grapheme cluster at its glyph origin (±0.01 px) with `xml:lang`; with PDF (C6/D-4), pinned `pdftotext` extraction equals the source text in reading order for 100 % of fixtures, including Thai and ligatures                                                                                                           |
| T29 | Diagnostics                                    | ID highlights H&J, keep and substitution violations                                                                        | G     | Every H&J, keep, substitution and missing-cluster event is a `QualityIssue` with layer, line and range locators; no silent fallback                                                                                                                                                                                                                        |
| T30 | Bounded resources                              | — (Glyphkiln rule)                                                                                                         | G     | Shaping calls per paragraph ≤ k × break units (no re-shaping of whole candidate lines); hard caps on paragraph length, styles, stacks and active nodes, each with a stable error                                                                                                                                                                           |
| T31 | Colour fonts                                   | ID/FG show COLR and SVG fonts                                                                                              | X now | Later option: COLRv0/v1 to SVG paths and gradients with byte-exact baselines; until then `COLOR_GLYPH_UNSUPPORTED` stays                                                                                                                                                                                                                                   |
| T32 | Bidi and vertical text                         | ID World-Ready/Japanese composers                                                                                          | X now | Architecture only: itemizer and shaper carry direction and vertical slots; rejection diagnostics stay until D-2 is triggered                                                                                                                                                                                                                               |

### 2.2 Levels

- **L1 Correct text:** T01, T05, T08, T09, T10, T27, T29 and T30. Nothing visibly
  wrong in any script Core accepts.
- **L2 Professional paragraph:** L1 plus T02–T04, T06, T07 and T11–T17. Paragraph
  quality on par with InDesign's composition settings.
- **L3 Professional layout:** L2 plus T18–T26 and T28.

### 2.3 Reference comparison (final gate)

A designer sets 24 reference fixtures (12 Latin, 8 Thai, 4 mixed; short display,
deck and body copy) in InDesign with documented settings and exports PDFs. Core
sets the same text with matching settings. **Pass** when (a) on ≥ 80 % of fixtures
Core is no more than 10 % worse than InDesign on each of mean absolute adjustment
ratio, hyphen count, runts and rag deviation (Thai: zero in-cluster breaks), and
(b) a blind panel prefers or ties Core in ≥ 50 % of pairs. Identical line breaks
are **not** a goal: InDesign's composer is proprietary. This gate needs the
designer budget from owner decision D2.

## 3. Current state

### 3.1 Measured defects (4 November 2026 probes, fontkit 2.0.4, Node 24.16)

| Defect                                                                                                              | Where                                                                                                                                               | Effect                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One script per line: `face.layout(line)` without script; fontkit `Script.forString` returns the first strong script | [`fonts/index.ts:68`](../../packages/glyphkiln-core/src/fonts/index.ts#L68), [`:106`](../../packages/glyphkiln-core/src/fonts/index.ts#L106)        | For `"AI ที่ป้ญู"` the run is `latn`: `uni0E48.small`, `uni0E49.narrow` and `uni0E0D.less` are not chosen, and marks fall back to cruder offsets. Thai-only lines are correct |
| Tracking after every glyph, including zero-advance marks; width counts `glyphs.length − 1` gaps                     | [`fonts/index.ts:69-71`](../../packages/glyphkiln-core/src/fonts/index.ts#L69-L71), [`:218`](../../packages/glyphkiln-core/src/fonts/index.ts#L218) | Nonzero tracking moves Thai marks right of their bases and over-measures Thai lines (code reading, consistent with the glyph list)                                            |
| NBSP becomes a break: `/\s+/g` folds U+00A0 into a space                                                            | [`segmentation.ts:122-124`](../../packages/glyphkiln-core/src/typography/segmentation.ts#L122-L124)                                                 | `100 km` can split; ZWSP and WJ are not honoured as break controls                                                                                                            |
| BudouX-th 0.7.0 boundaries inside syllables                                                                         | [`segmentation.ts:88-120`](../../packages/glyphkiln-core/src/typography/segmentation.ts#L88-L120)                                                   | กรุงเทพมหานคร → กรุงเทพม \| หาน \| คร. A dictionary (host ICU 78.3, research only) got it right but broke โปรโมชั่น, so neither alone is sufficient                           |
| No Thai line-edge or number–unit rules                                                                              | [`segmentation.ts:126-146`](../../packages/glyphkiln-core/src/typography/segmentation.ts#L126-L146)                                                 | Static Ads T04: `ๆ` can start a line; `499 \| บาท` can split                                                                                                                  |

### 3.2 Capability state

| Capability                             | State                                                                                                                                                                           | Code                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Font identity and loading              | Exact bytes, SHA-256, family + weight + style key; Inter aliases 100–900; collections rejected                                                                                  | [`fonts/key.ts`](../../packages/glyphkiln-core/src/fonts/key.ts), [`fonts/index.ts:19-57`](../../packages/glyphkiln-core/src/fonts/index.ts#L19-L57), [`:177-188`](../../packages/glyphkiln-core/src/fonts/index.ts#L177-L188)                                                             |
| Variable axes                          | `wght` only; `opsz`, `wdth`, custom axes stay at defaults                                                                                                                       | [`fonts/index.ts:150-153`](../../packages/glyphkiln-core/src/fonts/index.ts#L150-L153)                                                                                                                                                                                                     |
| Font fallback / script mixing          | None: one face per text element; `MISSING_GLYPH` blocks                                                                                                                         | [`templates/shared.ts:202-219`](../../packages/glyphkiln-core/src/templates/shared.ts#L202-L219), [`scene/render.ts:462-480`](../../packages/glyphkiln-core/src/scene/render.ts#L462-L480)                                                                                                 |
| Shaping and features                   | fontkit 2.0.4 default features (kerning on); B2 adds a closed set                                                                                                               | [`fonts/index.ts:59-73`](../../packages/glyphkiln-core/src/fonts/index.ts#L59-L73); PR #70 `typography/opentype.ts`                                                                                                                                                                        |
| Tracking and leading                   | Tracking per glyph; leading = size × factor; first baseline = `y + ascent`                                                                                                      | [`fonts/index.ts:104-117`](../../packages/glyphkiln-core/src/fonts/index.ts#L104-L117); PR #70 `typography/size-setting.ts`                                                                                                                                                                |
| Break opportunities                    | Whitespace tokens; Thai via BudouX-th 0.7.0; `keepTogether` (schema 1.2.0)                                                                                                      | [`segmentation.ts:60-78`](../../packages/glyphkiln-core/src/typography/segmentation.ts#L60-L78), [`:148-187`](../../packages/glyphkiln-core/src/typography/segmentation.ts#L148-L187)                                                                                                      |
| Line selection                         | Thai: balanced DP minimizing squared slack plus orphan penalty; Latin: greedy                                                                                                   | [`typography/index.ts:254-404`](../../packages/glyphkiln-core/src/typography/index.ts#L254-L404)                                                                                                                                                                                           |
| Fit to box                             | Font size decremented 1 px from preferred to minimum; orphan-aware choice; emergency grapheme split at minimum (blocking error)                                                 | [`typography/index.ts:185-242`](../../packages/glyphkiln-core/src/typography/index.ts#L185-L242), [`:508-516`](../../packages/glyphkiln-core/src/typography/index.ts#L508-L516), [`:631-651`](../../packages/glyphkiln-core/src/typography/index.ts#L631-L651)                             |
| Measurement cost                       | Each candidate line is reshaped as a whole string, O(units²) shaping calls in the balanced DP, repeated for every candidate font size                                           | [`typography/index.ts:373-401`](../../packages/glyphkiln-core/src/typography/index.ts#L373-L401)                                                                                                                                                                                           |
| Alignment and justification            | Left, center, right; no justify                                                                                                                                                 | [`fonts/index.ts:110-115`](../../packages/glyphkiln-core/src/fonts/index.ts#L110-L115)                                                                                                                                                                                                     |
| Hyphenation, protrusion, glyph scaling | None                                                                                                                                                                            | [`docs/known-limitations.md`](../known-limitations.md)                                                                                                                                                                                                                                     |
| Styles                                 | Brand typography roles (schema 1.4.0); B2 emphasis spans (8 per layer, closed styles); separate runs shaped individually                                                        | PR #70 `typography/rich-text.ts`                                                                                                                                                                                                                                                           |
| Layout                                 | One box per text element; Scene Kernel explicit geometry; no columns, threads, wraps, paths or baseline grid                                                                    | [`scene/render.ts:442-560`](../../packages/glyphkiln-core/src/scene/render.ts#L442)                                                                                                                                                                                                        |
| Text call paths                        | Four paths call the registry directly: templates `measureText`/`addText`, Scene `resolveText`, editorial fill, and B2's `typeset.ts`; `style: "normal"` hard-coded in templates | [`templates/shared.ts:122-157`](../../packages/glyphkiln-core/src/templates/shared.ts#L122-L157), [`templates/editorial-fill.ts:225`](../../packages/glyphkiln-core/src/templates/editorial-fill.ts#L225), [`scene/render.ts:514`](../../packages/glyphkiln-core/src/scene/render.ts#L514) |
| Bidi and vertical                      | Diagnosed with Unicode 17 tables and rejected                                                                                                                                   | [`typography/text-layout.ts:77-137`](../../packages/glyphkiln-core/src/typography/text-layout.ts#L77-L137)                                                                                                                                                                                 |
| Colour glyphs                          | Rejected                                                                                                                                                                        | [`fonts/index.ts:202-208`](../../packages/glyphkiln-core/src/fonts/index.ts#L202-L208)                                                                                                                                                                                                     |
| Output and accessibility               | Glyph paths; `role="group" aria-label`; optional transparent `<text>` companion that relies on recipient fonts and line-level positions                                         | [`renderer/svg.ts:199-234`](../../packages/glyphkiln-core/src/renderer/svg.ts#L199-L234)                                                                                                                                                                                                   |
| Versioning                             | Typography policy object in the fingerprint and manifest; renderer 0.5.0, manifest 1.2.0, design schema 1.6.0 (1.7.0 in PR #70), Scene 1.0.0                                    | [`typography/policy.ts`](../../packages/glyphkiln-core/src/typography/policy.ts), [`cache/fingerprint-contract.ts:19`](../../packages/glyphkiln-core/src/cache/fingerprint-contract.ts#L19), [`domain/types.ts`](../../packages/glyphkiln-core/src/domain/types.ts)                        |

**Strengths to keep:** exact bytes and policy versioning; structured, located
diagnostics (`LINGUISTIC_WORD_BROKEN`, `ORPHAN_LINE`, `TEXT_OVERFLOW`); a
deterministic fit-to-box that the desktop tools do not offer; no synthesized
styles; no host fonts or host ICU.

## 4. Engine technology

| Layer                    | Recommendation                                                                                                                                                                                                                       | Rejected or deferred                                                                                      | Determinism risk and control                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shaping                  | An internal `Shaper` interface. Qualify **harfbuzzjs** (MIT, wasm; 1.6.4 on 22 Oct 2026; about 1.3 MB unpacked; `HB_TINY` build with `glyphToPath`) as the default for new policies. Keep **fontkit 2.0.4** for exact legacy renders | Writing a shaper; rustybuzz via a custom wasm build (no maintained JS package)                            | Pin the harfbuzzjs version and embedded HarfBuzz commit in the policy. Prove byte equality in fresh processes on Linux and macOS, Node 22 and 24. Glyph outlines must come from the same font instance |
| Variable instancing      | Use the chosen shaper's instancer; verify outlines against an offline reference instancer in tests only                                                                                                                              | Trusting either library without an oracle                                                                 | Record axis coordinates in the font identity                                                                                                                                                           |
| Script itemization       | In-house from generated Unicode 17 `Scripts.txt`/`ScriptExtensions.txt`, using the existing offline table pipeline                                                                                                                   | Host `Intl` or ICU                                                                                        | Pure function over pinned tables                                                                                                                                                                       |
| Line-break opportunities | In-house UAX #14 from generated `LineBreak.txt`, checked with `LineBreakTest.txt`                                                                                                                                                    | Host `Intl.Segmenter` (Node 24.16 ships ICU 78.3; varies by host); ICU4X JS (no maintained binding found) | Pinned Unicode version in the policy                                                                                                                                                                   |
| Thai segmentation        | Hybrid: ICU `thaidict` (about 26.4k entries, Unicode licence) maximal-matching lattice, BudouX Thai model as scorer and tiebreak (upgrade from 0.7.0 only through a new policy), project lexicon, syllable-boundary guard            | libthai (LGPL-2.1, poor fit for vendoring); BudouX alone; ICU dictionary alone                            | Hash dictionary, model and lexicon in the policy                                                                                                                                                       |
| Composer                 | In-house Knuth–Plass over box/glue/penalty items with bounded active nodes, using Typst's choices as a modern reference                                                                                                              | Greedy only; external TeX                                                                                 | Stable tie-breaks; pinned costs; integer or quantized arithmetic at decisions                                                                                                                          |
| Hyphenation              | In-house Liang over pinned `hyph-utf8` pattern files with recorded licences; en-US first                                                                                                                                             | Hunspell (dictionary and licence weight)                                                                  | Pattern file hash in the policy                                                                                                                                                                        |
| Bidi (D-2 only)          | In-house UAX #9 from generated tables, or a pinned MIT library, when D-2 is triggered                                                                                                                                                | —                                                                                                         | —                                                                                                                                                                                                      |

**Why HarfBuzz is worth it.** fontkit's gaps are structural, not just bugs: it has
no Thai shaper (HarfBuzz has one, with legacy PUA fallback), picks one script per
string, and has had no release for over two years. HarfBuzz output is what
browsers and professional open stacks produce, which turns "parity" into a
testable oracle. **Costs:** wasm initialization and about 1.3 MB of package
weight; a renderer identity change; a differential-test burden; and the
`HB_TINY` build may lack functions Core needs (to be checked in the M0 spike).
**Decision gate:** ADR 0019 at the end of M0, based on the differential corpus,
performance and byte-stability evidence.

## 5. Milestones

Dependency order:
`M0 → M1 → (M2) → M3 → M4 → M5, M6 → M7 → M8 → M9 → M10`.
M3 may start after M0 in parallel with M1, since segmentation and the font model
touch different files.

### M0 — Harness, shaper interface and one text path (no pixel change)

- **Scope.** (1) Unify the four text call paths behind one internal
  `layoutText(request) → TextLayout`: lines, glyph runs with clusters, metrics,
  evidence and issues. (2) A `Shaper` interface with explicit script, language,
  direction, features and variation coordinates, implemented on fontkit with
  today's exact behaviour. (3) Corpora: C-LAT, C-TH, C-MIX, C-PARA, number/unit and
  punctuation edges, emphasis runs, and the probe and Static Ads T04 regressions.
  (4) Metric tooling: adjustment ratios, runts, hyphens, rag deviation, Thai
  in-cluster breaks, mark offset invariance, cross-script x-height delta.
  (5) Development-only oracles: `hb-shape` through harfbuzzjs, `LineBreakTest.txt`
  and an offline instancer report. (6) A HarfBuzz spike behind the interface,
  ending in ADR 0019.
- **Exit gate.** All existing SVG/PNG baselines, examples and fixtures are
  byte-identical. A baseline metrics report of the current engine is committed.
  ADR 0019 is accepted by the owner.
- **Version owners.** None change (no pixel, schema or manifest change).
- **Tests.** Existing gates; new corpus snapshot tests (glyph-run JSON per
  fixture); a fresh-process determinism test for the harness.
- **Progress (4 November 2026, branch `claude/typography-m0`, draft PR).**
  Scope items 1–6 are implemented, and every existing baseline, example and
  fixture is byte-identical.
  - `layoutText` (`src/typography/layout-text.ts`) is the only caller of the
    fitter and setters. It serves templates `measureText`/`addText`, B2's
    typesetting (which is `src/templates/typeset.ts`, not under
    `typography/`), the editorial-fill quote mark, the roles coverage predictor
    and Scene `resolveText`.
  - `Shaper` (`src/fonts/shaper.ts`) has a fontkit implementation.
  - Corpora and snapshots are under `tests/typography/`. Metrics live in
    `src/typography/quality-metrics.ts`. The oracles are a vendored
    `LineBreakTest.txt` (17.0.0), a fontTools 4.60.1 instancer reference and
    harfbuzzjs 1.6.4 as a devDependency.
  - The baseline report is in
    [`docs/research/typography-m0-baseline/`](../research/typography-m0-baseline/README.md).
  - [ADR 0019](../adr/0019-harfbuzz-shaper-qualification.md) was **accepted**
    by the owner on 4 November 2026. Finding: script itemization, not the shaper, fixes
    the one-script defect. HarfBuzz adds Thai reordering, instances that match
    fontTools, and about 4× faster shaping.
  - The exit gate is met: baselines are byte-identical, the metrics report is
    committed, and ADR 0019 is accepted. The full gate and both determinism
    digests also pass on macOS arm64.

### M1 — Font model: variable axes, optical size, per-script mixing, correctness fixes

The required starting point.

- **M1a — Axes and optical size.** Design schema 1.8.0 adds a closed `axes` map
  (registered `wght`, `wdth`, `opsz`, `slnt`, `ital`, plus custom axes present in
  the font's `fvar`), `namedInstance`, and `opticalSizing: auto | none` with an
  optional explicit `opsz`. Brand typography roles gain the same fields. Policy
  `optical-size-auto@1.0.0` sets `opsz` to 0.75 × `s`, clamped to the axis range,
  where `s` is the type size in px at B2's 1080 px short-side reference (CSS
  96 px = 72 pt). The owner must confirm this mapping (§10, Q6). Policy
  `font-variation@1.0.0` covers instancing.
- **M1b — Script runs and cluster tracking.** Policy `script-runs@1.0.0` (Unicode
  17; Common and Inherited attach to the preceding run, else the following one)
  shapes each run with its script tag. Policy `cluster-tracking@1.0.0` adds
  tracking between grapheme clusters, not at line ends, splits sara am around its
  nikhahit, and turns optional ligatures off under tracking. Both are opt-in
  through new template versions (§10, Q1).
- **M1c — Fallback and composite fonts.** Roles and Scene text accept an ordered
  font stack plus optional per-script faces with per-pair `scale` and
  `baselineShift`, either explicit or `auto` from measured metrics (policy
  `script-matching@1.0.0`). Faces are chosen per grapheme cluster as in CSS §5.3.
  Diagnostics name the stack tried. Scene schema 1.1.0 gains the same stack.
- **Depends on.** M0; B2's remaining task of bundling the approved fonts (not
  duplicated here).
- **Exit gate.** T01, T03, T04, T05, T06, T08 and T27 pass. Pre-1.8.0 documents
  and Scene 1.0.0 are byte-identical. The approved Thai–Latin pairings render
  brief A of the benchmark set and the Kilnform quote without findings, and a
  reviewer inspects the new baselines.
- **Version owners.** Renderer 0.6.0 (pixels); design schema 1.8.0 and Scene
  1.1.0 (fields); manifest 1.3.0 and Scene manifest 1.1.0 (font identity v2 with
  coordinates, stack used, per-run faces); typography policies listed above; new
  template versions opt in.
- **Tests.** Oracle shaping on C-MIX; instancer comparison; opsz mapping table;
  cluster integrity; tracking invariance on C-TH; visual baselines for every
  approved family at three sizes.
- **Progress (4 November 2026, branch `claude/typography-m1`, draft PR).**
  The fonts are bundled (B2's remaining task) and M1a, M1b and M1c are
  implemented on HarfBuzz, as ADR 0019 decided. See
  [Typography M1](../typography-m1.md).
  - **Fonts.** The twelve approved families are bundled: 101 files, each with
    its OFL text and SHA-256 checked by `licenses:verify`.
  - **Engine.** harfbuzzjs is a runtime dependency used only by the new
    policies, with the shaper identity and wasm hash in the policy. The ADR's
    remaining conditions are met: outline cache, CI budgets, and the
    `seven`→`eight` explanation.
  - **Versions.** Design schema 1.8.0, Scene 1.1.0, manifest 1.3.0, Scene
    manifest 1.1.0 and renderer 0.6.0. `quote-card@1.4.0`,
    `statistic-card@1.4.0` and `image-led-campaign@1.3.0` opt in. Q1 and Q6
    use the plan's recommendations, provisionally.
  - **Legacy.** Legacy renders keep renderer 0.5.0 and manifest 1.2.0, so
    pre-1.8.0 documents, older template versions and Scene 1.0.0 are
    byte-identical, including manifests and fingerprints.
  - **Exit gate.**
    - T01, T03, T04, T05, T06, T08 and T27 have passing tests.
    - Brief A and the Kilnform quote render with no findings under six
      provisional Thai–Latin pairings. Since 5 November 2026 this includes
      the advisory craft review at the delivery width, so text must also be
      large enough to read on a phone (x-height ≥ 5.5 px at 360 px; brief A
      also at its 400 px view). One finding is accepted for review: the
      Source Serif 4 attribution at 5.38 px.
    - Baselines exist for every approved family at three sizes.
    - The reviewer step is open: see the
      [review sheet](../research/typography-m1-baselines/README.md).
  - **Metrics.** [Before/after](../research/typography-m1-metrics/README.md):
    one-script lines 84/200 → 0/200, marks moved under tracking 246/246 →
    0/246, instancing error ≤ 0.005/1000 em.
  - **Left open.**
    - `size-setting@2.0.0` (plan §8) is not done.
    - The editorial-fill quote mark stays on fontkit.
    - Itemization uses `Scripts.txt` only, not `ScriptExtensions.txt`.

### M2 — Shaper switch (conditional on ADR 0019)

- **Scope.** Make harfbuzzjs the shaper and outline source for the new typography
  policy (`shaper: harfbuzz@<commit>/harfbuzzjs@<version>`). Keep fontkit for every
  existing policy. If the ADR picks HarfBuzz early, build M1 on it directly and M2
  shrinks to legacy retention.
- **Exit gate.** On the differential corpus, glyph IDs match the fontkit path
  wherever fontkit was correct, and the known fontkit defects are fixed. Bytes
  are identical across Linux and macOS and Node 22/24. Cold start and per-render
  cost stay within budgets set in the ADR.
- **Version owners.** Renderer; typography policy (shaper identity); manifest
  records the shaper.
- **Progress (5 November 2026, branch `claude/typography-m2`, draft PR).**
  M2 shrank to legacy retention, as foreseen above. See
  [Typography M2](../typography-m2.md).
  - **Already done in M1.** HarfBuzz is the shaper and outline source of the
    M1 policies, and fontkit keeps every legacy policy byte for byte. Renderer
    0.6.0 and manifest 1.3.0 record the shaper identity. The ADR's budgets are
    in `npm test`, and the `seven`→`eight` difference is explained.
  - **Added in M2, with no pixel, schema, manifest or policy change.**
    - A differential corpus test runs C-LAT, C-TH and C-MIX through the legacy
      fontkit path and the M1 HarfBuzz path. 250 of 314 lines are identical.
      The other 64 are on a committed allowlist under four kinds, and each
      kind is proved mechanically: script itemization (58), Thai mark shaping
      (4), Inter `endash.case` (1) and the doubled `DFLT` kern (1). In each
      kind, fontkit is the incorrect one.
    - The known fontkit defects are asserted as fixed on M1 and kept on
      legacy: §3.1 one script per line and tracking after every glyph, plus
      the ADR's sara am, `seven`→`eight` and instancing findings.
    - A fresh-process digest of M1 shaping and outlines
      (`npm run typography-m1-digest`) is pinned. It is identical on Linux
      x64 with Node 22.23.4 and 24.22.1, as are the 27 M1 visual baselines.
    - The shaper identity is checked in the policy, against the installed
      wasm, and in every committed manifest: the 27 M1 manifests record it,
      and the legacy ones record none. Both visual suites now pin each
      committed manifest exactly.
  - **Exit gate.** Met. On 5 November 2026 the owner's Mac (macOS arm64,
    Node 22.23.1) reproduced the M1 digest and all 27 M1 baselines, and passed
    the full gate. macOS arm64 with Node 24 already matched in M0 and M1.

### M3 — Break opportunities and Thai segmentation 2.0

- **Scope.** UAX #14 opportunities (`line-break-uax14@17.0.0`). Whitespace handling
  keeps NBSP, NNBSP, ZWSP, WJ and SHY. Tailorings: Thai through the segmenter;
  number + unit and currency glue; Thai line edges (ๆ, ฯ, quotes, `%`). The hybrid
  Thai segmenter (`thai-segmentation-hybrid@1.0.0`) adds a bounded document or
  brand `lexicon` (schema 1.8.x). `keepTogether` gains `preferBreakAfter` phrases
  (DQ W3 "semantic line breaks").
- **Exit gate.** T09 and T10 pass, including the G-TH gold set (§10, Q3). Existing
  policies are unchanged.
- **Version owners.** Typography policy (segmentation and opportunities, with data
  hashes); schema (lexicon, preferred breaks); renderer, when a template opts in.
- **Tests.** `LineBreakTest.txt`; G-TH line-breaking at 5 widths; probe
  regressions; Static Ads T04.

### M4 — Paragraph composer, ragged modes and justification

- **Scope.** Knuth–Plass composer (`composer-total-fit@1.0.0`) with pinned costs
  and bounded active nodes, plus a single-line composer for headlines. Ragged
  modes `auto`, `balance` and `pretty` for all scripts. Alignment `justify` with
  last-line modes; spacing limits (word min/desired/max, letter, glyph scaling
  off); Thai clustered-script justification. `fitText` runs on the composer with
  a documented size search order. New diagnostics: `HJ_SPACING_VIOLATION`,
  `HJ_RUNT`, `HJ_CONSECUTIVE_HYPHENS`. Measurement shapes each break unit once and
  reuses advances.
- **Exit gate.** T11, T12, T13, the in-frame part of T15, and T30.
- **Version owners.** Typography algorithm 3.0.0 and composer policy; schema
  fields for alignment and limits; renderer; new template versions.
- **Tests.** C-PARA metrics against greedy; justification flushness; Thai
  justification fixtures; performance bound tests.

### M5 — Hyphenation

- **Scope.** Liang engine (`hyphenation-liang@1.0.0`), en-US patterns
  (`hyph-en-us@<tex-hyphen commit>`), limits, SHY, and a bounded exception list. A
  closed BCP 47 `lang` field on text also feeds shaping (`locl`). Other languages
  follow real briefs.
- **Exit gate.** T14.
- **Version owners.** Typography policy (patterns and limits); schema (`lang`,
  hyphenation settings); renderer.

### M6 — Microtypography and run-aware shaping

- **Scope.** Protrusion and hanging punctuation with a pinned, Glyphkiln-authored
  default table (`protrusion@1.0.0`; DQ W3's hanging quote marks); glyph scaling as
  an option. Shape across paint-only style runs in one pass, splitting only on a
  face change (`emphasis-runs@2.0.0`; B2's `1.0.0` stays exact).
- **Exit gate.** T07, T16 and T17.
- **Version owners.** Typography policy; renderer; schema switches.

### M7 — Style system and paragraph furniture

- **Scope.** Paragraph and character styles with `basedOn` over a closed property
  set; B2 emphasis becomes character styles. Closed pattern styles (T19). Tabs and
  leaders; lists with hanging indent; space before and after; drop caps;
  first-baseline modes and leading trim; baseline grid.
- **Exit gate.** T18–T23.
- **Version owners.** Schema (styles are a substantial contract; consider a
  separate `TextStyle` sub-schema version); renderer; authoring metadata.

### M8 — Text flow and shaped layout

- **Scope.** Multi-column frames with balancing; threaded frames; span and split
  columns; keeps, widows and orphans across frames; text wrap around Scene shapes
  and image subject regions (shared with B3's cutout masks); text on a path over
  the Scene Kernel's closed path vocabulary.
- **Exit gate.** The cross-frame part of T15, T24, T25 and T26.
- **Version owners.** Scene schema (frames, threads, wraps, paths); renderer;
  Scene manifest.

### M9 — Output and accessibility

- **Scope.** Per-cluster positioned SVG companion text with `xml:lang`. With C6 and
  D-4: a PDF text layer with embedded font subsets, `ToUnicode`, `ActualText` for
  ligatures and Thai clusters, and tagged reading order. Optional COLRv1 output
  (T31).
- **Exit gate.** T28 (and T31 if taken).
- **Version owners.** Renderer (SVG serialization); manifest; the future PDF
  output contract.

### M10 — Professional-parity qualification

- Run every acceptance test, then the §2.3 reference comparison. Publish the
  parity matrix with a pass, fail or deferred status per row.

## 6. Test strategy

- **Fixtures.** Text corpora as JSON under `packages/glyphkiln-core/tests/typography/`
  with expected glyph runs (glyph ID, cluster, advances, offsets), break
  positions, line widths and issues. Every probe failure becomes a regression
  fixture before its fix.
- **Oracles (development only, never in the render path).** `hb-shape` at a
  pinned HarfBuzz; `LineBreakTest.txt`; the pattern package's test words; an
  offline instancer report; the G-TH gold set.
- **Visual baselines.** Exact PNG and SVG bytes in the pinned environment for each
  new policy; reviewed images at delivered size, including 360 px previews for
  social formats.
- **Reference comparisons.** Optional offline Typst or TeX settings of C-PARA for
  composer sanity checks; the §2.3 InDesign set for the final gate.
- **Determinism.** Fresh-process byte tests and the Node 22/24 matrix for every
  policy. For the HarfBuzz path, add macOS.
- **Legacy.** Every existing exact version stays byte-identical. Each milestone
  re-runs `examples:verify`, `fixtures:verify`, `schema-conformance:verify` and
  the visual-regression suite.

## 7. Version owners

| Owner                            | Changes when                                                                                                                                                                           | Milestones            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Renderer (`RENDERER_VERSION`)    | Glyph selection, positions, outlines, SVG text serialization or raster output change for any accepted input                                                                            | M1, M2, M3–M9         |
| Typography policy object         | Any algorithm or data table: shaper identity, script runs, tracking, fallback, opsz mapping, UAX #14 version, Thai dictionary, model and lexicon, composer costs, patterns, protrusion | M1–M6                 |
| Design schema (`DesignDocument`) | New fields: axes, optical sizing, stacks, lexicon, preferred breaks, alignment and limits, hyphenation, `lang`, styles                                                                 | M1, M3, M4, M5, M7    |
| Scene schema and Scene Kernel    | Font stacks, frames, threads, wraps, paths in `SceneDocument`                                                                                                                          | M1, M8                |
| Manifest and Scene manifest      | Font identity v2, stack used, policy data hashes, shaper identity                                                                                                                      | M1, M2, M3, M5        |
| Templates                        | Opt in to new policies through new exact versions; old versions keep their policies                                                                                                    | every pixel milestone |
| Authoring metadata               | Publishes new fields and template versions                                                                                                                                             | M1, M3, M4, M7        |

## 8. Integration with the open-work plan

- **B2 (PR #70).** Builds on `opentype-settings@1.0.0`, `emphasis-runs@1.0.0` and
  `size-setting@1.0.0` rather than replacing them. B2's remaining work (bundling
  the twelve approved families) is an M1 prerequisite and stays in B2. T02 widens
  B2's closed feature set. M6 introduces `emphasis-runs@2.0.0` because B2 shapes
  each run separately, which loses kerning and contextual shaping across a run
  boundary. When `opsz` is automatic, B2's tracking curve must be re-derived
  (`size-setting@2.0.0`) so spacing is not corrected twice. B2's `italic` emphasis
  on Thai should give an advisory, because Thai inline emphasis is bold.
- **B3 (composition engine).** B3 measures text through M0's single `layoutText`
  API and M4's composer (candidate line sets, measured blocks) and does not grow
  its own measurement. M8's text wrap reuses B3's cutout masks and subject
  regions. B3 can start with today's wrapping, but its type-dependent parts should
  follow M1.
- **D-2 (Arabic, CJK).** M0's unified layout path is the "unifying the typography
  layout path" prerequisite D-2 names. M1's itemizer and the shaper interface
  reserve direction and vertical slots. Bidi, RTL and CJK composition stay in D-2,
  triggered by owner decision D8.
- **D-6 (hyphenation, fallback stacks, more script models).** This plan schedules
  D-6: fallback stacks in M1c, script models in M3 (Thai now; Lao, Khmer and
  Myanmar through the same lattice when a brief needs them), and hyphenation in
  M5. The open-work plan's D-6 row now points here.
- **Other items.** C5 (multi-page documents and decks) consumes M7–M8. C6 (print
  and PDF) and D-4 (accessible publication) consume M9. M10 reuses B1's designer
  programme and budget (D2).

## 9. Out of reach or not worth matching

- **Optical kerning parity.** Adobe's algorithm is proprietary. A shape-based
  kerning of our own could be researched later, but it would not be parity.
- **Identical InDesign line breaks.** The Paragraph Composer's weights are not
  published. The goal is equal or better quality metrics.
- **GREP and regex styles, scripting, plugins, expressions.** These are code in
  data. Closed pattern kinds (T19) cover the common uses.
- **Host and OS fonts, font activation services, interactive story editing,
  spell-checking.**
- **Synthesized bold, italic and small caps.** Deliberately refused, as today.
- **SVG-in-OpenType colour fonts** (markup inside fonts) and bitmap glyphs as
  outlines.
- **Hinting and subpixel rendering.** Outlines plus the rasterizer's anti-aliasing
  replace them.
- **CJK mojikumi, Japanese composers, Arabic kashida and vertical text** before
  D-2 is triggered.
- **Print production** (CMYK, spot colours, overprint, imposition, PDF/X) belongs
  to C6. **Book features** (footnotes, indexes, tables of contents,
  cross-references, master pages) belong to a later `@glyphkiln/book` (D-3/C5).

## 10. Open questions for the owner

1. **Pixel policy for the two correctness fixes.** Gate per-run shaping and
   cluster tracking behind new template versions, as B2 does for its features, or
   correct every render under a renderer bump? Recommended: new template versions
   now, plus a documented advisory on old versions that use tracking with Thai.
2. **HarfBuzz adoption.** Is about 1.3 MB of wasm and a renderer identity change
   acceptable if ADR 0019's evidence supports it? **Answered 4 November
   2026:** yes. The owner accepted
   [ADR 0019](../adr/0019-harfbuzz-shaper-qualification.md); the measured
   runtime cost is about 530 KB of wasm and JS.
3. **Thai gold corpus.** Which source and licence for G-TH: an existing licensed
   corpus, or annotating the workspace's own Thai campaign copy? **Answered 5 November
   2026:** annotate the owner's own copy
   ([licence research](../research/thai-gold-corpus-2026-11/README.md)). A
   318-line draft, with 2,230 acceptable break points, is in
   [`tests/typography/gold/`](../../packages/glyphkiln-core/tests/typography/gold/README.md),
   awaiting the native reader's correction.
4. **InDesign reference set.** Can a designer with InDesign set the 24 fixtures
   (part of the D2 budget)?
5. **Hyphenation languages** beyond en-US.
6. **Optical-size mapping.** Accept `opsz = 0.75 × px` at the 1080 px reference, or
   use a delivered-size (phone) assumption instead?
7. **Text flow priority.** Is M8 (threads, columns, wraps, paths) needed before
   C5, or can it wait for a real multi-page brief?
8. **Thai inline italics.** Should B2's `italic` emphasis on Thai give a warning or
   be refused?

## 11. Risks

- **Baseline review load.** Each pixel milestone adds reviewed baselines.
  Mitigation: corpus metrics first, visual review per approved family.
- **Schema growth.** `DesignDocument` is already a union of eight versions (TS2590
  in PR #70). Consider separate versioned text-style sub-schemas in M7.
- **Composer cost inside `fitText`.** Total fit × candidate sizes can be expensive.
  Mitigation: bounded nodes, cached shaping, a documented size search order.
- **Data licences.** Record a licence for each pattern file, dictionary and model
  before admission.
- **Wasm determinism** is a strong expectation, not yet a measurement. Test it on
  every platform before switching.

## 12. Not verified in the research

InDesign optical margin alignment and composite fonts (secondary sources only);
Affinity Publisher (secondary only); Illustrator composers (search summary); the
Knuth–Plass and Liang papers (bibliographic record only); Figma optical-size
behaviour; QuarkXPress (not researched); HarfBuzz output on the probe strings
(not run); ICU4X JavaScript bindings; and Thai segmentation accuracy on any gold
corpus.
