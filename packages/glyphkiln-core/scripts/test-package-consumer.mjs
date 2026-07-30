import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const typescriptCompiler = require.resolve("typescript/bin/tsc");
const temporaryRoot = await mkdtemp(join(tmpdir(), "glyphkiln-consumer-"));
const consumerDirectory = join(temporaryRoot, "consumer");

try {
  await mkdir(consumerDirectory);
  const archive = await packArchive();
  await writeFile(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify({
      name: "glyphkiln-package-consumer",
      private: true,
      type: "module",
    })}\n`,
  );
  await execFileAsync(
    "npm",
    [
      "install",
      archive,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    { cwd: consumerDirectory },
  );
  await cp(
    join(root, "examples/article-cover.json"),
    join(consumerDirectory, "design.json"),
  );
  await writeConsumerSources();
  await runJavaScriptConsumer();
  await runTypeScriptConsumer();
  await runCliConsumer();
  process.stdout.write(
    "Fresh tarball JavaScript, TypeScript, CLI, and isolated consumers passed.\n",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function packArchive() {
  const { stdout } = await execFileAsync(
    "npm",
    ["pack", "--pack-destination", temporaryRoot, "--silent"],
    { cwd: root },
  );
  const archiveName = stdout.trim().split(/\r?\n/).at(-1);
  if (archiveName === undefined || archiveName.length === 0) {
    throw new Error("npm pack did not report an archive name.");
  }
  return join(temporaryRoot, archiveName);
}

async function writeConsumerSources() {
  await writeFile(
    join(consumerDirectory, "consumer.mjs"),
    `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  TEXT_LAYOUT_DIAGNOSTICS_VERSION,
  analyzeTextLayoutSupport,
  inspectDesignDocument,
  renderGraphic,
  renderGraphicIsolated,
} from "@glyphkiln/core";

const document = JSON.parse(await readFile(new URL("./design.json", import.meta.url)));
assert.equal(
  analyzeTextLayoutSupport("Latin").version,
  TEXT_LAYOUT_DIAGNOSTICS_VERSION,
);
const direct = await renderGraphic(document, { formats: ["svg"] });
const isolated = await renderGraphicIsolated(document, { formats: ["png"] });
assert.ok(direct.outputs[0].bytes.length > 0);
assert.ok(isolated.outputs[0].bytes.length > 0);

const unsupported = structuredClone(document);
unsupported.layers.find((layer) => layer.type === "headline").text = "\\u05D0";
assert.equal(inspectDesignDocument(unsupported).textLayout.renderable, false);
await assert.rejects(
  renderGraphic(unsupported),
  (error) =>
    error.code === "QUALITY_VALIDATION_FAILED" &&
    error.details.textLayout.totalDiagnostics === 1 &&
    error.details.textLayout.retainedDiagnostics === 1 &&
    error.details.textLayout.truncated === false &&
    error.details.issues.some((issue) => issue.code === "BIDI_LAYOUT_UNSUPPORTED"),
);
await assert.rejects(
  import("@glyphkiln/core/typography/text-layout"),
  (error) => error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
`,
  );
  await writeFile(
    join(consumerDirectory, "consumer.ts"),
    `import {
  TEXT_LAYOUT_DIAGNOSTICS_VERSION,
  analyzeTextLayoutSupport,
  type DesignTextLayoutDiagnostic,
  type DesignTextLayoutInspection,
  type TextLayoutAnalysis,
  type TextLayoutDiagnostic,
  type TextLayoutDiagnosticCode,
  type TextLayoutMatch,
  type TextLayoutMatchProperty,
} from "@glyphkiln/core";

const analysis: TextLayoutAnalysis = analyzeTextLayoutSupport("Latin");
const code: TextLayoutDiagnosticCode = "BIDI_LAYOUT_UNSUPPORTED";
const property: TextLayoutMatchProperty = "Bidi_Class=R";
const match: TextLayoutMatch = { codePoint: 0x05d0, scalarIndex: 0, property };
const diagnostic: TextLayoutDiagnostic = {
  code,
  message: "fixed",
  totalMatches: 1,
  matches: [match],
  truncated: false,
};
const designDiagnostic: DesignTextLayoutDiagnostic = {
  ...diagnostic,
  layerId: "headline",
  layerType: "headline",
  fieldPath: "/layers/0/text",
  visible: true,
  blocksRender: true,
};
const inspection: DesignTextLayoutInspection = {
  version: TEXT_LAYOUT_DIAGNOSTICS_VERSION,
  renderable: false,
  totalDiagnostics: 1,
  diagnostics: [designDiagnostic],
  truncated: false,
};
void [analysis, inspection];
`,
  );
  await writeFile(
    join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["consumer.ts"],
    })}\n`,
  );
}

async function runJavaScriptConsumer() {
  await execFileAsync(process.execPath, ["consumer.mjs"], {
    cwd: consumerDirectory,
  });
}

async function runTypeScriptConsumer() {
  await execFileAsync(process.execPath, [typescriptCompiler, "-p", "tsconfig.json"], {
    cwd: consumerDirectory,
  });
}

async function runCliConsumer() {
  const cli = join(consumerDirectory, "node_modules/@glyphkiln/core/dist/cli/index.js");
  const inspection = await execFileAsync(process.execPath, [
    cli,
    "inspect",
    join(consumerDirectory, "design.json"),
  ]);
  assert.equal(JSON.parse(inspection.stdout).textLayout.renderable, true);

  const unsupported = JSON.parse(
    await readFile(join(consumerDirectory, "design.json"), "utf8"),
  );
  unsupported.layers.find((layer) => layer.type === "headline").text = "\u05D0";
  const unsupportedPath = join(consumerDirectory, "unsupported.json");
  await writeFile(unsupportedPath, `${JSON.stringify(unsupported)}\n`);
  await assert.rejects(
    execFileAsync(process.execPath, [
      cli,
      "render",
      unsupportedPath,
      "--format",
      "svg",
      "--output",
      join(consumerDirectory, "blocked.svg"),
    ]),
    (error) =>
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      error.stderr.includes("BIDI_LAYOUT_UNSUPPORTED"),
  );
}
