// ADR 0019 pre-ship budgets for the M1 HarfBuzz shaper, run by `npm test`
// (the repository has no hosted CI yet, so this is the local release gate):
//   - cold: first shaped and outlined line <= 100 ms in a fresh process;
//   - warm shaping per corpus line no slower than fontkit 2.0.4;
//   - warm outlines (per-face cache) at most 2x fontkit's.
// Those compare the raw shapers. The M1 typesetter adds script runs, face
// coverage, variation instances and cluster tracking, so the script also
// sets every corpus line through it and through the legacy FontRegistry
// path, and fails if M1 is more than TYPESET_RATIO_LIMIT times slower. That
// is a regression guard, not an ADR condition; on 21 November 2026 the two
// paths measured within about 6% of each other on macOS arm64.
// Wall-clock numbers on shared machines vary; the test takes medians and
// allows one re-measurement before failing, and prints the numbers.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { loadHarfBuzzShaper } from "../dist/fonts/harfbuzz.js";
import { FontRegistry } from "../dist/fonts/index.js";
import { fontkitShaper } from "../dist/fonts/shaper.js";
import { createTypesetter } from "../dist/typography/engine.js";

const execFileAsync = promisify(execFile);
const COLD_BUDGET_MS = 100;
const TYPESET_RATIO_LIMIT = 1.25;

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

/** Warm µs per corpus line through each full line setter, at 48 px. */
function typeset() {
  const registry = new FontRegistry();
  const engines = new Map();
  const engineFor = (family) => {
    if (!engines.has(family)) {
      engines.set(
        family,
        createTypesetter({
          registry,
          model: { family, weight: 400, style: "normal" },
          shortSidePx: 1080,
          layerId: "budget",
        }),
      );
    }
    return engines.get(family);
  };
  const corpus = lines().map((line) => ({
    ...line,
    family: line.latin ? "Inter" : "Noto Sans Thai",
  }));
  const set = (setter, line) =>
    setter.setLines({
      lines: [line.text],
      family: line.family,
      weight: 400,
      style: "normal",
      fontSize: 48,
      lineHeight: 1.2,
      x: 0,
      y: 0,
      align: "left",
    });
  const rounds = { legacy: [], m1: [] };
  for (let iteration = 0; iteration < 9; iteration += 1) {
    for (const [name, setterFor] of [
      ["legacy", () => registry],
      ["m1", (line) => engineFor(line.family)],
    ]) {
      const started = performance.now();
      for (const line of corpus) set(setterFor(line), line);
      rounds[name].push(((performance.now() - started) * 1000) / corpus.length);
    }
  }
  return {
    legacyMicroseconds: median(rounds.legacy.slice(2)),
    m1Microseconds: median(rounds.m1.slice(2)),
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
    typeset: typeset(),
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
  if (
    result.typeset.m1Microseconds >
    TYPESET_RATIO_LIMIT * result.typeset.legacyMicroseconds
  ) {
    failures.push(
      `warm M1 typesetting exceeds ${TYPESET_RATIO_LIMIT}x the legacy FontRegistry path`,
    );
  }
  return { result, failures };
}

let attempt = await measure();
if (attempt.failures.length > 0) attempt = await measure();
const round = (value) => Math.round(value * 10) / 10;
process.stdout.write(
  `Typography budgets: cold first line HarfBuzz ${round(attempt.result.coldFirstShapedLineMs.harfbuzz)} ms (fontkit ${round(attempt.result.coldFirstShapedLineMs.fontkit)} ms); warm shaping ${round(attempt.result.warm.harfbuzz.shapeMicroseconds)} µs/line vs fontkit ${round(attempt.result.warm.fontkit.shapeMicroseconds)}; warm outlines ${round(attempt.result.warm.harfbuzz.outlineMicroseconds)} µs/line vs fontkit ${round(attempt.result.warm.fontkit.outlineMicroseconds)}; warm full line setting M1 ${round(attempt.result.typeset.m1Microseconds)} µs/line vs legacy ${round(attempt.result.typeset.legacyMicroseconds)}.\n`,
);
if (attempt.failures.length > 0) {
  process.stderr.write(`Typography budget failures: ${attempt.failures.join("; ")}\n`);
  process.exitCode = 1;
}
