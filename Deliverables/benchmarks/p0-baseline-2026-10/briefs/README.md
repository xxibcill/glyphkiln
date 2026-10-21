# P0 benchmark pack — twelve fixed briefs

**Prepared 22 October 2026. Status: proposed benchmark inputs; no expert
designer has been commissioned and no blind round has run.**

These briefs fix the copy, assets, sizes, and delivery conditions for the
"beat the expert" benchmark in the
[design-quality improvement plan](../../../../docs/plans/design-quality-improvement-plan.md)
(§2 and W9). Glyphkiln and each professional designer receive the same brief.
Results are compared blind using the [scoring sheet](scoring-sheet.md).

| ID  | Brief                                                   | Canvas                         | Delivery view                           | Proposed time box | Ready to run?                                                   |
| --- | ------------------------------------------------------- | ------------------------------ | --------------------------------------- | ----------------- | --------------------------------------------------------------- |
| K1  | [Product announcement](K1-announcement.md)              | 1200×627                       | 360 px wide (phone feed)                | 1 h               | Yes                                                             |
| K2  | [Quote card](K2-quote.md)                               | 1080×1350                      | 360×450                                 | 45 min            | Yes                                                             |
| K3  | [Statistic / three places](K3-statistic.md)             | 1080×1080                      | 360×360                                 | 45 min            | Yes                                                             |
| K4  | [Journal cover thumbnail](K4-article-cover.md)          | 1280×720                       | 320 px wide                             | 1 h               | Yes                                                             |
| K5  | [Three-format photo campaign](K5-photo-campaign.md)     | 1200×627, 1080×1080, 1080×1350 | 360 px wide                             | 2 h               | Yes                                                             |
| K6  | [Six-slide placement carousel](K6-carousel.md)          | 6 × 1080×1440                  | 360×480 per slide                       | 4 h               | Yes                                                             |
| K7  | [Process diagram](K7-process-diagram.md)                | 1200×675                       | 600 px wide (article) and 360 px (feed) | 4 h               | Yes (fictional process)                                         |
| A   | [Thai planning-service cover](A-thai-planning-cover.md) | 1600×1600                      | 400×400                                 | 3 h               | Needs IBM Plex Sans Thai bytes                                  |
| B   | [Thai notebook product card](B-thai-notebook.md)        | 1200×1500                      | 400×500                                 | 2 h               | Needs Noto Sans Thai bytes and an original illustration         |
| C   | [Six-frame workflow lesson](C-workflow-lesson.md)       | 6 × 1080×1350                  | 360×450                                 | 5 h               | Needs IBM Plex Sans bytes                                       |
| D   | [Lever torque diagram](D-lever-diagram.md)              | 1600×900                       | 800×450                                 | 3 h               | Needs IBM Plex Sans bytes                                       |
| E   | [Service-queue styleframes](E-service-queue.md)         | 4 × 1600×900                   | 800×450                                 | 6 h               | Needs a physical-scene asset route; not a Core-only brief today |

**Fixed inputs.** Copy is exact: preserve every character, line order, and
qualification. Asset hashes are SHA-256 of the committed bytes. All products,
claims, and services are fictional; K-series copy comes from the Kilnform
stress test, A–E copy from the reviewed GD20 study inputs.

**Missing inputs are listed, not invented.** Where a brief needs a font or
illustration that is not in this repository, it names it under _Missing
inputs_. A brief is not run until those are admitted with license records.

**Time boxes** are proposed working limits for the human designer, chosen so
that a fair comparison does not reward unlimited polish. Record actual hours
either way.

Shared assets for the K series:

| Asset                                | Path                                                                 | SHA-256                                                            |
| ------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Lamp photograph (1536×1024 PNG)      | `packages/glyphkiln-core/examples/assets/kilnform-lamp-campaign.png` | `42930ab31255277669c7aea6da1c25b27ddc61891d29ca8298adcc4b65d13368` |
| Kilnform mark (1024×1024 PNG, alpha) | `packages/glyphkiln-core/examples/assets/kilnform-mark.png`          | `4c582c95cbb7fdff2597bb6c57a11da219a7ce328f0e67447b4894c95ad575d9` |
| Inter Variable (OFL 1.1)             | `packages/glyphkiln-core/assets/fonts/Inter-Variable.ttf`            | `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031` |

K-series brand palette (from the stress-test brand snapshot): see
`packages/glyphkiln-core/examples/image-led-campaign.json` → `brand`; accent
`#F3C879`. Designers may use any typeface they can license for the brief only
if Glyphkiln is given the same font bytes; otherwise Inter only.
