import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  LINE_BREAK_POLICY,
  lineBreakOpportunities,
  lineBreakProperties,
} from "../src/typography/line-break.js";

const ORACLES = new URL("../vendor/unicode/17.0.0/oracles/", import.meta.url);

function lineBreakTestCases() {
  const checksums = JSON.parse(
    readFileSync(new URL("oracle-checksums.json", ORACLES), "utf8"),
  ) as { files: Record<string, { uncompressedSha256: string }> };
  const pinned = checksums.files["LineBreakTest.txt.gz"]!;
  const text = gunzipSync(readFileSync(new URL("LineBreakTest.txt.gz", ORACLES)));
  expect(createHash("sha256").update(text).digest("hex")).toBe(
    pinned.uncompressedSha256,
  );
  const cases: { line: number; text: string; breaks: number[] }[] = [];
  for (const [index, rawLine] of text.toString("utf8").split("\n").entries()) {
    const line = rawLine.split("#")[0]!.trim();
    if (line.length === 0) continue;
    const codePoints: number[] = [];
    const breaks: number[] = [];
    for (const token of line.split(/\s+/u)) {
      if (token === "÷") {
        if (codePoints.length > 0) breaks.push(codePoints.length);
      } else if (token !== "×") {
        codePoints.push(Number.parseInt(token, 16));
      }
    }
    cases.push({
      line: index + 1,
      text: String.fromCodePoint(...codePoints),
      breaks: breaks.filter((position) => position < codePoints.length),
    });
  }
  return cases;
}

/** Opportunities as code-point positions, as LineBreakTest.txt counts them. */
function codePointBreaks(text: string): number[] {
  const positions: number[] = [];
  let codePoints = 0;
  let offset = 0;
  const offsets = lineBreakOpportunities(text).map((opportunity) => opportunity.offset);
  for (const target of offsets) {
    while (offset < target) {
      offset += text.codePointAt(offset)! > 0xffff ? 2 : 1;
      codePoints += 1;
    }
    positions.push(codePoints);
  }
  return positions;
}

describe("line-break-uax14@17.0.0", () => {
  it("records its policy and data hashes", () => {
    expect(LINE_BREAK_POLICY).toMatchObject({
      id: "line-break-uax14",
      version: "17.0.0",
      unicodeVersion: "17.0.0",
    });
    expect(Object.keys(LINE_BREAK_POLICY.sourceSha256).sort()).toEqual([
      "DerivedGeneralCategory.txt",
      "EastAsianWidth.txt",
      "LineBreak.txt",
      "emoji-data.txt",
    ]);
  });

  it("passes every case of LineBreakTest.txt", () => {
    const cases = lineBreakTestCases();
    expect(cases.length).toBeGreaterThan(19_000);
    const failures = cases
      .filter((testCase) => {
        const actual = codePointBreaks(testCase.text);
        return actual.join() !== testCase.breaks.join();
      })
      .map((testCase) => testCase.line);
    expect(failures.slice(0, 20)).toEqual([]);
    expect(failures.length).toBe(0);
  });

  it("reads table properties", () => {
    expect(lineBreakProperties(0x41).lineBreakClass).toBe("AL");
    expect(lineBreakProperties(0x0e01).lineBreakClass).toBe("SA");
    expect(lineBreakProperties(0x2010).lineBreakClass).toBe("HH");
    expect(lineBreakProperties(0x10ffff).lineBreakClass).toBe("XX");
  });

  it("marks hard breaks as required and keeps CR LF together", () => {
    expect(lineBreakOpportunities("a\r\nb c\nd")).toEqual([
      { offset: 3, required: true },
      { offset: 5, required: false },
      { offset: 7, required: true },
    ]);
    expect(lineBreakOpportunities("")).toEqual([]);
    expect(lineBreakOpportunities("😀😀")).toEqual([{ offset: 2, required: false }]);
  });

  describe("break controls", () => {
    const offsets = (text: string) =>
      lineBreakOpportunities(text).map((opportunity) => opportunity.offset);

    it.each([
      ["NBSP", "10\u00A0kg"],
      ["NNBSP", "10\u202Fkg"],
      ["WJ", "ab\u2060cd"],
    ])("%s never breaks", (_name, text) => {
      expect(offsets(text)).toEqual([]);
      expect(offsets(`x ${text} y`)).toEqual([2, text.length + 3]);
    });

    it("keeps NBSP glued even beside spaces it would otherwise follow", () => {
      expect(offsets("a\u00A0\u00A0b")).toEqual([]);
      expect(offsets("\u0E01\u00A0\u0E02")).toEqual([]);
    });

    it("allows a break after ZWSP, even before spaces", () => {
      expect(offsets("ab\u200Bcd")).toEqual([3]);
      expect(offsets("ab\u200B  cd")).toEqual([5]);
    });

    it("allows a break after SHY but never before it", () => {
      expect(offsets("hy\u00ADphen")).toEqual([3]);
    });

    it("allows a break after a hard hyphen", () => {
      expect(offsets("well-known")).toEqual([5]);
      expect(offsets("A\u2010B")).toEqual([2]);
      // Except before a number (LB25) and after a word-initial hyphen (LB20a).
      expect(offsets("x -5")).toEqual([2]);
      expect(offsets("-ish")).toEqual([]);
    });
  });
});
