import { describe, expect, it } from "vitest";

import { wrapText, type TextMeasurer } from "../src/typography/index.js";
import type { M3LineBreaking } from "../src/typography/segmentation.js";
import { segmentParagraph } from "../src/typography/segmentation.js";

/** One unit of width per code point, so line widths are character counts. */
const registry: TextMeasurer = {
  measure: (text, _family, _weight, _style, fontSize) =>
    Array.from(text).length * fontSize,
};
const style = {
  family: "Test",
  weight: 400,
  style: "normal" as const,
  fontSize: 1,
  lineHeight: 1,
};
const M3: M3LineBreaking = { lexicon: [], preferBreakAfter: [] };
const lines = (text: string, width: number, lineBreaking?: M3LineBreaking) =>
  wrapText(text, width, style, registry, {
    ...(lineBreaking === undefined ? {} : { lineBreaking }),
  }).lines;

describe("M3 line breaking in the wrapper", () => {
  it("records the M3 policies only when asked", () => {
    expect(wrapText("กรุงเทพ", 20, style, registry).segmentationPolicyVersion).toBe(
      "budoux-th@0.7.0",
    );
    expect(
      wrapText("กรุงเทพ", 20, style, registry, { lineBreaking: M3 })
        .segmentationPolicyVersion,
    ).toBe("thai-segmentation-hybrid@1.0.0");
    expect(
      wrapText("Run far", 20, style, registry, { lineBreaking: M3 }).segmentationPolicy,
    ).toBe("line-break-tailoring");
    expect(wrapText("Run far", 20, style, registry).segmentationPolicy).toBe(
      "whitespace",
    );
  });

  it("keeps the M0 NBSP probe together", () => {
    // Legacy folds NBSP into a space; M3 keeps it a no-break space.
    const nbsp = "Run 100\u00a0laps";
    expect(lines(nbsp, 9)).toEqual(["Run 100", "laps"]);
    expect(lines(nbsp, 9, M3)).toEqual(["Run", "100\u00a0laps"]);
    expect(lines("Run 100\u202flaps", 9, M3)).toEqual(["Run", "100\u202flaps"]);
    expect(lines("Run 100 laps", 9, M3)).toEqual(["Run 100", "laps"]);
  });

  it("never breaks inside กรุงเทพมหานคร (M0 BudouX probe)", () => {
    for (const width of [5, 8, 13]) {
      expect(lines("กรุงเทพมหานคร", width, M3)).toEqual(["กรุงเทพมหานคร"]);
    }
  });

  it("never starts a line with ๆ and keeps an amount with its unit (Static Ads T04)", () => {
    const text = "เด็กๆ ชอบมาก ลดราคาพิเศษ 499 บาท";
    for (const width of [6, 8, 10, 12, 16]) {
      for (const line of lines(text, width, M3)) {
        expect(line.startsWith("ๆ"), `${width}: ${line}`).toBe(false);
        expect(line === "บาท" || line.startsWith("บาท"), `${width}: ${line}`).toBe(
          false,
        );
      }
    }
    expect(lines(text, 12, M3)).toContain("499 บาท");
  });

  it("keeps spaces that carry no opportunity inside a unit", () => {
    const { units } = segmentParagraph("ราคา 499 บาท วันนี้", [], M3);
    expect(units.map((unit) => [unit.text, unit.separatorBefore])).toEqual([
      ["ราคา", ""],
      ["499 บาท", " "],
      ["วันนี้", " "],
    ]);
  });

  it("uses the lexicon", () => {
    const text = "ชวนเพื่อนไร่เพื่อนสวนมาเที่ยว";
    expect(lines(text, 10, M3)).not.toContain("เพื่อนไร่เพื่อนสวน");
    expect(lines(text, 18, { ...M3, lexicon: ["เพื่อนไร่เพื่อนสวน"] })).toContain(
      "เพื่อนไร่เพื่อนสวน",
    );
  });

  it("prefers a break after a preferBreakAfter phrase", () => {
    const text = "ลดราคาพิเศษ สำหรับสมาชิกใหม่ทุกคน";
    const plain = lines(text, 20, M3);
    const preferred = lines(text, 20, { ...M3, preferBreakAfter: ["ลดราคา"] });
    expect(preferred[0]).toBe("ลดราคา");
    expect(plain[0]).not.toBe("ลดราคา");
  });

  it("is deterministic", () => {
    const text = "ดูรายละเอียดในคอมเมนต์แรก ราคา 1,290 บาท จาก 3–5 วัน";
    const first = [5, 8, 12, 16, 24].map((width) => lines(text, width, M3));
    const second = [5, 8, 12, 16, 24].map((width) => lines(text, width, M3));
    expect(second).toEqual(first);
  });
});
