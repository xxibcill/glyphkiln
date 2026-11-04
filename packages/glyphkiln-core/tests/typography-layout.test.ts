import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GlyphkilnError } from "../src/domain/types.js";
import { FontRegistry } from "../src/fonts/index.js";
import { FONTKIT_SHAPER_ID, fontkitShaper } from "../src/fonts/shaper.js";
import { fitText } from "../src/typography/index.js";
import { layoutText, missingGlyphIssue } from "../src/typography/layout-text.js";
import {
  adjustmentRatio,
  breaksInsideGraphemeClusters,
  breaksOutsideGold,
  countInterwordSpaces,
  crossScriptXHeight,
  lineBreakOffsets,
  markOffsetDeviation,
  markOffsets,
  outlineTop,
  paragraphMetrics,
  thaiBreakFindings,
} from "../src/typography/quality-metrics.js";
import { outlineRichLines } from "../src/typography/rich-text.js";

const thaiBytes = new Uint8Array(
  readFileSync(new URL("../fixtures/scene-thai/font/NotoSansThai.ttf", import.meta.url)),
);
const interBytes = new Uint8Array(
  readFileSync(new URL("../assets/fonts/Inter-Variable.ttf", import.meta.url)),
);

function registry(): FontRegistry {
  return new FontRegistry(
    [400, 700].map((weight) => ({
      family: "Noto Sans Thai",
      weight,
      style: "normal" as const,
      bytes: thaiBytes,
    })),
  );
}

function glyphNames(text: string, script?: string): string[] {
  const face = fontkitShaper.loadFace(thaiBytes);
  const run = fontkitShaper.shape(face, { text, ...(script === undefined ? {} : { script }) });
  return run.glyphs.map((glyph) => fontkitShaper.glyphOutline(face, glyph.id).name ?? "");
}

describe("fontkit shaper", () => {
  it("reproduces the legacy one-script-per-line choice and honours an explicit script", () => {
    const face = fontkitShaper.loadFace(thaiBytes);
    expect(fontkitShaper.shape(face, { text: "AI ที่" }).script).toBe("latn");
    expect(glyphNames("ที่")).toContain("uni0E48.small");
    // The §3.1 defect: inside a Latin-first line the Thai tone mark keeps its
    // default form. Shaping the Thai run with its own script fixes it.
    expect(glyphNames("AI ที่")).toContain("uni0E48");
    expect(glyphNames("ที่", "thai")).toContain("uni0E48.small");
  });

  it("derives character clusters, folding fontkit's sara am decomposition", () => {
    const face = fontkitShaper.loadFace(thaiBytes);
    const run = fontkitShaper.shape(face, { text: "น้ำ" });
    expect(run.glyphs.map((glyph) => glyph.cluster)).toEqual([0, 1, 2, 2]);
    expect(run.glyphs.reduce((total, glyph) => total + glyph.codePointCount, 0)).toBe(3);
    const latin = fontkitShaper.shape(fontkitShaper.loadFace(interBytes), {
      text: "A😀B",
    });
    expect(latin.glyphs.map((glyph) => glyph.cluster)).toEqual([0, 1, 3]);
  });

  it("applies explicit features on top of the defaults", () => {
    const face = fontkitShaper.loadFace(interBytes);
    const kerned = fontkitShaper.shape(face, { text: "AV" });
    const unkerned = fontkitShaper.shape(face, { text: "AV", features: { kern: false } });
    expect(kerned.advanceWidth).toBeLessThan(unkerned.advanceWidth);
    expect(fontkitShaper.availableFeatures(face)).toContain("kern");
    expect(fontkitShaper.hasGlyphForCodePoint(face, 0x41)).toBe(true);
    expect(fontkitShaper.hasGlyphForCodePoint(face, 0x0e01)).toBe(false);
  });

  it("instances variation coordinates and reports metrics and axes", () => {
    const base = fontkitShaper.loadFace(interBytes);
    expect(fontkitShaper.variationAxes(base)["wght"]).toMatchObject({ min: 100, max: 900 });
    const bold = fontkitShaper.instantiate(base, { wght: 700 });
    const regular = fontkitShaper.shape(base, { text: "Glyph" }).advanceWidth;
    expect(fontkitShaper.shape(bold, { text: "Glyph" }).advanceWidth).toBeGreaterThan(regular);
    expect(fontkitShaper.metrics(base)).toMatchObject({ unitsPerEm: 2048, ascent: 1984 });
  });

  it("rejects unsupported directions and faces from another shaper", () => {
    const face = fontkitShaper.loadFace(interBytes);
    expect(() => fontkitShaper.shape(face, { text: "a", direction: "rtl" })).toThrow(
      expect.objectContaining({ code: "SHAPING_DIRECTION_UNSUPPORTED" }),
    );
    expect(() => fontkitShaper.shape({ shaper: "other" }, { text: "a" })).toThrow(
      expect.objectContaining({ code: "SHAPER_FACE_MISMATCH" }),
    );
    expect(() => fontkitShaper.loadFace(new Uint8Array([0, 1, 2, 3]))).toThrow();
  });

  it("is the registry's shaper", () => {
    expect(registry().shaperId).toBe(FONTKIT_SHAPER_ID);
  });
});

describe("FontRegistry setters", () => {
  it("returns the outlineText paths with positioned glyph evidence", () => {
    const fonts = registry();
    const input = {
      lines: ["ที่ป้ญู", "AI"],
      family: "Noto Sans Thai",
      weight: 400,
      style: "normal" as const,
      fontSize: 40,
      lineHeight: 1.2,
      x: 100,
      y: 10,
      align: "center" as const,
      letterSpacing: 2,
    };
    const set = fonts.setLines(input);
    expect(set.map((line) => line.path)).toEqual(fonts.outlineText(input));
    expect(set[1]!.baseline - set[0]!.baseline).toBeCloseTo(48);
    const [first] = set;
    expect(first!.x).toBeCloseTo(100 - first!.width / 2);
    // Tracking is applied after every glyph today, marks included (§3.1).
    expect(first!.glyphs[1]!.advance).toBe(2);
  });

  it("sets styled segments with the outlineSegments paths and width", () => {
    const fonts = registry();
    const input = {
      segments: [
        { text: "ลด", weight: 400, style: "normal" as const },
        { text: "25%", weight: 700, style: "normal" as const },
      ],
      family: "Noto Sans Thai",
      fontSize: 30,
      x: 5,
      baseline: 40,
      letterSpacing: 1,
    };
    const set = fonts.setSegments(input);
    const legacy = fonts.outlineSegments(input);
    expect(set.segments.map((segment) => segment.path)).toEqual(legacy.paths);
    expect(set.width).toBe(legacy.width);
    expect(set.segments[1]!.x).toBeCloseTo(5 + set.segments[0]!.width + 1);
  });

  it("shapes with an explicit script through the registry", () => {
    const fonts = registry();
    const run = fonts.shape("ที่", "Noto Sans Thai", 400, "normal", undefined, {
      script: "thai",
    });
    expect(run.script).toBe("thai");
  });
});

describe("layoutText", () => {
  const box = { x: 40, y: 60, width: 420, height: 300 };

  it("reproduces fitText and outlineText for template text", () => {
    const fonts = registry();
    const layout = layoutText({
      text: "วันนี้มีข้อเสนอพิเศษสำหรับคนที่ชอบอ่านชัดๆ",
      registry: fonts,
      face: { family: "Noto Sans Thai", weight: 400, style: "normal" },
      box,
      layerId: "headline",
      sizing: { mode: "fit", preferredFontSize: 72, minimumFontSize: 24, maximumLines: 3 },
      setting: { kind: "em", lineHeight: 1.2, letterSpacingEm: -0.01 },
      align: "right",
      detail: "glyphs",
      renderedLineLimit: 3,
      coverage: "rendered-lines",
    });
    const fitted = fitText({
      text: "วันนี้มีข้อเสนอพิเศษสำหรับคนที่ชอบอ่านชัดๆ",
      registry: fonts,
      style: { family: "Noto Sans Thai", weight: 400, style: "normal", lineHeight: 1.2 },
      box,
      preferredFontSize: 72,
      minimumFontSize: 24,
      maximumLines: 3,
      layerId: "headline",
      letterSpacingEm: -0.01,
    });
    expect(layout.lines.map((line) => line.text)).toEqual(fitted.lines);
    expect(layout.fontSize).toBe(fitted.fontSize);
    expect(layout.letterSpacing).toBe(-0.01 * fitted.fontSize);
    expect(layout.issues).toEqual(fitted.issues);
    expect(layout.bounds).toEqual({
      x: box.x + box.width - fitted.width,
      y: box.y,
      width: fitted.width,
      height: fitted.height,
    });
    expect(layout.lines.map((line) => line.set!.outline)).toEqual(
      fonts.outlineText({
        lines: fitted.lines,
        family: "Noto Sans Thai",
        weight: 400,
        style: "normal",
        fontSize: fitted.fontSize,
        lineHeight: 1.2,
        x: box.x + box.width,
        y: box.y,
        align: "right",
        letterSpacing: -0.01 * fitted.fontSize,
      }),
    );
    expect(layout.missingCodePoints).toEqual([]);
    expect(layout.evidence).toMatchObject({
      shaper: FONTKIT_SHAPER_ID,
      usesBalancedLineBreaking: true,
      segmentationPolicyVersion: "budoux-th@0.7.0",
    });
    const run = layout.lines[0]!.set!.runs[0]!;
    expect(run.text).toBe(layout.lines[0]!.text);
    expect(run.glyphs.length).toBeGreaterThan(0);
  });

  it("places Scene text with absolute spacing and vertical alignment", () => {
    const fonts = new FontRegistry();
    const base = {
      text: "Exact bytes",
      registry: fonts,
      face: { family: "Inter", weight: 700, style: "normal" as const },
      box,
      layerId: "scene-text",
      sizing: {
        mode: "fit" as const,
        preferredFontSize: 48,
        minimumFontSize: 20,
        maximumLines: 2,
      },
      setting: { kind: "absolute" as const, lineHeight: 1.1, letterSpacing: 3 },
      align: "center" as const,
      detail: "glyphs" as const,
      coverage: "source-text" as const,
    };
    const top = layoutText(base);
    const middle = layoutText({ ...base, verticalAlign: "middle" });
    const bottom = layoutText({ ...base, verticalAlign: "bottom" });
    expect(top.anchor).toEqual({ x: box.x + box.width / 2, y: box.y });
    expect(middle.anchor.y).toBeCloseTo(box.y + (box.height - top.metrics.height) / 2);
    expect(bottom.anchor.y).toBeCloseTo(box.y + box.height - top.metrics.height);
    expect(top.letterSpacing).toBe(3);
    expect(top.lineHeight).toBe(1.1);
  });

  it("reports uncovered code points from the source text or the rendered lines", () => {
    const fonts = new FontRegistry();
    const request = {
      text: "Hi ไทย",
      registry: fonts,
      face: { family: "Inter", weight: 400, style: "normal" as const },
      box,
      layerId: "copy",
      sizing: { mode: "fixed" as const, fontSize: 20 },
      setting: { kind: "em" as const, lineHeight: 1 },
      align: "left" as const,
      detail: "glyphs" as const,
    };
    expect(layoutText({ ...request, coverage: "source-text" }).missingCodePoints).toEqual([
      0x0e44, 0x0e17, 0x0e22,
    ]);
    expect(
      layoutText({
        ...request,
        sizing: { mode: "fixed", fontSize: 20, lines: ["Hi"] },
        coverage: "rendered-lines",
      }).missingCodePoints,
    ).toEqual([]);
    expect(layoutText(request).missingCodePoints).toEqual([]);
    expect(missingGlyphIssue("copy", "Missing.", [0x0e44])).toMatchObject({
      code: "MISSING_GLYPH",
      details: { codePoints: ["U+0E44"] },
    });
  });

  it("sets fixed-size lines without fitting", () => {
    const fonts = new FontRegistry();
    const layout = layoutText({
      text: "One\nTwo",
      registry: fonts,
      face: { family: "Inter", weight: 400, style: "normal" },
      box: { x: 0, y: 0, width: 0, height: 0 },
      layerId: "mark",
      sizing: { mode: "fixed", fontSize: 30 },
      setting: { kind: "absolute", lineHeight: 1 },
      align: "left",
      detail: "glyphs",
    });
    expect(layout.fitted).toBeUndefined();
    expect(layout.issues).toEqual([]);
    expect(layout.lines.map((line) => line.text)).toEqual(["One", "Two"]);
    expect(layout.metrics.height).toBe(60);
    expect(layout.evidence.segmentationPolicy).toBeUndefined();
  });

  it("follows a size-dependent setting and stops early for measurement", () => {
    const fonts = new FontRegistry();
    const atSize = (fontSize: number) => ({
      lineHeight: fontSize > 40 ? 1 : 1.3,
      letterSpacingEm: -0.02,
    });
    const layout = layoutText({
      text: "Typography for a new season",
      registry: fonts,
      face: { family: "Inter", weight: 400, style: "normal" },
      box,
      layerId: "headline",
      sizing: { mode: "fit", preferredFontSize: 64, minimumFontSize: 24, maximumLines: 2 },
      setting: { kind: "at-size", atSize },
      align: "left",
      detail: "measure",
    });
    expect(layout.lineHeight).toBe(atSize(layout.fontSize).lineHeight);
    expect(layout.letterSpacing).toBe(-0.02 * layout.fontSize);
    expect(layout.fitted?.setting).toEqual(atSize(layout.fontSize));
    expect(layout.lines.every((line) => line.set === undefined)).toBe(true);
  });

  it("sets emphasis runs exactly as outlineRichLines does", () => {
    const fonts = new FontRegistry();
    const spans = [
      { phrase: "50%", style: "strong" as const },
      { phrase: "weekend", style: "accent" as const },
    ];
    const layout = layoutText({
      text: "Save 50% this weekend only",
      registry: fonts,
      face: { family: "Inter", weight: 400, style: "normal" },
      box: { x: 0, y: 0, width: 900, height: 200 },
      layerId: "headline",
      sizing: { mode: "fit", preferredFontSize: 48, minimumFontSize: 48, maximumLines: 2 },
      setting: { kind: "em", lineHeight: 1.1 },
      align: "center",
      features: { kern: true },
      emphasis: spans,
      detail: "glyphs",
    });
    const rich = outlineRichLines({
      registry: fonts,
      lines: layout.lines.map((line) => line.text),
      spans,
      family: "Inter",
      weight: 400,
      fontSize: 48,
      lineHeight: 1.1,
      x: 450,
      y: 0,
      align: "center",
      features: { kern: true },
    });
    const line = layout.lines[0]!.set!;
    expect(line.outline).toBe(rich[0]!.base);
    expect(line.emphasis).toEqual(rich[0]!.emphasis);
    expect(line.runs.map((run) => run.text).join("")).toBe(layout.lines[0]!.text);
    expect(line.runs.find((run) => run.text === "50%")).toMatchObject({
      emphasis: "strong",
      face: { weight: 700 },
    });
  });
});

describe("typography quality metrics", () => {
  const glue = { space: 10, stretch: 0.5, shrink: 1 / 3 };

  it("computes TeX adjustment ratios", () => {
    expect(countInterwordSpaces(" a b  c ")).toBe(3);
    expect(adjustmentRatio({ text: "word", width: 50 }, 100, glue)).toBeNull();
    expect(adjustmentRatio({ text: "a b c", width: 90 }, 100, glue)).toBeCloseTo(1);
    expect(adjustmentRatio({ text: "a b c", width: 110 }, 100, glue)).toBeCloseTo(-1.5);
  });

  it("summarizes a paragraph", () => {
    const metrics = paragraphMetrics(
      [
        { text: "alpha beta", width: 90 },
        { text: "gamma co-", width: 70 },
        { text: "op", width: 20 },
      ],
      100,
      glue,
    );
    expect(metrics.lineCount).toBe(3);
    expect(metrics.adjustmentRatios[0]).toBeCloseTo(2);
    expect(metrics.meanAbsoluteAdjustmentRatio).toBeCloseTo(4);
    expect(metrics.runt).toBe(true);
    expect(metrics.hyphenatedLines).toBe(1);
    expect(metrics.ragDeviation).toBeCloseTo(0.1);
    expect(metrics.meanSlack).toBeCloseTo(0.2);
    expect(metrics.overfullLines).toBe(0);
    const thai = paragraphMetrics(
      [
        { text: "ภาษาไทย", width: 90 },
        { text: "อ่านง่าย", width: 120 },
      ],
      100,
      glue,
      { finalLineUnitCount: 2 },
    );
    expect(thai.runt).toBe(false);
    expect(thai.meanAbsoluteAdjustmentRatio).toBeNull();
    expect(thai.overfullLines).toBe(1);
    expect(paragraphMetrics([{ text: "one", width: 10 }], 0, glue)).toMatchObject({
      ragDeviation: 0,
      meanSlack: 0,
      runt: false,
    });
  });

  it("locates line breaks and checks them against clusters, Thai orthography and gold", () => {
    expect(lineBreakOffsets("Run 100 km", ["Run 100", "km"])).toEqual([8]);
    expect(lineBreakOffsets("abc", ["abc", "zzz"])).toEqual([]);
    expect(breaksInsideGraphemeClusters("ที่", [1, 3])).toEqual([1]);
    expect(thaiBreakFindings("เด็กๆ ไป", [4])).toEqual([{ offset: 4, kind: "line-edge" }]);
    expect(thaiBreakFindings("เกม", [1])).toEqual([
      { offset: 1, kind: "after-leading-vowel" },
    ]);
    expect(thaiBreakFindings("กา", [1])).toEqual([{ offset: 1, kind: "before-dependent" }]);
    expect(thaiBreakFindings("ที่", [1])).toEqual([{ offset: 1, kind: "inside-cluster" }]);
    expect(thaiBreakFindings("กรุงเทพ", [4])).toEqual([]);
    expect(breaksOutsideGold([8, 11], [4, 7, 10])).toEqual([8, 11]);
  });

  it("measures mark offset invariance", () => {
    const reference = [
      { x: 0, mark: true },
      { x: 10, mark: false },
      { x: 18, mark: true },
      { x: 18, mark: true },
    ];
    const tracked = [
      { x: 0, mark: true },
      { x: 10, mark: false },
      { x: 20, mark: true },
      { x: 22, mark: true },
    ];
    expect(markOffsets(reference)).toEqual([8, 8]);
    expect(markOffsetDeviation(reference, tracked)).toEqual({
      maximum: 4,
      moved: 2,
      marks: 2,
    });
    expect(markOffsetDeviation(reference, reference).moved).toBe(0);
  });

  it("finds the exact top of an outline", () => {
    expect(
      outlineTop([
        { command: "moveTo", args: [0, 0] },
        { command: "quadraticCurveTo", args: [50, 100, 100, 0] },
        { command: "closePath", args: [] },
      ]),
    ).toBeCloseTo(50);
    expect(
      outlineTop([
        { command: "moveTo", args: [0, 0] },
        { command: "bezierCurveTo", args: [0, 100, 100, 100, 100, 0] },
        { command: "lineTo", args: [0, 0] },
      ]),
    ).toBeCloseTo(75);
    expect(
      outlineTop([
        { command: "moveTo", args: [0, 0] },
        { command: "bezierCurveTo", args: [10, 10, 20, 20, 30, 30] },
        { command: "quadraticCurveTo", args: [40, 30, 50, 30] },
      ]),
    ).toBeCloseTo(30);
    expect(outlineTop([])).toBeNull();
    expect(crossScriptXHeight(0.5, 0.5)).toEqual({ ratio: 1, delta: 0 });
  });

  it("uses GlyphkilnError for shaping failures", () => {
    expect(new GlyphkilnError("x", "SHAPING_DIRECTION_UNSUPPORTED")).toBeInstanceOf(Error);
  });
});
