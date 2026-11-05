import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { lineBreakOpportunities } from "../src/typography/line-break.js";
import { tailoredLineBreakOpportunities } from "../src/typography/line-break-tailoring.js";
import {
  THAI_DICTIONARY_SOURCE,
  THAI_DICTIONARY_WORDS,
} from "../src/typography/thai-dictionary.generated.js";
import {
  THAI_LEXICON_LIMITS,
  budouxThaiScore,
  hybridLineBreakOpportunities,
  isThaiClusterBoundary,
  normalizeThaiLexicon,
  thaiSegmentationHybridPolicy,
  thaiWordBoundaries,
} from "../src/typography/thai-segmentation-hybrid.js";
import { THAI_SUPPLEMENT_WORDS } from "../src/typography/thai-supplement-words.js";

type GoldLine = { id: string; text: string; gold: string };
const gold = JSON.parse(
  readFileSync(new URL("./typography/gold/g-th.json", import.meta.url), "utf8"),
) as { lines: GoldLine[] };

/** `text` with `|` at every chosen Thai word boundary. */
function marked(text: string, lexicon: readonly string[] = []): string {
  let result = "";
  let last = 0;
  for (const offset of thaiWordBoundaries(text, lexicon)) {
    result += `${text.slice(last, offset)}|`;
    last = offset;
  }
  return result + text.slice(last);
}

describe("thai-segmentation-hybrid@1.0.0", () => {
  describe("plan probes", () => {
    it.each([
      ["กรุงเทพมหานคร", "กรุงเทพมหานคร"],
      ["โปรโมชั่นพิเศษ", "โปรโมชั่น|พิเศษ"],
      ["ภาษาไทยเป็นภาษาที่สวยงาม", "ภาษา|ไทย|เป็น|ภาษา|ที่|สวยงาม"],
      ["ดูรายละเอียดในคอมเมนต์แรก", "ดู|รายละเอียด|ใน|คอมเมนต์|แรก"],
      ["กรุงเทพฯ", "กรุงเทพฯ"],
      ["ค่อยๆ", "ค่อยๆ"],
    ])("%s", (text, expected) => {
      expect(marked(text)).toBe(expected);
    });
  });

  describe("cluster guard", () => {
    it.each([
      ["กา", 1],
      ["กำ", 1],
      ["เก", 1],
      ["กั้น", 3],
      ["ตัว", 2],
      ["มนต์", 2],
      ["จันทร์", 4],
      ["เรียน", 3],
      ["เกี่ยว", 4],
      ["เปลี่ยน", 5],
      ["เรือ", 3],
      ["เธอ", 2],
      ["ค่อยๆ", 4],
      ["กรุงเทพฯ", 7],
      ["กิ", 1],
    ])("no cluster boundary in %s at %i", (text, index) => {
      expect(isThaiClusterBoundary(text, index)).toBe(false);
    });

    it.each([
      ["กข", 1],
      ["เกเก", 2],
      ["เลขอ", 3],
      ["กัน", 0],
      ["กัน", 3],
      ["รอ", 1],
      ["ดีย", 2],
    ])("a cluster boundary in %s at %i", (text, index) => {
      expect(isThaiClusterBoundary(text, index)).toBe(true);
    });

    it("never breaks inside a Thai cluster on any G-TH line", () => {
      let boundaries = 0;
      for (const { id, text } of gold.lines) {
        for (const offset of thaiWordBoundaries(text)) {
          boundaries += 1;
          expect(isThaiClusterBoundary(text, offset), id).toBe(true);
          expect(/\p{M}/u.test(text[offset]!), id).toBe(false);
          expect(["ๆ", "ฯ"], id).not.toContain(text[offset]);
        }
      }
      expect(boundaries).toBeGreaterThan(1500);
    });
  });

  describe("lexicon", () => {
    it("keeps a lexicon entry whole", () => {
      expect(marked("เพื่อนไร่เพื่อนสวน")).toBe("เพื่อน|ไร่|เพื่อน|สวน");
      expect(marked("เพื่อนไร่เพื่อนสวน", ["เพื่อนไร่เพื่อนสวน"])).toBe(
        "เพื่อนไร่เพื่อนสวน",
      );
      expect(marked("ชวนเพื่อนไร่เพื่อนสวนมา", ["เพื่อนไร่เพื่อนสวน"])).toBe(
        "ชวน|เพื่อนไร่เพื่อนสวน|มา",
      );
    });

    it("overrides the dictionary, leftmost-longest", () => {
      expect(marked("กรุงเทพมหานคร", ["เทพมหา"])).toBe("กรุง|เทพมหา|นคร");
      expect(marked("กรุงเทพมหานคร", ["เทพ", "เทพมหา"])).toBe("กรุง|เทพมหา|นคร");
      expect(marked("กรุงเทพมหานคร", ["กรุงเทพ", "เทพมหา"])).toBe("กรุงเทพ|มหานคร");
      // An occurrence whose edge would split a cluster is ignored.
      expect(marked("กรุงเทพมหานคร", ["กร"])).toBe("กรุงเทพมหานคร");
    });

    it("is normalized: unique and in code-unit order", () => {
      expect(normalizeThaiLexicon(["ข", "ก", "ข"])).toEqual(["ก", "ข"]);
      expect(thaiSegmentationHybridPolicy(["ข", "ก"])).toEqual(
        thaiSegmentationHybridPolicy(["ก", "ข", "ก"]),
      );
    });

    it.each([
      [""],
      ["abc"],
      ["กรุง เทพ"],
      ["๑๒"],
      ["ก".repeat(THAI_LEXICON_LIMITS.maxEntryLength + 1)],
      // Not NFC: the tone mark (ccc 107) precedes sara u (ccc 103).
      ["\u0e01\u0e48\u0e38"],
    ])("rejects %j", (entry) => {
      expect(() => normalizeThaiLexicon([entry])).toThrow(RangeError);
    });

    it("is bounded", () => {
      const entries = Array.from(
        { length: THAI_LEXICON_LIMITS.maxEntries + 1 },
        (_, index) => "ก".repeat((index % 40) + 1),
      );
      expect(() => normalizeThaiLexicon(entries)).toThrow(RangeError);
      expect(normalizeThaiLexicon(entries.slice(0, 40))).toHaveLength(40);
    });
  });

  describe("policy", () => {
    it("hashes the dictionary, supplement, model and lexicon", () => {
      const policy = thaiSegmentationHybridPolicy();
      expect(policy).toEqual({
        id: "thai-segmentation-hybrid",
        version: "1.0.0",
        lineBreak: "line-break-tailoring@1.1.0",
        dictionary: {
          name: "icu-thaidict",
          icuVersion: "78.3",
          license: "Unicode-3.0",
          sourceSha256:
            "3166abde40c0f44ab91c28f5ce96d7d1472cb7882e1c0bda0a72f8f69dba4274",
          wordsSha256:
            "93024370698207553181a6e3d7ae008acb1c676eee87774b5effb9f5f2f0fe26",
        },
        supplement: {
          entries: 47,
          sha256: policy.supplement.sha256,
        },
        model: {
          name: "budoux-th",
          version: "0.7.0",
          sha256: "1e1f5749e9bf73b90057c08493dfb00251436d4f771b570431a26b3cc50aef5b",
        },
        lexicon: {
          entries: 0,
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
      });
      expect(policy.supplement.sha256).toBe(
        "820d0612a076873fb2f3386e970cefa22913b0416c43d87f55e3161f936d06df",
      );
      expect(thaiSegmentationHybridPolicy(["ก"]).lexicon.sha256).not.toBe(
        policy.lexicon.sha256,
      );
    });

    it("pins the vendored dictionary", () => {
      expect(THAI_DICTIONARY_SOURCE).toMatchObject({
        icuVersion: "78.3",
        tag: "release-78.3",
        license: "Unicode-3.0",
        wordCount: 26_383,
        maxWordLength: 20,
      });
    });

    it("keeps the supplement sorted, unique, NFC Thai and outside the dictionary", () => {
      expect([...THAI_SUPPLEMENT_WORDS].sort()).toEqual(THAI_SUPPLEMENT_WORDS);
      expect(new Set(THAI_SUPPLEMENT_WORDS).size).toBe(THAI_SUPPLEMENT_WORDS.length);
      expect(normalizeThaiLexicon(THAI_SUPPLEMENT_WORDS)).toEqual(
        THAI_SUPPLEMENT_WORDS,
      );
      const dictionary = new Set(THAI_DICTIONARY_WORDS.split("\n"));
      for (const word of THAI_SUPPLEMENT_WORDS) {
        expect(dictionary.has(word), word).toBe(false);
      }
    });
  });

  describe("determinism and bounds", () => {
    it("returns the same boundaries on every call", () => {
      const first = gold.lines.map(({ text }) => thaiWordBoundaries(text));
      const second = gold.lines.map(({ text }) => thaiWordBoundaries(text));
      expect(second).toEqual(first);
    });

    it("scores BudouX boundaries in integers", () => {
      for (const { text } of gold.lines.slice(0, 20)) {
        for (let index = 1; index < text.length; index += 1) {
          expect(Number.isInteger(budouxThaiScore(text, index))).toBe(true);
        }
      }
    });

    it("segments a long run in linear work", () => {
      const run = "ภาษาไทยเป็นภาษาที่สวยงาม".repeat(200);
      const boundaries = thaiWordBoundaries(run);
      expect(boundaries).toHaveLength(6 * 200 - 1);
      expect(thaiWordBoundaries(run)).toEqual(boundaries);
    });

    it("leaves text without Thai alone", () => {
      expect(thaiWordBoundaries("Hello world 499")).toEqual([]);
      expect(thaiWordBoundaries("")).toEqual([]);
    });
  });

  describe("line-break opportunities", () => {
    it("adds Thai word boundaries to the tailored UAX #14 opportunities", () => {
      const text = "ราคาพิเศษ 499 บาท วันนี้เท่านั้น";
      expect(lineBreakOpportunities(text).map(({ offset }) => offset)).toEqual([
        10, 14, 18,
      ]);
      expect(tailoredLineBreakOpportunities(text).map(({ offset }) => offset)).toEqual([
        10, 18,
      ]);
      expect(hybridLineBreakOpportunities(text).map(({ offset }) => offset)).toEqual([
        4, 10, 18, 24,
      ]);
    });

    it("keeps required breaks and Thai line edges", () => {
      expect(hybridLineBreakOpportunities("เล็กๆ\nน้อยๆ")).toEqual([
        { offset: 6, required: true },
      ]);
      expect(hybridLineBreakOpportunities("เล็ก ๆ น้อย ๆ")).toEqual([
        { offset: 7, required: false },
      ]);
    });

    it("only adds opportunities inside Thai runs, never before ๆ or ฯ", () => {
      for (const { id, text } of gold.lines) {
        const base = new Set(
          tailoredLineBreakOpportunities(text).map(({ offset }) => offset),
        );
        for (const { offset } of hybridLineBreakOpportunities(text)) {
          if (base.has(offset)) continue;
          const before = text.charCodeAt(offset - 1);
          const after = text.charCodeAt(offset);
          expect(before >= 0x0e01 && before <= 0x0e5b, id).toBe(true);
          // A consonant or a leading vowel, never a mark, ๆ or ฯ.
          expect(
            (after >= 0x0e01 && after <= 0x0e2e) ||
              (after >= 0x0e40 && after <= 0x0e44),
            id,
          ).toBe(true);
        }
      }
    });
  });
});
