import { mkdir, readFile, writeFile } from "node:fs/promises";
import prettier from "prettier";

const root = new URL("../", import.meta.url);
const outputDirectory = new URL("fixtures/schema-conformance/", root);
const base = JSON.parse(
  await readFile(new URL("examples/product-announcement.json", root), "utf8"),
);
const cases = [
  {
    name: "valid",
    document: structuredClone(base),
    jsonSchemaValid: true,
    runtimeValid: true,
  },
  {
    name: "duplicate-layer-id",
    document: mutate((document) => {
      document.layers[1].id = document.layers[0].id;
    }),
    jsonSchemaValid: true,
    runtimeValid: false,
  },
  {
    name: "quiet-region-sum",
    document: mutate((document) => {
      const layer = document.layers.find(
        (candidate) => candidate.type === "procedural-decoration",
      );
      layer.quietRegion.x = 0.8;
      layer.quietRegion.width = 0.3;
    }),
    jsonSchemaValid: true,
    runtimeValid: false,
  },
];

await mkdir(outputDirectory, { recursive: true });
for (const entry of cases) {
  entry.document.id = `schema-conformance-${entry.name}`;
  await writeFile(
    new URL(`${entry.name}.json`, outputDirectory),
    await prettier.format(JSON.stringify(entry.document), { parser: "json" }),
    "utf8",
  );
}
await writeFile(
  new URL("expectations.json", outputDirectory),
  await prettier.format(
    JSON.stringify(
      Object.fromEntries(
        cases.map(({ name, jsonSchemaValid, runtimeValid }) => [
          name,
          { jsonSchemaValid, runtimeValid },
        ]),
      ),
    ),
    { parser: "json" },
  ),
  "utf8",
);
process.stdout.write(`Wrote ${cases.length} schema conformance documents.\n`);

function mutate(callback) {
  const document = structuredClone(base);
  callback(document);
  return document;
}
