import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import process from "node:process";

import { renderGraphic } from "../dist/index.js";

const examples = [
  "product-announcement",
  "statistic-card",
  "quote-card",
  "article-cover",
];
const outputDirectory = resolve("examples/generated");
await mkdir(outputDirectory, { recursive: true });

for (const name of examples) {
  const document = JSON.parse(await readFile(resolve(`examples/${name}.json`), "utf8"));
  const result = await renderGraphic(document, { formats: ["svg", "png"] });
  for (const output of result.outputs) {
    const outputPath = resolve(outputDirectory, `${name}.${output.format}`);
    await writeFile(outputPath, output.bytes);
    await writeFile(
      `${outputPath}.manifest.json`,
      `${JSON.stringify(output.manifest, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${basename(outputPath)} ${output.manifest.output.sha256}\n`);
  }
}
