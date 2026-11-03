import prettier from "prettier";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderGraphic,
  reviewCarouselSequence,
} from "../packages/glyphkiln-core/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = resolve(root, "packages/glyphkiln-core");
const outputRoot = resolve(root, "Deliverables");
const names = [
  "split-editorial-landscape-balanced",
  "split-editorial-square-balanced",
  "split-editorial-portrait-balanced",
  "image-carousel-balanced",
  "image-carousel-metric-balanced",
];
const readDesign = async (name) =>
  JSON.parse(
    await readFile(resolve(core, `tests/visual/baselines/${name}.design.json`), "utf8"),
  );
const examples = await Promise.all(
  names.map(async (name) => ({
    name: `refinement-${name}`,
    document: await readDesign(name),
  })),
);
const sequence = [];
for (let ordinal = 0; ordinal < 3; ordinal += 1) {
  const document = await readDesign("image-carousel-balanced");
  document.id = `refinement-story-${ordinal + 1}`;
  document.fonts.push(
    { ...document.fonts[0], weight: 500 },
    { ...document.fonts[0], weight: 600 },
  );
  const text = (type, value) => {
    document.layers.find((layer) => layer.type === type).text = value;
  };
  text("badge", `0${ordinal + 1} / 03`);
  if (ordinal === 0) {
    text("subtitle", "A cobalt base. A pale shade. One sculptural silhouette.");
    text("cta", "MEET THE FORM →");
  } else if (ordinal === 1) {
    document.layers = document.layers.filter((layer) => layer.type !== "image");
    document.assets = [];
    document.mode = "dark";
    text("headline", "Color gives the form its weight.");
    text("subtitle", "Cobalt curves meet a warm, quiet field.");
    text("cta", "A DIFFERENT POINT OF VIEW →");
  } else {
    document.mode = "dark";
    text("headline", "Make room for a new perspective.");
    text("subtitle", "Explore the Kilnform series.");
    text("cta", "EXPLORE SERIES 01 →");
  }
  examples.push({ name: document.id, document });
  sequence.push({
    document,
    ordinal,
    narrativeRole: ordinal === 0 ? "hook" : ordinal === 1 ? "context" : "action",
    compositionVariantId: "organic-photo-editorial",
    altText:
      ordinal === 1
        ? "An editorial text slide about the lamp's cobalt curves."
        : "A cobalt ceramic lamp against a warm wall, followed by editorial copy.",
  });
}
const review = reviewCarouselSequence({
  deliveryProfileId: "tiktok-organic-photo",
  slides: sequence,
});
if (
  !review.success ||
  review.issues.some((issue) => issue.code === "COMPOSITION_RHYTHM_REVIEW")
)
  throw new Error(JSON.stringify(review));

for (const extension of ["png", "svg", "json", "html"])
  await mkdir(resolve(outputRoot, extension), { recursive: true });
for (const { name, document } of examples) {
  const assets = await Promise.all(
    document.assets.map(async (declaration) => ({
      ...declaration,
      bytes: new Uint8Array(
        await readFile(resolve(core, `examples/assets/${declaration.id}.png`)),
      ),
    })),
  );
  const result = await renderGraphic(document, {
    formats: ["svg", "png"],
    assets,
    creationTimestamp: "2026-09-25T00:00:00.000Z",
  });
  if (result.qualityIssues.some((issue) => issue.severity === "error"))
    throw new Error(`Render failed: ${name}`);
  for (const output of result.outputs) {
    await writeFile(
      resolve(outputRoot, output.format, `${name}.${output.format}`),
      output.bytes,
    );
    await writeFile(
      resolve(outputRoot, "json", `${name}.${output.format}.manifest.json`),
      await prettier.format(JSON.stringify(output.manifest), { parser: "json" }),
    );
  }
}
await writeFile(
  resolve(outputRoot, "json", "refinement-story.review.json"),
  await prettier.format(JSON.stringify(review), { parser: "json" }),
);
const brandExamples = ["kilnform", "morrow-field", "northline-works"].flatMap((brand) =>
  ["linkedin-landscape", "instagram-square", "instagram-portrait"].map((format) => ({
    name: `refinement-${brand}-${format}`,
  })),
);
const card = ({ name }) =>
  `<figure><a href="../png/${name}.png"><img src="../png/${name}.png" alt="${name.replaceAll("-", " ")}" loading="lazy"></a><figcaption>${name.replace("refinement-", "").replaceAll("-", " ")} · <a href="../svg/${name}.svg">SVG</a> · <a href="../json/${name}.png.manifest.json">Manifest</a></figcaption></figure>`;
await writeFile(
  resolve(outputRoot, "html", "reference-led-review.html"),
  await prettier.format(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Glyphkiln · Reference-led refinement</title><style>body{margin:0;background:#f1efe8;color:#20251f;font:16px/1.5 system-ui}main{max-width:1144px;padding:48px 28px;margin:auto}h1{font:clamp(36px,5vw,72px)/1.05 Georgia,serif;max-width:950px;margin:16px 0}h2{font:32px Georgia,serif;margin-top:64px}p{max-width:760px}a{color:#254c3c}section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start}figure{margin:0}img{width:100%;display:block;border:1px solid #d7d4ca}figcaption{padding:12px 0;font-size:14px}small{letter-spacing:.12em;text-transform:uppercase}.wide{grid-column:1/-1;max-width:900px}@media(max-width:700px){section{grid-template-columns:1fr}main{padding:28px 18px}}</style><main><small>Glyphkiln / research to renderer / 25 September 2026</small><h1>Give the image a role.<br>Give the story room.</h1><p>Template version 1.1.1: larger display type, deliberate subject windows, and a shared editorial system for image and typography slides. Reviewed across three fictional brands, three typefaces, and four delivery formats. References inform the design requirements; their artwork is not reused.</p><p><a href="../graphic-design-reference-research-2026-09-25/index.html">Browse the 120-project reference library</a></p><h2>Three brands, three art directions</h2><p>Inter and cobalt ceramic lighting; Fraunces and botanical still life; Space Grotesk and urban equipment. Each uses the same deterministic renderer with its own brand roles and reviewed focal point.</p><section>${brandExamples.map(card).join("")}</section><h2>One campaign, three formats</h2><section>${examples.slice(0, 3).map(card).join("")}</section><h2>A sequence with image and typography</h2><p>The middle slide changes pace through oversized typography. Header, numbering, and action stay aligned across the sequence.</p><section>${examples.slice(5).map(card).join("")}</section><h2>Supporting information</h2><section>${examples.slice(3, 5).map(card).join("")}</section><p>Exact versioned baselines are retained in the Core test suite; three-brand inputs and render evidence are in docs/qualification/reference-led-2026-09-25. Older template versions remain available. Focal crops still need a designer's judgment; this pass does not provide print production, multi-page layout, or animation.</p></main></html>`,
    { parser: "html" },
  ),
);
console.log(
  `Rendered ${examples.length} reviewed examples to Deliverables/{png,svg,json}; review page: Deliverables/html/reference-led-review.html`,
);
