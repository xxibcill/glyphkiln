import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import {
  SCENE_DOCUMENT_VERSION,
  SCENE_KERNEL_VERSION,
  SCENE_RENDER_MANIFEST_VERSION,
  renderScene,
} from "../dist/scene/index.js";

const root = new URL("../", import.meta.url);
const fixtureDirectory = new URL("fixtures/scene-kernel/", root);
const generatedDirectory = new URL("generated/", fixtureDirectory);
const fixtureName = "editorial-decoder-spread-v1";
const sceneUrl = new URL(`${fixtureName}.scene.json`, fixtureDirectory);
const expectationsUrl = new URL(`${fixtureName}.expectations.json`, fixtureDirectory);
const pngUrl = new URL(`${fixtureName}.png`, generatedDirectory);
const svgManifestUrl = new URL(`${fixtureName}.svg.manifest.json`, generatedDirectory);
const pngManifestUrl = new URL(`${fixtureName}.png.manifest.json`, generatedDirectory);
const verify = process.argv.includes("--verify");
if (process.argv.length > 3 || (process.argv.length === 3 && !verify)) {
  throw new Error("Usage: generate-scene-kernel-fixture.mjs [--verify]");
}

const document = JSON.parse(await readFile(sceneUrl, "utf8"));
const currentExpectations = JSON.parse(await readFile(expectationsUrl, "utf8"));
const prettierOptions =
  (await prettier.resolveConfig(fileURLToPath(expectationsUrl))) ?? {};
const result = await renderScene(document, {
  formats: ["svg", "png"],
  creationTimestamp: "2026-08-29T00:00:00.000Z",
});
if (result.qualityIssues.length > 0) {
  throw new Error(
    `Scene Kernel fixture produced quality issues: ${JSON.stringify(result.qualityIssues)}`,
  );
}

const svg = outputFor(result.outputs, "svg");
const png = outputFor(result.outputs, "png");
const expectations = {
  ...currentExpectations,
  versions: {
    sceneSchemaVersion: SCENE_DOCUMENT_VERSION,
    sceneKernelVersion: SCENE_KERNEL_VERSION,
    rendererVersion: svg.manifest.renderer.version,
    sceneManifestVersion: SCENE_RENDER_MANIFEST_VERSION,
  },
  outputHashes: {
    svgSha256: svg.manifest.output.sha256,
    pngSha256: png.manifest.output.sha256,
  },
};
const files = [
  {
    url: expectationsUrl,
    contents: Buffer.from(await formatJson(expectations)),
    label: `${fixtureName}.expectations.json`,
  },
  {
    url: pngUrl,
    contents: Buffer.from(png.bytes),
    label: `${fixtureName}.png`,
  },
  {
    url: svgManifestUrl,
    contents: Buffer.from(await formatJson(svg.manifest)),
    label: `${fixtureName}.svg.manifest.json`,
  },
  {
    url: pngManifestUrl,
    contents: Buffer.from(await formatJson(png.manifest)),
    label: `${fixtureName}.png.manifest.json`,
  },
];

if (verify) {
  const stale = [];
  for (const file of files) {
    try {
      const committed = await readFile(file.url);
      if (!committed.equals(file.contents)) stale.push(file.label);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        stale.push(file.label);
        continue;
      }
      throw error;
    }
  }
  if (stale.length > 0) {
    throw new Error(
      `Scene Kernel fixture artifacts are stale: ${stale.join(", ")}. Run npm run scene-kernel-fixture:update.`,
    );
  }
  process.stdout.write(
    `Verified Scene Kernel fixture ${fixtureName}: SVG ${svg.manifest.output.sha256}, PNG ${png.manifest.output.sha256}.\n`,
  );
} else {
  await mkdir(generatedDirectory, { recursive: true });
  for (const file of files) await writeFile(file.url, file.contents);
  process.stdout.write(
    `Updated Scene Kernel fixture ${fixtureName}: SVG ${svg.manifest.output.sha256}, PNG ${png.manifest.output.sha256}.\n`,
  );
}

function outputFor(outputs, format) {
  const output = outputs.find((candidate) => candidate.format === format);
  if (output === undefined) throw new Error(`Missing ${format} fixture output.`);
  return output;
}

async function formatJson(value) {
  return prettier.format(JSON.stringify(value), {
    ...prettierOptions,
    parser: "json",
  });
}

function isNodeError(error) {
  return error instanceof Error && "code" in error;
}
