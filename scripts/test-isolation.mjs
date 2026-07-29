import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  GlyphkilnError,
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

process.stdout.write("Isolated child-process rendering passed.\n");
