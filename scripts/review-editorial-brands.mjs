import prettier from "prettier";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderGraphic } from "../packages/glyphkiln-core/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const qualification = resolve(root, "docs/qualification/brand-fidelity-2026-08-18");
const positional = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const version = positional[0] ?? "1.1.1";
const output = resolve(positional[1] ?? `/private/tmp/glyphkiln-brands-${version}`);
await mkdir(output, { recursive: true });
const deliver = process.argv.includes("--deliver");
const verify = process.argv.includes("--verify");
const sourceRoot = resolve(root, "docs/qualification/reference-led-2026-09-25");
async function emit(path, bytes) {
  if (verify)
    assert.deepEqual(
      await readFile(path),
      Buffer.from(bytes),
      `Artifact drift: ${path}`,
    );
  else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
}
const artifactPath = (name, extension) =>
  deliver
    ? resolve(
        root,
        "Deliverables",
        extension.endsWith("json") ? "json" : extension,
        `refinement-${name}.${extension}`,
      )
    : resolve(output, `${name}.${extension}`);
const records = [];
for (const brand of ["kilnform", "morrow-field", "northline-works"]) {
  for (const format of [
    "linkedin-landscape",
    "instagram-square",
    "instagram-portrait",
  ]) {
    const name = `${brand}-${format}`;
    const document = JSON.parse(
      await readFile(resolve(qualification, `generated/designs/${name}.json`), "utf8"),
    );
    document.template.version = version;
    // These are independent art directions using existing, provenance-backed assets.
    document.mode = brand === "northline-works" ? "dark" : "light";
    const image = document.layers.find((layer) => layer.type === "image");
    image.treatment = "none";
    if (brand === "northline-works") image.focalPoint = { x: 0.62, y: 0.62 };
    if (brand === "morrow-field") image.focalPoint = { x: 0.5, y: 0.62 };
    if (brand === "kilnform") image.focalPoint = { x: 0.69, y: 0.48 };
    const assets = await Promise.all(
      document.assets.map(async (asset) => {
        const source = asset.origin.sourceReference;
        const path = source.includes("/images/")
          ? source.replace(/\.png$/, ".normalized.png")
          : source;
        return { ...asset, bytes: new Uint8Array(await readFile(resolve(root, path))) };
      }),
    );
    const family = document.fonts[0].family;
    const fontPath =
      family === "Fraunces"
        ? "fraunces/Fraunces-Variable.ttf"
        : "space-grotesk/SpaceGrotesk-Variable.ttf";
    const fonts =
      family === "Inter"
        ? []
        : await Promise.all(
            document.fonts.map(async (font) => ({
              ...font,
              bytes: new Uint8Array(
                await readFile(resolve(qualification, "assets/fonts", fontPath)),
              ),
            })),
          );
    const result = await renderGraphic(document, {
      assets,
      fonts,
      formats: ["png", "svg"],
      creationTimestamp: "2026-09-25T00:00:00.000Z",
    });
    assert.deepEqual(
      result.qualityIssues.filter((issue) => issue.severity === "error"),
      [],
    );
    for (const file of result.outputs) {
      await emit(artifactPath(name, file.format), file.bytes);
      await emit(
        artifactPath(name, `${file.format}.manifest.json`),
        await prettier.format(JSON.stringify(file.manifest), { parser: "json" }),
      );
    }
    await emit(
      resolve(deliver ? sourceRoot : output, `${name}.design.json`),
      await prettier.format(JSON.stringify(result.document), { parser: "json" }),
    );
    records.push({
      name,
      evidence: result.evidence,
      qualityIssues: result.qualityIssues,
    });
  }
}
await emit(
  resolve(deliver ? sourceRoot : output, "review.json"),
  await prettier.format(JSON.stringify(records), { parser: "json" }),
);
console.log(
  `${verify ? "Verified" : "Rendered"} ${records.length} brand/format combinations ${deliver ? "in Deliverables and the qualification record" : `in ${output}`}`,
);
