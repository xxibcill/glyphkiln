// Measures M3 line breaking against the G-TH draft at five widths and shows
// the M0 line-breaking probes before and after, writing
// docs/research/typography-m3-metrics/. "Before" is the legacy wrapper
// (budoux-th@0.7.0 and whitespace@1.0.0, used by every M1 and older template
// version); "after" is the M3 wrapper (line-break-tailoring@1.1.0 and
// thai-segmentation-hybrid@1.0.0, used by quote-card@1.5.0,
// statistic-card@1.5.0 and image-led-campaign@1.4.0). Deterministic (no
// timings). --verify fails when the committed report is stale.
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import prettier from "prettier";

import { FontRegistry } from "../../dist/fonts/index.js";
import { wrapText } from "../../dist/typography/index.js";
import { isThaiClusterBoundary } from "../../dist/typography/thai-segmentation-hybrid.js";

const PACKAGE_ROOT = new URL("../../", import.meta.url);
const OUTPUT = new URL("../../docs/research/typography-m3-metrics/", PACKAGE_ROOT);
const FONT_SIZE = 32;
/** Five widths in px at 32 px Noto Sans Thai: about 6 to 30 Thai characters. */
const WIDTHS = [120, 200, 320, 480, 720];
const THAI_FACE = { family: "Noto Sans Thai", weight: 400, style: "normal" };
const LATIN_FACE = { family: "Inter", weight: 400, style: "normal" };
const M3 = { lexicon: [], preferBreakAfter: [] };
const BRAND_LEXICON = { lexicon: ["เพื่อนไร่เพื่อนสวน"], preferBreakAfter: [] };

const json = (path) => JSON.parse(readFileSync(new URL(path, PACKAGE_ROOT), "utf8"));
const gold = json("tests/typography/gold/g-th.json");
const probes = json("tests/typography/corpora/c-probe.json");
const registry = new FontRegistry();
const style = (face) => ({ ...face, fontSize: FONT_SIZE, lineHeight: 1 });

/** Offsets in `text` where each line after the first starts. */
function breakOffsets(text, lines) {
  const offsets = [];
  let position = 0;
  for (const [index, line] of lines.entries()) {
    if (index > 0) offsets.push(position);
    if (!text.startsWith(line, position)) {
      throw new Error(`Line ${JSON.stringify(line)} is not at ${position} of ${text}`);
    }
    position += line.length;
    if (text[position] === " ") position += 1;
  }
  return offsets;
}

/** Gold-acceptable break offsets and glue spaces of a G-TH line. */
function goldBoundaries(line) {
  const acceptable = new Set();
  const glueAfterDigit = new Set();
  let offset = 0;
  for (const marker of line.gold) {
    if (marker === "/" || marker === "|") {
      acceptable.add(offset);
      continue;
    }
    if (marker === " ") acceptable.add(offset + 1);
    if (marker === "_" && /\p{Nd}/u.test(line.text[offset - 1] ?? "")) {
      glueAfterDigit.add(offset + 1);
    }
    offset += marker.length;
  }
  return { acceptable, glueAfterDigit };
}

function measureGth(lineBreaking) {
  return WIDTHS.map((width) => {
    let breaks = 0;
    let acceptable = 0;
    let insideCluster = 0;
    let maiyamokAtLineStart = 0;
    let amountUnitSplits = 0;
    const misses = [];
    for (const line of gold.lines) {
      const lines = wrapText(line.text, width, style(THAI_FACE), registry, {
        ...(lineBreaking === undefined ? {} : { lineBreaking }),
      }).lines;
      const boundaries = goldBoundaries(line);
      for (const offset of breakOffsets(line.text, lines)) {
        breaks += 1;
        if (boundaries.acceptable.has(offset)) acceptable += 1;
        else misses.push(`${line.id}@${offset}`);
        if (!isThaiClusterBoundary(line.text, offset)) insideCluster += 1;
        if (line.text[offset] === "ๆ") maiyamokAtLineStart += 1;
        if (boundaries.glueAfterDigit.has(offset)) amountUnitSplits += 1;
      }
    }
    return {
      width,
      breaks,
      acceptable,
      acceptableShare:
        breaks === 0 ? 1 : Math.round((acceptable / breaks) * 10000) / 10000,
      insideCluster,
      maiyamokAtLineStart,
      amountUnitSplits,
      firstMisses: misses.slice(0, 8),
    };
  });
}

const PROBE_IDS = [
  "probe-nbsp",
  "probe-budoux-bangkok",
  "probe-budoux-promotion",
  "probe-static-ads-t04-mai-yamok",
  "probe-static-ads-t04-amount-unit",
  "probe-thai-offer-mai-yamok",
];
function probeLines(entry, lineBreaking) {
  const face = entry.face === "latn" ? LATIN_FACE : THAI_FACE;
  // Probes without a width are set where the word must break or stay whole.
  const width = entry.width ?? 120;
  return {
    width,
    lines: wrapText(entry.text, width, style(face), registry, {
      ...(lineBreaking === undefined ? {} : { lineBreaking }),
      allowWordBreak: false,
    }).lines,
  };
}
const probeRows = PROBE_IDS.map((id) => {
  const entry = probes.entries.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`Missing probe ${id}`);
  return {
    id,
    defect: entry.defect,
    text: entry.text,
    width: probeLines(entry).width,
    before: probeLines(entry).lines,
    after: probeLines(entry, M3).lines,
  };
});

const before = measureGth(undefined);
const after = measureGth(M3);
const afterLexicon = measureGth(BRAND_LEXICON);
const report = {
  generator: "scripts/typography/m3-metrics.mjs",
  goldSet: {
    id: gold.id,
    version: gold.version,
    status: "draft",
    lines: gold.lines.length,
  },
  measurer: { ...THAI_FACE, fontSize: FONT_SIZE, measure: "FontRegistry.measure" },
  widths: WIDTHS,
  before: { policy: "budoux-th@0.7.0 + whitespace@1.0.0", gth: before },
  after: {
    policy: "line-break-tailoring@1.1.0 + thai-segmentation-hybrid@1.0.0",
    gth: after,
  },
  afterWithBrandLexicon: { lexicon: BRAND_LEXICON.lexicon, gth: afterLexicon },
  probes: probeRows,
};

const percent = (value) => `${(value * 100).toFixed(2)} %`;
const table = (rows) => [
  "| Width px | Breaks | On gold-acceptable boundaries | Inside a Thai cluster | ๆ at line start | Amount + unit splits |",
  "| ---: | ---: | ---: | ---: | ---: | ---: |",
  ...rows.map(
    (row) =>
      `| ${row.width} | ${row.breaks} | ${row.acceptable} (${percent(row.acceptableShare)}) | ${row.insideCluster} | ${row.maiyamokAtLineStart} | ${row.amountUnitSplits} |`,
  ),
];
const show = (lines) =>
  lines.map((line) => `\`${line.replaceAll(" ", "⍽")}\``).join(" / ");
const markdown = [
  "# Typography M3 metrics: G-TH draft and probes",
  "",
  "<!-- Generated by `node packages/glyphkiln-core/scripts/typography/m3-metrics.mjs`. Do not edit. -->",
  "",
  `**Measured against the G-TH draft (\`${gold.version}\`), not a gold set.** The native Thai`,
  "reader has not corrected it yet, and the hybrid segmenter's 47-word supplement was",
  "drawn up from errors on this draft, so these numbers are not an independent test.",
  "**T10 is not claimed.** See the",
  "[G-TH README](../../../packages/glyphkiln-core/tests/typography/gold/README.md).",
  "",
  "**Before** is the legacy wrapper (`budoux-th@0.7.0`, `whitespace@1.0.0`), which every",
  "M1 and older template version keeps. **After** is the M3 wrapper",
  "(`line-break-tailoring@1.1.0`, `thai-segmentation-hybrid@1.0.0`) of",
  "`quote-card@1.5.0`, `statistic-card@1.5.0` and `image-led-campaign@1.4.0`. Each of the",
  `${gold.lines.length} G-TH lines is wrapped in ${THAI_FACE.family} ${THAI_FACE.weight} at ${FONT_SIZE} px, at ${WIDTHS.length} widths,`,
  "with the wrapper's own balanced breaking and no word breaking at the minimum size.",
  "Machine-readable values, with the first misses per width: [`metrics.json`](metrics.json).",
  "",
  "Definitions:",
  "",
  "- **On gold-acceptable boundaries:** the line starts after a space the draft marks",
  "  breakable, or at a `/` or `|`.",
  "- **Inside a Thai cluster:** the break fails the segmenter's Thai character cluster",
  "  guard. Such a break is always inside a syllable.",
  "- **Amount + unit splits:** the break is at a space the draft marks `_` right after a",
  "  digit (`499_บาท`, `2_ชิ้น`).",
  "",
  "## Before",
  "",
  ...table(before),
  "",
  "## After",
  "",
  ...table(after),
  "",
  "## After, with the brand lexicon",
  "",
  `The same run with the lexicon \`${BRAND_LEXICON.lexicon.join(", ")}\`, the brand of most of the`,
  "draft's copy.",
  "",
  ...table(afterLexicon),
  "",
  "## M0 probes, before and after",
  "",
  "From [C-PROBE](../../../packages/glyphkiln-core/tests/typography/corpora/c-probe.json),",
  `at each probe's width (120 px when it has none), ${FONT_SIZE} px. \`⍽\` marks a no-break space.`,
  "",
  "| Probe | Width px | Before | After |",
  "| --- | ---: | --- | --- |",
  ...probeRows.map(
    (row) =>
      `| \`${row.id}\` | ${row.width} | ${show(row.before)} | ${show(row.after)} |`,
  ),
  "",
];
const prettierOptions =
  (await prettier.resolveConfig(new URL("README.md", OUTPUT).pathname)) ?? {};
const readme = await prettier.format(`${markdown.join("\n")}\n`, {
  ...prettierOptions,
  parser: "markdown",
});
const metrics = await prettier.format(JSON.stringify(report), {
  ...((await prettier.resolveConfig(new URL("metrics.json", OUTPUT).pathname)) ?? {}),
  parser: "json",
});
if (process.argv.includes("--verify")) {
  const committedReadme = await readFile(new URL("README.md", OUTPUT), "utf8");
  const committedMetrics = await readFile(new URL("metrics.json", OUTPUT), "utf8");
  if (committedReadme !== readme || committedMetrics !== metrics) {
    throw new Error(
      "The M3 metrics report is stale; run scripts/typography/m3-metrics.mjs.",
    );
  }
  process.stdout.write("Verified the M3 G-TH and probe metrics report.\n");
} else {
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(new URL("README.md", OUTPUT), readme, "utf8");
  await writeFile(new URL("metrics.json", OUTPUT), metrics, "utf8");
  process.stdout.write("Wrote the M3 G-TH and probe metrics report.\n");
}
