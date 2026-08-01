import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FontRegistry,
  LINE_BREAKING_POLICY_VERSION,
  THAI_SEGMENTATION_POLICY_VERSION,
  TYPOGRAPHY_ALGORITHM_VERSION,
  contrastRatio,
  fitText,
  isInside,
  segmentThaiText,
  wrapText,
  type TextMeasurer,
} from "../src/index.js";

const registry = new FontRegistry();
const baseStyle = {
  family: "Inter",
  weight: 400,
  style: "normal" as const,
  fontSize: 30,
  lineHeight: 1.2,
};

const fixedWidthRegistry: TextMeasurer = {
  measure: (text, _family, _weight, _style, fontSize) =>
    Array.from(text).length * fontSize,
};

const fixedWidthStyle = {
  ...baseStyle,
  fontSize: 1,
  lineHeight: 1,
};

describe("layout helpers", () => {
  it("checks nested bounds", () => {
    expect(
      isInside(
        { x: 10, y: 10, width: 100, height: 100 },
        { x: 20, y: 20, width: 40, height: 40 },
      ),
    ).toBe(true);
    expect(
      isInside(
        { x: 10, y: 10, width: 100, height: 100 },
        { x: 0, y: 20, width: 40, height: 40 },
      ),
    ).toBe(false);
  });

  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });
});

describe("typography", () => {
  it("uses pinned Thai segmentation independently from font rendering", () => {
    expect(THAI_SEGMENTATION_POLICY_VERSION).toBe("budoux-th@0.7.0");
    expect(LINE_BREAKING_POLICY_VERSION).toBe("balanced-lines@1.0.0");
    expect(TYPOGRAPHY_ALGORITHM_VERSION).toBe("2.0.1");
    expect(segmentThaiText("รายจ่ายบางก้อนยังเดินต่อ")).toEqual([
      "รายจ่าย",
      "บาง",
      "ก้อน",
      "ยัง",
      "เดิน",
      "ต่อ",
    ]);
  });

  it("wraps the Thai reproduction only at linguistic boundaries", () => {
    const wrapped = wrapText(
      "วันที่บิลโรงพยาบาลปิด\nรายจ่ายบางก้อนยังเดินต่อ",
      21,
      fixedWidthStyle,
      fixedWidthRegistry,
    );

    expect(wrapped.lines).toEqual([
      "วันที่บิลโรงพยาบาลปิด",
      "รายจ่ายบางก้อน",
      "ยังเดินต่อ",
    ]);
    expect(wrapped.lines).not.toContain("เดิ");
    expect(wrapped.lines).not.toContain("น");
    expect(wrapped.brokeLongWord).toBe(false);
  });

  it("preserves explicit newlines while segmenting Thai paragraphs", () => {
    const wrapped = wrapText(
      "ประเทศไทยมีภาษาไทย\nรายจ่ายบางก้อน",
      100,
      fixedWidthStyle,
      fixedWidthRegistry,
    );
    expect(wrapped.lines).toEqual(["ประเทศไทยมีภาษาไทย", "รายจ่ายบางก้อน"]);
  });

  it("keeps author-controlled Thai phrases together", () => {
    const wrapped = wrapText(
      "รายจ่ายบางก้อนยังเดินต่อ",
      14,
      fixedWidthStyle,
      fixedWidthRegistry,
      { keepTogether: ["ยังเดินต่อ"] },
    );
    expect(wrapped.lines).toEqual(["รายจ่ายบางก้อน", "ยังเดินต่อ"]);
  });

  it("shrinks Thai text when a smaller legal layout removes an orphan", () => {
    const result = fitText({
      text: "วันที่บิลโรงพยาบาลปิด",
      registry: fixedWidthRegistry,
      style: {
        family: "Test",
        weight: 400,
        style: "normal",
        lineHeight: 1,
      },
      box: { x: 0, y: 0, width: 18, height: 10 },
      preferredFontSize: 2,
      minimumFontSize: 1,
      maximumLines: 3,
      layerId: "balanced-thai",
    });
    expect(result.fontSize).toBe(1);
    expect(result.lines).toEqual(["วันที่บิล", "โรงพยาบาลปิด"]);
    expect(result.orphanLines).toEqual([]);
  });

  it("preserves the existing greedy wrapping policy for English", () => {
    expect(
      wrapText("one two three four", 7, fixedWidthStyle, fixedWidthRegistry).lines,
    ).toEqual(["one two", "three", "four"]);
  });

  it("wraps words within a measured width", () => {
    const wrapped = wrapText(
      "Deterministic graphics stay reproducible",
      260,
      baseStyle,
      registry,
    );
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.width).toBeLessThanOrEqual(260);
  });

  it("measures tracking between shaped glyphs instead of code units", () => {
    const style = { ...baseStyle, letterSpacing: 12 };
    const precomposed = wrapText("é", 1_000, style, registry);
    const decomposed = wrapText("e\u0301", 1_000, style, registry);

    expect(decomposed.width).toBeCloseTo(precomposed.width);
  });

  it("preserves explicit line breaks", () => {
    const wrapped = wrapText("First line\nSecond line", 800, baseStyle, registry);
    expect(wrapped.lines).toEqual(["First line", "Second line"]);
  });

  it("breaks a very long token and reports it", async () => {
    const token = (
      await readFile(resolve("fixtures/text/very-long-word.txt"), "utf8")
    ).trim();
    const wrapped = wrapText(token, 180, baseStyle, registry);
    expect(wrapped.brokeLongWord).toBe(true);
    expect(wrapped.lines.length).toBeGreaterThan(2);
    expect(wrapped.width).toBeLessThanOrEqual(180);
  });

  it("reduces font size to meet line and height limits", () => {
    const result = fitText({
      text: "A long headline that needs a smaller size",
      registry,
      style: {
        family: "Inter",
        weight: 700,
        style: "normal",
        lineHeight: 1.1,
      },
      box: { x: 0, y: 0, width: 300, height: 110 },
      preferredFontSize: 60,
      minimumFontSize: 20,
      maximumLines: 2,
      layerId: "headline",
    });
    expect(result.fontSize).toBeLessThan(60);
    expect(result.lines.length).toBeLessThanOrEqual(2);
    expect(result.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "error" })]),
    );
  });

  it("tests the minimum size when the responsive preferred size is smaller", () => {
    const result = fitText({
      text: "Fits at minimum",
      registry,
      style: {
        family: "Inter",
        weight: 400,
        style: "normal",
        lineHeight: 1,
      },
      box: { x: 0, y: 0, width: 300, height: 20 },
      preferredFontSize: 12,
      minimumFontSize: 16,
      maximumLines: 1,
      layerId: "minimum",
    });
    expect(result.fontSize).toBe(16);
    expect(result.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "error" })]),
    );
  });

  it("returns an error issue when text cannot fit", () => {
    const result = fitText({
      text: "One two three four five six seven eight nine ten eleven twelve",
      registry,
      style: {
        family: "Inter",
        weight: 400,
        style: "normal",
        lineHeight: 1.2,
      },
      box: { x: 0, y: 0, width: 50, height: 20 },
      preferredFontSize: 24,
      minimumFontSize: 20,
      maximumLines: 1,
      layerId: "overflow",
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TEXT_OVERFLOW",
          severity: "error",
        }),
      ]),
    );
  });

  it("only breaks a single oversized Thai word at minimum size and errors", () => {
    const result = fitText({
      text: "โรงพยาบาล",
      registry: fixedWidthRegistry,
      style: {
        family: "Test",
        weight: 400,
        style: "normal",
        lineHeight: 1,
      },
      box: { x: 0, y: 0, width: 3, height: 20 },
      preferredFontSize: 2,
      minimumFontSize: 1,
      maximumLines: 20,
      layerId: "thai-word",
    });
    expect(result.fontSize).toBe(1);
    const issue = result.issues.find(
      (candidate) => candidate.code === "LINGUISTIC_WORD_BROKEN",
    );
    expect(issue).toMatchObject({
      severity: "error",
      layerId: "thai-word",
    });
    expect(issue?.details).toMatchObject({
      token: "โรงพยาบาล",
      segmentationPolicyVersion: THAI_SEGMENTATION_POLICY_VERSION,
    });
  });

  it("does not silently split an oversized Thai word in fixed-size wrapping", () => {
    const wrapped = wrapText("โรงพยาบาล", 3, fixedWidthStyle, fixedWidthRegistry);

    expect(wrapped.lines).toEqual(["โรงพยาบาล"]);
    expect(wrapped.width).toBeGreaterThan(3);
    expect(wrapped.brokeLongWord).toBe(false);
  });

  it("reports an isolated final word as an orphan line", () => {
    const result = fitText({
      text: "one two three four",
      registry: fixedWidthRegistry,
      style: {
        family: "Test",
        weight: 400,
        style: "normal",
        lineHeight: 1,
      },
      box: { x: 0, y: 0, width: 7, height: 3 },
      preferredFontSize: 1,
      minimumFontSize: 1,
      maximumLines: 3,
      layerId: "orphan",
    });
    const issue = result.issues.find((candidate) => candidate.code === "ORPHAN_LINE");
    expect(issue).toMatchObject({ severity: "warning", layerId: "orphan" });
    expect(issue?.details).toMatchObject({
      affectedLine: "four",
      phrase: "four",
      finalLineToPreviousLineWidthRatio: 0.8,
      lineBreakingPolicyVersion: LINE_BREAKING_POLICY_VERSION,
    });
  });

  it("rejects unsupported fonts instead of substituting", () => {
    expect(() => registry.get("Not Installed", 400, "normal")).toThrow(
      /Unsupported font/,
    );
  });

  it("creates deterministic portable glyph outlines for every line", () => {
    const input = {
      lines: ["Portable", "SVG"],
      family: "Inter",
      weight: 700,
      style: "normal" as const,
      fontSize: 48,
      lineHeight: 1.1,
      x: 100,
      y: 80,
      align: "left" as const,
    };
    const first = registry.outlineText(input);
    expect(first).toEqual(registry.outlineText(input));
    expect(first).toHaveLength(2);
    expect(first.every((path) => path.startsWith("M "))).toBe(true);
    expect(first.join(" ")).not.toMatch(/NaN|Infinity/);
  });

  it("reports code points missing from a resolved font", () => {
    expect(registry.missingCodePoints("\u{10FFFF}", "Inter", 400, "normal")).toEqual([
      0x10ffff,
    ]);
  });
});
