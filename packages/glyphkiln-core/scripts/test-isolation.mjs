import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  GlyphkilnError,
  RENDER_RESOURCE_LIMITS,
  RENDERER_VERSION,
  RENDER_WORKER_PROFILE,
  renderGraphicIsolated,
} from "../dist/index.js";
import { renderSceneIsolated } from "../dist/scene/index.js";

const require = createRequire(import.meta.url);
const dependenciesDirectory = dirname(dirname(require.resolve("zod/package.json")));
const document = JSON.parse(
  await readFile(new URL("../examples/article-cover.json", import.meta.url), "utf8"),
);
const creationTimestamp = "2026-07-29T10:00:00.000Z";
const result = await renderGraphicIsolated(document, {
  formats: ["svg", "png"],
  creationTimestamp,
});

assert.equal(result.outputs.length, 2);
assert.equal(result.outputs[0].manifest.renderer.version, RENDERER_VERSION);
assert.equal(result.outputs[0].manifest.creationTimestamp, creationTimestamp);
assert.deepEqual(
  [...result.outputs[1].bytes.slice(0, 8)],
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
);

await assert.rejects(
  renderGraphicIsolated(document, {}, { timeoutMilliseconds: 1 }),
  (error) => error instanceof GlyphkilnError && error.code === "RENDER_TIMEOUT",
);

await assert.rejects(
  renderGraphicIsolated({}),
  (error) =>
    error instanceof GlyphkilnError && error.code === "INVALID_DESIGN_DOCUMENT",
);

const unsupportedTextDocument = structuredClone(document);
unsupportedTextDocument.layers.find((layer) => layer.type === "headline").text =
  "\u05D0";
await assert.rejects(
  renderGraphicIsolated(unsupportedTextDocument),
  (error) =>
    error instanceof GlyphkilnError &&
    error.code === "QUALITY_VALIDATION_FAILED" &&
    error.details.textLayout.totalDiagnostics === 1 &&
    error.details.textLayout.retainedDiagnostics === 1 &&
    error.details.textLayout.truncated === false &&
    error.details.issues.some(
      (issue) =>
        issue.code === "BIDI_LAYOUT_UNSUPPORTED" &&
        issue.details.fieldPath === "/layers/3/text",
    ),
);

assert.throws(
  () =>
    renderGraphicIsolated(document, {
      assets: [
        {
          id: "oversized",
          mimeType: "image/png",
          sha256: "0".repeat(64),
          width: 1,
          height: 1,
          origin: { kind: "unknown" },
          bytes: new Uint8Array(RENDER_RESOURCE_LIMITS.maxAssetBytes + 1),
        },
      ],
    }),
  (error) =>
    error instanceof GlyphkilnError && error.code === "ASSET_BYTES_LIMIT_EXCEEDED",
);

assert.throws(
  () =>
    renderGraphicIsolated(document, {
      creationTimestamp: "x".repeat(
        RENDER_RESOURCE_LIMITS.maxCreationTimestampBytes + 1,
      ),
    }),
  (error) =>
    error instanceof GlyphkilnError &&
    error.code === "CREATION_TIMESTAMP_LIMIT_EXCEEDED",
);

assert.throws(
  () =>
    renderGraphicIsolated(document, {
      formats: Array.from(
        { length: RENDER_RESOURCE_LIMITS.maxOutputFormats + 1 },
        () => "svg",
      ),
    }),
  (error) =>
    error instanceof GlyphkilnError && error.code === "OUTPUT_FORMAT_LIMIT_EXCEEDED",
);

await verifySymlinkedDependencyIsolation(document);

const scene = JSON.parse(
  await readFile(
    new URL(
      "../fixtures/scene-kernel/editorial-decoder-spread-v1.scene.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const isolatedScene = await renderSceneIsolated(scene, {
  formats: ["svg"],
  creationTimestamp,
});
assert.equal(isolatedScene.outputs[0].manifest.input.kind, "scene");
assert.equal(isolatedScene.evidence.version, "1.0.0");
await assert.rejects(
  renderSceneIsolated(scene, {}, { timeoutMilliseconds: 1 }),
  (error) => error instanceof GlyphkilnError && error.code === "RENDER_TIMEOUT",
);
await assert.rejects(
  renderSceneIsolated({ ...scene, elements: [] }),
  (error) => error instanceof GlyphkilnError && error.code === "INVALID_SCENE_DOCUMENT",
);
assert.throws(
  () =>
    renderSceneIsolated(scene, {
      assets: [
        {
          id: "oversized",
          mimeType: "image/png",
          sha256: "0".repeat(64),
          width: 1,
          height: 1,
          origin: { kind: "unknown" },
          bytes: new Uint8Array(RENDER_RESOURCE_LIMITS.maxAssetBytes + 1),
        },
      ],
    }),
  (error) =>
    error instanceof GlyphkilnError && error.code === "ASSET_BYTES_LIMIT_EXCEEDED",
);
await assert.rejects(
  renderSceneIsolated(scene, {
    fonts: [
      {
        family: "Broken",
        weight: 400,
        style: "normal",
        sha256: "0".repeat(64),
        bytes: new Uint8Array([1, 2, 3]),
      },
    ],
  }),
  (error) => error instanceof GlyphkilnError && error.code !== undefined,
);
assert.equal(RENDER_WORKER_PROFILE.nodeResourceLimits.maxOldGenerationSizeMb, 256);
await verifySceneWorkerFailure(scene);

process.stdout.write("Isolated child-process rendering passed.\n");

async function verifySymlinkedDependencyIsolation(input) {
  const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
  const temporaryRoot = await mkdtemp(
    join(scriptsDirectory, "../.glyphkiln-isolation-linked-"),
  );
  const packageRoot = join(temporaryRoot, "package");
  try {
    await mkdir(packageRoot);
    await Promise.all([
      cp(join(scriptsDirectory, "../dist"), join(packageRoot, "dist"), {
        recursive: true,
      }),
      cp(join(scriptsDirectory, "../assets"), join(packageRoot, "assets"), {
        recursive: true,
      }),
      cp(join(scriptsDirectory, "../package.json"), join(packageRoot, "package.json")),
    ]);
    await symlink(
      dependenciesDirectory,
      join(packageRoot, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const linkedPackage = await import(
      pathToFileURL(join(packageRoot, "dist/index.js")).href
    );
    const linkedResult = await linkedPackage.renderGraphicIsolated(input, {
      formats: ["svg"],
      creationTimestamp,
    });
    assert.equal(linkedResult.outputs[0].format, "svg");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function verifySceneWorkerFailure(input) {
  const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
  const temporaryRoot = await mkdtemp(
    join(scriptsDirectory, "../.glyphkiln-scene-worker-"),
  );
  const packageRoot = join(temporaryRoot, "package");
  try {
    await mkdir(packageRoot);
    await Promise.all([
      cp(join(scriptsDirectory, "../dist"), join(packageRoot, "dist"), {
        recursive: true,
      }),
      cp(join(scriptsDirectory, "../assets"), join(packageRoot, "assets"), {
        recursive: true,
      }),
      cp(join(scriptsDirectory, "../package.json"), join(packageRoot, "package.json")),
    ]);
    await symlink(
      dependenciesDirectory,
      join(packageRoot, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const isolated = await import(
      pathToFileURL(join(packageRoot, "dist/scene/index.js")).href
    );
    const workerPath = join(packageRoot, "dist/isolation/render-process.js");
    await writeFile(workerPath, "process.exit(7);\n");
    await assert.rejects(
      isolated.renderSceneIsolated(input),
      (error) => error?.code === "RENDER_PROCESS_EXITED",
    );
    await writeFile(
      workerPath,
      "const blocks = []; function fill() { for (let i = 0; i < 20; i++) blocks.push(new Array(100000).fill('memory')); setImmediate(fill); } fill();\n",
    );
    await assert.rejects(
      isolated.renderSceneIsolated(input),
      (error) => error?.code === "RENDER_PROCESS_EXITED",
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
