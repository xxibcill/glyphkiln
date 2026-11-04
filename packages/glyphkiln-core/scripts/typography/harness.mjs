// Typography harness (plan M0). Development only: reads the committed corpora,
// shapes and breaks them through the current engine (fontkit shaper,
// layoutText, wrapText) and computes the plan's quality measures. Nothing here
// is imported by render code. Output is canonical JSON so that fresh processes
// can be compared byte for byte.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import GraphemeSplitter from "grapheme-splitter";

import { FontRegistry } from "../../dist/fonts/index.js";
import { fontkitShaper } from "../../dist/fonts/shaper.js";
import { wrapText } from "../../dist/typography/index.js";
import { layoutText } from "../../dist/typography/layout-text.js";
import {
  TYPOGRAPHY_METRICS_VERSION,
  breaksInsideGraphemeClusters,
  breaksOutsideGold,
  crossScriptXHeight,
  lineBreakOffsets,
  markOffsetDeviation,
  outlineTop,
  paragraphMetrics,
  thaiBreakFindings,
} from "../../dist/typography/quality-metrics.js";
import { evaluateLineBreakTest } from "./oracles.mjs";

const PACKAGE_ROOT = new URL("../../", import.meta.url);
export const CORPUS_FILES = [
  "c-lat.json",
  "c-th.json",
  "c-mix.json",
  "c-para.json",
  "c-edge.json",
  "c-emph.json",
  "c-probe.json",
];
export const THAI_FONT_SHA256 =
  "5a1c559bb539583c8a1fd99d1c5b9491e5e14478c9cd2bd0970d5c3096cc9ef8";
export const INTER_FONT_SHA256 =
  "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031";
export const TRACKING_SAMPLES_EM = [-0.02, 0.05, 0.1];
const GLUE = { stretch: 1 / 2, shrink: 1 / 3 };
const graphemes = new GraphemeSplitter();

export function packagePath(relative) {
  return new URL(relative, PACKAGE_ROOT);
}

export function loadFontBytes() {
  const thai = new Uint8Array(
    readFileSync(packagePath("fixtures/scene-thai/font/NotoSansThai.ttf")),
  );
  const inter = new Uint8Array(
    readFileSync(packagePath("assets/fonts/Inter-Variable.ttf")),
  );
  if (sha256(thai) !== THAI_FONT_SHA256 || sha256(inter) !== INTER_FONT_SHA256) {
    throw new Error("Harness font bytes changed; the corpus snapshots pin them.");
  }
  return { thai, inter };
}

export function loadCorpora() {
  return Object.fromEntries(
    CORPUS_FILES.map((file) => {
      const corpus = JSON.parse(
        readFileSync(packagePath(`tests/typography/corpora/${file}`), "utf8"),
      );
      return [corpus.id, corpus];
    }),
  );
}

export function createHarnessRegistry() {
  const { thai } = loadFontBytes();
  return new FontRegistry(
    [400, 700].map((weight) => ({
      family: "Noto Sans Thai",
      weight,
      style: "normal",
      sha256: THAI_FONT_SHA256,
      bytes: thai,
    })),
  );
}

export function faceFor(corpus, entry) {
  if (corpus.face !== undefined) return corpus.face;
  return corpus.faces[entry.face ?? entry.script];
}

/** Compact glyph-run encoding: id:cluster:xAdvance:xOffset:yOffset[:yAdvance]. */
export function encodeRun(run) {
  return run.glyphs
    .map((glyph) =>
      [
        glyph.id,
        glyph.cluster,
        round(glyph.xAdvance),
        round(glyph.xOffset),
        round(glyph.yOffset),
      ]
        .concat(glyph.yAdvance === 0 ? [] : [round(glyph.yAdvance)])
        .join(":"),
    )
    .join(" ");
}

function clusterMappingExact(run, text) {
  const codePoints = [...text].length;
  return (
    run.glyphs.reduce((total, glyph) => total + glyph.codePointCount, 0) === codePoints
  );
}

function shapeSnapshot(registry, corpus) {
  return corpus.entries.map((entry) => {
    const face = faceFor(corpus, entry);
    const run = registry.shape(entry.text, face.family, face.weight, face.style);
    return {
      id: entry.id,
      script: run.script,
      clusterMappingExact: clusterMappingExact(run, entry.text),
      glyphs: encodeRun(run),
    };
  });
}

function wrapAt(registry, corpus, entry, width) {
  const face = faceFor(corpus, entry);
  return wrapText(
    entry.text,
    width,
    {
      ...face,
      fontSize: corpus.fontSize,
      lineHeight: corpus.lineHeight ?? 1.25,
    },
    registry,
  );
}

function paragraphSnapshot(registry, corpus) {
  return corpus.entries.map((entry) => ({
    id: entry.id,
    widths: entry.widths.map((width) => {
      const wrapped = wrapAt(registry, corpus, entry, width);
      return {
        width,
        lines: wrapped.lines,
        lineWidths: wrapped.lineWidths.map(round),
        balanced: wrapped.usesBalancedLineBreaking,
        brokenWords: wrapped.brokenWords.length,
        orphanLines: wrapped.orphanLines.length,
      };
    }),
  }));
}

function edgeSnapshot(registry, corpus) {
  return corpus.entries.map((entry) => {
    const wrapped = wrapAt(registry, corpus, entry, entry.width);
    return { id: entry.id, width: entry.width, lines: wrapped.lines };
  });
}

function emphasisLayout(registry, corpus, entry, spans) {
  const face = faceFor(corpus, entry);
  return layoutText({
    text: entry.text,
    registry,
    face,
    box: { x: 0, y: 0, width: corpus.width, height: corpus.fontSize * 4 },
    layerId: entry.id,
    sizing: {
      mode: "fit",
      preferredFontSize: corpus.fontSize,
      minimumFontSize: corpus.fontSize,
      maximumLines: 4,
    },
    setting: { kind: "em", lineHeight: 1.1 },
    align: "left",
    ...(spans.length === 0 ? {} : { emphasis: spans }),
    detail: "glyphs",
    coverage: "rendered-lines",
  });
}

function emphasisSnapshot(registry, corpus) {
  return corpus.entries.map((entry) => {
    const styled = emphasisLayout(registry, corpus, entry, entry.spans);
    return {
      id: entry.id,
      lines: styled.lines.map((line) => ({
        text: line.text,
        runs: line.set.runs.map((run) => ({
          text: run.text,
          emphasis: run.emphasis ?? null,
          weight: run.face.weight,
          x: round(run.x),
          glyphs: run.glyphs.map((glyph) => `${glyph.id}@${round(glyph.x)}`).join(" "),
        })),
      })),
    };
  });
}

/** Snapshots of today's output for every corpus, defects included. */
export function buildSnapshots(
  registry = createHarnessRegistry(),
  corpora = loadCorpora(),
) {
  return {
    "C-LAT": shapeSnapshot(registry, corpora["C-LAT"]),
    "C-TH": shapeSnapshot(registry, corpora["C-TH"]),
    "C-MIX": shapeSnapshot(registry, corpora["C-MIX"]),
    "C-PARA": paragraphSnapshot(registry, corpora["C-PARA"]),
    "C-EDGE": edgeSnapshot(registry, corpora["C-EDGE"]),
    "C-EMPH": emphasisSnapshot(registry, corpora["C-EMPH"]),
    "C-PROBE": probeSnapshot(registry, corpora["C-PROBE"]),
  };
}

function probeSnapshot(registry, corpus) {
  const thai = fontkitShaper.loadFace(loadFontBytes().thai);
  return corpus.entries.map((entry) => {
    const face = faceFor(corpus, entry);
    const run = registry.shape(entry.text, face.family, face.weight, face.style);
    const snapshot = {
      id: entry.id,
      defect: entry.defect,
      script: run.script,
      glyphs: encodeRun(run),
    };
    if (face.family === "Noto Sans Thai") {
      snapshot.glyphNames = run.glyphs
        .map((glyph) => fontkitShaper.glyphOutline(thai, glyph.id).name)
        .join(" ");
    }
    if (entry.width !== undefined) {
      const lines = wrapAt(registry, corpus, entry, entry.width).lines;
      snapshot.lines = lines;
      snapshot.lineStartsWithMaiYamokOrPaiyannoi = lines.some(
        (line, index) => index > 0 && /^[\u0e46\u0e2f]/u.test(line),
      );
      snapshot.amountSplitFromUnit = lines.some(
        (line, index) =>
          /\d$/u.test(line) && /^\p{Script=Thai}/u.test(lines[index + 1] ?? ""),
      );
    }
    if (entry.tracking !== undefined) {
      snapshot.markDeviation = markDeviation(
        registry,
        face,
        entry.text,
        entry.tracking,
      );
    }
    if (entry.gold !== undefined) {
      const units = engineThaiBoundaries(registry, corpus, entry);
      snapshot.boundaries = units;
      snapshot.boundariesOutsideGold = breaksOutsideGold(units, entry.gold);
    }
    return snapshot;
  });
}

function engineThaiBoundaries(registry, corpus, entry) {
  // Narrowest possible measure: every break unit on its own line exposes the
  // segmenter's boundaries exactly.
  const wrapped = wrapAt(registry, corpus, entry, 1);
  return lineBreakOffsets(entry.text, wrapped.lines);
}

const MARK = /\p{Mn}/u;

function placements(registry, face, text, trackingEm) {
  const [line] = registry.setLines({
    lines: [text],
    ...face,
    fontSize: 100,
    lineHeight: 1,
    x: 0,
    y: 0,
    align: "left",
    letterSpacing: trackingEm * 100,
  });
  return {
    width: line.width,
    glyphs: line.glyphs.map((glyph) => ({
      x: glyph.x,
      mark: MARK.test(String.fromCodePoint(text.codePointAt(glyph.cluster) ?? 0x20)),
    })),
  };
}

function markDeviation(registry, face, text, trackingEm) {
  const reference = placements(registry, face, text, 0);
  const tracked = placements(registry, face, text, trackingEm);
  const deviation = markOffsetDeviation(reference.glyphs, tracked.glyphs);
  const clusters = graphemes.splitGraphemes(text).length;
  return {
    trackingEm,
    maximumMarkShiftEm: round(deviation.maximum / 100),
    marksMoved: deviation.moved,
    marks: deviation.marks,
    // T08: width should be untracked + (clusters - 1) * tracking.
    widthExcessEm: round(
      (tracked.width - (reference.width + (clusters - 1) * trackingEm * 100)) / 100,
    ),
  };
}

function summarize(values) {
  const defined = values.filter((value) => value !== null && Number.isFinite(value));
  if (defined.length === 0) return { count: 0, mean: null, max: null };
  return {
    count: defined.length,
    mean: round(defined.reduce((total, value) => total + value, 0) / defined.length),
    max: round(Math.max(...defined)),
  };
}

function paragraphMeasures(registry, corpus) {
  const result = {};
  for (const script of ["latn", "thai"]) {
    const face = corpus.faces[script];
    const space = registry.measure(
      " ",
      face.family,
      face.weight,
      face.style,
      corpus.fontSize,
    );
    const entries = corpus.entries.filter((entry) => entry.script === script);
    const perWidth = {};
    for (const width of entries[0].widths) {
      const metrics = [];
      const thai = { insideGraphemeCluster: 0, orthographic: 0, lineEdge: 0 };
      for (const entry of entries) {
        const wrapped = wrapAt(registry, corpus, entry, width);
        const lines = wrapped.lines.map((text, index) => ({
          text,
          width: wrapped.lineWidths[index],
        }));
        // wrapText marks a final line holding one break unit as isolated.
        const isolated = wrapped.orphanLines.some((orphan) => orphan.isolatedWord);
        metrics.push(
          paragraphMetrics(
            lines,
            width,
            { space, ...GLUE },
            {
              finalLineUnitCount: isolated ? 1 : 2,
            },
          ),
        );
        const offsets = lineBreakOffsets(entry.text, wrapped.lines);
        thai.insideGraphemeCluster += breaksInsideGraphemeClusters(
          entry.text,
          offsets,
        ).length;
        for (const finding of thaiBreakFindings(entry.text, offsets)) {
          if (finding.kind === "line-edge") thai.lineEdge += 1;
          else thai.orthographic += 1;
        }
      }
      perWidth[width] = {
        paragraphs: metrics.length,
        lines: metrics.reduce((total, metric) => total + metric.lineCount, 0),
        meanAbsoluteAdjustmentRatio: summarize(
          metrics.map((metric) => metric.meanAbsoluteAdjustmentRatio),
        ),
        runts: metrics.filter((metric) => metric.runt).length,
        hyphenatedLines: metrics.reduce(
          (total, metric) => total + metric.hyphenatedLines,
          0,
        ),
        ragDeviation: summarize(metrics.map((metric) => metric.ragDeviation)),
        meanSlack: summarize(metrics.map((metric) => metric.meanSlack)),
        overfullLines: metrics.reduce(
          (total, metric) => total + metric.overfullLines,
          0,
        ),
        ...(script === "thai" ? { thaiBreaks: thai } : {}),
      };
    }
    result[script] = perWidth;
  }
  return result;
}

function markInvariance(registry, corpus) {
  const face = corpus.face;
  return TRACKING_SAMPLES_EM.map((tracking) => {
    const rows = corpus.entries.map((entry) =>
      markDeviation(registry, face, entry.text, tracking),
    );
    return {
      trackingEm: tracking,
      lines: rows.length,
      linesWithMovedMarks: rows.filter((row) => row.marksMoved > 0).length,
      marks: rows.reduce((total, row) => total + row.marks, 0),
      marksMoved: rows.reduce((total, row) => total + row.marksMoved, 0),
      maximumMarkShiftEm: round(Math.max(...rows.map((row) => row.maximumMarkShiftEm))),
      maximumWidthExcessEm: round(
        Math.max(...rows.map((row) => Math.abs(row.widthExcessEm))),
      ),
    };
  });
}

function inkTopEm(face, character) {
  const run = fontkitShaper.shape(face, { text: character });
  const outline = fontkitShaper.glyphOutline(face, run.glyphs[0].id);
  return outlineTop(outline.commands) / run.unitsPerEm;
}

function xHeightMeasures() {
  const { thai, inter } = loadFontBytes();
  const thaiFace = fontkitShaper.loadFace(thai);
  const interFace = fontkitShaper.loadFace(inter);
  const thaiBody = inkTopEm(thaiFace, "น");
  const pairings = {
    "Noto Sans Thai x / Noto Sans Thai น": crossScriptXHeight(
      inkTopEm(thaiFace, "x"),
      thaiBody,
    ),
    "Inter x / Noto Sans Thai น": crossScriptXHeight(
      inkTopEm(interFace, "x"),
      thaiBody,
    ),
  };
  return Object.fromEntries(
    Object.entries(pairings).map(([name, value]) => [
      name,
      { ratio: round(value.ratio), delta: round(value.delta) },
    ]),
  );
}

function emphasisPositionDrift(registry, corpus) {
  // T07: paint-only runs must not move glyphs. Compare each styled layout with
  // the unstyled one, for entries whose spans are all paint-only.
  const paintOnly = new Set(["accent", "muted"]);
  return corpus.entries
    .filter((entry) => entry.spans.every((span) => paintOnly.has(span.style)))
    .map((entry) => {
      const flat = emphasisLayout(registry, corpus, entry, []);
      const styled = emphasisLayout(registry, corpus, entry, entry.spans);
      const flatX = flat.lines.flatMap((line) =>
        line.set.runs.flatMap((run) => run.glyphs.map((g) => g.x)),
      );
      const styledX = styled.lines.flatMap((line) =>
        line.set.runs.flatMap((run) => run.glyphs.map((g) => g.x)),
      );
      const count = Math.min(flatX.length, styledX.length);
      let maximum = 0;
      for (let index = 0; index < count; index += 1) {
        maximum = Math.max(maximum, Math.abs(flatX[index] - styledX[index]));
      }
      return {
        id: entry.id,
        glyphCountEqual: flatX.length === styledX.length,
        maximumShiftPx: round(maximum),
      };
    });
}

function probeFindings(snapshots) {
  return snapshots["C-PROBE"].map((probe) => ({
    id: probe.id,
    defect: probe.defect,
    ...(probe.script === undefined ? {} : { script: probe.script }),
    ...(probe.glyphNames === undefined ? {} : { glyphNames: probe.glyphNames }),
    ...(probe.lines === undefined
      ? {}
      : {
          lines: probe.lines,
          lineStartsWithMaiYamokOrPaiyannoi: probe.lineStartsWithMaiYamokOrPaiyannoi,
          amountSplitFromUnit: probe.amountSplitFromUnit,
        }),
    ...(probe.markDeviation === undefined
      ? {}
      : { markDeviation: probe.markDeviation }),
    ...(probe.boundaries === undefined
      ? {}
      : {
          boundaries: probe.boundaries,
          boundariesOutsideGold: probe.boundariesOutsideGold,
        }),
  }));
}

function edgeFindings(registry, corpora) {
  const corpus = corpora["C-EDGE"];
  return corpus.entries.map((entry) => {
    const wrapped = wrapAt(registry, corpus, entry, entry.width);
    const offsets = lineBreakOffsets(entry.text, wrapped.lines);
    const broken = new Set(offsets);
    const noBreakControls = [];
    for (let offset = 0; offset < entry.text.length; offset += 1) {
      const character = entry.text[offset];
      if ("  ⁠".includes(character) && (broken.has(offset) || broken.has(offset + 1))) {
        noBreakControls.push(offset);
      }
    }
    return {
      id: entry.id,
      lines: wrapped.lines,
      brokeAtNoBreakControl: noBreakControls.length > 0,
      thaiLineEdgeViolations: thaiBreakFindings(entry.text, offsets).filter(
        (finding) => finding.kind === "line-edge",
      ).length,
    };
  });
}

/** Baseline quality report of the current engine. */
export function buildBaselineReport(
  registry = createHarnessRegistry(),
  corpora = loadCorpora(),
) {
  const snapshots = buildSnapshots(registry, corpora);
  const mix = snapshots["C-MIX"];
  return {
    metricsVersion: TYPOGRAPHY_METRICS_VERSION,
    shaper: registry.shaperId,
    fonts: { "Noto Sans Thai": THAI_FONT_SHA256, Inter: INTER_FONT_SHA256 },
    corpora: Object.fromEntries(
      Object.entries(corpora).map(([id, corpus]) => [id, corpus.entries.length]),
    ),
    snapshotSha256: sha256(Buffer.from(canonicalJson(snapshots))),
    shaping: {
      clusterMappingInexact: Object.fromEntries(
        ["C-LAT", "C-TH", "C-MIX"].map((id) => [
          id,
          snapshots[id]
            .filter((entry) => !entry.clusterMappingExact)
            .map((entry) => entry.id),
        ]),
      ),
      mixedLinesShapedAsLatin: mix.filter((entry) => entry.script === "latn").length,
      mixedLines: mix.length,
    },
    paragraphs: paragraphMeasures(registry, corpora["C-PARA"]),
    markOffsetInvariance: markInvariance(registry, corpora["C-TH"]),
    crossScriptXHeight: xHeightMeasures(),
    emphasisPaintOnlyDrift: emphasisPositionDrift(registry, corpora["C-EMPH"]),
    edges: edgeFindings(registry, corpora),
    probes: probeFindings(snapshots),
    lineBreakTest: evaluateLineBreakTest(),
  };
}

/** Format generated text exactly as `prettier --check` expects it. */
export async function formatForRepository(contents, url) {
  const prettier = await import("prettier");
  const filepath = url.pathname;
  const options = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(contents, { ...options, filepath });
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function round(value) {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
