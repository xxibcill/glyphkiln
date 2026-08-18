# Carousel design research validation

**Validation date:** 2026-08-18

**Source report:** `pasted-text.txt`, “Designing High-Performance Instagram and
TikTok Carousels”

**Scope:** Current platform facts, the strength of the visual-design evidence,
and product implications for Glyphkiln. This note does not qualify any render
output and does not change application or renderer behavior.

There was no existing repository directory for external research notes.
`docs/research/` is used to keep this source review separate from
`docs/qualification/`, which records verification of implemented Glyphkiln
behavior and generated artifacts.

## Verdict

The supplied report is better than most social-design guidance. It repeatedly
distinguishes correlation from causation, identifies ad-versus-organic caveats,
and admits that its numeric layout rules are working heuristics. Its most useful
durable conclusions are:

- protect legibility and hierarchy before adding decoration;
- use one main communication job per slide;
- keep explanatory labels close to the item they explain;
- preserve a coherent visual grammar across a sequence while allowing
  composition to vary;
- design and proof at delivered phone size;
- treat safe zones as platform- and surface-specific;
- keep Instagram and TikTok production paths distinct;
- use explicit alt text, redundant chart encoding, and strong luminance
  contrast; and
- test account-specific outcomes instead of claiming a universal best slide
  count, hook, or visual style.

Its main weaknesses are not fabricated platform facts. They are evidence-grade
and provenance problems:

1. The attached artifact's inline references such as
   `citeturn28search0` are session-local tokens, not durable citations. Only
   the URLs in its bibliography remain independently usable.
2. Several conclusions marked `[STRONG]` are strongly supported in visual
   search, HCI, or multimedia-learning contexts but only **indirectly** support
   an Instagram or TikTok carousel recommendation.
3. TikTok advertising specifications are carefully caveated in prose, but
   still supply much of the report's organic Photo Mode geometry and creative
   advice. No current first-party organic Photo Mode safe-zone specification
   was found.
4. The safe-area percentages, font bands, word counts, grid counts, logo sizes,
   70–85% consistency rule, scoring thresholds, and carousel blueprints are
   useful design defaults, not validated performance optima.
5. `1080 × 1920` is a defensible TikTok-aligned working canvas, not an official
   organic Photo Mode requirement. Conversely, this research does not validate
   `1080 × 1440` as the one correct organic canvas either.

Use the report as a design hypothesis catalog and QA checklist. Do not encode
its numeric heuristics as universal renderer truth without platform delivery
tests and user/account evidence.

## Confidence model

- **High:** directly supported by a current first-party platform document, a
  W3C criterion, or the cited study's actual result.
- **Medium:** well-supported transfer from adjacent research, or a conservative
  application of paid-placement guidance to a related organic surface.
- **Low:** professional heuristic, trend, or account-specific hypothesis with
  no direct causal validation.

Confidence refers to the stated conclusion, not the general quality of a cited
source.

## Claim-by-claim validation

| Report claim                                                                                                         | Validation                                                                       |                             Confidence | Correction or boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instagram preserves native photos from `1.91:1` through `3:4`, up to 1080 px wide.                                   | **Accurate and current.**                                                        |                                   High | Meta's current Help Center says images 320–1080 px wide retain resolution when within `1.91:1`–`3:4`; wider images are resized to 1080 px. It says “at least 1080 px” in its upload recommendation, but the behavior description is more precise than calling 1080 the minimum accepted width. [Meta Help Center, current page; accessed 2026-08-18](https://www.facebook.com/help/1631821640426723/)                                                                                                                                                                                                                                |
| Instagram's “current accepted portrait range” is `1.91:1`–`3:4`.                                                     | **The numbers are accurate; the label is not.**                                  |                                   High | `1.91:1` is landscape. Call this the supported feed-photo aspect-ratio range, not the portrait range. [Meta Help Center, current page; accessed 2026-08-18](https://www.facebook.com/help/1631821640426723/)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Instagram's programmatic media requirements still differ from native upload: JPEG, 8 MB, and `4:5`–`1.91:1`.         | **Accurate at validation time.**                                                 |                                   High | The current IG User Media reference also specifies width 320–1440 and sRGB. That supports keeping `1080 × 1350` as a compatibility default for API/scheduler workflows until the exact publishing path is tested. [Meta for Developers, current page; accessed 2026-08-18](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media)                                                                                                                                                                                                                                             |
| Instagram carousels allow up to 20 photos/videos.                                                                    | **Accurate.**                                                                    |                                   High | This is a platform maximum, not a recommended sequence length. Some indexed/localized Help copies still expose the former count, so the dated Creators announcement is the cleanest evidence for the increase. [Instagram Help Center, current page; accessed 2026-08-18](https://www.facebook.com/help/instagram/269314186824048/), [Instagram Creators, 2024-08-27](https://creators.instagram.com/blog/new-text-tools-to-help-you-personalize-your-content)                                                                                                                                                                       |
| Instagram's publishing API supports the same 20-item carousel maximum as the native app.                             | **Inaccurate.**                                                                  |                                   High | Current Content Publishing documentation still limits an API carousel container to 2–10 children. It also states that carousel items are cropped according to the first image's aspect ratio. Model native and API pack constraints separately. [Meta Content Publishing, current page; accessed 2026-08-18](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing)                                                                                                                                                                                                          |
| Instagram supports authored and automatic image alt text.                                                            | **Accurate.**                                                                    |                                   High | The Help Center says automatic alt text is generated and creators can replace it before or after posting. [Instagram Help Center, current page; accessed 2026-08-18](https://www.facebook.com/help/instagram/503708446705527)                                                                                                                                                                                                                                                                                                                                                                                                        |
| TikTok photo posts allow up to 35 photos.                                                                            | **Accurate.**                                                                    |                                   High | The current creation flow documents a maximum of 35 photos. TikTok's iOS Share Kit also documents a 35-image maximum and a broad accepted aspect-ratio range; neither document defines a preferred organic design canvas. [TikTok Support, current page; accessed 2026-08-18](https://support.tiktok.com/en/using-tiktok/creating-videos/making-a-post), [TikTok Share Kit, current page; accessed 2026-08-18](https://developers.tiktok.com/doc/share-kit-ios-quickstart-v2)                                                                                                                                                        |
| TikTok Photo Mode can use music and allows manual swiping while images display in sequence.                          | **Accurate in the first-party launch description.**                              |                                 Medium | The source is dated 2022, so the interaction should still be checked in the release/device matrix. Current posting docs continue to expose photo posting and music options. [TikTok Newsroom, 2022-10-06](https://newsroom.tiktok.com/editing-tools?lang=en)                                                                                                                                                                                                                                                                                                                                                                         |
| Organic TikTok Photo Mode requires or officially recommends `1080 × 1920`.                                           | **Unsupported as an organic requirement.**                                       |                                    Low | The current organic Help page does not prescribe one pixel canvas. The Content Posting API accepts JPEG/WebP images, caps each image at 20 MB, and states a maximum picture size of 1080p without making `9:16` the organic Photo Mode composition standard. `9:16` and `720 × 1280` are well-supported for carousel **ads**, not organic posts. [TikTok Content Posting API media guide, current page; accessed 2026-08-18](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide), [TikTok carousel-ad specifications, updated 2026-01](https://ads.tiktok.com/help/article/specifications-for-carousel-ads/) |
| TikTok carousel ads accept 2–35 JPG/JPEG/PNG images, specify `720 × 1280` for vertical, and require music.           | **Accurate for standard carousel ads.**                                          |                                   High | Do not apply the requirement to organic Photo Mode. [TikTok carousel-ad specifications, updated 2026-01](https://ads.tiktok.com/help/article/specifications-for-carousel-ads/)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| TikTok safe zones change with aspect ratio, caption length, device presentation, and additional formats.             | **Accurate for in-feed advertising.**                                            |                                   High | This proves that a single universal safe zone is unsafe. It does not prove the report's exact organic Photo Mode percentages. [TikTok Auction In-Feed Ads, updated 2026-06](https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads?lang=en-GB), [TikTok Reservation In-Feed Ads, updated 2025-07](https://ads.tiktok.com/help/article/tiktok-reservation-in-feed-ads-reach-frequency?lang=en)                                                                                                                                                                                                                                |
| TikTok organic critical content should use the report's `x ≈ 8–78%`, `y ≈ 10–76%` zone.                              | **Reasonable conservative proxy, not validated.**                                |                                    Low | The report labels this as practice/test, which is correct. Maintain versioned surface profiles and validate them against captured live UI rather than treating these numbers as official.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| TikTok supports creator-authored alt text for photos; platform UI has contrast and bold-text accessibility settings. | **Accurate.**                                                                    |                                   High | TikTok's Help content documents up to 300 characters of alt text per photo; the 2025 accessibility announcement describes contrast and bold-text support. Those UI settings do not increase the contrast or size of text baked into a raster image. [TikTok accessibility help, current page; accessed 2026-08-18](https://support.tiktok.com/en/using-tiktok/creating-videos/accessibility), [TikTok Newsroom, 2025-05-14](https://newsroom.tiktok.com/celebrating-global-accessibility-awareness?lang=en)                                                                                                                          |
| Instagram music/audio is a discovery or distribution aid for carousels.                                              | **Feature availability is verified; the distribution benefit is not.**           |                                    Low | Instagram officially supports music on photo carousels, but the traceable Help material does not establish a reach or ranking benefit. Keep any distribution effect as an account-level test hypothesis. [Meta Newsroom, 2023-08-11](https://about.fb.com/news/2023/08/music-and-collabs-on-instagram/)                                                                                                                                                                                                                                                                                                                              |
| `4.5:1` normal text and `3:1` large text are defensible targets for carousel text.                                   | **Accurate as conservative accessibility targets.**                              |                                   High | WCAG 2.2 explicitly includes images of text in SC 1.4.3. Formal WCAG conformance is a web-content question, but the visual problem and ratios transfer cleanly to exported social graphics. W3C also warns that source-canvas point/pixel sizes are unreliable; the delivered display size matters. [W3C SC 1.4.3, current understanding document; accessed 2026-08-18](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)                                                                                                                                                                                           |
| Meaningful graphics should reach `3:1` and color should not be the sole carrier of meaning.                          | **Accurate with scope nuance.**                                                  |                                   High | SC 1.4.11 applies to graphical objects required to understand content; SC 1.4.1 requires redundant information where color conveys meaning. Apply this to chart marks, states, and essential diagram boundaries—not every decorative object. [W3C SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [W3C SC 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)                                                                                                                                                                                                                      |
| Visual attention is limited, so competing focal points and clutter can make search harder.                           | **The underlying result is accurate.**                                           |                                 Medium | Wolfe's review says people cannot recognize more than a few items at a time and attention prioritizes items. Rosenholtz et al. validate measures of perceptual clutter. “One proposition per cover” is a good transfer, not a directly tested social-engagement law. [Wolfe, 2021](https://doi.org/10.3758/s13423-020-01859-9), [Rosenholtz, Li & Nakano, 2007](https://doi.org/10.1167/7.2.17)                                                                                                                                                                                                                                      |
| Segment complex material, signal structure, and keep labels close to what they explain.                              | **Strong learning-design evidence; indirect social evidence.**                   |                                 Medium | The meta-meta-analysis covered 29 reviews, 1,189 studies, and 78,177 participants and found benefits for signaling, spatial/temporal contiguity, segmentation, and related principles. It also found larger effects in system-paced than self-paced contexts, which is an important limit for manually swiped carousels. [Noetel et al., first published 2021-10-23; 2022 volume](https://doi.org/10.3102/00346543211052329)                                                                                                                                                                                                         |
| Viewers form aesthetic impressions very quickly.                                                                     | **Accurate for the cited website stimuli.**                                      |                                 Medium | Lindgaard et al. found stable visual-appeal judgments at 50 ms. That does not establish a 50 ms Instagram comprehension deadline or identify which carousel compositions perform best. [Lindgaard et al., 2006](https://doi.org/10.1080/01449290500330448)                                                                                                                                                                                                                                                                                                                                                                           |
| More aesthetic designs are perceived as more usable.                                                                 | **Supported in the cited interface experiment, with known boundary conditions.** |                                 Medium | Tractinsky et al. tested an ATM-like application and perceived usability, not social engagement or objective conversion. A later online-shop experiment did not find an effect of manipulated aesthetics on perceived usability. The supplied report mentions boundary conditions, but “credibility” is not established by this citation. [Tractinsky, Katz & Ikar, 2000](<https://doi.org/10.1016/S0953-5438(00)00031-X>), [Tuch et al., 2012](https://doi.org/10.1016/j.chb.2012.03.024)                                                                                                                                           |
| Typeface characteristics influence perceived brand personality.                                                      | **Supported in new-brand/name experiments.**                                     |                                 Medium | The evidence supports using typography as a brand signal. It does not show that a named font family, two-font maximum, or a weight range improves carousel engagement. [Grohmann, Giese & Parkman, published online 2012-04-27](https://doi.org/10.1057/bm.2012.23)                                                                                                                                                                                                                                                                                                                                                                  |
| Body `42–54 px`, headlines `72–120 px`, 28–48 characters per line, and specific word-density bands are optimal.      | **Not established as universal optima.**                                         |                                    Low | The arithmetic that maps 42–54 source pixels on a 1080-wide image to roughly 15–20 logical pixels at a 390-pixel display width is sound. The ranges are useful starting points, but font metrics, platform rendering, device width, language, and viewing conditions matter. Validate final display size instead of accepting source pixels alone.                                                                                                                                                                                                                                                                                   |
| 3 or 7–9 slides is a best-performing carousel length.                                                                | **Only supported in TikTok's paid-ad playbook; not organic.**                    | Low for organic; Medium for ad testing | TikTok's playbook says these counts usually showed better CTR/CVR for carousel ads and explicitly says to keep testing. It does not establish an organic narrative optimum. [TikTok Image Ads / Carousel Ads Playbook, current PDF; accessed 2026-08-18](https://ads.tiktok.com/business/library/Image_Ads_Carousel_Ads_Playbook.pdf)                                                                                                                                                                                                                                                                                                |
| Carousels outperform other formats.                                                                                  | **Observational only.**                                                          |                  Low as a causal claim | The report correctly says Socialinsider and Fanpage Karma benchmarks cannot isolate format, topic, creator, audience, or design. They may inform a prior, but they should not determine Glyphkiln composition contracts or promise performance.                                                                                                                                                                                                                                                                                                                                                                                      |
| Instagram and TikTok designs should usually be recomposed rather than merely resized.                                | **Sound synthesis, not a controlled finding.**                                   |                                 Medium | Platform aspect ratios, publishing paths, UI pressure, and audience conventions differ. This is a durable product principle even though the exact best composition remains account-specific.                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## What Glyphkiln already gets right

The research supports several existing architectural choices:

- `DesignDocument` uses semantic layers and bounded templates rather than
  arbitrary coordinates or scripts. That makes hierarchy and quality rules
  inspectable and keeps input as data.
- The renderer exposes safe-area, text-bound, overflow, crop, and contrast
  evidence. This is a stronger foundation than a static design-blog safe-zone
  overlay.
- `contrastIssue` defaults to `4.5`, a conservative policy for all semantic
  text. Keeping one floor is safer than guessing whether raster text will count
  as “large” after delivery.
- Organic TikTok photo output (`tiktok-photo-carousel`, `1080 × 1440`) and
  TikTok carousel-ad output (`tiktok-carousel`, `1080 × 1920`) are already
  distinct contracts. The research supports keeping that distinction even
  though it does not prove that `3:4` is the one ideal organic ratio.
- The TikTok authoring contract already asks for one hook and one supporting
  idea and prevents a subtitle and statistic from competing on the same slide.
- Campaigns keep one document per canvas and coordinate order outside the
  renderer. This is compatible with ordered narrative QA without turning the
  design document into a page scripting language.
- Template versions and visual baselines protect deterministic output when a
  deliberate pixel-affecting change is introduced.

## Product changes justified by the validation

### P0 — Correct the organic/ad evidence boundary

**Confidence: High.**

`docs/template-authoring.md` currently places both of these ad-specific rules
under the combined TikTok carousel policy:

- “create 3 or 7–9” slides; and
- make each slide standalone so **Smart Order** can surface any slide first.

The cited TikTok playbook supports those ideas for carousel ads. Smart Order is
an Ads Manager feature. The current editor repeats the `3` or `7–9` guidance
for the organic `1.0.3` workflow.

Split the guidance by surface:

- For `tiktok-carousel-slide@1.0.2` ad output, retain the playbook-derived
  length as a test prior and retain Smart Order resilience.
- For `tiktok-carousel-slide@1.0.4` organic output, say to use the number of
  slides needed to complete the promise, validate each slide's local clarity,
  and preserve the intended order. Do not claim `3` or `7–9` is optimal.

Relevant files:

- `docs/template-authoring.md`
- `apps/glyphkiln-app/src/features/project-preview/editor-controls.tsx`

Also enforce one aspect ratio per Instagram carousel pack in the publishing
workflow. Instagram's documented carousel workflow applies the selected
square, portrait, or landscape orientation to every item; it does not allow a
different orientation per item. This is a pack-level invariant, not a reason to
merge multiple slides into one design document.

### P0 — Add a delivered-size legibility proof

**Confidence: Medium.**

Core proves geometric fit and contrast, but source-canvas font size does not
prove comfortable phone reading. In the current organic TikTok template, the
supporting copy prefers `34 px` and may shrink to `23 px` on a 1080-wide
canvas. At a representative 390-logical-pixel display width, those correspond
to roughly `12.3 px` and `8.3 px`; the `25 px` footer corresponds to about
`9.0 px`. These figures are not WCAG failures—WCAG has no general minimum font
size—but they are clear candidates for actual-phone review.

Add a non-destructive proof mode before changing pixels:

- preview each artifact at representative 360, 390, and 430 logical-pixel
  widths;
- report delivered-equivalent text size for every semantic text bound;
- flag essential copy below a product-owned review threshold, with metadata
  that distinguishes headline, body, label, citation, and decorative text;
- run user/device qualification before making the warning an error; and
- version any later template font-size change and update pixel baselines.

Relevant files:

- `packages/glyphkiln-core/src/templates/tiktok-carousel-slide-v1-0-3.ts`
- `packages/glyphkiln-core/src/templates/image-led-campaign.ts`
- `apps/glyphkiln-app/src/features/project-preview/preview-stage.tsx`

### P1 — Version platform-surface overlays separately from brand safe areas

**Confidence: High for the need; Low for any one set of coordinates.**

The existing proof overlay displays Core's resolved safe area. Add optional,
non-authoritative delivery overlays for:

- Instagram feed media;
- Instagram profile/grid cover preview;
- TikTok organic Photo Mode;
- TikTok carousel ads; and
- caption-length/device variants where evidence warrants them.

Every overlay should identify `platform`, `surface`, `profileVersion`, source,
retrieval date, and whether it is `official`, `measured`, or `conservative`.
Keep these profiles outside brand snapshots: a brand inset is durable design
data, while platform UI geometry is mutable delivery context. The preview
should show the stricter intersection without silently rewriting old design
documents.

Do not replace the current `3:4` organic format from this report alone. Qualify
both `1080 × 1440` and `1080 × 1920` through the actual native and API/scheduler
paths, on representative iOS/Android devices, with short and long captions.

### P1 — Add sequence-level authoring and review semantics

**Confidence: Medium.**

The App owns campaigns and slide order, so it can improve narrative quality
without changing Core's one-canvas contract. Add bounded member intent such as:

- `cover/hook`;
- `context/problem`;
- `explanation/benefit`;
- `evidence/example`;
- `recap`; and
- `action`.

Sequence QA can then detect a missing cover promise, repeated slide roles,
multiple action slides, mismatched visible numbering, an unsupported statistic,
or an action before the promised value is delivered. Keep these as advisory
until real briefs demonstrate stable error conditions. A slide role must remain
data, never user-supplied executable layout behavior.

### P1 — Carry accessibility and source copy into the delivery bundle

**Confidence: High for need and platform capability.**

SVG title/description alone is not enough for PNG posts. Export a human-reviewable
sidecar per canvas containing:

- suggested platform alt text;
- full text transcript in reading order;
- source/citation copy for statistics and quotations;
- chart summary when charts become supported;
- platform/canvas identifier; and
- an explicit human-review status.

Do not claim the automatic description is sufficient. Instagram and TikTok
both let publishers author alt text, and the publishing step should preserve
that human decision. This aligns with the existing roadmap's planned asset
labels and deterministic chart summaries.

### P1 — Publish path-specific export profiles

**Confidence: High.**

Separate design canvas presets from delivery validation:

- native Instagram: 1080 px target width and aspect ratios through `3:4`;
- Instagram API-compatible: 2–10 children per carousel, JPEG images at most
  8 MB, `4:5`–`1.91:1`, width 320–1440, and sRGB; keep the whole carousel at
  the first image's aspect ratio;
- TikTok organic Content Posting API: WebP/JPEG, at most 1080p and 20 MB per
  image, with at most 35 images; and
- TikTok paid carousel: its own 720 × 1280 vertical, image-count, file, music,
  and Smart Order rules.

Do not infer organic PNG support from the paid carousel-ad specification.
Record the selected delivery profile in the handoff manifest. Meta's explicit
sRGB requirement also provides primary-source support for the project's planned
color-profile normalization work.

### P2 — Expand composition families only from concrete briefs

**Confidence: Medium.**

The report's ten composition patterns are a useful backlog taxonomy, not a
mandate to add ten shallow templates. Glyphkiln currently has one organic
TikTok editorial composition. The most defensible next families are the ones
that map to existing semantic data:

- annotated image/screenshot;
- oversized statistic with source;
- controlled A/B comparison;
- step/explanation slide; and
- recap/action slide.

Implement each as a deep, versioned template or explicit composition variant
only after a real campaign proves the need. Do not add arbitrary positioning,
uploaded SVG decoration, or generic effect toggles to chase the report's style
examples.

### P2 — Make thumbnail and compression checks part of qualification

**Confidence: Medium.**

Add a qualification matrix that captures:

- native feed view;
- profile/search thumbnail view;
- downloaded/recompressed output;
- light/dark device settings where platform UI changes;
- short/long captions; and
- representative low- and high-density phone widths.

Thin rules, fine grain, subtle gradients, screenshots, and small source labels
should be examined after upload/download, not only in the deterministic local
render. This external-delivery check should be recorded separately from exact
Core pixel reproducibility.

### P3 — Treat performance advice as experiment metadata, not renderer policy

**Confidence: High.**

Hooks, CTA wording, slide count, progress indicators, branding intensity, and
image-versus-type-led openings can be recorded as experiment variants in the
App. They should not alter Core behavior invisibly and should not be labelled
“high performing” without account evidence. Save/share/profile/conversion
metrics should be selected by campaign objective; likes alone are not an
adequate universal goal.

## Claims that should not become hard product rules

Do not encode any of the following without additional qualification:

- TikTok organic is always `9:16` or always `3:4`;
- the report's organic TikTok safe-zone percentages are official;
- Instagram always crops native `3:4` output correctly through every scheduler;
- `3`, `7–9`, `5–10`, or any other slide count is universally optimal;
- a single word-count band defines acceptable information density;
- one specific source-pixel font size is readable on every device;
- one or two type families always outperform a broader branded system;
- faces, arrows, audio, progress indicators, or a particular CTA cause organic
  engagement;
- `70–85%` visual consistency is a measured optimum;
- the report's 100-point rubric predicts performance; or
- external engagement benchmarks establish format or design causality.

## Recommended implementation order

1. Correct the organic/ad guidance boundary and remove the unsupported organic
   `3` or `7–9` prescription.
2. Add delivered-size and platform-surface proof modes before making another
   pixel-affecting template decision.
3. Run a real-device publishing qualification for TikTok `3:4` versus `9:16`
   and Instagram `4:5` versus native `3:4`, including the actual scheduler/API
   paths the project intends to support.
4. Add reviewed alt-text/transcript/source sidecars to campaign delivery.
5. Add sequence-role review and only then develop the next concrete composition
   family from a real brief.

## Primary source register

Platform documents are mutable. “Accessed” dates below are therefore part of
the evidence record.

| Source                                                                                                                                                   | Published/updated                                       | What it supports                                                                     | Important limit                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [Meta: Image resolution of photos shared on Instagram](https://www.facebook.com/help/1631821640426723/)                                                  | Date not displayed; accessed 2026-08-18                 | Native width/resolution behavior and `1.91:1`–`3:4` range                            | No carousel safe-zone or scheduler guarantee                   |
| [Meta: Share a post with multiple photos or videos](https://www.facebook.com/help/instagram/269314186824048/)                                            | Date not displayed; accessed 2026-08-18                 | Instagram carousel operation, one orientation per pack, and current 20-item metadata | Some indexed/localized body copies still show the former count |
| [Instagram Creators: New text tools](https://creators.instagram.com/blog/new-text-tools-to-help-you-personalize-your-content)                            | 2024-08-27                                              | Dated announcement of the 20-item maximum                                            | Product announcement, not performance guidance                 |
| [Meta for Developers: IG User Media](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media)       | Date not displayed; accessed 2026-08-18                 | Programmatic JPEG, 8 MB, `4:5`–`1.91:1`, width 320–1440, and sRGB requirements       | API path differs from native upload                            |
| [Meta for Developers: Content Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing) | Date not displayed; accessed 2026-08-18                 | API carousels use 2–10 children and the first image controls item crop ratio         | Native app permits more items                                  |
| [Instagram: Edit alternative text](https://www.facebook.com/help/instagram/503708446705527)                                                              | Date not displayed; accessed 2026-08-18                 | Automatic and creator-authored alt text                                              | Does not repair illegible baked-in text                        |
| [TikTok Support: Making a post](https://support.tiktok.com/en/using-tiktok/creating-videos/making-a-post)                                                | Current page; accessed 2026-08-18                       | Up to 35 photos and current organic creation flow                                    | No preferred organic pixel canvas or safe zone                 |
| [TikTok Developers: media transfer guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)                                    | Current page; accessed 2026-08-18                       | JPEG/WebP, maximum 1080p, 20 MB per image                                            | Delivery restrictions, not composition guidance                |
| [TikTok Developers: iOS Share Kit](https://developers.tiktok.com/doc/share-kit-ios-quickstart-v2)                                                        | Current page; accessed 2026-08-18                       | Up to 35 images and broad aspect-ratio acceptance                                    | SDK acceptance is not feed-display geometry                    |
| [TikTok: Photo Mode introduction](https://newsroom.tiktok.com/editing-tools?lang=en)                                                                     | 2022-10-06                                              | Sequential display, music, manual swipe                                              | Launch-era description                                         |
| [TikTok: Carousel Ad specifications](https://ads.tiktok.com/help/article/specifications-for-carousel-ads/)                                               | Updated 2026-01                                         | Paid carousel image count, format, vertical resolution, and music                    | Advertising only                                               |
| [TikTok: Auction In-Feed Ads](https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads?lang=en-GB)                                                 | Updated 2026-06                                         | `9:16` paid-placement recommendation and variable safe zones                         | Advertising only                                               |
| [TikTok: Image Ads / Carousel Ads Playbook](https://ads.tiktok.com/business/library/Image_Ads_Carousel_Ads_Playbook.pdf)                                 | Current PDF; accessed 2026-08-18                        | Paid carousel `9:16`, 720p+, safe zone, Smart Order, and `3` or `7–9` test prior     | Not organic causal evidence                                    |
| [TikTok: Accessibility help](https://support.tiktok.com/en/using-tiktok/creating-videos/accessibility)                                                   | Current page; accessed 2026-08-18                       | Photo alt text and its 300-character limit                                           | Platform UI capability only                                    |
| [TikTok: 2025 accessibility announcement](https://newsroom.tiktok.com/celebrating-global-accessibility-awareness?lang=en)                                | 2025-05-14                                              | Photo alt text, UI contrast, bold-text setting                                       | Does not change pixels inside uploaded art                     |
| [W3C: SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)                                                    | Current WCAG 2.2 understanding doc; accessed 2026-08-18 | `4.5:1` normal text, `3:1` large text, including images of text                      | Web conformance context; no social font-size optimum           |
| [W3C: SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)                                                   | Current WCAG 2.2 understanding doc; accessed 2026-08-18 | Essential graphical objects at `3:1`                                                 | Not a requirement for decoration                               |
| [W3C: SC 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)                                                              | Current WCAG 2.2 understanding doc; accessed 2026-08-18 | Do not use color as the only information channel                                     | Accessibility, not aesthetic prescription                      |
| [Wolfe: Guided Search 6.0](https://doi.org/10.3758/s13423-020-01859-9)                                                                                   | Published 2021-02-05                                    | Limited item recognition and attentional prioritization                              | Theoretical review, not social engagement experiment           |
| [Rosenholtz, Li & Nakano: Measuring visual clutter](https://doi.org/10.1167/7.2.17)                                                                      | 2007                                                    | Perceptual congestion and clutter measurement                                        | No maximum element count for a slide                           |
| [Noetel et al.: Multimedia Design for Learning](https://doi.org/10.3102/00346543211052329)                                                               | First published 2021-10-23                              | Signaling, contiguity, segmentation, coherence                                       | Education transfer; self-paced effects differ                  |
| [Lindgaard et al.: 50 ms first impressions](https://doi.org/10.1080/01449290500330448)                                                                   | 2006                                                    | Rapid stable website visual-appeal judgments                                         | Not social comprehension or conversion                         |
| [Tractinsky, Katz & Ikar: What is beautiful is usable](<https://doi.org/10.1016/S0953-5438(00)00031-X>)                                                  | 2000                                                    | Relationship between perceived aesthetics and usability in one interface study       | Not objective usability or social performance                  |
| [Grohmann, Giese & Parkman: Typeface and brand personality](https://doi.org/10.1057/bm.2012.23)                                                          | Online 2012; volume 2013                                | Typeface characteristics influence new-brand personality judgments                   | Not a carousel font or engagement test                         |

## Final assessment

The supplied report is credible enough to guide Glyphkiln's next proofing and
authoring work, provided its numeric recommendations remain labelled as
heuristics. The highest-value adoption is not a new decorative feature. It is a
more explicit evidence chain from semantic intent to delivered phone-size
legibility, platform-surface clearance, accessible delivery copy, and
sequence-level review.
