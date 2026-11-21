import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Structural checks for the G-TH Thai line-breaking gold set (plan §2.1 T10,
 * M3). The set is a draft until the native Thai reader's correction is
 * recorded; these checks keep any edit well-formed.
 */
type GoldLine = {
  id: string;
  source: string;
  kind: string;
  text: string;
  gold: string;
  machine: string;
  review: string;
};
type Gold = {
  id: "G-TH";
  version: string;
  counts: { lines: number; acceptableBoundaries: number; glued: number };
  lines: GoldLine[];
};

const gold = JSON.parse(
  readFileSync(new URL("typography/gold/g-th.json", import.meta.url), "utf8"),
) as Gold;

const strip = (value: string) => value.replace(/[/|]/g, "").replace(/_/g, " ");
const acceptable = (value: string) => (value.match(/[/| ]/g) ?? []).length;
const COMBINING = /\p{M}/u;
// Thai vowels that are letters (Lo), not marks, but still bind to a consonant.
const THAI_LEADING_VOWEL = /[เแโใไ]/;
const THAI_FOLLOWING_VOWEL = /[ะาำๅ]/;
const THAI_KARAN = "\u0E4C";
const LATIN_OR_DIGIT = /[A-Za-z\p{Nd}]/u;
// Units the draft glues to their amount; extend when a new unit is glued.
const AMOUNT_UNIT_BREAK =
  /\p{Nd}[/| ](?:บาท|ซม\.|กก\.|มล\.|ลิตร|ชม\.|ชิ้น|วัน|เดือน|ปี|น\.)(?!\p{Script=Thai})/u;

describe("G-TH gold set", () => {
  it("restores every source text exactly from its annotation", () => {
    for (const line of gold.lines) {
      expect(strip(line.gold), line.id).toBe(line.text);
      expect(strip(line.machine), line.id).toBe(line.text);
      expect(line.text.normalize("NFC"), line.id).toBe(line.text);
    }
  });

  it("places markers only between characters, never inside a Thai syllable cluster, a Latin word or a number", () => {
    for (const line of gold.lines) {
      for (const match of line.gold.matchAll(/[/|]/g)) {
        const before = /.$/u.exec(line.gold.slice(0, match.index))?.[0];
        const after = /^./u.exec(line.gold.slice(match.index + 1))?.[0];
        const afterNext = /^.(.)/u.exec(line.gold.slice(match.index + 1))?.[1];
        expect(before, `${line.id} starts with a marker`).toBeDefined();
        expect(after, `${line.id} ends with a marker`).toBeDefined();
        expect(/[\s/|_]/.test(before!), `${line.id} doubled marker`).toBe(false);
        expect(/[\s/|_]/.test(after!), `${line.id} doubled marker`).toBe(false);
        expect(COMBINING.test(after!), `${line.id} break before a mark`).toBe(false);
        expect(
          THAI_LEADING_VOWEL.test(before!),
          `${line.id} break after a leading vowel`,
        ).toBe(false);
        expect(
          THAI_FOLLOWING_VOWEL.test(after!),
          `${line.id} break before a following vowel`,
        ).toBe(false);
        expect(afterNext === THAI_KARAN, `${line.id} break before a silent final`).toBe(
          false,
        );
        expect(
          LATIN_OR_DIGIT.test(before!) && LATIN_OR_DIGIT.test(after!),
          `${line.id} break inside a Latin word or number`,
        ).toBe(false);
      }
    }
  });

  it("never allows a break inside a numeric range", () => {
    // Owner decision (5 November 2026): numeric ranges never break, in Latin
    // or Thai digits, on either side of the range dash.
    const rangeBreak = /\p{Nd}[/| ]?[-–—][/| ]\p{Nd}|\p{Nd}[/| ][-–—]\p{Nd}/u;
    for (const line of gold.lines) {
      expect(rangeBreak.test(line.gold), `${line.id} breaks a numeric range`).toBe(
        false,
      );
    }
  });

  it("has unique sequential ids and the recorded counts", () => {
    expect(gold.lines.map((line) => line.id)).toEqual(
      gold.lines.map((_, index) => `gth-${String(index + 1).padStart(4, "0")}`),
    );
    expect(gold.counts.lines).toBe(gold.lines.length);
    expect(gold.counts.acceptableBoundaries).toBe(
      gold.lines.reduce((sum, line) => sum + acceptable(line.gold), 0),
    );
    expect(gold.counts.glued).toBe(
      gold.lines.reduce((sum, line) => sum + (line.gold.match(/_/g) ?? []).length, 0),
    );
  });

  it("meets the plan's size floor of 2,000 annotated boundaries", () => {
    // Counts plain spaces as boundaries. Whether spaces count towards the T10
    // floor is an open owner decision; see gold/README.md.
    expect(gold.counts.acceptableBoundaries).toBeGreaterThanOrEqual(2000);
  });

  it("covers every T10 edge rule", () => {
    const all = gold.lines.map((line) => line.gold);
    expect(all.some((value) => value.includes("ๆ"))).toBe(true);
    expect(all.some((value) => value.includes("ฯ"))).toBe(true);
    expect(all.some((value) => value.includes("%"))).toBe(true);
    expect(all.some((value) => /\p{Nd}_บาท/u.test(value))).toBe(true);
    expect(all.some((value) => value.includes("“"))).toBe(true);
    expect(all).toContain("กรุงเทพมหานคร");
    expect(all).toContain("โปรโมชั่น/พิเศษ");
  });

  it("annotates every T10 edge rule as a non-break", () => {
    const forbidden: [string, RegExp][] = [
      ["break before ๆ", /[/| ]ๆ/],
      ["break before ฯ", /[/|]ฯ/],
      ["break before %", /[/| ]%/],
      ["break after an opening quote", /[“‘][/| ]/],
      ["break before a closing quote", /[/| ][”’]/],
      ["break between ฿ and its amount", /฿[/| ]\p{Nd}/u],
      ["break between an amount and its unit", AMOUNT_UNIT_BREAK],
    ];
    for (const line of gold.lines) {
      for (const [rule, pattern] of forbidden) {
        expect(pattern.test(line.gold), `${line.id}: ${rule}`).toBe(false);
      }
    }
  });
});
