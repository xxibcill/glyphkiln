// Cold-start probe for the HarfBuzz spike. Run in a fresh process; nothing is
// imported before the timer starts, so both shapers pay their module load.
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const name = process.argv[2];
const started = performance.now();
const shaper =
  name === "harfbuzz"
    ? await (await import("./oracles.mjs")).createHarfBuzzShaper()
    : (await import("../../dist/fonts/shaper.js")).fontkitShaper;
const loaded = performance.now();
const bytes = new Uint8Array(
  readFileSync(new URL("../../assets/fonts/Inter-Variable.ttf", import.meta.url)),
);
const face = shaper.instantiate(shaper.loadFace(bytes), { wght: 400 });
const run = shaper.shape(face, { text: "Glyphkiln" });
for (const glyph of run.glyphs) shaper.glyphOutline(face, glyph.id);
const finished = performance.now();
process.stdout.write(
  JSON.stringify({ moduleMs: loaded - started, firstShapeMs: finished - started }),
);
