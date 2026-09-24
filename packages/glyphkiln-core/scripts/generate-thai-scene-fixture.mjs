import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Resvg } from "@resvg/resvg-js";
import { sha256 } from "../dist/index.js";
import { renderScene, verifySceneReproduction } from "../dist/scene/index.js";

const root = resolve("fixtures/scene-thai");
const generated = resolve(root, "generated");
const verify = process.argv.includes("--verify");
const document = JSON.parse(
  await readFile(resolve(root, "thai-offer.scene.json"), "utf8"),
);
const bytes = new Uint8Array(await readFile(resolve(root, "font/NotoSansThai.ttf")));
const license = await readFile(resolve(root, "font/OFL.txt"), "utf8");
if (
  sha256(bytes) !== document.fonts[0].sha256 ||
  !license.includes("SIL OPEN FONT LICENSE Version 1.1")
) {
  throw new Error("The reviewed Thai font bytes or license changed.");
}
const fonts = document.fonts.map((font) => ({ ...font, bytes }));
const result = await renderScene(document, {
  formats: ["svg", "png"],
  fonts,
  creationTimestamp: "2026-09-24T00:00:00.000Z",
  reviewReadingOrder: true,
});
if (
  result.qualityIssues.some(
    (issue) =>
      issue.severity === "error" || issue.code === "SCENE_READING_ORDER_UNCOVERED",
  )
) {
  throw new Error(
    `Thai fixture has blocking review issues: ${JSON.stringify(result.qualityIssues)}`,
  );
}
const svg = result.outputs.find((output) => output.format === "svg");
const png = result.outputs.find((output) => output.format === "png");
if (svg === undefined || png === undefined) throw new Error("Missing fixture outputs.");
for (const output of [svg, png]) {
  if (
    verifySceneReproduction({
      document,
      bytes: output.bytes,
      manifest: output.manifest,
    }).length > 0
  ) {
    throw new Error(`Thai ${output.format} reproduction failed.`);
  }
}
const compact = new Resvg(svg.bytes, { fitTo: { mode: "width", value: 360 } })
  .render()
  .asPng();
const files = new Map([
  ["thai-offer.svg", svg.bytes],
  ["thai-offer.png", png.bytes],
  ["thai-offer-360.png", compact],
  ["thai-offer.svg.manifest.json", `${JSON.stringify(svg.manifest, null, 2)}\n`],
  ["thai-offer.png.manifest.json", `${JSON.stringify(png.manifest, null, 2)}\n`],
  ["thai-offer.evidence.json", `${JSON.stringify(result.evidence, null, 2)}\n`],
]);
if (!verify) await mkdir(generated, { recursive: true });
for (const [name, expected] of files) {
  const path = resolve(generated, name);
  if (verify) {
    const actual = await readFile(path);
    if (!actual.equals(Buffer.from(expected)))
      throw new Error(`Thai fixture ${name} differs from reviewed baseline.`);
  } else {
    await writeFile(path, expected);
  }
}
process.stdout.write(
  `${verify ? "Verified" : "Generated"} ${files.size} Thai scene fixture artifacts.\n`,
);
