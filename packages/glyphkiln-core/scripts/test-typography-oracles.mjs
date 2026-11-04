// Self-tests for the development-only typography oracles (plan M0). Offline:
// every input is vendored and hash-checked.
import assert from "node:assert/strict";

import { fontkitShaper } from "../dist/fonts/shaper.js";
import { loadFontBytes } from "./typography/harness.mjs";
import {
  compareWithInstancerReference,
  createHarfBuzzShaper,
  createScriptItemizer,
  engineBreakOpportunities,
  normalizeOutline,
  parseLineBreakTest,
  readInstancerReference,
} from "./typography/oracles.mjs";

// LineBreakTest.txt: pinned file, every case parsed.
const cases = parseLineBreakTest();
assert.equal(cases.length, 19_338);
assert.deepEqual(parseLineBreakTest("× 0041 × 0020 ÷ 0042 ÷\t#  A SP B\n# comment\n"), [
  { line: 1, text: "A B", codePointCount: 3, breaks: [2] },
]);
assert.deepEqual(engineBreakOpportunities("Run 100 km"), [4, 8]);
assert.deepEqual(engineBreakOpportunities("กรุงเทพมหานคร"), [8, 11]);

// Script itemizer over Unicode 17 Scripts.txt.
const itemize = createScriptItemizer();
assert.deepEqual(itemize("AI ที่ป้ญู"), [
  { script: "Latin", start: 0, end: 3 },
  { script: "Thai", start: 3, end: 10 },
]);
assert.deepEqual(itemize("“499” บาท"), [{ script: "Thai", start: 0, end: 9 }]);
assert.deepEqual(itemize("123"), [{ script: "Common", start: 0, end: 3 }]);

// Outline normalisation drops only a closing line back to the contour start.
assert.deepEqual(
  normalizeOutline([
    { command: "moveTo", args: [0, 0] },
    { command: "lineTo", args: [10, 0] },
    { command: "lineTo", args: [0, 0] },
    { command: "closePath", args: [] },
  ]).map((command) => command.command),
  ["moveTo", "lineTo", "closePath"],
);

// HarfBuzz behind the Shaper interface.
const harfbuzz = await createHarfBuzzShaper();
assert.match(harfbuzz.id, /^harfbuzzjs@1\.6\.4\/harfbuzz@\d+\.\d+\.\d+$/u);
const { inter, thai } = loadFontBytes();
const thaiFace = harfbuzz.loadFace(thai);
const names = (face, text, script) =>
  harfbuzz
    .shape(face, { text, ...(script === undefined ? {} : { script }) })
    .glyphs.map((glyph) => harfbuzz.glyphOutline(face, glyph.id).name);
assert.ok(names(thaiFace, "ที่").includes("uni0E48.small"));
assert.ok(names(thaiFace, "AI ที่").includes("uni0E48"), "whole-line guess is Latin");
assert.deepEqual(
  harfbuzz.shape(thaiFace, { text: "น้ำ" }).glyphs.map((glyph) => glyph.cluster),
  [0, 2, 1, 2],
  "HarfBuzz reorders nikhahit before the tone mark",
);
assert.throws(() => harfbuzz.shape(thaiFace, { text: "a", direction: "rtl" }));
assert.throws(() => harfbuzz.shape({ shaper: "other" }, { text: "a" }));
const interFace = harfbuzz.loadFace(inter);
assert.deepEqual(
  harfbuzz.metrics(interFace),
  fontkitShaper.metrics(fontkitShaper.loadFace(inter)),
);
assert.ok(harfbuzz.hasGlyphForCodePoint(interFace, 0x41));
assert.ok(!harfbuzz.hasGlyphForCodePoint(interFace, 0x0e01));
assert.ok(harfbuzz.availableFeatures(interFace).includes("kern"));
assert.equal(harfbuzz.variationAxes(interFace).wght.max, 900);
const unkerned = harfbuzz.shape(interFace, { text: "AV", features: { kern: false } });
assert.ok(
  harfbuzz.shape(interFace, { text: "AV" }).advanceWidth < unkerned.advanceWidth,
);

// fontTools instancer reference: pinned, and HarfBuzz reproduces it.
const reference = readInstancerReference();
assert.equal(reference.fontTools, "4.60.1");
const bytes = { "Inter-Variable.ttf": inter, "NotoSansThai.ttf": thai };
for (const rows of Object.values(
  compareWithInstancerReference(harfbuzz, bytes).fonts,
)) {
  for (const row of rows) {
    assert.equal(row.glyphsResolved, row.glyphs);
    assert.equal(row.structureMismatches, 0);
    assert.ok(row.maximumDeltaVsUnroundedPerMilleEm <= 0.01);
  }
}
for (const rows of Object.values(
  compareWithInstancerReference(fontkitShaper, bytes).fonts,
)) {
  for (const row of rows) assert.ok(row.maximumDeltaVsInstancerPerMilleEm <= 0.5);
}

process.stdout.write(
  `Typography oracles passed (${cases.length} LineBreakTest cases).\n`,
);
