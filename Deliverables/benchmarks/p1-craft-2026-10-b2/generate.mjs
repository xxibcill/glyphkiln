// P1 remainder (open-work item B2, without the font library) applied to the
// Kilnform set, with advisory craft reviews before (P1) and after (B2).
// Usage after building Core:
// node Deliverables/benchmarks/p1-craft-2026-10-b2/generate.mjs [--verify]
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";
import prettier from "prettier";

import {
  renderGraphic,
  reviewGraphicCraft,
} from "../../../packages/glyphkiln-core/dist/index.js";
import { createQualificationEmitter } from "../../../scripts/qualification-output.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const P0 = resolve(ROOT, "Deliverables/designer-stress-test-2026-09-25/designs");
const P1 = resolve(ROOT, "Deliverables/benchmarks/p1-craft-2026-10");
const OUT = resolve(ROOT, "Deliverables/benchmarks/p1-craft-2026-10-b2");
const TIMESTAMP = "2026-11-03T00:00:00.000Z";
const { emit } = createQualificationEmitter({
  repositoryRoot: ROOT,
  verify: process.argv.includes("--verify"),
});

const assetBytes = {
  "kilnform-lamp-campaign": new Uint8Array(
    await readFile(
      resolve(
        ROOT,
        "packages/glyphkiln-core/examples/assets/kilnform-lamp-campaign.png",
      ),
    ),
  ),
  "kilnform-mark": new Uint8Array(
    await readFile(
      resolve(ROOT, "packages/glyphkiln-core/examples/assets/kilnform-mark.png"),
    ),
  ),
};
const withBytes = (document) =>
  document.assets.map((asset) => ({ ...asset, bytes: assetBytes[asset.id] }));

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

/** Measured from the photograph: shade, finial and base of the lamp. */
const LAMP_SUBJECT = { x: 0.52, y: 0.09, width: 0.29, height: 0.745 };

function toSchema1_7(before, version) {
  const document = structuredClone(before);
  document.schemaVersion = "1.7.0";
  document.id = `${before.id.replace(/-p1$/, "")}-b2`;
  document.template = { ...before.template, version };
  return document;
}

function setLayer(document, type, values) {
  const layer = document.layers.find((candidate) => candidate.type === type);
  Object.assign(layer, values);
}

/**
 * Quote: quote-card@1.3.0. "a place to rest." carries the accent, so the
 * hanging mark steps back to the text role. The topographic layer is kept
 * without a job, so 1.3.0 does not draw it and reports DECORATION_WITHOUT_JOB.
 */
function quoteAfter(before) {
  const document = toSchema1_7(before, "1.3.0");
  setLayer(document, "headline", {
    emphasis: [{ phrase: "a place to rest.", style: "accent" }],
  });
  setLayer(document, "attribution", { openType: { caseSensitiveForms: true } });
  return document;
}

/**
 * Statistic: statistic-card@1.3.0. "three places" is set strong (Inter 900,
 * declared). The value fills the field; its ink exceeds the 8% accent budget,
 * so it is set in the figure color under an accent rule. The trend uses
 * tabular lining numerals by template default.
 */
function statisticAfter(before) {
  const document = toSchema1_7(before, "1.3.0");
  if (!document.fonts.some((font) => font.weight === 900)) {
    document.fonts.push({ ...document.fonts[0], weight: 900 });
  }
  setLayer(document, "headline", {
    emphasis: [{ phrase: "three places", style: "strong" }],
  });
  return document;
}

/**
 * Photo campaign: back to copy over the photograph, as in the 25 September
 * originals, but on image-led-campaign@1.2.0: the copy column goes beside the
 * declared lamp region and a local scrim darkens only behind the copy, so the
 * cobalt glaze is not dimmed. The last word carries the accent.
 */
const CAMPAIGN = {
  "campaign-instagram-square": {
    focalPoint: { x: 0.52, y: 0.5 },
    emphasis: [{ phrase: "glow.", style: "accent" }],
    keepTogether: ["Clay to"],
  },
  "campaign-instagram-portrait": {
    focalPoint: { x: 0.56, y: 0.48 },
    emphasis: [{ phrase: "glow.", style: "accent" }],
    keepTogether: ["Clay to"],
  },
  "campaign-linkedin-landscape": {
    focalPoint: { x: 0.68, y: 0.48 },
    emphasis: [{ phrase: "the glow.", style: "accent" }],
  },
};
function campaignAfter(p0, name) {
  const settings = CAMPAIGN[name];
  const document = toSchema1_7(p0, "1.2.0");
  document.id = `${p0.id}-b2`;
  setLayer(document, "image", {
    treatment: "local-dark-scrim",
    subjectRegion: LAMP_SUBJECT,
    focalPoint: settings.focalPoint,
  });
  setLayer(document, "headline", {
    emphasis: settings.emphasis,
    ...(settings.keepTogether === undefined
      ? {}
      : { keepTogether: settings.keepTogether }),
  });
  return document;
}

const CHANGED = [
  { name: "quote", after: (p1) => quoteAfter(p1) },
  { name: "statistic", after: (p1) => statisticAfter(p1) },
  ...Object.keys(CAMPAIGN).map((name) => ({
    name,
    after: (_p1, p0) => campaignAfter(p0, name),
  })),
];
// No B2 template versions exist for these; they are re-rendered from the P1
// designs and must stay byte-identical to the P1 outputs.
const UNCHANGED = [
  "announcement-b",
  ...["01", "02", "03", "04", "05", "06"].map((number) => `carousel-${number}`),
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

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function review(document) {
  return (
    await reviewGraphicCraft(document, { assets: withBytes(document) })
  ).findings.map(label);
}

async function emitFiles(name, document, svg, png) {
  await emit(
    resolve(OUT, "designs", `${name}.json`),
    await prettier.format(JSON.stringify(document), { parser: "json" }),
  );
  await emit(resolve(OUT, "outputs", `${name}.svg`), svg.bytes);
  await emit(resolve(OUT, "outputs", `${name}.png`), png.bytes);
  await emit(resolve(OUT, "phone-width", `${name}.png`), downscale(png.bytes, 360));
}

const summary = [];
for (const name of [...CHANGED.map((item) => item.name), ...UNCHANGED]) {
  const p1 = await loadJson(resolve(P1, "designs", `${name}.json`));
  const p0 = await loadJson(resolve(P0, `${name}.json`));
  const change = CHANGED.find((item) => item.name === name);
  const after = change === undefined ? p1 : change.after(p1, p0);
  const result = await renderGraphic(after, {
    formats: ["svg", "png"],
    assets: withBytes(after),
    creationTimestamp: TIMESTAMP,
  });
  const [svg, png] = result.outputs;
  if (change === undefined) {
    // Unchanged graphics are checked against the P1 files, not copied here.
    for (const [extension, output] of [
      ["svg", svg],
      ["png", png],
    ]) {
      const p1Bytes = new Uint8Array(
        await readFile(resolve(P1, "outputs", `${name}.${extension}`)),
      );
      if (!Buffer.from(p1Bytes).equals(Buffer.from(output.bytes))) {
        throw new Error(`${name}.${extension} no longer matches its P1 output.`);
      }
    }
  } else {
    await emitFiles(name, after, svg, png);
  }
  summary.push({
    design: name,
    p1: `${p1.template.id}@${p1.template.version}`,
    b2: `${after.template.id}@${after.template.version}`,
    changed: change !== undefined,
    ...(change === undefined
      ? { files: "identical to Deliverables/benchmarks/p1-craft-2026-10 (verified)" }
      : {}),
    qualityIssues: result.qualityIssues.map(
      (issue) => `${issue.severity} ${issue.code}`,
    ),
    craftP1: await review(p1),
    craftB2: await review(after),
    outputSha256: { svg: sha256(svg.bytes), png: sha256(png.bytes) },
  });
}

await emit(
  resolve(OUT, "craft-comparison.json"),
  await prettier.format(
    JSON.stringify({
      purpose:
        "B2 (P1 remainder without fonts) on the Kilnform set. Advisory craft-review findings at P1 and after B2 (policy craft-review 1.1.0); not audience or expert-comparison evidence.",
      summary,
    }),
    { parser: "json" },
  ),
);
for (const item of summary) {
  console.log(
    `${item.design}: ${item.craftP1.length} → ${item.craftB2.length} craft findings; quality: ${item.qualityIssues.join(", ") || "none"}`,
  );
}
