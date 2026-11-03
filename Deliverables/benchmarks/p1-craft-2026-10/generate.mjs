// P1 craft repairs applied to three Kilnform stress-test graphics, with
// advisory craft reviews before and after. Usage after building Core:
// node Deliverables/benchmarks/p1-craft-2026-10/generate.mjs [--verify]
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";
import prettier from "prettier";

import {
  CRAFT_REVIEW_POLICY_VERSION,
  renderGraphic,
  reviewFormatSet,
  reviewGraphicCraft,
} from "../../../packages/glyphkiln-core/dist/index.js";
import { createQualificationEmitter } from "../../../scripts/qualification-output.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE = resolve(ROOT, "Deliverables/designer-stress-test-2026-09-25/designs");
const OUT = resolve(ROOT, "Deliverables/benchmarks/p1-craft-2026-10");
const TIMESTAMP = "2026-10-22T00:00:00.000Z";
const { emit } = createQualificationEmitter({
  repositoryRoot: ROOT,
  verify: process.argv.includes("--verify"),
});

const lampBytes = new Uint8Array(
  await readFile(
    resolve(ROOT, "packages/glyphkiln-core/examples/assets/kilnform-lamp-campaign.png"),
  ),
);
const markBytes = new Uint8Array(
  await readFile(
    resolve(ROOT, "packages/glyphkiln-core/examples/assets/kilnform-mark.png"),
  ),
);
const campaign = JSON.parse(
  await readFile(resolve(SOURCE, "campaign-instagram-square.json"), "utf8"),
);
const lampAsset = campaign.assets.find(
  (asset) => asset.id === "kilnform-lamp-campaign",
);
const markAsset = campaign.assets.find((asset) => asset.id === "kilnform-mark");
const assetBytes = { "kilnform-lamp-campaign": lampBytes, "kilnform-mark": markBytes };

async function load(name) {
  return JSON.parse(await readFile(resolve(SOURCE, `${name}.json`), "utf8"));
}

/** Announcement B: show the product instead of procedural waves. */
function announcementAfter(before) {
  const document = structuredClone(before);
  document.id = "designer-day-announcement-b-p1";
  document.template = { id: "product-announcement", version: "1.2.0" };
  document.assets = [lampAsset];
  // Delivered-size repair (critique AN-4): the subtitle cannot survive a 360 px
  // phone feed, so it moves to the post caption, as brief K1 permits, and is
  // recorded in craft-comparison.json. Product name and material stay unbroken.
  document.layers = document.layers
    .filter(
      (layer) => layer.type !== "procedural-decoration" && layer.type !== "subtitle",
    )
    .map((layer) => {
      if (layer.type === "headline") {
        return { ...layer, keepTogether: ["Studio Lamp", "cobalt ceramic."] };
      }
      return layer;
    })
    .concat([
      {
        id: "product",
        type: "product-screenshot",
        visible: true,
        assetId: lampAsset.id,
        alt: "A cobalt ceramic table lamp on a warm plaster pedestal.",
        fit: "contain",
      },
    ]);
  return document;
}

function upgrade(before, version) {
  const document = structuredClone(before);
  document.id = `${before.id}-p1`;
  document.template = { ...before.template, version };
  return document;
}

/**
 * Photo campaign: recompose each format on the separated image/copy template
 * that already exists (image-led-campaign@1.1.1) instead of overlaying copy on a
 * globally darkened photograph. With no copy on the photo, the scrim has no job,
 * so the cobalt glaze is shown at full strength. The square crop's focal point
 * moves right so the whole shade stays in frame.
 */
function campaignAfter(before) {
  const document = structuredClone(before);
  document.id = `${before.id}-p1`;
  document.template = { ...before.template, version: "1.1.1" };
  document.layers = document.layers.map((layer) =>
    layer.type === "image"
      ? {
          ...layer,
          treatment: "none",
          ...(before.format === "instagram-square"
            ? { focalPoint: { x: 0.62, y: layer.focalPoint?.y ?? 0.5 } }
            : {}),
        }
      : layer,
  );
  return document;
}

/**
 * Carousel: re-author on tiktok-carousel-slide@1.1.1, which accepts an
 * optional photograph, so the lamp appears on the cover, the "three corners"
 * slide, and the final call to action. Procedural decoration is removed (it
 * had no subject job), and slide 05 keeps its two sentences whole.
 */
const CAROUSEL_IMAGE_SLIDES = new Set(["carousel-01", "carousel-03", "carousel-06"]);
function carouselAfter(before) {
  const document = structuredClone(before);
  document.id = `${before.id}-p1`;
  document.template = { ...before.template, version: "1.1.1" };
  document.layers = document.layers
    .filter((layer) => layer.type !== "procedural-decoration")
    .map((layer) =>
      layer.type === "headline" && before.id.endsWith("carousel-05")
        ? { ...layer, keepTogether: ["Keep the lamp.", "Shift the mood."] }
        : layer,
    );
  const slide = before.id.replace("designer-day-", "");
  if (CAROUSEL_IMAGE_SLIDES.has(slide)) {
    document.assets = [lampAsset];
    document.layers.push({
      id: "lamp",
      type: "image",
      visible: true,
      assetId: lampAsset.id,
      alt: "A cobalt ceramic table lamp on a warm plaster pedestal.",
      fit: "cover",
      focalPoint: { x: 0.62, y: 0.5 },
      treatment: "none",
    });
  }
  return document;
}

const cases = [
  { name: "announcement-b", after: announcementAfter },
  { name: "quote", after: (before) => upgrade(before, "1.2.0") },
  { name: "statistic", after: (before) => upgrade(before, "1.2.0") },
  { name: "campaign-linkedin-landscape", after: campaignAfter },
  { name: "campaign-instagram-square", after: campaignAfter },
  { name: "campaign-instagram-portrait", after: campaignAfter },
  ...["01", "02", "03", "04", "05", "06"].map((number) => ({
    name: `carousel-${number}`,
    after: carouselAfter,
  })),
];

function downscale(bytes, width) {
  const source = PNG.sync.read(Buffer.from(bytes));
  const scale = source.width / width;
  const height = Math.round(source.height / scale);
  const target = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      const sum = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const offset = (sy * source.width + sx) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            sum[channel] += source.data[offset + channel];
          }
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        target.data[offset + channel] = Math.round(sum[channel] / count);
      }
    }
  }
  return new Uint8Array(PNG.sync.write(target, { colorType: 6 }));
}

function label(finding) {
  return finding.elementId === undefined
    ? `${finding.code} (${finding.details.scope ?? "canvas"})`
    : `${finding.code} ${finding.elementId}`;
}

const summary = [];
const campaignReviews = { before: [], after: [] };
for (const item of cases) {
  const before = await load(item.name);
  const after = item.after(before);
  const assets = after.assets.map((asset) => ({
    ...asset,
    bytes: assetBytes[asset.id],
  }));
  const result = await renderGraphic(after, {
    formats: ["svg", "png"],
    assets,
    creationTimestamp: TIMESTAMP,
  });
  const [svg, png] = result.outputs;
  await emit(
    resolve(OUT, "designs", `${item.name}.json`),
    await prettier.format(JSON.stringify(after), { parser: "json" }),
  );
  await emit(resolve(OUT, "outputs", `${item.name}.svg`), svg.bytes);
  await emit(resolve(OUT, "outputs", `${item.name}.png`), png.bytes);
  await emit(
    resolve(OUT, "phone-width", `${item.name}.png`),
    downscale(png.bytes, 360),
  );
  const reviewBefore = await reviewGraphicCraft(before, {
    assets: before.assets.map((asset) => ({ ...asset, bytes: assetBytes[asset.id] })),
  });
  const reviewAfter = await reviewGraphicCraft(after, { assets });
  if (item.name.startsWith("campaign-")) {
    campaignReviews.before.push({ format: before.format, review: reviewBefore });
    campaignReviews.after.push({ format: after.format, review: reviewAfter });
  }
  summary.push({
    design: item.name,
    before: `${before.template.id}@${before.template.version}`,
    after: `${after.template.id}@${after.template.version}`,
    qualityIssues: result.qualityIssues.map(
      (issue) => `${issue.severity} ${issue.code}`,
    ),
    craftBefore: reviewBefore.findings.map(label),
    craftAfter: reviewAfter.findings.map(label),
    outputSha256: { svg: svg.manifest.outputHash, png: png.manifest.outputHash },
    ...(item.name === "announcement-b"
      ? {
          copyMovedToCaption: before.layers.find((layer) => layer.type === "subtitle")
            ?.text,
        }
      : {}),
  });
}

function formatSetSummary(entries) {
  const review = reviewFormatSet(entries);
  return {
    findings: review.findings.map(
      (finding) =>
        `${finding.code} ${finding.details.formats.join(" / ")} (${finding.details.layoutDistance})`,
    ),
    pairs: review.metrics.pairs.map((pair) => ({
      formats: pair.formats,
      layoutDistance: pair.layoutDistance,
      sameReadingOrder: pair.sameReadingOrder,
    })),
  };
}
const campaignFormatSet = {
  before: formatSetSummary(campaignReviews.before),
  after: formatSetSummary(campaignReviews.after),
};

await emit(
  resolve(OUT, "craft-comparison.json"),
  await prettier.format(
    JSON.stringify({
      purpose: `P1 craft repairs on three Kilnform graphics. Advisory craft-review findings before and after (policy ${CRAFT_REVIEW_POLICY_VERSION}); not audience or expert-comparison evidence.`,
      summary,
      campaignFormatSet,
    }),
    { parser: "json" },
  ),
);
console.log(
  `campaign format set: ${campaignFormatSet.before.findings.length} → ${campaignFormatSet.after.findings.length} findings`,
);
for (const item of summary) {
  console.log(
    `${item.design}: ${item.craftBefore.length} → ${item.craftAfter.length} craft findings; quality: ${item.qualityIssues.join(", ") || "none"}`,
  );
}
