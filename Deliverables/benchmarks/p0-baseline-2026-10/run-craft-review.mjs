// Advisory craft review of the Kilnform designer stress test (P0 baseline).
// Usage, after building Core: node Deliverables/benchmarks/p0-baseline-2026-10/run-craft-review.mjs [--verify]
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import {
  CRAFT_REVIEW_POLICY_VERSION,
  reviewFormatSet,
  reviewGraphicCraft,
} from "../../../packages/glyphkiln-core/dist/index.js";
import { reviewSceneCraft } from "../../../packages/glyphkiln-core/dist/scene/index.js";
import { createQualificationEmitter } from "../../../scripts/qualification-output.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE = resolve(ROOT, "Deliverables/designer-stress-test-2026-09-25");
const OUT = resolve(ROOT, "Deliverables/benchmarks/p0-baseline-2026-10");
const { emit } = createQualificationEmitter({
  repositoryRoot: ROOT,
  verify: process.argv.includes("--verify"),
});

const assetFiles = {
  "kilnform-lamp-campaign":
    "packages/glyphkiln-core/examples/assets/kilnform-lamp-campaign.png",
  "kilnform-mark": "packages/glyphkiln-core/examples/assets/kilnform-mark.png",
};

async function resolveAssets(declarations) {
  return Promise.all(
    declarations.map(async (declaration) => ({
      ...declaration,
      bytes: new Uint8Array(await readFile(resolve(ROOT, assetFiles[declaration.id]))),
    })),
  );
}

function findingLabel(finding) {
  return finding.elementId === undefined
    ? `${finding.code} (${finding.details.scope ?? "canvas"})`
    : `${finding.code} ${finding.elementId}`;
}

const reviews = [];
const names = (await readdir(resolve(SOURCE, "designs")))
  .filter((name) => name.endsWith(".json"))
  .sort();
for (const name of names) {
  const document = JSON.parse(await readFile(resolve(SOURCE, "designs", name), "utf8"));
  const assets = await resolveAssets(document.assets);
  const review = await reviewGraphicCraft(document, { assets });
  // Desktop-feed sensitivity: the same design viewed 600 px wide.
  const desktop = await reviewGraphicCraft(document, {
    assets,
    thresholds: { displayWidth: 600 },
  });
  reviews.push({
    design: `designs/${name}`,
    template: `${document.template.id}@${document.template.version}`,
    format: document.format,
    review,
    desktopFindings: desktop.findings.map(findingLabel),
  });
}

const scene = JSON.parse(await readFile(resolve(SOURCE, "scene/scene.json"), "utf8"));
// The diagram's declared accent is its clay stage color.
const sceneOptions = { accentColors: ["#A34F37"] };
reviews.push({
  design: "scene/scene.json",
  template: "scene-kernel",
  format: `${scene.dimensions.width}x${scene.dimensions.height}`,
  review: await reviewSceneCraft(scene, sceneOptions),
  desktopFindings: (
    await reviewSceneCraft(scene, {
      ...sceneOptions,
      thresholds: { displayWidth: 600 },
    })
  ).findings.map(findingLabel),
});

// Set-level review: the three campaign formats are one design.
const formatSet = reviewFormatSet(
  reviews
    .filter(({ design }) => design.startsWith("designs/campaign-"))
    .map(({ format, review }) => ({ format, review })),
);

const summary = reviews.map(({ design, review, desktopFindings }) => ({
  design,
  findings: review.findings.map(findingLabel),
  desktopFindings,
}));

const json = await prettier.format(
  JSON.stringify(
    {
      purpose: `Advisory craft heuristics (policy craft-review ${CRAFT_REVIEW_POLICY_VERSION}) applied to the Kilnform stress-test designs. Findings are review prompts, not quality verdicts or audience results.`,
      displayWidths: { primary: 360, desktopSensitivity: 600 },
      summary,
      formatSets: {
        campaign: {
          findings: formatSet.findings.map(
            (finding) =>
              `${finding.code} ${finding.details.formats.join(" / ")} (${finding.details.layoutDistance})`,
          ),
          review: formatSet,
        },
      },
      reviews,
    },
    null,
    2,
  ),
  { parser: "json" },
);
await emit(resolve(OUT, "craft-review.json"), json);
console.log(`campaign format set → ${formatSet.findings.length}`);
for (const item of summary) {
  console.log(
    `${item.design}: 360 px → ${item.findings.length}, 600 px → ${item.desktopFindings.length}`,
  );
}
