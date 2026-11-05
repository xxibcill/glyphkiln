// ADR 0019 pre-ship budgets for the M1 HarfBuzz shaper, checked in CI:
//   - cold: first shaped and outlined line <= 100 ms in a fresh process;
//   - warm shaping per corpus line no slower than fontkit 2.0.4;
//   - warm outlines (per-face cache) at most 2x fontkit's.
// Wall-clock numbers on shared machines vary; the test takes medians and
// allows one re-measurement before failing, and prints the numbers.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { loadHarfBuzzShaper } from "../dist/fonts/harfbuzz.js";
import { fontkitShaper } from "../dist/fonts/shaper.js";

const execFileAsync = promisify(execFile);
const COLD_BUDGET_MS = 100;

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

function lines() {
  const out = [];
  for (const name of ["c-lat", "c-th", "c-mix"]) {
    const corpus = JSON.parse(
      readFileSync(
        new URL(`../tests/typography/corpora/${name}.json`, import.meta.url),
        "utf8",
      ),
    );
    for (const entry of corpus.entries)
      out.push({ text: entry.text, latin: name === "c-lat" });
  }
  return out;
}

async function cold(name) {
  const runs = [];
  for (let index = 0; index < 5; index += 1) {
    const { stdout } = await execFileAsync(process.execPath, [
      new URL("./typography/cold-start-m1.mjs", import.meta.url).pathname,
      name,
    ]);
    runs.push(JSON.parse(stdout).firstShapeMs);
  }
  return median(runs);
}

function warm(shaper) {
  const inter = readFileSync(
    new URL("../assets/fonts/Inter-Variable.ttf", import.meta.url),
  );
  const thai = readFileSync(
    new URL(
      "../assets/fonts/notosansthai/NotoSansThai[wdth,wght].ttf",
      import.meta.url,
    ),
  );
  const faces = {
    latin: shaper.instantiate(shaper.loadFace(inter), { wght: 400 }),
    thai: shaper.instantiate(shaper.loadFace(thai), { wght: 400 }),
  };
  const corpus = lines();
  const shapeRounds = [];
  const outlineRounds = [];
  for (let iteration = 0; iteration < 9; iteration += 1) {
    let started = performance.now();
    const runs = corpus.map((line) =>
      shaper.shape(line.latin ? faces.latin : faces.thai, { text: line.text }),
    );
    shapeRounds.push(((performance.now() - started) * 1000) / corpus.length);
    started = performance.now();
    for (const [index, run] of runs.entries()) {
      const face = corpus[index].latin ? faces.latin : faces.thai;
      for (const glyph of run.glyphs) shaper.glyphOutline(face, glyph.id);
    }
    outlineRounds.push(((performance.now() - started) * 1000) / corpus.length);
  }
  return {
    shapeMicroseconds: median(shapeRounds.slice(2)),
    outlineMicroseconds: median(outlineRounds.slice(2)),
  };
}

async function measure() {
  const harfbuzz = await loadHarfBuzzShaper();
  const fontkitWarm = warm(fontkitShaper);
  const harfbuzzWarm = warm(harfbuzz);
  const result = {
    coldFirstShapedLineMs: {
      harfbuzz: await cold("harfbuzz"),
      fontkit: await cold("fontkit"),
    },
    warm: { fontkit: fontkitWarm, harfbuzz: harfbuzzWarm },
  };
  const failures = [];
  if (result.coldFirstShapedLineMs.harfbuzz > COLD_BUDGET_MS) {
    failures.push(
      `cold first shaped line ${result.coldFirstShapedLineMs.harfbuzz.toFixed(1)} ms > ${COLD_BUDGET_MS} ms`,
    );
  }
  if (harfbuzzWarm.shapeMicroseconds > fontkitWarm.shapeMicroseconds) {
    failures.push("warm HarfBuzz shaping is slower than fontkit");
  }
  if (harfbuzzWarm.outlineMicroseconds > 2 * fontkitWarm.outlineMicroseconds) {
    failures.push("warm HarfBuzz outlines exceed 2x fontkit");
  }
  return { result, failures };
}

let attempt = await measure();
if (attempt.failures.length > 0) attempt = await measure();
const round = (value) => Math.round(value * 10) / 10;
process.stdout.write(
  `Typography budgets: cold first line HarfBuzz ${round(attempt.result.coldFirstShapedLineMs.harfbuzz)} ms (fontkit ${round(attempt.result.coldFirstShapedLineMs.fontkit)} ms); warm shaping ${round(attempt.result.warm.harfbuzz.shapeMicroseconds)} µs/line vs fontkit ${round(attempt.result.warm.fontkit.shapeMicroseconds)}; warm outlines ${round(attempt.result.warm.harfbuzz.outlineMicroseconds)} µs/line vs fontkit ${round(attempt.result.warm.fontkit.outlineMicroseconds)}.\n`,
);
if (attempt.failures.length > 0) {
  process.stderr.write(`Typography budget failures: ${attempt.failures.join("; ")}\n`);
  process.exitCode = 1;
}
