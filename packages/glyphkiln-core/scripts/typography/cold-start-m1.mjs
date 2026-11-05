// Cold-start probe for the M1 runtime shaper (ADR 0019 budget). Run in a
// fresh process: the timer starts before Core's HarfBuzz module is imported,
// so the module load, wasm hash check, instantiation, parsing Inter and the
// first shaped and outlined line are all counted.
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const name = process.argv[2];
const started = performance.now();
const shaper =
  name === "harfbuzz"
    ? await (await import("../../dist/fonts/harfbuzz.js")).loadHarfBuzzShaper()
    : (await import("../../dist/fonts/shaper.js")).fontkitShaper;
const bytes = new Uint8Array(
  readFileSync(new URL("../../assets/fonts/Inter-Variable.ttf", import.meta.url)),
);
const face = shaper.instantiate(shaper.loadFace(bytes), { wght: 400 });
const run = shaper.shape(face, { text: "Glyphkiln" });
for (const glyph of run.glyphs) shaper.glyphOutline(face, glyph.id);
process.stdout.write(JSON.stringify({ firstShapeMs: performance.now() - started }));
