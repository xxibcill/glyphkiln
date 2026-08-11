import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import prettier from "prettier";

const root = new URL("../", import.meta.url);
const outputDirectory = new URL("fixtures/schema-conformance/", root);
const mode = parseMode(process.argv.slice(2));
const base = JSON.parse(
  await readFile(new URL("examples/product-announcement.json", root), "utf8"),
);
const imageLed = JSON.parse(
  await readFile(new URL("examples/image-led-campaign.json", root), "utf8"),
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
  {
    name: "current-valid",
    document: mutateImageLed(() => {}),
    jsonSchemaValid: true,
    runtimeValid: true,
  },
  {
    name: "current-mislabeled-as-legacy",
    document: mutateImageLed((document) => {
      document.schemaVersion = "1.3.0";
    }),
    jsonSchemaValid: false,
    runtimeValid: false,
  },
];

const generatedFiles = [];
for (const entry of cases) {
  entry.document.id = `schema-conformance-${entry.name}`;
  generatedFiles.push({
    name: `${entry.name}.json`,
    contents: await prettier.format(JSON.stringify(entry.document), {
      parser: "json",
    }),
  });
}
generatedFiles.push({
  name: "expectations.json",
  contents: await prettier.format(
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
});

if (mode === "verify") {
  const expectedFileNames = new Set(generatedFiles.map((file) => file.name));
  const staleFiles = (await readJsonFileNames(outputDirectory)).filter(
    (name) => !expectedFileNames.has(name),
  );
  for (const file of generatedFiles) {
    try {
      const current = await readFile(new URL(file.name, outputDirectory), "utf8");
      if (current !== file.contents) staleFiles.push(file.name);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        staleFiles.push(file.name);
        continue;
      }
      throw error;
    }
  }
  if (staleFiles.length > 0) {
    process.stderr.write(
      `Schema conformance artifacts are stale: ${staleFiles.join(", ")}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Verified ${cases.length} schema conformance documents and expectations.\n`,
    );
  }
} else {
  await mkdir(outputDirectory, { recursive: true });
  for (const file of generatedFiles) {
    await writeFile(new URL(file.name, outputDirectory), file.contents, "utf8");
  }
  process.stdout.write(`Wrote ${cases.length} schema conformance documents.\n`);
}

function mutate(callback) {
  const document = structuredClone(base);
  callback(document);
  return document;
}

function mutateImageLed(callback) {
  const document = structuredClone(imageLed);
  callback(document);
  return document;
}

function parseMode(args) {
  if (args.length === 0) return "update";
  if (args.length === 1 && args[0] === "--verify") return "verify";
  throw new Error("Usage: generate-schema-conformance.mjs [--verify]");
}

function isNodeError(error) {
  return error instanceof Error && "code" in error;
}

async function readJsonFileNames(directory) {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}
