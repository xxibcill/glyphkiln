import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import prettier from "prettier";
import { renderGraphic } from "../packages/glyphkiln-core/dist/index.js";

const root = resolve(import.meta.dirname, "..");
const verify = process.argv.includes("--verify");
const families = [
  "testimonial-evidence",
  "comparison",
  "problem-solution",
  "offer-urgency",
];
const names = families.flatMap((family) =>
  ["square", "portrait", "story", "landscape"].map((format) => `${family}-${format}`),
);
for (const name of names) {
  const source = await readFile(
    resolve(root, `packages/glyphkiln-core/tests/visual/baselines/${name}.design.json`),
  );
  const document = JSON.parse(source);
  const assets = await Promise.all(
    document.assets.map(async (asset) => ({
      ...asset,
      bytes: new Uint8Array(
        await readFile(
          resolve(root, `packages/glyphkiln-core/examples/assets/${asset.id}.png`),
        ),
      ),
    })),
  );
  const result = await renderGraphic(document, {
    assets,
    formats: ["svg", "png"],
    creationTimestamp: "2026-09-25T00:00:00.000Z",
  });
  await save(`json/${name}.design.json`, source);
  for (const output of result.outputs) {
    await save(`${output.format}/${name}.${output.format}`, output.bytes);
    await save(
      `json/${name}.${output.format}.manifest.json`,
      await prettier.format(JSON.stringify(output.manifest), { parser: "json" }),
    );
  }
}
console.log(
  verify
    ? "Static-ad proofs reproduce exactly."
    : "Wrote static-ad proofs to Deliverables/.",
);

async function save(relative, bytes) {
  const path = resolve(root, "Deliverables", relative);
  const expected = Buffer.from(bytes);
  if (verify) {
    if (!(await readFile(path)).equals(expected))
      throw new Error(`Proof drift: ${relative}`);
  } else {
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, expected);
  }
}
