import { Buffer } from "node:buffer";
import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  inspectDesignDocument,
  renderGraphic,
  validateDesignDocument,
} from "@glyphkiln/core";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultPaths = {
  designPath: join(projectDirectory, "designs/kiln-ledger.json"),
  generatedDirectory: join(projectDirectory, "generated"),
};
const creationTimestamp = "2026-07-31T00:00:00.000Z";
const outputBasename = "kiln-ledger";

if (isMainModule()) {
  await runShowcase(parseMode(process.argv.slice(2)));
}

/**
 * @typedef {{
 *   designPath: string;
 *   generatedDirectory: string;
 * }} ShowcasePaths
 */

/**
 * @param {"generate" | "verify"} mode
 * @param {ShowcasePaths} [paths]
 */
export async function runShowcase(mode, paths = defaultPaths) {
  const document = await loadValidatedDesign(paths.designPath);
  assertInspectionPasses(document);
  const result = await renderGraphic(document, {
    formats: ["svg", "png"],
    creationTimestamp,
  });
  assertExpectedOutputs(result.outputs);
  assertNoQualityIssues(result.qualityIssues);
  await mkdir(paths.generatedDirectory, { recursive: true });
  if (mode === "verify") {
    await assertGeneratedOutputSet(paths.generatedDirectory, result.outputs);
  }

  for (const output of result.outputs) {
    await persistOutput(output, mode, paths.generatedDirectory);
  }
  return result;
}

/**
 * @param {readonly string[]} arguments_
 * @returns {"generate" | "verify"}
 */
export function parseMode(arguments_) {
  const unexpected = arguments_.filter((argument) => argument !== "--verify");
  if (unexpected.length > 0) {
    throw new Error(`Unsupported argument: ${unexpected.join(", ")}`);
  }
  return arguments_.includes("--verify") ? "verify" : "generate";
}

function isMainModule() {
  const entryPath = process.argv[1];
  return (
    entryPath !== undefined && resolve(entryPath) === fileURLToPath(import.meta.url)
  );
}

/** @param {string} designPath */
async function loadValidatedDesign(designPath) {
  const input = JSON.parse(await readFile(designPath, "utf8"));
  const validation = validateDesignDocument(input);
  if (!validation.success) {
    throw new Error(`Design validation failed: ${JSON.stringify(validation.problems)}`);
  }
  return validation.data;
}

/** @param {import("@glyphkiln/core").DesignDocument} document */
function assertInspectionPasses(document) {
  const inspection = inspectDesignDocument(document);
  if (!inspection.textLayout.renderable) {
    throw new Error(
      `Text-layout inspection failed: ${JSON.stringify(inspection.textLayout)}`,
    );
  }
}

/** @param {readonly { format: string }[]} outputs */
export function assertExpectedOutputs(outputs) {
  const formats = outputs.map((output) => output.format);
  if (formats.length !== 2 || formats[0] !== "svg" || formats[1] !== "png") {
    throw new Error(
      `Expected exactly one SVG and one PNG, received: ${formats.join(", ")}`,
    );
  }
}

/**
 * @param {string} generatedDirectory
 * @param {readonly { format: string }[]} outputs
 */
async function assertGeneratedOutputSet(generatedDirectory, outputs) {
  const expectedFiles = outputs
    .flatMap((output) => [
      `${outputBasename}.${output.format}`,
      `${outputBasename}.${output.format}.manifest.json`,
    ])
    .sort();
  const actualFiles = (await readdir(generatedDirectory)).sort();
  const matches =
    actualFiles.length === expectedFiles.length &&
    actualFiles.every((file, index) => file === expectedFiles[index]);

  if (!matches) {
    throw new Error(
      `Generated output set does not match. Expected: ${expectedFiles.join(", ")}. Received: ${actualFiles.join(", ")}.`,
    );
  }
}

/** @param {readonly import("@glyphkiln/core").QualityIssue[]} issues */
function assertNoQualityIssues(issues) {
  if (issues.length > 0) {
    throw new Error(
      `Showcase must render without quality issues: ${JSON.stringify(issues)}`,
    );
  }
}

/**
 * @param {import("@glyphkiln/core").RenderedOutput} output
 * @param {"generate" | "verify"} mode
 * @param {string} generatedDirectory
 */
async function persistOutput(output, mode, generatedDirectory) {
  const outputPath = join(generatedDirectory, `${outputBasename}.${output.format}`);
  const manifestPath = `${outputPath}.manifest.json`;
  const bytes = Buffer.from(output.bytes);
  const manifest = `${JSON.stringify(output.manifest, null, 2)}\n`;

  if (mode === "verify") {
    await verifyFile(outputPath, bytes);
    await verifyTextFile(manifestPath, manifest);
  } else {
    await writeFile(outputPath, bytes);
    await writeFile(manifestPath, manifest, "utf8");
  }

  process.stdout.write(
    `${mode === "verify" ? "verified" : "generated"} ${basename(outputPath)} ${output.manifest.output.sha256}\n`,
  );
}

/**
 * @param {string} path
 * @param {Buffer} expected
 */
async function verifyFile(path, expected) {
  const committed = await readFile(path);
  if (!committed.equals(expected)) {
    throw new Error(`${basename(path)} does not match generated bytes.`);
  }
}

/**
 * @param {string} path
 * @param {string} expected
 */
async function verifyTextFile(path, expected) {
  const committed = await readFile(path, "utf8");
  if (committed !== expected) {
    throw new Error(`${basename(path)} manifest is stale.`);
  }
}
