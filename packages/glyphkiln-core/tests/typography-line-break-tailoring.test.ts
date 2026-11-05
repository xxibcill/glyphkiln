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

describe("line-break-tailoring@1.0.0", () => {
  it("records its policy", () => {
    expect(LINE_BREAK_TAILORING_POLICY).toEqual({
      id: "line-break-tailoring",
      version: "1.0.0",
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
    // Known draft gap: `Affiliate_—` (a space before an em dash) is not a
    // number, unit or Thai line-edge case and stays breakable.
    expect(misses).toEqual(["gth-0313@15"]);
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
