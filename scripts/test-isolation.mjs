import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  GlyphkilnError,
  RENDER_RESOURCE_LIMITS,
  RENDERER_VERSION,
  renderGraphicIsolated,
} from "../dist/index.js";

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
      join(scriptsDirectory, "../node_modules"),
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
