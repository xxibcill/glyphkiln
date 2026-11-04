// HarfBuzz spike behind the Shaper interface (plan M0, scope item 6; ADR 0019).
//   node scripts/typography-harfbuzz-spike.mjs           measure and write the report
//   node scripts/typography-harfbuzz-spike.mjs --verify  re-measure; require the
//                                                        deterministic part to match
// Development only: harfbuzzjs is a devDependency and never reaches render code.
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { fontkitShaper } from "../dist/fonts/shaper.js";
import {
  canonicalJson,
  encodeRun,
  formatForRepository,
  loadCorpora,
  loadFontBytes,
  packagePath,
  round,
  sha256,
} from "./typography/harness.mjs";
import {
  compareWithInstancerReference,
  createHarfBuzzShaper,
  createScriptItemizer,
  instancerReport,
  normalizeOutline,
  openTypeScriptTag,
} from "./typography/oracles.mjs";

const execFileAsync = promisify(execFile);
const REPORT = "../../docs/research/typography-m0-baseline/harfbuzz-spike.json";
const mode = process.argv[2];

if (mode === "--child-digest") {
  process.stdout.write(await harfbuzzDigest());
} else {
  await main(process.argv.includes("--verify"));
}

/** Faces for every corpus face key, instanced the way FontRegistry does it. */
function facesFor(shaper) {
  const { inter, thai } = loadFontBytes();
  const make = (bytes, weight) => {
    const base = shaper.loadFace(bytes);
    return shaper.variationAxes(base).wght === undefined
      ? base
      : shaper.instantiate(base, { wght: weight });
  };
  return {
    "Inter/400": make(inter, 400),
    "Inter/700": make(inter, 700),
    "Noto Sans Thai/400": make(thai, 400),
  };
}

function corpusLines() {
  const corpora = loadCorpora();
  return ["C-LAT", "C-TH", "C-MIX"].flatMap((id) =>
    corpora[id].entries.map((entry) => ({
      corpus: id,
      id: entry.id,
      text: entry.text,
      face: `${corpora[id].face.family}/${corpora[id].face.weight}`,
    })),
  );
}

async function harfbuzzDigest() {
  const shaper = await createHarfBuzzShaper();
  const faces = facesFor(shaper);
  const parts = corpusLines().map((line) => {
    const face = faces[line.face];
    const run = shaper.shape(face, { text: line.text });
    const outlines = run.glyphs.map((glyph) =>
      JSON.stringify(shaper.glyphOutline(face, glyph.id).commands),
    );
    return `${line.id}\t${encodeRun(run)}\t${sha256(Buffer.from(outlines.join("\n")))}`;
  });
  return `${shaper.id}\n${parts.join("\n")}\n`;
}

function sameIds(left, right) {
  return (
    left.glyphs.length === right.glyphs.length &&
    left.glyphs.every((glyph, index) => glyph.id === right.glyphs[index].id)
  );
}

function samePositions(left, right, tolerance) {
  return left.glyphs.every((glyph, index) => {
    const other = right.glyphs[index];
    return (
      Math.abs(glyph.xAdvance - other.xAdvance) <= tolerance &&
      Math.abs(glyph.xOffset - other.xOffset) <= tolerance &&
      Math.abs(glyph.yOffset - other.yOffset) <= tolerance &&
      Math.abs(glyph.yAdvance - other.yAdvance) <= tolerance
    );
  });
}

function sameClusters(left, right) {
  return left.glyphs.every(
    (glyph, index) => glyph.cluster === right.glyphs[index].cluster,
  );
}

function shapeItemized(shaper, face, text, itemize) {
  const runs = itemize(text).map((run) => {
    const shaped = shaper.shape(face, {
      text: text.slice(run.start, run.end),
      script: openTypeScriptTag(run.script),
    });
    return {
      ...shaped,
      glyphs: shaped.glyphs.map((glyph) => ({
        ...glyph,
        cluster: glyph.cluster + run.start,
      })),
    };
  });
  return {
    glyphs: runs.flatMap((run) => run.glyphs),
    runs: runs.length,
  };
}

function names(shaper, face, run) {
  return run.glyphs.map((glyph) => shaper.glyphOutline(face, glyph.id).name).join(" ");
}

function agreement(fontkit, harfbuzz) {
  const fkFaces = facesFor(fontkitShaper);
  const hbFaces = facesFor(harfbuzz);
  const itemize = createScriptItemizer();
  const byCorpus = {};
  const thaiDifferences = [];
  let mixedChanged = { fontkit: 0, harfbuzz: 0 };
  let mixedItemizedAgree = 0;
  for (const line of corpusLines()) {
    const fk = fontkit.shape(fkFaces[line.face], { text: line.text });
    const hb = harfbuzz.shape(hbFaces[line.face], { text: line.text });
    const row = (byCorpus[line.corpus] ??= {
      lines: 0,
      glyphIdsEqual: 0,
      positionsEqualWithin1Unit: 0,
      clustersEqual: 0,
      differing: [],
    });
    row.lines += 1;
    const ids = sameIds(fk, hb);
    if (ids) {
      row.glyphIdsEqual += 1;
      if (samePositions(fk, hb, 1)) row.positionsEqualWithin1Unit += 1;
      if (sameClusters(fk, hb)) row.clustersEqual += 1;
    } else {
      row.differing.push(line.id);
      if (line.corpus === "C-TH") {
        thaiDifferences.push({
          id: line.id,
          text: line.text,
          fontkit: names(fontkit, fkFaces[line.face], fk),
          harfbuzz: names(harfbuzz, hbFaces[line.face], hb),
        });
      }
    }
    if (line.corpus === "C-MIX") {
      const fkRuns = shapeItemized(fontkit, fkFaces[line.face], line.text, itemize);
      const hbRuns = shapeItemized(harfbuzz, hbFaces[line.face], line.text, itemize);
      if (!sameIds(fk, fkRuns)) mixedChanged.fontkit += 1;
      if (!sameIds(hb, hbRuns)) mixedChanged.harfbuzz += 1;
      if (sameIds(fkRuns, hbRuns)) mixedItemizedAgree += 1;
    }
  }
  for (const row of Object.values(byCorpus)) {
    row.glyphIdAgreement = round(row.glyphIdsEqual / row.lines);
    row.differing = row.differing.slice(0, 40);
  }
  return {
    wholeLine: byCorpus,
    thaiDifferences: thaiDifferences.slice(0, 20),
    mixedPerScriptRun: {
      lines: byCorpus["C-MIX"].lines,
      linesChangedByItemizationFontkit: mixedChanged.fontkit,
      linesChangedByItemizationHarfBuzz: mixedChanged.harfbuzz,
      itemizedGlyphIdsEqualBetweenShapers: mixedItemizedAgree,
    },
  };
}

function defectProbes(fontkit, harfbuzz) {
  const fkFaces = facesFor(fontkitShaper);
  const hbFaces = facesFor(harfbuzz);
  const itemize = createScriptItemizer();
  const face = "Noto Sans Thai/400";
  const probe = (text) => {
    const fkLine = fontkit.shape(fkFaces[face], { text });
    const hbLine = harfbuzz.shape(hbFaces[face], { text });
    const fkRuns = shapeItemized(fontkit, fkFaces[face], text, itemize);
    const hbRuns = shapeItemized(harfbuzz, hbFaces[face], text, itemize);
    return {
      text,
      fontkitWholeLine: {
        script: fkLine.script,
        glyphs: names(fontkit, fkFaces[face], fkLine),
      },
      harfbuzzWholeLine: names(harfbuzz, hbFaces[face], hbLine),
      fontkitPerScriptRun: names(fontkit, fkFaces[face], fkRuns),
      harfbuzzPerScriptRun: names(harfbuzz, hbFaces[face], hbRuns),
    };
  };
  return {
    oneScriptPerLine: probe("AI ที่ป้ญู"),
    saraAm: ["น้ำ", "ก่ำ", "กำ"].map((text) => {
      const fk = fontkit.shape(fkFaces[face], { text });
      const hb = harfbuzz.shape(hbFaces[face], { text });
      return {
        text,
        fontkit: names(fontkit, fkFaces[face], fk),
        harfbuzz: names(harfbuzz, hbFaces[face], hb),
        fontkitClusters: fk.glyphs.map((glyph) => glyph.cluster).join(" "),
        harfbuzzClusters: hb.glyphs.map((glyph) => glyph.cluster).join(" "),
      };
    }),
    // Tracking, NBSP, BudouX and Thai line edges are engine defects (tracking
    // placement, whitespace handling, segmentation); no shaper changes them.
    shaperIndependent: [
      "tracking-per-glyph",
      "nbsp-breaks",
      "budoux-in-syllable",
      "thai-line-edge",
    ],
  };
}

function outlineAgreement(fontkit, harfbuzz) {
  const fkFaces = facesFor(fontkitShaper);
  const hbFaces = facesFor(harfbuzz);
  const serialize = (commands) =>
    commands
      .map(
        (command) =>
          `${command.command}:${command.args.map((value) => round(value)).join(",")}`,
      )
      .join(" ");
  const result = {};
  for (const key of ["Inter/400", "Inter/700", "Noto Sans Thai/400"]) {
    const ids = new Set();
    for (const line of corpusLines().filter((line) =>
      line.face.startsWith(key.split("/")[0]),
    )) {
      for (const glyph of fontkit.shape(fkFaces[key], { text: line.text }).glyphs)
        ids.add(glyph.id);
    }
    let identical = 0;
    let identicalNormalized = 0;
    for (const id of ids) {
      const left = fontkit.glyphOutline(fkFaces[key], id).commands;
      const right = harfbuzz.glyphOutline(hbFaces[key], id).commands;
      if (serialize(left) === serialize(right)) identical += 1;
      if (serialize(normalizeOutline(left)) === serialize(normalizeOutline(right))) {
        identicalNormalized += 1;
      }
    }
    result[key] = {
      glyphs: ids.size,
      identicalAt0001Units: identical,
      identicalAfterClosingLineNormalization: identicalNormalized,
    };
  }
  return result;
}

function interfaceCoverage(harfbuzz) {
  const { inter } = loadFontBytes();
  const fk = fontkitShaper.loadFace(inter);
  const hb = harfbuzz.loadFace(inter);
  const fkMetrics = fontkitShaper.metrics(fk);
  const hbMetrics = harfbuzz.metrics(hb);
  const fkFeatures = [...fontkitShaper.availableFeatures(fk)].sort();
  const hbFeatures = [...harfbuzz.availableFeatures(hb)].sort();
  return {
    shape: true,
    glyphOutlines: true,
    variationAxes: true,
    instancing: true,
    glyphNames: true,
    colorLayerCheck: true,
    metricsEqual: Object.fromEntries(
      Object.keys(fkMetrics).map((key) => [key, fkMetrics[key] === hbMetrics[key]]),
    ),
    metrics: { fontkit: fkMetrics, harfbuzz: hbMetrics },
    featureTagsEqual: JSON.stringify(fkFeatures) === JSON.stringify(hbFeatures),
    featureTagsOnlyInFontkit: fkFeatures.filter((tag) => !hbFeatures.includes(tag)),
    featureTagsOnlyInHarfBuzz: hbFeatures.filter((tag) => !fkFeatures.includes(tag)),
  };
}

async function timings(harfbuzz) {
  const cold = { fontkit: [], harfbuzz: [] };
  for (let index = 0; index < 5; index += 1) {
    for (const name of ["fontkit", "harfbuzz"]) {
      const { stdout } = await execFileAsync(process.execPath, [
        new URL("./typography/cold-start.mjs", import.meta.url).pathname,
        name,
      ]);
      cold[name].push(JSON.parse(stdout));
    }
  }
  const median = (values) => {
    const sorted = [...values].sort((left, right) => left - right);
    return round(sorted[Math.floor(sorted.length / 2)]);
  };
  const lines = corpusLines();
  const warm = {};
  for (const [name, shaper] of [
    ["fontkit", fontkitShaper],
    ["harfbuzz", harfbuzz],
  ]) {
    const faces = facesFor(shaper);
    const shapeRounds = [];
    const outlineRounds = [];
    for (let iteration = 0; iteration < 7; iteration += 1) {
      let started = performance.now();
      const runs = lines.map((line) =>
        shaper.shape(faces[line.face], { text: line.text }),
      );
      shapeRounds.push(((performance.now() - started) * 1000) / lines.length);
      started = performance.now();
      for (const [index, run] of runs.entries()) {
        for (const glyph of run.glyphs)
          shaper.glyphOutline(faces[lines[index].face], glyph.id);
      }
      outlineRounds.push(((performance.now() - started) * 1000) / lines.length);
    }
    warm[name] = {
      shapeMicrosecondsPerLine: median(shapeRounds.slice(2)),
      outlineMicrosecondsPerLine: median(outlineRounds.slice(2)),
    };
  }
  return {
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      cpu: os.cpus()[0]?.model ?? "unknown",
      cpus: os.cpus().length,
    },
    coldStartMedianMs: {
      fontkit: {
        module: median(cold.fontkit.map((row) => row.moduleMs)),
        firstShapedLine: median(cold.fontkit.map((row) => row.firstShapeMs)),
      },
      harfbuzz: {
        module: median(cold.harfbuzz.map((row) => row.moduleMs)),
        firstShapedLine: median(cold.harfbuzz.map((row) => row.firstShapeMs)),
      },
    },
    warm,
    corpusLines: lines.length,
    note: "Medians of 5 fresh processes (cold) and of 5 warm rounds over the C-LAT, C-TH and C-MIX lines. Cold start includes module load, wasm instantiation, parsing Inter and the first shaped and outlined line. Wall-clock numbers vary by about 1.5x between runs on this shared container; compare ratios, not absolutes.",
  };
}

async function main(verify) {
  const harfbuzz = await createHarfBuzzShaper();
  const [first, second] = await Promise.all([childDigest(), childDigest()]);
  const { inter, thai } = loadFontBytes();
  const sample = "AaBbCcGgHhOoQqRrSsxyz0123456789&@";
  const deterministic = {
    shapers: { fontkit: fontkitShaper.id, harfbuzz: harfbuzz.id },
    harfbuzzWasmSha256: sha256(
      await readFile(
        new URL("../../../node_modules/harfbuzzjs/dist/harfbuzz.wasm", import.meta.url),
      ),
    ),
    agreement: agreement(fontkitShaper, harfbuzz),
    defects: defectProbes(fontkitShaper, harfbuzz),
    outlines: outlineAgreement(fontkitShaper, harfbuzz),
    interface: interfaceCoverage(harfbuzz),
    determinism: {
      freshProcesses: 2,
      identical: first === second,
      digest: sha256(Buffer.from(first)),
    },
    instancerVsFontTools: [
      compareWithInstancerReference(fontkitShaper, {
        "Inter-Variable.ttf": inter,
        "NotoSansThai.ttf": thai,
      }),
      compareWithInstancerReference(harfbuzz, {
        "Inter-Variable.ttf": inter,
        "NotoSansThai.ttf": thai,
      }),
    ],
    instancerFontkitVsHarfBuzz: [
      instancerReport({
        subject: fontkitShaper,
        reference: harfbuzz,
        bytes: inter,
        fontName: "Inter-Variable.ttf",
        sampleText: sample,
      }),
      instancerReport({
        subject: fontkitShaper,
        reference: harfbuzz,
        bytes: thai,
        fontName: "NotoSansThai.ttf",
        sampleText: `${sample} กขคงจฉชซญฎฐณดตถทนบปผพฟภมยรลวศษสหฬอฮ ะาำิีึืุู่้๊๋็์`,
      }),
    ],
  };
  const url = packagePath(REPORT);
  if (verify) {
    const committed = JSON.parse(await readFile(url, "utf8"));
    if (canonicalJson(committed.deterministic) !== canonicalJson(deterministic)) {
      process.stderr.write(
        "HarfBuzz spike results differ from the committed report.\n",
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Verified HarfBuzz spike report (${deterministic.determinism.digest}).\n`,
    );
    return;
  }
  const report = { deterministic, timings: await timings(harfbuzz) };
  await writeFile(url, await formatForRepository(canonicalJson(report), url));
  process.stdout.write(`Wrote ${REPORT}.\n`);
}

async function childDigest() {
  const { stdout } = await execFileAsync(
    process.execPath,
    [new URL(import.meta.url).pathname, "--child-digest"],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout;
}
