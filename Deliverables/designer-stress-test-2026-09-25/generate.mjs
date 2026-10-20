import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import {
  DELIVERY_PROFILE_REGISTRY,
  createCampaignCanvasKey,
  createCampaignDirectionKey,
  createCarouselDeliverySidecar,
  deriveCampaignSeeds,
  renderGraphic,
  reviewCarouselSequence,
  sha256,
  verifyRenderReproduction,
} from "../../packages/glyphkiln-core/dist/index.js";
import {
  createQualificationEmitter,
  outlineText,
  renderSvg,
} from "../../scripts/qualification-output.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "Deliverables/designer-stress-test-2026-09-25");
const TIMESTAMP = "2026-09-25T00:00:00.000Z";
const VERIFY = process.argv.includes("--verify");
const { emit, repositoryPath } = createQualificationEmitter({
  repositoryRoot: ROOT,
  verify: VERIFY,
});
const fontBytes = new Uint8Array(
  await readFile(
    resolve(ROOT, "packages/glyphkiln-core/assets/fonts/Inter-Variable.ttf"),
  ),
);
const fontHash = sha256(fontBytes);
const imageBase = JSON.parse(
  await readFile(
    resolve(ROOT, "packages/glyphkiln-core/examples/image-led-campaign.json"),
    "utf8",
  ),
);
const imageBytes = new Uint8Array(
  await readFile(
    resolve(ROOT, "packages/glyphkiln-core/examples/assets/kilnform-lamp-campaign.png"),
  ),
);
const logoBytes = new Uint8Array(
  await readFile(
    resolve(ROOT, "packages/glyphkiln-core/examples/assets/kilnform-mark.png"),
  ),
);
const assets = imageBase.assets.map((asset) => ({
  ...asset,
  bytes: asset.id === "kilnform-lamp-campaign" ? imageBytes : logoBytes,
}));
const brand = structuredClone(imageBase.brand);
brand.snapshotId = "brand-kilnform-second-firing-2026-09";
brand.preferredProceduralStyles = [
  "layered-waves",
  "recursive-subdivision",
  "topographic-contours",
  "flow-field",
];

const cases = [];
const carouselSlides = [];

for (const spec of quickSpecs()) {
  const document = {
    schemaVersion: "1.4.0",
    id: `designer-day-${spec.id}`,
    template: spec.template,
    format: spec.format,
    seed: `designer-day-second-firing-${spec.id}-v1`,
    mode: spec.mode,
    brand,
    assets: [],
    fonts: declaredFonts(),
    layers: spec.layers,
    metadata: {
      brief: "fictional-kilnform-second-firing",
      task: spec.task,
      revision: spec.revision ?? "final",
      factualBasis: "Fictional client brief; no external performance claims.",
    },
  };
  cases.push(await renderCase(spec.id, document, []));
}

const directionKey = createCampaignDirectionKey("second-firing-editorial");
for (const [format, focalPoint] of [
  ["linkedin-landscape", { x: 0.68, y: 0.48 }],
  ["instagram-square", { x: 0.52, y: 0.5 }],
  ["instagram-portrait", { x: 0.58, y: 0.48 }],
]) {
  const id = `campaign-${format}`;
  const seeds = deriveCampaignSeeds({
    campaignSeed: "fictional-kilnform-second-firing-2026-09",
    familyId: "image-led-campaign",
    directionKey,
    canvasKey: createCampaignCanvasKey(id),
    template: { id: "image-led-campaign", version: "1.0.1" },
    format,
    compositionVariantId: "focal-editorial",
  });
  const document = {
    schemaVersion: "1.4.0",
    id: `designer-day-${id}`,
    template: { id: "image-led-campaign", version: "1.0.1" },
    format,
    seed: seeds.canvasSeed,
    mode: "dark",
    brand,
    assets: imageBase.assets,
    fonts: declaredFonts(),
    layers: [
      {
        id: "campaign-image",
        type: "image",
        assetId: "kilnform-lamp-campaign",
        alt: "A cobalt ceramic table lamp on a warm plaster pedestal.",
        fit: "cover",
        focalPoint,
        treatment: "dark-scrim",
      },
      {
        id: "brand-mark",
        type: "logo",
        assetId: "kilnform-mark",
        alt: "Kilnform arch mark.",
        fit: "contain",
      },
      {
        id: "headline",
        type: "headline",
        text:
          format === "linkedin-landscape"
            ? "Make room for the glow."
            : "Clay to\nglow.",
      },
    ],
    metadata: {
      brief: "fictional-kilnform-second-firing",
      direction: "second-firing-editorial",
      directionSeed: seeds.directionSeed,
      canvas: id,
      task: "image-led-cross-format-adaptation",
    },
  };
  cases.push(await renderCase(id, document, assets));
}
await emitJson(resolve(OUT, "campaign/publishing-copy.json"), {
  version: "1.0.0",
  status: "fictional-internal-proof",
  caption:
    "The Studio Lamp returns in cobalt ceramic. A sculptural pool of light for the corners you keep. Meet the Second Firing from Kilnform.",
  images: [
    {
      format: "linkedin-landscape",
      altText:
        "Cobalt ceramic table lamp on a warm plaster pedestal. Editorial text at left reads: Make room for the glow. Small Kilnform mark above.",
    },
    {
      format: "instagram-square",
      altText:
        "Cobalt ceramic table lamp on a warm plaster pedestal. Editorial text at left reads: Clay to glow. Small Kilnform mark above.",
    },
    {
      format: "instagram-portrait",
      altText:
        "Portrait crop of a cobalt ceramic table lamp on a warm plaster pedestal. Editorial text at left reads: Clay to glow. Small Kilnform mark above.",
    },
  ],
});

const slideSpecs = [
  {
    role: "hook",
    mode: "dark",
    headline: "One lamp. Three places to pause.",
    eyebrow: "KILNFORM / THE PLACEMENT EDIT",
    cta: "SWIPE FOR THE THREE CORNERS →",
    footer: "THE STUDIO LAMP / SECOND FIRING",
  },
  {
    role: "context",
    mode: "light",
    headline: "Choose the moment first.",
    subtitle: "Name the pause you need.",
    pattern: "recursive-subdivision",
  },
  {
    role: "evidence",
    mode: "dark",
    headline: "Three corners.\nOne warm glow.",
    statistic: {
      value: "03",
      label: "desk · bedside · entry",
      trend: "three places to try",
    },
    pattern: "topographic-contours",
  },
  {
    role: "explanation",
    mode: "light",
    headline: "Give the shade room to breathe.",
    subtitle: "Set it beside the task.\nLeave space for the shade.",
    pattern: "layered-waves",
  },
  {
    role: "recap",
    mode: "dark",
    headline: "Keep the lamp.\nShift the mood.",
    subtitle: "Desk for focus. Bedside for calm. Entry for a soft welcome.",
    pattern: "flow-field",
  },
  {
    role: "action",
    mode: "light",
    headline: "Make room.",
    cta: "MEET THE STUDIO LAMP →",
    footer: "KILNFORM / SECOND FIRING",
  },
];

for (const [ordinal, spec] of slideSpecs.entries()) {
  const number = ordinal + 1;
  const canvasKey = `carousel-${String(number).padStart(2, "0")}`;
  const seeds = deriveCampaignSeeds({
    campaignSeed: "fictional-kilnform-placement-edit-2026-09",
    familyId: "image-led-campaign",
    directionKey,
    canvasKey: createCampaignCanvasKey(canvasKey),
    template: { id: "tiktok-carousel-slide", version: "1.0.4" },
    format: "tiktok-photo-carousel",
    compositionVariantId: "organic-photo-editorial",
  });
  const document = {
    schemaVersion: "1.4.0",
    id: `designer-day-${canvasKey}`,
    template: { id: "tiktok-carousel-slide", version: "1.0.4" },
    format: "tiktok-photo-carousel",
    seed: seeds.canvasSeed,
    mode: spec.mode,
    brand,
    assets: [],
    fonts: declaredFonts(),
    layers: [
      { id: "background", type: "background" },
      ...(spec.pattern === undefined
        ? []
        : [
            {
              id: "pattern-rail",
              type: "procedural-decoration",
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
        text: `${String(number).padStart(2, "0")} / 06`,
      },
      ...(spec.eyebrow ? [{ id: "eyebrow", type: "eyebrow", text: spec.eyebrow }] : []),
      { id: "headline", type: "headline", text: spec.headline },
      ...(spec.subtitle
        ? [{ id: "subtitle", type: "subtitle", text: spec.subtitle }]
        : []),
      ...(spec.statistic
        ? [{ id: "placement-count", type: "statistic", ...spec.statistic }]
        : []),
      ...(spec.cta ? [{ id: "cta", type: "cta", text: spec.cta }] : []),
      ...(spec.footer ? [{ id: "footer", type: "footer", text: spec.footer }] : []),
    ],
    metadata: {
      brief: "fictional-kilnform-second-firing",
      sequence: "placement-edit",
      slideNumber: number,
      narrativeRole: spec.role,
      directionSeed: seeds.directionSeed,
    },
  };
  const result = await renderCase(canvasKey, document, []);
  cases.push(result);
  carouselSlides.push({
    document: result.document,
    ordinal,
    narrativeRole: spec.role,
    compositionVariantId: "organic-photo-editorial",
    altText: wholeSlideAlt(number, spec),
    sourceNotes:
      spec.role === "evidence"
        ? [{ label: "Fictional Kilnform client brief: three placement concepts" }]
        : [],
  });
}

const sequence = {
  deliveryProfileId: "tiktok-organic-photo",
  slides: carouselSlides,
};
const sequenceReview = reviewCarouselSequence(sequence);
if (!sequenceReview.success) {
  throw new Error(`Carousel sequence review failed: ${JSON.stringify(sequenceReview)}`);
}
const sidecar = createCarouselDeliverySidecar(sequence);
await emitJson(resolve(OUT, "carousel/sequence-review.json"), sequenceReview);
await emitJson(resolve(OUT, "carousel/delivery-sidecar.json"), sidecar);

for (const [boardId, names, columns, cellWidth, cellHeight] of [
  [
    "quick",
    ["announcement-a", "announcement-b", "statistic", "quote", "article-cover"],
    3,
    560,
    520,
  ],
  [
    "campaign",
    [
      "campaign-linkedin-landscape",
      "campaign-instagram-square",
      "campaign-instagram-portrait",
    ],
    3,
    700,
    750,
  ],
  [
    "carousel",
    slideSpecs.map((_, index) => `carousel-${String(index + 1).padStart(2, "0")}`),
    3,
    430,
    650,
  ],
]) {
  const boardSvg = makeBoard(
    boardId,
    names.map((name) => cases.find((entry) => entry.id === name)),
    columns,
    cellWidth,
    cellHeight,
  );
  await emit(resolve(OUT, `boards/${boardId}-review.svg`), boardSvg);
  await emit(resolve(OUT, `boards/${boardId}-review.png`), renderSvg(boardSvg));
}

const review = {
  version: "1.0.0",
  brief: "Fictional Kilnform Second Firing designer day",
  timestamp: TIMESTAMP,
  approvalState: "awaiting-human-visual-review",
  assetSources: {
    image: "packages/glyphkiln-core/examples/assets/kilnform-lamp-campaign.png",
    logo: "packages/glyphkiln-core/examples/assets/kilnform-mark.png",
    note: "Existing fictional project assets reused for this workflow stress test.",
  },
  deliveryProfile: DELIVERY_PROFILE_REGISTRY["tiktok-organic-photo"],
  cases: cases.map(({ document, pngBytes, ...entry }) => entry),
  carousel: {
    review: sequenceReview,
    sidecarPath:
      "Deliverables/designer-stress-test-2026-09-25/carousel/delivery-sidecar.json",
    altText: carouselSlides.map(({ ordinal, altText, narrativeRole }) => ({
      ordinal,
      narrativeRole,
      altText,
    })),
  },
};
await emitJson(resolve(OUT, "review-record.json"), review);
process.stdout.write(
  `${VERIFY ? "Verified" : "Generated"} ${cases.length} designs with SVG, PNG, manifests, three review boards, and a ${carouselSlides.length}-slide sequence.\n`,
);
process.stdout.write(
  `Carousel: ${sequenceReview.success ? "pass" : "fail"}, ${sequenceReview.issues.length} warning(s).\n`,
);

function declaredFonts() {
  return [400, 500, 600, 700, 800].map((weight) => ({
    family: "Inter",
    weight,
    style: "normal",
    sha256: fontHash,
  }));
}

function quickSpecs() {
  const background = { id: "background", type: "background" };
  return [
    {
      id: "announcement-a",
      task: "rapid-product-announcement",
      revision: "option-a",
      template: { id: "product-announcement", version: "1.1.1" },
      format: "linkedin-landscape",
      mode: "dark",
      layers: [
        background,
        {
          id: "waves",
          type: "procedural-decoration",
          style: "layered-waves",
          intensity: 0.45,
          density: 0.55,
          complexity: 0.42,
          contrast: 0.38,
          quietRegion: { x: 0.04, y: 0.12, width: 0.7, height: 0.62 },
        },
        { id: "eyebrow", type: "eyebrow", text: "KILNFORM / SECOND FIRING" },
        { id: "headline", type: "headline", text: "The Studio Lamp returns." },
        {
          id: "subtitle",
          type: "subtitle",
          text: "A warm new chapter in cobalt ceramic.",
        },
        { id: "cta", type: "cta", text: "EXPLORE THE LAMP →" },
      ],
    },
    {
      id: "announcement-b",
      task: "client-copy-revision",
      revision: "selected-v2",
      template: { id: "product-announcement", version: "1.1.1" },
      format: "linkedin-landscape",
      mode: "dark",
      layers: [
        background,
        {
          id: "waves",
          type: "procedural-decoration",
          style: "layered-waves",
          intensity: 0.45,
          density: 0.55,
          complexity: 0.42,
          contrast: 0.38,
          quietRegion: { x: 0.04, y: 0.12, width: 0.7, height: 0.62 },
        },
        { id: "eyebrow", type: "eyebrow", text: "KILNFORM / SECOND FIRING" },
        {
          id: "headline",
          type: "headline",
          text: "The Studio Lamp returns in cobalt ceramic.",
        },
        {
          id: "subtitle",
          type: "subtitle",
          text: "A warm new chapter for the corners you keep.",
        },
        { id: "cta", type: "cta", text: "MEET THE STUDIO LAMP →" },
      ],
    },
    {
      id: "statistic",
      task: "number-led-social-post",
      template: { id: "statistic-card", version: "1.1.0" },
      format: "instagram-square",
      mode: "dark",
      layers: [
        background,
        {
          id: "grid",
          type: "procedural-decoration",
          style: "recursive-subdivision",
          intensity: 0.38,
          density: 0.44,
          complexity: 0.36,
          contrast: 0.26,
          quietRegion: { x: 0.04, y: 0.31, width: 0.92, height: 0.54 },
        },
        { id: "headline", type: "headline", text: "One lamp, three places to pause" },
        {
          id: "placement-count",
          type: "statistic",
          value: "03",
          label: "desk · bedside · entry",
          trend: "three places to try",
        },
      ],
    },
    {
      id: "quote",
      task: "editorial-quote-card",
      template: { id: "quote-card", version: "1.1.0" },
      format: "instagram-portrait",
      mode: "dark",
      layers: [
        background,
        {
          id: "contours",
          type: "procedural-decoration",
          style: "topographic-contours",
          intensity: 0.42,
          density: 0.5,
          complexity: 0.5,
          contrast: 0.34,
          quietRegion: { x: 0.08, y: 0.18, width: 0.84, height: 0.68 },
        },
        {
          id: "quote",
          type: "headline",
          text: "Light should give a room a place to rest.",
        },
        { id: "attribution", type: "attribution", text: "KILNFORM STUDIO NOTE" },
      ],
    },
    {
      id: "article-cover",
      task: "editorial-story-cover",
      template: { id: "article-cover", version: "1.1.0" },
      format: "youtube-thumbnail",
      mode: "dark",
      layers: [
        background,
        {
          id: "flow",
          type: "procedural-decoration",
          style: "flow-field",
          intensity: 0.42,
          density: 0.52,
          complexity: 0.58,
          contrast: 0.29,
          quietRegion: { x: 0.04, y: 0.34, width: 0.78, height: 0.58 },
        },
        { id: "eyebrow", type: "eyebrow", text: "KILNFORM JOURNAL" },
        {
          id: "headline",
          type: "headline",
          text: "Where a small lamp changes the room",
        },
        { id: "byline", type: "attribution", text: "A STUDIO GUIDE · 4 MIN READ" },
      ],
    },
  ];
}

async function renderCase(id, document, suppliedAssets) {
  const result = await renderGraphic(document, {
    formats: ["svg", "png"],
    assets: suppliedAssets,
    fonts: [],
    creationTimestamp: TIMESTAMP,
  });
  const errors = result.qualityIssues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) throw new Error(`${id}: ${JSON.stringify(errors)}`);
  const outputInfo = {};
  let pngBytes;
  for (const output of result.outputs) {
    const path = resolve(OUT, `outputs/${id}.${output.format}`);
    await emit(path, output.bytes);
    await emitJson(`${path}.manifest.json`, output.manifest);
    const reproductionIssues = verifyRenderReproduction({
      document: result.document,
      bytes: output.bytes,
      manifest: output.manifest,
    });
    if (reproductionIssues.length > 0) {
      throw new Error(
        `${id} ${output.format} failed reproduction: ${JSON.stringify(reproductionIssues)}`,
      );
    }
    outputInfo[output.format] = {
      path: repositoryPath(path),
      sha256: output.manifest.output.sha256,
      fingerprint: output.fingerprint,
      byteSize: output.bytes.byteLength,
    };
    if (output.format === "png") pngBytes = output.bytes;
  }
  const documentPath = resolve(OUT, `designs/${id}.json`);
  await emitJson(documentPath, result.document);
  const safe = result.evidence.safeArea;
  const textProof = result.evidence.text.map((textEntry) => ({
    layerId: textEntry.layerId,
    fontSize: textEntry.fontSize,
    overflow: textEntry.overflow,
    bounds: textEntry.bounds,
    inSafeArea:
      textEntry.bounds.x >= safe.x - 0.001 &&
      textEntry.bounds.y >= safe.y - 0.001 &&
      textEntry.bounds.x + textEntry.bounds.width <= safe.x + safe.width + 0.001 &&
      textEntry.bounds.y + textEntry.bounds.height <= safe.y + safe.height + 0.001,
    deliveredAt390Px: Math.round((textEntry.fontSize * 390 * 100) / 1080) / 100,
  }));
  if (textProof.some((proof) => proof.overflow || !proof.inSafeArea)) {
    throw new Error(`${id} failed text-bound proof.`);
  }
  if (
    result.evidence.contrast.some((item) => item.minimumRatio < item.minimumRequired)
  ) {
    throw new Error(`${id} failed contrast proof.`);
  }
  return {
    id,
    document: result.document,
    documentPath: repositoryPath(documentPath),
    format: result.document.format,
    template: result.document.template,
    qualityIssues: result.qualityIssues,
    evidence: {
      safeArea: safe,
      text: textProof,
      crops: result.evidence.crops,
      contrast: result.evidence.contrast,
    },
    outputs: outputInfo,
    pngBytes,
  };
}

function wholeSlideAlt(number, spec) {
  const parts = [
    `Slide ${number} of 6, ${spec.role}.`,
    `${spec.mode === "dark" ? "Dark" : "Light"} Kilnform editorial card.`,
    `Headline: ${spec.headline}`,
  ];
  if (spec.subtitle) parts.push(spec.subtitle);
  if (spec.statistic) parts.push("Three placement ideas: desk, bedside, and entry.");
  if (spec.cta) parts.push(`Action: ${spec.cta}`);
  return parts.join(" ");
}

function makeBoard(title, entries, columns, cellWidth, cellHeight) {
  const margin = 50;
  const gap = 30;
  const header = 125;
  const rows = Math.ceil(entries.length / columns);
  const width = margin * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = header + margin + rows * cellHeight + (rows - 1) * gap;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#171311"/>`,
    `<path d="${outlineText(fontBytes, `KILNFORM / ${title.toUpperCase()} REVIEW`, {
      x: margin,
      baseline: 82,
      fontSize: 44,
      weight: 700,
      letterSpacing: 1,
    })}" fill="#FFF6E7"/>`,
  ];
  for (const [index, entry] of entries.entries()) {
    if (!entry) throw new Error(`Missing board entry ${index}.`);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (cellWidth + gap);
    const y = header + row * (cellHeight + gap);
    const imagePad = 15;
    const labelHeight = 58;
    const availableWidth = cellWidth - imagePad * 2;
    const availableHeight = cellHeight - labelHeight - imagePad * 2;
    const png = entry.pngBytes;
    const dimensions =
      entry.document.format === "linkedin-landscape"
        ? { width: 1200, height: 627 }
        : entry.document.format === "instagram-square"
          ? { width: 1080, height: 1080 }
          : entry.document.format === "instagram-portrait"
            ? { width: 1080, height: 1350 }
            : entry.document.format === "youtube-thumbnail"
              ? { width: 1280, height: 720 }
              : { width: 1080, height: 1440 };
    const scale = Math.min(
      availableWidth / dimensions.width,
      availableHeight / dimensions.height,
    );
    const imageWidth = dimensions.width * scale;
    const imageHeight = dimensions.height * scale;
    const imageX = x + (cellWidth - imageWidth) / 2;
    const imageY = y + imagePad + (availableHeight - imageHeight) / 2;
    parts.push(
      `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="15" fill="#312823"/>`,
    );
    parts.push(
      `<image x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" href="data:image/png;base64,${Buffer.from(png).toString("base64")}"/>`,
    );
    parts.push(
      `<path d="${outlineText(fontBytes, entry.id.toUpperCase(), {
        x: x + 20,
        baseline: y + cellHeight - 21,
        fontSize: 24,
        weight: 700,
        letterSpacing: 0.4,
      })}" fill="#FFF6E7"/>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}

async function emitJson(path, value) {
  await emit(path, await prettier.format(JSON.stringify(value), { parser: "json" }));
}
