// Development-only oracles for the typography harness (plan M0, scope item 5).
// Never imported by render code. All data is vendored and hash-checked; no
// function here touches the network.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { segmentThaiText } from "../../dist/typography/index.js";

const PACKAGE_ROOT = new URL("../../", import.meta.url);
const ORACLE_DIRECTORY = "vendor/unicode/17.0.0/oracles/";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function oracleChecksums() {
  return JSON.parse(
    readFileSync(
      new URL(`${ORACLE_DIRECTORY}oracle-checksums.json`, PACKAGE_ROOT),
      "utf8",
    ),
  );
}

/** Read the pinned LineBreakTest.txt, verifying both hashes. */
export function readLineBreakTest() {
  const pinned = oracleChecksums().files["LineBreakTest.txt.gz"];
  const compressed = readFileSync(
    new URL(`${ORACLE_DIRECTORY}LineBreakTest.txt.gz`, PACKAGE_ROOT),
  );
  if (sha256(compressed) !== pinned.compressedSha256) {
    throw new Error("LineBreakTest.txt.gz does not match its pinned hash.");
  }
  const text = gunzipSync(compressed);
  if (sha256(text) !== pinned.uncompressedSha256) {
    throw new Error("LineBreakTest.txt does not match its pinned hash.");
  }
  return text.toString("utf8");
}

/**
 * Parse LineBreakTest.txt into cases: code points and the set of positions
 * (between code points, 1..n-1) where a break is allowed. The final `÷` that
 * every case ends with is not an interior position and is dropped.
 */
export function parseLineBreakTest(source = readLineBreakTest()) {
  const cases = [];
  for (const [lineIndex, rawLine] of source.split("\n").entries()) {
    const line = rawLine.split("#")[0].trim();
    if (line.length === 0) continue;
    const tokens = line.split(/\s+/u);
    const codePoints = [];
    const breaks = [];
    for (const token of tokens) {
      if (token === "÷") {
        if (codePoints.length > 0) breaks.push(codePoints.length);
      } else if (token !== "×") {
        codePoints.push(Number.parseInt(token, 16));
      }
    }
    cases.push({
      line: lineIndex + 1,
      text: String.fromCodePoint(...codePoints),
      codePointCount: codePoints.length,
      breaks: breaks.filter((position) => position < codePoints.length),
    });
  }
  return cases;
}

/**
 * Break opportunities of the current engine, in code-point positions. Today a
 * line may start at the first non-space after a run of `\s` (which wrongly
 * includes NBSP), and inside a Thai token at each BudouX-th 0.7.0 boundary.
 * This mirrors `segmentation.ts` without its whitespace normalisation, which
 * only changes the spaces themselves.
 */
export function engineBreakOpportunities(text) {
  const opportunities = new Set();
  for (const match of text.matchAll(/\S+/gu)) {
    if (match.index > 0) opportunities.add(match.index);
    if (!/[฀-๿]/u.test(match[0])) continue;
    let offset = match.index;
    for (const [index, segment] of segmentThaiText(match[0]).entries()) {
      if (index > 0) opportunities.add(offset);
      offset += segment.length;
    }
  }
  return [...opportunities]
    .map((offset) => [...text.slice(0, offset)].length)
    .sort((left, right) => left - right);
}

/** Conformance of the current engine with LineBreakTest.txt (T09 baseline). */
export function evaluateLineBreakTest() {
  const pinned = oracleChecksums().files["LineBreakTest.txt.gz"];
  const cases = parseLineBreakTest();
  let passing = 0;
  let expectedBreaks = 0;
  let foundBreaks = 0;
  let agreedBreaks = 0;
  for (const testCase of cases) {
    const actual = engineBreakOpportunities(testCase.text);
    const expected = new Set(testCase.breaks);
    const agreed = actual.filter((position) => expected.has(position)).length;
    expectedBreaks += expected.size;
    foundBreaks += actual.length;
    agreedBreaks += agreed;
    if (agreed === expected.size && actual.length === expected.size) passing += 1;
  }
  return {
    source: "LineBreakTest-17.0.0.txt",
    sha256: pinned.uncompressedSha256,
    cases: cases.length,
    passing,
    passRate: Math.round((passing / cases.length) * 10_000) / 10_000,
    breakRecall: Math.round((agreedBreaks / expectedBreaks) * 10_000) / 10_000,
    breakPrecision:
      foundBreaks === 0
        ? null
        : Math.round((agreedBreaks / foundBreaks) * 10_000) / 10_000,
  };
}

/**
 * Script itemizer over the vendored Unicode 17 Scripts.txt (spike only; M1b
 * will generate tables through the offline pipeline). Common and Inherited
 * attach to the preceding run, or to the following one at the start.
 */
export function createScriptItemizer() {
  const source = readFileSync(
    new URL("vendor/unicode/17.0.0/sources/Scripts.txt", PACKAGE_ROOT),
    "utf8",
  );
  const ranges = [];
  for (const rawLine of source.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (line.length === 0) continue;
    const [range, script] = line.split(";").map((part) => part.trim());
    const [start, end = start] = range
      .split("..")
      .map((value) => Number.parseInt(value, 16));
    ranges.push([start, end, script]);
  }
  ranges.sort((left, right) => left[0] - right[0]);
  const scriptOf = (codePoint) => {
    let low = 0;
    let high = ranges.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const [start, end, script] = ranges[middle];
      if (codePoint < start) high = middle - 1;
      else if (codePoint > end) low = middle + 1;
      else return script;
    }
    return "Unknown";
  };
  return (text) => {
    const runs = [];
    let offset = 0;
    for (const character of text) {
      const script = scriptOf(character.codePointAt(0));
      const neutral = script === "Common" || script === "Inherited";
      const last = runs.at(-1);
      if (neutral) {
        if (last !== undefined) last.end += character.length;
      } else if (last !== undefined && last.script === script) {
        last.end += character.length;
      } else {
        runs.push({
          script,
          start: last === undefined ? 0 : offset,
          end: offset + character.length,
        });
      }
      offset += character.length;
    }
    if (runs.length === 0) return [{ script: "Common", start: 0, end: text.length }];
    return runs;
  };
}

/** OpenType script tag for a Unicode script name used in the corpora. */
export function openTypeScriptTag(script) {
  switch (script) {
    case "Thai":
      return "thai";
    case "Latin":
      return "latn";
    default:
      return "DFLT";
  }
}

// ---------------------------------------------------------------------------
// HarfBuzz behind the Shaper interface (spike, scope item 6).

let harfbuzz;

/** Load harfbuzzjs once. Returns the module and its embedded HarfBuzz version. */
export async function loadHarfBuzz() {
  harfbuzz ??= await import("harfbuzzjs");
  return harfbuzz;
}

export const HARFBUZZJS_VERSION = "1.6.4";

/**
 * A `Shaper` (src/fonts/shaper.ts) on harfbuzzjs. Character-level clusters
 * (HarfBuzz cluster level 2) so clusters compare with the fontkit shaper's.
 * Font scale stays at units per em, so advances are in font units.
 */
export async function createHarfBuzzShaper() {
  const hb = await loadHarfBuzz();
  const id = `harfbuzzjs@${HARFBUZZJS_VERSION}/harfbuzz@${hb.versionString()}`;
  const make = (state) => Object.freeze({ shaper: id, ...state });
  const unwrap = (face) => {
    if (face.shaper !== id)
      throw new Error(`A ${face.shaper} face cannot be shaped by ${id}.`);
    return face;
  };
  return {
    id,
    loadFace(bytes) {
      const blob = new hb.Blob(bytes);
      const face = new hb.Face(blob, 0);
      const font = new hb.Font(face);
      return make({ blob, face, font, coordinates: {} });
    },
    variationAxes(handle) {
      const axes = unwrap(handle).face.getAxisInfos();
      return Object.fromEntries(
        Object.entries(axes).map(([tag, axis]) => [
          tag,
          { min: axis.min, default: axis.default, max: axis.max },
        ]),
      );
    },
    instantiate(handle, coordinates) {
      const { blob, face } = unwrap(handle);
      const font = new hb.Font(face);
      font.setVariations(
        Object.entries(coordinates).map(([tag, value]) => new hb.Variation(tag, value)),
      );
      return make({ blob, face, font, coordinates: { ...coordinates } });
    },
    shape(handle, request) {
      if (request.direction !== undefined && request.direction !== "ltr") {
        throw new Error(`Shaping direction "${request.direction}" is not supported.`);
      }
      const { font } = unwrap(handle);
      const buffer = new hb.Buffer();
      buffer.addText(request.text);
      buffer.setClusterLevel(hb.ClusterLevel.CHARACTERS);
      buffer.guessSegmentProperties();
      if (request.script !== undefined) buffer.setScript(request.script);
      if (request.language !== undefined) buffer.setLanguage(request.language);
      buffer.setDirection(hb.Direction.LTR);
      const features = Object.entries(request.features ?? {}).map(
        ([tag, on]) => new hb.Feature(tag, on ? 1 : 0),
      );
      hb.shape(font, buffer, features);
      const infos = buffer.getGlyphInfosAndPositions();
      const clusters = [...new Set(infos.map((info) => info.cluster))].sort(
        (a, b) => a - b,
      );
      const glyphs = infos.map((info) => {
        const next =
          clusters.find((cluster) => cluster > info.cluster) ?? request.text.length;
        return {
          id: info.codepoint,
          cluster: info.cluster,
          codePointCount: [...request.text.slice(info.cluster, next)].length,
          xAdvance: info.xAdvance ?? 0,
          yAdvance: info.yAdvance ?? 0,
          xOffset: info.xOffset ?? 0,
          yOffset: info.yOffset ?? 0,
        };
      });
      return {
        glyphs,
        advanceWidth: glyphs.reduce((total, glyph) => total + glyph.xAdvance, 0),
        unitsPerEm: unwrap(handle).face.upem,
        script: request.script,
        direction: "ltr",
      };
    },
    glyphOutline(handle, glyphId) {
      const { font, face } = unwrap(handle);
      return {
        commands: font.glyphToJson(glyphId).map(svgToOutline),
        color: face.hasColorLayers() && face.getGlyphColorLayers(glyphId).length > 0,
        name: font.glyphName(glyphId),
      };
    },
    metrics(handle) {
      const { font, face } = unwrap(handle);
      const extents = font.hExtents();
      return {
        unitsPerEm: face.upem,
        ascent: extents.ascender,
        descent: extents.descender,
        xHeight: font.getMetricPositionWithFallback(hb.MetricsTag.X_HEIGHT),
        capHeight: font.getMetricPositionWithFallback(hb.MetricsTag.CAP_HEIGHT),
      };
    },
    hasGlyphForCodePoint(handle, codePoint) {
      return unwrap(handle).font.nominalGlyph(codePoint) !== undefined;
    },
    availableFeatures(handle) {
      const { face } = unwrap(handle);
      return [
        ...new Set([
          ...face.getTableFeatureTags("GSUB"),
          ...face.getTableFeatureTags("GPOS"),
        ]),
      ];
    },
  };
}

function svgToOutline(segment) {
  switch (segment.type) {
    case "M":
      return { command: "moveTo", args: segment.values };
    case "L":
      return { command: "lineTo", args: segment.values };
    case "Q":
      return { command: "quadraticCurveTo", args: segment.values };
    case "C":
      return { command: "bezierCurveTo", args: segment.values };
    case "Z":
      return { command: "closePath", args: [] };
    default:
      throw new Error(`Unexpected path segment ${segment.type}.`);
  }
}

// ---------------------------------------------------------------------------
// Offline instancer report.

/**
 * Compare two shapers' variable-font instancing: for every `fvar` axis at its
 * minimum, default, maximum and the midpoints between them (other axes at
 * default; masters hide rounding, midpoints expose it), outline each sampled
 * glyph with both and record the largest coordinate difference, in 1/1000 em.
 * The plan's T03 tolerance is 0.5/1000 em per point.
 */
export function instancerReport({ subject, reference, bytes, fontName, sampleText }) {
  const subjectBase = subject.loadFace(bytes);
  const referenceBase = reference.loadFace(bytes);
  const axes = subject.variationAxes(subjectBase);
  const upem = subject.metrics(subjectBase).unitsPerEm;
  const glyphIds = [
    ...new Set(
      subject.shape(subjectBase, { text: sampleText }).glyphs.map((glyph) => glyph.id),
    ),
  ].sort((left, right) => left - right);
  const rows = [];
  for (const [tag, axis] of Object.entries(axes)) {
    for (const [position, value] of [
      ["min", axis.min],
      ["min-default midpoint", (axis.min + axis.default) / 2],
      ["default", axis.default],
      ["default-max midpoint", (axis.default + axis.max) / 2],
      ["max", axis.max],
    ]) {
      if (value === axis.default && position.includes("midpoint")) continue;
      const left = subject.instantiate(subjectBase, { [tag]: value });
      const right = reference.instantiate(referenceBase, { [tag]: value });
      let maximum = 0;
      let structureMismatches = 0;
      for (const glyphId of glyphIds) {
        const a = pointsOf(subject.glyphOutline(left, glyphId).commands);
        const b = pointsOf(reference.glyphOutline(right, glyphId).commands);
        if (a.length !== b.length) {
          structureMismatches += 1;
          maximum = Math.max(maximum, boundsDelta(a, b));
          continue;
        }
        for (let index = 0; index < a.length; index += 1) {
          maximum = Math.max(maximum, Math.abs(a[index] - b[index]));
        }
      }
      rows.push({
        axis: tag,
        position,
        value,
        glyphs: glyphIds.length,
        structureMismatches,
        pathBytesIdentical: maximum === 0 && structureMismatches === 0,
        maximumDeltaPerMilleEm: Math.round(((maximum * 1000) / upem) * 1000) / 1000,
        withinT03Tolerance: (maximum * 1000) / upem <= 0.5,
      });
    }
  }
  return {
    font: fontName,
    subject: subject.id,
    reference: reference.id,
    unitsPerEm: upem,
    rows,
  };
}

function pointsOf(commands) {
  return normalizeOutline(commands).flatMap((command) => command.args);
}

/**
 * Drop a `lineTo` that only returns to the contour's start right before
 * `closePath`. HarfBuzz's draw callbacks emit it; fontkit leaves it implied.
 * The geometry is identical; only the command list differs.
 */
export function normalizeOutline(commands) {
  const normalized = [];
  let start;
  for (const [index, command] of commands.entries()) {
    if (command.command === "moveTo") start = command.args;
    const next = commands[index + 1];
    if (
      command.command === "lineTo" &&
      next?.command === "closePath" &&
      start !== undefined &&
      command.args[0] === start[0] &&
      command.args[1] === start[1]
    ) {
      continue;
    }
    normalized.push(command);
  }
  return normalized;
}

function boundsDelta(a, b) {
  const box = (values) => {
    const xs = values.filter((_, index) => index % 2 === 0);
    const ys = values.filter((_, index) => index % 2 === 1);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  if (a.length === 0 || b.length === 0) return a.length === b.length ? 0 : Infinity;
  const left = box(a);
  const right = box(b);
  return Math.max(...left.map((value, index) => Math.abs(value - right[index])));
}

// ---------------------------------------------------------------------------
// fontTools instancer reference (generated offline, committed, hash-pinned).

export const INSTANCER_REFERENCE_SHA256 =
  "04b85cab4ad221385dcb5bcac65e1aa8f32c003b15f9aef132c5c3127953ea12";

export function readInstancerReference() {
  const compressed = readFileSync(
    new URL("tests/typography/oracles/instancer-reference.json.gz", PACKAGE_ROOT),
  );
  if (sha256(compressed) !== INSTANCER_REFERENCE_SHA256) {
    throw new Error("instancer-reference.json.gz does not match its pinned hash.");
  }
  return JSON.parse(gunzipSync(compressed).toString("utf8"));
}

/**
 * Compare a shaper's instanced outlines with the fontTools reference: the
 * unrounded glyph set ("float") and varLib.instancer output ("rounded").
 * Deltas are in 1/1000 em; T03's tolerance is 0.5.
 */
export function compareWithInstancerReference(shaper, fontBytes) {
  const reference = readInstancerReference();
  const result = {
    reference: `fontTools ${reference.fontTools}`,
    shaper: shaper.id,
    fonts: {},
  };
  for (const [fileName, font] of Object.entries(reference.fonts)) {
    const bytes = fontBytes[fileName];
    if (sha256(bytes) !== font.sha256) throw new Error(`${fileName} bytes changed.`);
    const base = shaper.loadFace(bytes);
    const wanted = new Set(font.glyphNames);
    const ids = new Map();
    for (const character of font.sample) {
      for (const glyph of shaper.shape(base, { text: character }).glyphs) {
        const name = shaper.glyphOutline(base, glyph.id).name;
        if (wanted.has(name)) ids.set(name, glyph.id);
      }
    }
    result.fonts[fileName] = font.rows.map((row) => {
      const face = shaper.instantiate(base, { [row.axis]: row.value });
      const worst = { float: 0, rounded: 0 };
      let structureMismatches = 0;
      for (const name of font.glyphNames) {
        const id = ids.get(name);
        if (id === undefined) continue;
        const actual = pointsOf(shaper.glyphOutline(face, id).commands);
        for (const variant of ["float", "rounded"]) {
          const expected = pointsOf(
            row.glyphs[name][variant].map(([command, args]) => ({ command, args })),
          );
          if (expected.length !== actual.length) {
            structureMismatches += 1;
            worst[variant] = Math.max(worst[variant], boundsDelta(actual, expected));
            continue;
          }
          for (let index = 0; index < actual.length; index += 1) {
            worst[variant] = Math.max(
              worst[variant],
              Math.abs(actual[index] - expected[index]),
            );
          }
        }
      }
      const perMille = (value) =>
        Math.round(((value * 1000) / font.unitsPerEm) * 1000) / 1000;
      return {
        axis: row.axis,
        position: row.position,
        value: row.value,
        glyphs: font.glyphNames.length,
        glyphsResolved: ids.size,
        structureMismatches,
        maximumDeltaVsUnroundedPerMilleEm: perMille(worst.float),
        maximumDeltaVsInstancerPerMilleEm: perMille(worst.rounded),
      };
    });
  }
  return result;
}
