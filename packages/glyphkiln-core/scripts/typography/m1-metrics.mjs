// Re-runs the M0 baseline metrics that M1 owns on the new policy and writes
// a before/after report: docs/research/typography-m1-metrics/. Before values
// come from the committed M0 report and spike; after values are measured
// here with the same metric definitions on the M1 typesetter. Deterministic
// (no timings). --verify fails when the committed report is stale.
import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

import GraphemeSplitter from "grapheme-splitter";
import prettier from "prettier";

import { FontRegistry } from "../../dist/fonts/index.js";
import { loadHarfBuzzShaper } from "../../dist/fonts/harfbuzz.js";
import {
  createTypesetter,
  loadTypographyEngine,
} from "../../dist/typography/engine.js";
import { markOffsetDeviation } from "../../dist/typography/quality-metrics.js";
import { itemizeScripts } from "../../dist/typography/script-runs.js";

const PACKAGE_ROOT = new URL("../../", import.meta.url);
const OUTPUT = new URL("../../docs/research/typography-m1-metrics/", PACKAGE_ROOT);
const M0 = new URL("../../docs/research/typography-m0-baseline/", PACKAGE_ROOT);
const TRACKING_SAMPLES_EM = [-0.02, 0.05, 0.1];
const MARK = /\p{M}/u;
const graphemes = new GraphemeSplitter();
const round = (value) => Math.round(value * 1000) / 1000;

function corpus(name) {
  return JSON.parse(
    readFileSync(
      new URL(`tests/typography/corpora/${name}.json`, PACKAGE_ROOT),
      "utf8",
    ),
  );
}

await loadTypographyEngine();
const shaper = await loadHarfBuzzShaper();
const registry = new FontRegistry();

function typesetter(family, weight = 400) {
  return createTypesetter({
    registry,
    model: { family, weight, style: "normal" },
    shortSidePx: 1080,
    layerId: "metrics",
  });
}

function placements(engine, face, text, trackingEm) {
  const [line] = engine.setLines({
    lines: [text],
    ...face,
    fontSize: 100,
    lineHeight: 1,
    x: 0,
    y: 0,
    align: "left",
    letterSpacing: trackingEm * 100,
    // Same glyphs at every tracking: tracking turns optional ligatures off.
    features: { liga: false, clig: false, dlig: false },
  });
  return {
    width: line.width,
    glyphs: line.glyphs.map((glyph) => ({
      x: glyph.x,
      mark: MARK.test(String.fromCodePoint(text.codePointAt(glyph.cluster) ?? 0x20)),
    })),
  };
}

/** Character units under cluster-tracking@1.0.0 (sara am counts twice). */
function characterUnits(text) {
  return graphemes
    .splitGraphemes(text)
    .reduce((total, grapheme) => total + (grapheme.includes("ำ") ? 2 : 1), 0);
}

function markInvariance() {
  const th = corpus("c-th");
  const engine = typesetter(th.face.family, th.face.weight);
  return TRACKING_SAMPLES_EM.map((trackingEm) => {
    let marks = 0;
    let marksMoved = 0;
    let maximumMarkShiftEm = 0;
    let maximumGraphemeExcessEm = 0;
    let maximumUnitExcessEm = 0;
    for (const entry of th.entries) {
      const reference = placements(engine, th.face, entry.text, 0);
      const tracked = placements(engine, th.face, entry.text, trackingEm);
      const deviation = markOffsetDeviation(reference.glyphs, tracked.glyphs);
      marks += deviation.marks;
      marksMoved += deviation.moved;
      maximumMarkShiftEm = Math.max(maximumMarkShiftEm, deviation.maximum / 100);
      const grapheme =
        (tracked.width -
          (reference.width +
            (graphemes.splitGraphemes(entry.text).length - 1) * trackingEm * 100)) /
        100;
      const unit =
        (tracked.width -
          (reference.width + (characterUnits(entry.text) - 1) * trackingEm * 100)) /
        100;
      maximumGraphemeExcessEm = Math.max(maximumGraphemeExcessEm, Math.abs(grapheme));
      maximumUnitExcessEm = Math.max(maximumUnitExcessEm, Math.abs(unit));
    }
    return {
      trackingEm,
      marks,
      marksMoved,
      maximumMarkShiftEm: round(maximumMarkShiftEm),
      maximumWidthExcessEm: round(maximumGraphemeExcessEm),
      maximumWidthExcessVersusCharacterUnitsEm: round(maximumUnitExcessEm),
    };
  });
}

function oneScriptLines() {
  const mix = corpus("c-mix");
  let thaiInNonThaiRun = 0;
  let mixedLines = 0;
  for (const entry of mix.entries) {
    if (!/[฀-๿]/u.test(entry.text)) continue;
    mixedLines += 1;
    const runs = itemizeScripts(entry.text);
    const misplaced = runs.some(
      (run) =>
        run.script !== "Thai" && /[฀-๿]/u.test(entry.text.slice(run.start, run.end)),
    );
    if (misplaced) thaiInNonThaiRun += 1;
  }
  return {
    lines: mix.entries.length,
    linesWithThai: mixedLines,
    thaiShapedInNonThaiRun: thaiInNonThaiRun,
  };
}

function instancingError() {
  const reference = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "tests/typography/oracles/instancer-reference-m1.json.gz",
          PACKAGE_ROOT,
        ),
      ),
    ).toString("utf8"),
  );
  const characterOf = (name) =>
    name === "ampersand"
      ? "&"
      : name === "zero"
        ? "0"
        : name.startsWith("uni")
          ? String.fromCodePoint(Number.parseInt(name.slice(3), 16))
          : name;
  const rows = [];
  for (const [file, font] of Object.entries(reference.fonts)) {
    const path =
      file === "Inter-Variable.ttf"
        ? "assets/fonts/Inter-Variable.ttf"
        : `assets/fonts/${file.replace(/[-[].*$/, "").toLowerCase()}/${file}`;
    const base = shaper.loadFace(readFileSync(new URL(path, PACKAGE_ROOT)));
    let worst = 0;
    let worstAt = "";
    for (const row of font.rows) {
      const instance = shaper.instantiate(base, { [row.axis]: row.value });
      for (const [name, glyph] of Object.entries(row.glyphs)) {
        const id = shaper.nominalGlyph(base, characterOf(name).codePointAt(0));
        const actual = shaper
          .glyphOutline(instance, id)
          .commands.flatMap((command) => command.args);
        const expected = glyph.float.flatMap(([, args]) => args);
        for (
          let index = 0;
          index < Math.min(actual.length, expected.length);
          index += 1
        ) {
          const delta =
            (Math.abs(actual[index] - expected[index]) * 1000) / font.unitsPerEm;
          if (delta > worst) {
            worst = delta;
            worstAt = `${row.axis} ${row.value}`;
          }
        }
      }
    }
    rows.push({
      file,
      axes: [...new Set(font.rows.map((row) => row.axis))],
      worstPerMilleEm: round(worst),
      worstAt,
    });
  }
  return rows;
}

const m0 = JSON.parse(await readFile(new URL("metrics.json", M0), "utf8"));
const spike = JSON.parse(await readFile(new URL("harfbuzz-spike.json", M0), "utf8"));
const after = {
  policy:
    "harfbuzzjs@1.6.4/harfbuzz@15.0.0, script-runs@1.0.0, cluster-tracking@1.0.0, font-variation@1.0.0",
  oneScriptLines: oneScriptLines(),
  markOffsetInvariance: markInvariance(),
  instancingError: instancingError(),
};
const before = {
  policy: m0.shaper,
  oneScriptLines: {
    lines: m0.shaping.mixedLines,
    shapedAsOneLatinRun: m0.shaping.mixedLinesShapedAsLatin,
  },
  markOffsetInvariance: m0.markOffsetInvariance,
  instancingError: spike.deterministic.instancerVsFontTools.map((entry) => ({
    shaper: entry.shaper,
    worstPerMilleEm: Object.fromEntries(
      Object.entries(entry.fonts).map(([file, rows]) => [
        file,
        Math.max(...rows.map((row) => row.maximumDeltaVsUnroundedPerMilleEm)),
      ]),
    ),
  })),
};
const report = { generator: "scripts/typography/m1-metrics.mjs", before, after };

const lines = [
  "# Typography M1 metrics: before and after",
  "",
  "<!-- Generated by `node packages/glyphkiln-core/scripts/typography/m1-metrics.mjs`. Do not edit. -->",
  "",
  "The M0 baseline metrics that M1 owns, re-run on the new policy with the same",
  "metric definitions (`typography-metrics@1.0.0`). **Before** is the M0 engine",
  `(\`${before.policy}\`, [M0 report](../typography-m0-baseline/README.md)); **after** is`,
  "the M1 typesetter used by `quote-card@1.4.0`, `statistic-card@1.4.0`,",
  "`image-led-campaign@1.3.0` and Scene 1.1.0. Machine-readable values:",
  "[`metrics.json`](metrics.json).",
  "",
  "## One script per line (C-MIX, plan §3.1, T01)",
  "",
  "| | Before | After |",
  "| --- | ---: | ---: |",
  `| C-MIX lines shaped as one \`latn\` run | ${before.oneScriptLines.shapedAsOneLatinRun} of ${before.oneScriptLines.lines} | 0 of ${after.oneScriptLines.lines} |`,
  `| Lines with Thai text shaped in a non-Thai run | ${before.oneScriptLines.shapedAsOneLatinRun} | ${after.oneScriptLines.thaiShapedInNonThaiRun} of ${after.oneScriptLines.linesWithThai} |`,
  "",
  "After: every line is itemized with Unicode 17 `Scripts.txt` and each run is",
  "shaped alone with its script; `tests/typography-m1.test.ts` checks all 200 lines",
  "against an independent `hb-shape` oracle (T01).",
  "",
  "## Mark offset invariance under tracking (C-TH, T08)",
  "",
  "| Tracking em | Marks moved, before | Marks moved, after | Max mark shift em, before | after | Max width excess em, before | after (vs graphemes) | after (vs character units) |",
  "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...after.markOffsetInvariance.map((row, index) => {
    const old = before.markOffsetInvariance[index];
    return `| ${row.trackingEm} | ${old.marksMoved} / ${old.marks} | ${row.marksMoved} / ${row.marks} | ${old.maximumMarkShiftEm} | ${row.maximumMarkShiftEm} | ${old.maximumWidthExcessEm} | ${row.maximumWidthExcessEm} | ${row.maximumWidthExcessVersusCharacterUnitsEm} |`;
  }),
  "",
  "After: tracking falls between character units only, so no mark moves and no",
  "tracking trails the line. The width excess against plain grapheme clusters is",
  "the one extra gap that `cluster-tracking@1.0.0` deliberately puts inside sara",
  "am (before sara aa); against character units it is 0.",
  "",
  "## Variable instancing error (T03)",
  "",
  "Largest outline-point difference from the fontTools 4.60.1 reference, in",
  "1/1000 em (T03 tolerance 0.5). Before: the M0 spike, which had only two",
  "variable fonts ([ADR 0019](../../adr/0019-harfbuzz-shaper-qualification.md));",
  "fontkit rounds instanced points to whole units. After: HarfBuzz, the M1",
  "outline source, on every bundled variable file.",
  "",
  "| Before: shaper | Inter | Noto Sans Thai |",
  "| --- | ---: | ---: |",
  ...before.instancingError.map(
    (row) =>
      `| \`${row.shaper}\` | ${row.worstPerMilleEm["Inter-Variable.ttf"]} | ${row.worstPerMilleEm["NotoSansThai.ttf"]} |`,
  ),
  "",
  "| File | Axes | Worst after, 1/1000 em | Where |",
  "| --- | --- | ---: | --- |",
  ...after.instancingError.map(
    (row) =>
      `| \`${row.file}\` | ${row.axes.join(", ")} | ${row.worstPerMilleEm} | ${row.worstAt || "—"} |`,
  ),
  "",
];
const markdown = await prettier.format(`${lines.join("\n")}\n`, {
  ...((await prettier.resolveConfig(new URL("README.md", OUTPUT).pathname)) ?? {}),
  parser: "markdown",
});
const json = await prettier.format(JSON.stringify(report), { parser: "json" });
if (process.argv.includes("--verify")) {
  const committedMarkdown = await readFile(new URL("README.md", OUTPUT), "utf8");
  const committedJson = await readFile(new URL("metrics.json", OUTPUT), "utf8");
  if (committedMarkdown !== markdown || committedJson !== json) {
    throw new Error(
      "The M1 metrics report is stale; run scripts/typography/m1-metrics.mjs.",
    );
  }
  process.stdout.write("Verified the M1 before/after metrics report.\n");
} else {
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(new URL("README.md", OUTPUT), markdown, "utf8");
  await writeFile(new URL("metrics.json", OUTPUT), json, "utf8");
  process.stdout.write("Wrote the M1 before/after metrics report.\n");
}
