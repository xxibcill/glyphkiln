import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import {
  DELIVERY_PROFILE_REGISTRY,
  DELIVERY_SOURCES,
  createCampaignCanvasKey,
  createCampaignDirectionKey,
  createCarouselDeliverySidecar,
  deriveCampaignSeeds,
  hashCanonical,
  renderGraphic,
  reviewCarouselSequence,
  sha256,
} from "../packages/glyphkiln-core/dist/index.js";
import {
  createQualificationEmitter,
  outlineText,
  renderSvg,
} from "./qualification-output.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_ROOT = resolve(
  REPOSITORY_ROOT,
  "docs/samples/carousel-design-review-2026-08-18",
);
const GENERATED_ROOT = resolve(SAMPLE_ROOT, "generated");
const DELIVERABLE_JSON_ROOT = resolve(
  REPOSITORY_ROOT,
  "Deliverables/json/carousel-review-sample",
);
const DELIVERABLE_PNG_ROOT = resolve(
  REPOSITORY_ROOT,
  "Deliverables/png/carousel-review-sample",
);
const DELIVERABLE_SVG_ROOT = resolve(
  REPOSITORY_ROOT,
  "Deliverables/svg/carousel-review-sample",
);
const VERIFY = process.argv.includes("--verify");
const { emit, repositoryPath } = createQualificationEmitter({
  repositoryRoot: REPOSITORY_ROOT,
  verify: VERIFY,
});
const CREATION_TIMESTAMP = "2026-08-18T15:30:00.000Z";
const CAMPAIGN_ID = "campaign-carousel-clinic-sample";
const DIRECTION_KEY = "editorial-reading-path";
const CAMPAIGN_SEED = "carousel-clinic-tiktok-organic-2026-08";
const DELIVERY_PROFILE_ID = "tiktok-organic-photo";
const TEMPLATE = { id: "tiktok-carousel-slide", version: "1.0.4" };
const COMPOSITION_VARIANT_ID = "organic-photo-editorial";
const PHONE_WIDTHS = [360, 390, 430];
const RESEARCH_URL =
  "https://github.com/xxibcill/glyphkiln/blob/main/docs/research/carousel-design-validation-2026-08-18.md";
const WORKFLOW_URL =
  "https://github.com/xxibcill/glyphkiln/blob/main/.agents/skills/create-glyphkiln-carousel/references/carousel-workflow.md";

const paths = {
  inter: resolve(
    REPOSITORY_ROOT,
    "packages/glyphkiln-core/assets/fonts/Inter-Variable.ttf",
  ),
};

const slideSpecs = [
  slide("hook", "dark", {
    headline: "Your carousel isn't boring. It lacks hierarchy.",
    cta: "SWIPE TO FIX THE PATH →",
    eyebrow: "CAROUSEL CLINIC / START HERE",
    footer: "GLYPHKILN · TIKTOK ORGANIC SAMPLE",
    altText:
      "Slide 1 of 6, hook. Dark navy editorial card reading: Your carousel isn't boring. It lacks hierarchy. Purple frame and mint accents establish the sequence.",
    sourceNotes: [{ label: "Carousel design research validation", url: RESEARCH_URL }],
  }),
  slide("context", "light", {
    headline: "Four focal points\nerase the focus.",
    subtitle:
      "Headline, image, badge, and CTA should not all compete at display scale on one slide.",
    pattern: "recursive-subdivision",
    altText:
      "Slide 2 of 6, context. Light editorial card reading: Four focal points erase the focus. It explains that a headline, image, badge, and call to action should not compete at the same visual scale.",
    sourceNotes: [{ label: "Carousel design research validation", url: RESEARCH_URL }],
  }),
  slide("evidence", "dark", {
    headline: "Proof happens at phone size.",
    statistic: {
      value: "3",
      label: "review widths: 360 / 390 / 430 px",
      trend: "before posting",
    },
    pattern: "topographic-contours",
    altText:
      "Slide 3 of 6, evidence. Dark editorial card stating that proof happens at phone size and naming three review widths: 360, 390, and 430 pixels.",
    sourceNotes: [{ label: "Glyphkiln carousel review workflow", url: WORKFLOW_URL }],
  }),
  slide("explanation", "light", {
    headline: "Each slide\nhas one job.",
    subtitle: "HOOK → FRAME\nPROVE → EXPLAIN\nRECAP → ACT",
    cta: "MAKE THE SEQUENCE DO THE WORK →",
    pattern: "layered-waves",
    altText:
      "Slide 4 of 6, explanation. Light editorial card listing six narrative jobs: hook, frame, prove, explain, recap, and act.",
    sourceNotes: [{ label: "Glyphkiln carousel review workflow", url: WORKFLOW_URL }],
  }),
  slide("recap", "dark", {
    headline: "Keep the grammar.\nChange the beat.",
    headlineMaxLines: 2,
    subtitle:
      "Repeat the palette, grid, and type system. Vary scale, density, and evidence treatment.",
    pattern: "flow-field",
    altText:
      "Slide 5 of 6, recap. Dark editorial card recommending a stable palette, grid, and type system with varied scale, density, and evidence treatment.",
    sourceNotes: [{ label: "Carousel design research validation", url: RESEARCH_URL }],
  }),
  slide("action", "light", {
    headline: "Shrink it. Swipe it. Source it.",
    cta: "OPEN THE REVIEW RECORD →",
    footer: "GLYPHKILN · REVIEW BEFORE PUBLISHING",
    altText:
      "Slide 6 of 6, action. Light closing card reading: Shrink it. Swipe it. Source it. It asks the reviewer to inspect the sequence and delivery record.",
    sourceNotes: [{ label: "Glyphkiln carousel review workflow", url: WORKFLOW_URL }],
  }),
];

const interBytes = new Uint8Array(await readFile(paths.inter));
const interHash = sha256(interBytes);
const directionKey = createCampaignDirectionKey(DIRECTION_KEY);
const renderedSlides = [];

for (const [ordinal, spec] of slideSpecs.entries()) {
  const canvasKey = `slide-${String(ordinal + 1).padStart(2, "0")}`;
  const seeds = deriveCampaignSeeds({
    campaignSeed: CAMPAIGN_SEED,
    familyId: "image-led-campaign",
    directionKey,
    canvasKey: createCampaignCanvasKey(canvasKey),
    template: TEMPLATE,
    format: "tiktok-photo-carousel",
    compositionVariantId: COMPOSITION_VARIANT_ID,
  });
  const document = createDocument(spec, ordinal, canvasKey, seeds.canvasSeed);
  const result = await renderGraphic(document, {
    formats: ["svg", "png"],
    creationTimestamp: CREATION_TIMESTAMP,
    assets: [],
    fonts: [],
  });
  assertRenderResult(canvasKey, result);

  const designPath = resolve(GENERATED_ROOT, "designs", `${canvasKey}.json`);
  await emitJson(designPath, result.document);
  await emitJson(
    resolve(DELIVERABLE_JSON_ROOT, `${canvasKey}.design.json`),
    result.document,
  );
  const outputs = {};
  for (const output of result.outputs) {
    const outputPath = resolve(
      GENERATED_ROOT,
      "outputs",
      `${canvasKey}.${output.format}`,
    );
    await emit(outputPath, output.bytes);
    await emitJson(`${outputPath}.manifest.json`, output.manifest);
    await emit(
      resolve(
        output.format === "png" ? DELIVERABLE_PNG_ROOT : DELIVERABLE_SVG_ROOT,
        `${canvasKey}.${output.format}`,
      ),
      output.bytes,
    );
    await emitJson(
      resolve(DELIVERABLE_JSON_ROOT, `${canvasKey}.${output.format}.manifest.json`),
      output.manifest,
    );
    outputs[output.format] = {
      bytes: output.bytes,
      path: repositoryPath(outputPath),
      manifestPath: repositoryPath(`${outputPath}.manifest.json`),
      sha256: output.manifest.output.sha256,
      byteSize: output.bytes.byteLength,
      fingerprint: output.fingerprint,
    };
  }
  renderedSlides.push({
    ...spec,
    ordinal,
    canvasKey,
    ...seeds,
    document: result.document,
    documentPath: repositoryPath(designPath),
    documentHash: hashCanonical(result.document),
    evidence: result.evidence,
    qualityIssues: result.qualityIssues,
    outputs,
  });
}

const sequence = {
  deliveryProfileId: DELIVERY_PROFILE_ID,
  slides: renderedSlides.map((slideEntry) => ({
    document: slideEntry.document,
    ordinal: slideEntry.ordinal,
    narrativeRole: slideEntry.narrativeRole,
    compositionVariantId: COMPOSITION_VARIANT_ID,
    sourceNotes: slideEntry.sourceNotes,
  })),
};
const sequenceReview = reviewCarouselSequence(sequence);
if (!sequenceReview.success) {
  throw new Error(`Carousel sequence failed review: ${JSON.stringify(sequenceReview)}`);
}
const unexpectedWarnings = sequenceReview.issues.filter(
  (issue) => issue.code !== "COMPOSITION_RHYTHM_REVIEW",
);
if (unexpectedWarnings.length > 0) {
  throw new Error(
    `Carousel sequence returned unexpected warnings: ${JSON.stringify(unexpectedWarnings)}`,
  );
}

const deliverySidecar = createCarouselDeliverySidecar(sequence);
const publishingCopy = {
  version: "1.0.0",
  deliveryProfileId: DELIVERY_PROFILE_ID,
  caption:
    "A carousel is a reading path before it is a collection of graphics. This six-slide review sample shows how Glyphkiln plans, proofs, and hands off that path.",
  slides: renderedSlides.map((slideEntry) => ({
    documentId: slideEntry.document.id,
    ordinal: slideEntry.ordinal,
    narrativeRole: slideEntry.narrativeRole,
    altText: slideEntry.altText,
  })),
};
for (const slideEntry of publishingCopy.slides) {
  if (slideEntry.altText.length > 300) {
    throw new Error(
      `${slideEntry.documentId} exceeds TikTok's 300-character alt field.`,
    );
  }
}

const reviewBoardSvg = createReviewBoard(renderedSlides, interBytes);
const reviewBoardPng = renderSvg(reviewBoardSvg, 2_400);
const reviewBoardSvgPath = resolve(GENERATED_ROOT, "carousel-review-board.svg");
const reviewBoardPngPath = resolve(GENERATED_ROOT, "carousel-review-board.png");
await emit(reviewBoardSvgPath, reviewBoardSvg);
await emit(reviewBoardPngPath, reviewBoardPng);
await emit(resolve(DELIVERABLE_SVG_ROOT, "carousel-review-board.svg"), reviewBoardSvg);
await emit(resolve(DELIVERABLE_PNG_ROOT, "carousel-review-board.png"), reviewBoardPng);
await emitJson(resolve(GENERATED_ROOT, "sequence-review.json"), sequenceReview);
await emitJson(resolve(GENERATED_ROOT, "delivery-sidecar.json"), deliverySidecar);
await emitJson(resolve(GENERATED_ROOT, "publishing-copy.json"), publishingCopy);
await emitJson(resolve(DELIVERABLE_JSON_ROOT, "sequence-review.json"), sequenceReview);
await emitJson(
  resolve(DELIVERABLE_JSON_ROOT, "delivery-sidecar.json"),
  deliverySidecar,
);
await emitJson(resolve(DELIVERABLE_JSON_ROOT, "publishing-copy.json"), publishingCopy);

const profile = DELIVERY_PROFILE_REGISTRY[DELIVERY_PROFILE_ID];
const profileSourceIds = new Set([
  ...profile.slideCount.sourceIds,
  ...profile.acceptedImageMediaTypes.sourceIds,
  ...profile.aspectRatio.sourceIds,
  ...profile.raster.sourceIds,
  ...profile.accessibility.sourceIds,
]);
const reviewRecord = {
  version: "1.0.0",
  status: "awaiting-human-visual-approval",
  creationTimestamp: CREATION_TIMESTAMP,
  generator: repositoryPath(fileURLToPath(import.meta.url)),
  campaign: {
    id: CAMPAIGN_ID,
    title: "Carousel clinic: build a reading path",
    brief:
      "Demonstrate an attractive, legible carousel sequence without engagement promises or unsupported platform rules.",
    campaignSeed: CAMPAIGN_SEED,
    directionKey: DIRECTION_KEY,
  },
  deliveryProfile: profile,
  deliverySources: [...profileSourceIds].map((id) => DELIVERY_SOURCES[id]),
  contractNotes: {
    platformCapability:
      "TikTok's current organic Photo Mode documentation supports up to 35 photos.",
    glyphkilnAdvisories: [
      "The 1080 × 1440 canvas is a Glyphkiln working format, not an official universal TikTok requirement.",
      "The dashed surface overlay is dated advisory guidance and needs live-device verification before publishing.",
    ],
  },
  sequenceReview,
  warningDispositions: sequenceReview.issues.map((issue) => ({
    code: issue.code,
    disposition:
      "Accepted for this sample: the registered template exposes one composition contract, while content-responsive field alignment, color mode, evidence treatment, and deterministic pattern rails deliberately vary the visual rhythm. The warning remains conservative because the composition metadata identifier is shared.",
  })),
  rendererContract: {
    designSchema: "1.4.0",
    template: `${TEMPLATE.id}@${TEMPLATE.version}`,
    format: "tiktok-photo-carousel",
    compositionVariantId: COMPOSITION_VARIANT_ID,
  },
  deviceProofWidths: PHONE_WIDTHS,
  slides: renderedSlides.map((slideEntry) => ({
    ordinal: slideEntry.ordinal,
    canvasKey: slideEntry.canvasKey,
    narrativeRole: slideEntry.narrativeRole,
    documentPath: slideEntry.documentPath,
    documentHash: slideEntry.documentHash,
    directionSeed: slideEntry.directionSeed,
    canvasSeed: slideEntry.canvasSeed,
    sourceNotes: slideEntry.sourceNotes,
    altText: slideEntry.altText,
    qualityIssues: slideEntry.qualityIssues,
    evidence: {
      version: slideEntry.evidence.version,
      safeArea: slideEntry.evidence.safeArea,
      crops: slideEntry.evidence.crops,
      contrast: slideEntry.evidence.contrast,
      text: slideEntry.evidence.text.map((textEntry) => ({
        ...textEntry,
        deliveredFontSizePx: Object.fromEntries(
          PHONE_WIDTHS.map((width) => [
            width,
            round(textEntry.fontSize * (width / 1_080)),
          ]),
        ),
      })),
    },
    outputs: Object.fromEntries(
      Object.entries(slideEntry.outputs).map(([format, output]) => [
        format,
        {
          path: output.path,
          manifestPath: output.manifestPath,
          sha256: output.sha256,
          byteSize: output.byteSize,
          fingerprint: output.fingerprint,
        },
      ]),
    ),
  })),
  reviewBoard: {
    svg: repositoryPath(reviewBoardSvgPath),
    png: repositoryPath(reviewBoardPngPath),
    sha256: sha256(reviewBoardPng),
    byteSize: reviewBoardPng.byteLength,
  },
};
await emitJson(resolve(GENERATED_ROOT, "review-record.json"), reviewRecord);
await emitJson(resolve(DELIVERABLE_JSON_ROOT, "review-record.json"), reviewRecord);
const readme = await prettier.format(createReadme(reviewRecord), {
  parser: "markdown",
});
await emit(resolve(SAMPLE_ROOT, "README.md"), readme);

process.stdout.write(
  `${VERIFY ? "Verified" : "Generated"} ${renderedSlides.length.toString()} TikTok organic carousel slides.\n`,
);
process.stdout.write(
  `Sequence review: ${sequenceReview.success ? "pass" : "fail"} with ${sequenceReview.issues.length.toString()} advisory warning(s). Review board ${sha256(reviewBoardPng)}.\n`,
);

function slide(narrativeRole, mode, copy) {
  return { narrativeRole, mode, ...copy };
}

function createDocument(spec, ordinal, canvasKey, seed) {
  const slideNumber = ordinal + 1;
  return {
    schemaVersion: "1.4.0",
    id: `sample-carousel-clinic-${canvasKey}`,
    template: TEMPLATE,
    format: "tiktok-photo-carousel",
    seed,
    mode: spec.mode,
    brand: glyphkilnBrand(),
    assets: [],
    fonts: [400, 500, 600, 700, 800].map((weight) => ({
      family: "Inter",
      weight,
      style: "normal",
      sha256: interHash,
    })),
    layers: [
      { id: "background", type: "background" },
      ...(spec.pattern === undefined
        ? []
        : [
            {
              id: "pattern-interrupt",
              type: "procedural-decoration",
              visible: true,
              style: spec.pattern,
              intensity: 0.38,
              density: 0.54,
              complexity: 0.5,
              contrast: 0.28,
              quietRegion:
                spec.pattern === "layered-waves" || spec.pattern === "flow-field"
                  ? { x: 0.24, y: 0.12, width: 0.62, height: 0.58 }
                  : { x: 0.06, y: 0.12, width: 0.62, height: 0.58 },
            },
          ]),
      {
        id: "slide-number",
        type: "badge",
        text: `${String(slideNumber).padStart(2, "0")} / ${String(slideSpecs.length).padStart(2, "0")}`,
      },
      ...(spec.eyebrow === undefined
        ? []
        : [{ id: "eyebrow", type: "eyebrow", text: spec.eyebrow }]),
      {
        id: "headline",
        type: "headline",
        text: spec.headline,
        ...(spec.headlineMaxLines === undefined
          ? {}
          : { maxLines: spec.headlineMaxLines }),
      },
      ...(spec.subtitle === undefined
        ? []
        : [{ id: "subtitle", type: "subtitle", text: spec.subtitle }]),
      ...(spec.statistic === undefined
        ? []
        : [{ id: "proof-statistic", type: "statistic", ...spec.statistic }]),
      ...(spec.cta === undefined ? [] : [{ id: "cta", type: "cta", text: spec.cta }]),
      ...(spec.footer === undefined
        ? []
        : [{ id: "footer", type: "footer", text: spec.footer }]),
    ],
    metadata: {
      campaignId: CAMPAIGN_ID,
      campaignCanvasKey: canvasKey,
      slideIndex: slideNumber,
      slideCount: slideSpecs.length,
      sample: "carousel-design-review-2026-08-18",
      reviewState: "in-review",
    },
  };
}

function glyphkilnBrand() {
  return {
    snapshotId: "brand-glyphkiln-carousel-clinic-2026-08",
    version: "1.0.0",
    name: "Glyphkiln",
    palette: {
      primary: "#6C5CE7",
      secondary: "#00B894",
      accent: "#FDCB6E",
      neutrals: ["#0B1020", "#F7F8FC", "#47506A"],
    },
    themes: {
      light: {
        background: "#F7F8FC",
        surface: "#FFFFFF",
        text: "#0B1020",
        mutedText: "#47506A",
      },
      dark: {
        background: "#0B1020",
        surface: "#171D32",
        text: "#F7F8FC",
        mutedText: "#B8C0D9",
      },
    },
    typography: {
      headlineFamily: "Inter",
      bodyFamily: "Inter",
      monospaceFamily: "Inter",
      roles: {
        display: {
          family: "Inter",
          weight: 800,
          lineHeight: 0.94,
          tracking: -0.035,
        },
        body: {
          family: "Inter",
          weight: 500,
          lineHeight: 1.2,
          tracking: 0,
        },
        label: {
          family: "Inter",
          weight: 700,
          lineHeight: 1,
          tracking: 0.075,
        },
      },
    },
    spacingScale: [4, 8, 12, 16, 24, 32, 48, 64],
    borderRadii: [0, 16, 28],
    visualDensity: "balanced",
    preferredProceduralStyles: [
      "recursive-subdivision",
      "topographic-contours",
      "layered-waves",
      "flow-field",
    ],
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    prohibitedColors: [],
    prohibitedStyles: ["photorealistic-ai"],
  };
}

function assertRenderResult(canvasKey, result) {
  if (result.qualityIssues.length > 0) {
    throw new Error(
      `${canvasKey} returned quality issues: ${JSON.stringify(result.qualityIssues)}.`,
    );
  }
  if (result.outputs.length !== 2) {
    throw new Error(`${canvasKey} did not return both SVG and PNG outputs.`);
  }
  const safe = result.evidence.safeArea;
  for (const textEntry of result.evidence.text) {
    if (textEntry.overflow)
      throw new Error(`${canvasKey} overflows ${textEntry.layerId}.`);
    if (!(textEntry.fontSize > 0)) {
      throw new Error(`${canvasKey} has invalid fitted type for ${textEntry.layerId}.`);
    }
    const withinSafeArea =
      textEntry.bounds.x >= safe.x - 0.001 &&
      textEntry.bounds.y >= safe.y - 0.001 &&
      textEntry.bounds.x + textEntry.bounds.width <= safe.x + safe.width + 0.001 &&
      textEntry.bounds.y + textEntry.bounds.height <= safe.y + safe.height + 0.001;
    if (!withinSafeArea) {
      throw new Error(
        `${canvasKey} places ${textEntry.layerId} outside Core safe area.`,
      );
    }
  }
  for (const contrast of result.evidence.contrast) {
    if (contrast.minimumRatio < contrast.minimumRequired) {
      throw new Error(`${canvasKey} fails contrast for ${contrast.layerId}.`);
    }
  }
}

function createReviewBoard(slides, fontBytes) {
  const width = 2_400;
  const height = 2_290;
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="2400" height="2290" fill="#090D18"/>',
    `<path d="${outlineText(fontBytes, "CAROUSEL CLINIC / TIKTOK ORGANIC REVIEW", {
      x: 90,
      baseline: 105,
      fontSize: 49,
      weight: 800,
      letterSpacing: 1.6,
    })}" fill="#F7F8FC"/>`,
    `<path d="${outlineText(
      fontBytes,
      "6 SLIDES · 3:4 WORKING CANVAS · DASHED LINE = ADVISORY SURFACE",
      {
        x: 90,
        baseline: 155,
        fontSize: 23,
        weight: 600,
        letterSpacing: 1.1,
      },
    )}" fill="#8F9BC1"/>`,
  ];
  const profile = DELIVERY_PROFILE_REGISTRY[DELIVERY_PROFILE_ID];
  slides.forEach((slideEntry, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const box = {
      x: 90 + column * 760,
      y: 220 + row * 990,
      width: 700,
      height: 940,
    };
    reviewCard(parts, fontBytes, slideEntry, box, profile.surfaceOverlay.insets);
  });
  parts.push(
    `<path d="${outlineText(
      fontBytes,
      "AWAITING HUMAN VISUAL APPROVAL · CORE SAFE AREA PASSED · PLATFORM OVERLAY IS ADVISORY",
      {
        x: 90,
        baseline: 2235,
        fontSize: 22,
        weight: 700,
        letterSpacing: 1,
      },
    )}" fill="#FDCB6E"/>`,
    "</svg>",
    "",
  );
  return parts.join("\n");
}

function reviewCard(parts, fontBytes, slideEntry, box, overlayInsets) {
  const image = { x: box.x + 50, y: box.y + 24, width: 600, height: 800 };
  const data = Buffer.from(slideEntry.outputs.png.bytes).toString("base64");
  const overlay = {
    x: image.x + image.width * overlayInsets.left,
    y: image.y + image.height * overlayInsets.top,
    width: image.width * (1 - overlayInsets.left - overlayInsets.right),
    height: image.height * (1 - overlayInsets.top - overlayInsets.bottom),
  };
  const headlineEvidence = slideEntry.evidence.text.find(
    (entry) => entry.layerId === "headline",
  );
  const headlineAt360 =
    headlineEvidence === undefined
      ? "n/a"
      : `${round(headlineEvidence.fontSize / 3)} px`;
  parts.push(
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="24" fill="#171D32" stroke="#303A60" stroke-width="2"/>`,
    `<image x="${image.x}" y="${image.y}" width="${image.width}" height="${image.height}" href="data:image/png;base64,${data}"/>`,
    `<rect x="${round(overlay.x)}" y="${round(overlay.y)}" width="${round(overlay.width)}" height="${round(overlay.height)}" rx="10" fill="none" stroke="#FDCB6E" stroke-width="3" stroke-dasharray="13 10" opacity="0.9"/>`,
    `<path d="${outlineText(
      fontBytes,
      `${String(slideEntry.ordinal + 1).padStart(2, "0")} · ${slideEntry.narrativeRole.toUpperCase()}`,
      {
        x: box.x + 50,
        baseline: box.y + 866,
        fontSize: 22,
        weight: 800,
        letterSpacing: 1.2,
      },
    )}" fill="#F7F8FC"/>`,
    `<path d="${outlineText(fontBytes, `HEADLINE ${headlineAt360} @ 360 PX`, {
      x: box.x + 50,
      baseline: box.y + 905,
      fontSize: 18,
      weight: 600,
      letterSpacing: 0.8,
    })}" fill="#8F9BC1"/>`,
  );
}

function createReadme(reviewRecord) {
  const slideRows = reviewRecord.slides
    .map(
      (slideEntry) =>
        `| ${slideEntry.ordinal + 1} | \`${slideEntry.narrativeRole}\` | [PNG](generated/outputs/${slideEntry.canvasKey}.png) | [Design](generated/designs/${slideEntry.canvasKey}.json) |`,
    )
    .join("\n");
  return `# Carousel design review sample

**Status:** Awaiting human visual approval

**Delivery profile:** \`${DELIVERY_PROFILE_ID}\`

**Template:** \`${TEMPLATE.id}@${TEMPLATE.version}\`

**Format:** 1080 × 1440 Glyphkiln working canvas

![Six-slide carousel review board](generated/carousel-review-board.png)

## Review intent

This six-slide sample demonstrates a hook-to-action reading path, stable brand
grammar, phone-size type proof, explicit source notes, publisher-ready alt text,
and a dated advisory TikTok surface overlay. It makes no engagement promise and
does not claim that 3:4 is an official universal TikTok requirement.

| Slide | Narrative role | Render | Source document |
| ---: | --- | --- | --- |
${slideRows}

## Review records

- [Sequence review](generated/sequence-review.json)
- [Delivery sidecar](generated/delivery-sidecar.json)
- [Publishing copy and per-image alt text](generated/publishing-copy.json)
- [Complete render and device-proof record](generated/review-record.json)

The sequence has no blocking review errors. It intentionally retains one
\`COMPOSITION_RHYTHM_REVIEW\` warning because the registered template currently
offers one composition metadata identifier. Within that contract, the sample
uses content-responsive field alignment, alternating density, a statistic slide,
three deterministic pattern rails, and a quiet closing slide to create rhythm.

Whitespace is treated as a pacing tool, not an automatic defect: each retained
open area now supports one dominant reading path or makes room for a deliberate
pattern interrupt. The slide-number badge remains on every slide for orientation;
the header appears only on the opener, and the brand footer bookends the sequence.

Regenerate with \`npm run sample:carousel\` and verify exact bytes with
\`npm run sample:carousel:verify\`.
`;
}

async function emitJson(path, value) {
  const formatted = await prettier.format(JSON.stringify(value), { parser: "json" });
  await emit(path, formatted);
}

function round(value) {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
