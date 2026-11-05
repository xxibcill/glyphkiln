import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { lineBreakOpportunities } from "../src/typography/line-break.js";
import {
  LINE_BREAK_TAILORING_POLICY,
  tailoredLineBreakOpportunities,
} from "../src/typography/line-break-tailoring.js";

const offsets = (text: string) =>
  tailoredLineBreakOpportunities(text).map((opportunity) => opportunity.offset);

type GoldLine = { id: string; text: string; gold: string };
const gold = JSON.parse(
  readFileSync(new URL("./typography/gold/g-th.json", import.meta.url), "utf8"),
) as { lines: GoldLine[] };

/** Text offsets of the spaces a gold annotation marks `_` (glue) or ` ` (break). */
function goldSpaces(line: GoldLine): { glue: number[]; breaks: number[] } {
  const glue: number[] = [];
  const breaks: number[] = [];
  let offset = 0;
  for (const marker of line.gold) {
    if (marker === "/" || marker === "|") continue;
    if (marker === "_") glue.push(offset);
    else if (marker === " ") breaks.push(offset);
    offset += marker.length;
  }
  expect(offset).toBe(line.text.length);
  return { glue, breaks };
}

describe("line-break-tailoring@1.1.0", () => {
  it("records its policy", () => {
    expect(LINE_BREAK_TAILORING_POLICY).toEqual({
      id: "line-break-tailoring",
      version: "1.1.0",
      base: "line-break-uax14@17.0.0",
    });
  });

  it("only removes UAX #14 opportunities", () => {
    for (const { text } of gold.lines) {
      const base = new Set(lineBreakOpportunities(text).map(({ offset }) => offset));
      for (const offset of offsets(text)) expect(base.has(offset)).toBe(true);
    }
  });

  it("keeps every G-TH draft glue space (`_`) unbroken", () => {
    const misses: string[] = [];
    let cases = 0;
    for (const line of gold.lines) {
      const allowed = new Set(offsets(line.text));
      for (const space of goldSpaces(line).glue) {
        cases += 1;
        // A break at a space falls after it, before the next word.
        if (allowed.has(space + 1)) misses.push(`${line.id}@${space}`);
      }
    }
    expect(cases).toBeGreaterThanOrEqual(40);
    expect(misses).toEqual([]);
  });

  it("keeps every G-TH draft breakable space breakable", () => {
    const lost: string[] = [];
    for (const line of gold.lines) {
      const allowed = new Set(offsets(line.text));
      for (const space of goldSpaces(line).breaks) {
        const after = line.text.codePointAt(space + 1);
        if (after !== undefined && after !== 0x20 && !allowed.has(space + 1)) {
          lost.push(`${line.id}@${space}`);
        }
      }
    }
    expect(lost).toEqual([]);
  });

  describe("Thai line edges", () => {
    it("never starts a line with ๆ or ฯ, even after a space", () => {
      expect(offsets("เล็ก ๆ ใน")).toEqual([7]);
      expect(offsets("ค่อย ๆ")).toEqual([]);
      expect(offsets("คอม ฯ")).toEqual([]);
      expect(offsets("a ๆ b ฯ")).toEqual([4]);
    });

    it("keeps quotes and % with their text", () => {
      expect(offsets("ลด 15% เมื่อ")).toEqual([3, 7]);
      expect(offsets('คำว่า "สวน" นะ')).toEqual([6, 12]);
      expect(offsets("คำว่า “สวน” นะ")).toEqual([6, 12]);
    });
  });

  it("never breaks inside a G-TH draft range or before a dash", () => {
    for (const line of gold.lines) {
      for (const offset of offsets(line.text)) {
        expect(["—", "–"], line.id).not.toContain(line.text[offset]);
        if (/[–-]/.test(line.text[offset - 1]!)) {
          expect(/\p{Nd}/u.test(line.text[offset - 2] ?? ""), line.id).toBe(false);
        }
      }
    }
  });

  describe("dashes (1.1.0)", () => {
    it.each([
      ["Affiliate — อาจ", [12]],
      ["a – b", [4]],
      ["abc—def", [4]],
      ["a —— b", [5]],
      ["ลิงก์ Affiliate — อาจได้รับ", [6, 18]],
    ])("no line starts with an em or en dash: %s", (text, expected) => {
      expect(offsets(text)).toEqual(expected);
    });

    it("keeps a required break before a dash", () => {
      expect(tailoredLineBreakOpportunities("a\n— b")).toEqual([
        { offset: 2, required: true },
        { offset: 4, required: false },
      ]);
    });
  });

  describe("numeric ranges (1.1.0)", () => {
    it.each([
      ["3–5", []],
      ["3–5 วัน", []],
      ["เวลา ๙.๐๐–๑๘.๐๐ น.", [5]],
      ["9:00–18:00", []],
      ["1,290–1,490 บาท", []],
      ["3-5", []],
      ["ปี 2025–2026 นี้", [3, 13]],
    ])("never breaks: %s", (text, expected) => {
      expect(offsets(text)).toEqual(expected);
    });

    it("keeps the break after a dash that is not between two amounts", () => {
      expect(offsets("3– ok")).toEqual([3]);
      expect(offsets("A–B")).toEqual([2]);
      expect(offsets("A–5")).toEqual([2]);
      expect(offsets("5–A")).toEqual([2]);
      expect(offsets("5 – 6")).toEqual([4]);
    });
  });

  describe("number + unit and currency glue", () => {
    it.each([
      ["499 บาท", []],
      ["1,290 บาท จาก", [10]],
      ["31 ต.ค. เท่านั้น", [8]],
      ["๑๘.๐๐ น.", []],
      ["20 ml water", [6]],
      ["1.2 kg.", []],
      ["30 x 45 ซม.", []],
      ["2 × 3", []],
      ["฿ 499", []],
      ["$ 5 off", [4]],
      ["10 €", []],
      ["5 %", []],
    ])("%s", (text, expected) => {
      expect(offsets(text)).toEqual(expected);
    });

    it("does not glue words that are not units", () => {
      expect(offsets("2 apples")).toEqual([2]);
      expect(offsets("x 5")).toEqual([2]);
      expect(offsets("a x 5")).toEqual([2, 4]);
      expect(offsets("หน้า 80")).toEqual([5]);
      expect(offsets("ได้ 8 รูปแบบ")).toEqual([4, 6]);
      expect(offsets("ณ 23 ตุลาคม")).toEqual([2, 5]);
      expect(offsets("THFTT858 ใบ")).toEqual([9]);
    });

    it("keeps required breaks", () => {
      expect(tailoredLineBreakOpportunities("5\nบาท")).toEqual([
        { offset: 2, required: true },
      ]);
    });
  });
});
