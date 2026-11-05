/**
 * Tailorings on top of `line-break-uax14@17.0.0` (policy
 * `line-break-tailoring@1.0.0`, plan M3). They only remove opportunities, so a
 * tailored break is always a UAX #14 break too:
 *
 * - **Thai line edges.** ๆ (MAIYAMOK) and ฯ (PAIYANNOI) never start a line,
 *   even after a space (`เล็ก ๆ`). Quotes and `%` are already kept with their
 *   text by LB19, LB19a and LB24/LB25; the tests pin that.
 * - **Amount + unit.** No break between an amount (a word of digits and
 *   numeric punctuation, such as `1,290` or `3–5`) and a following unit: a
 *   Thai unit, classifier or month abbreviation from a fixed list (`499 บาท`,
 *   `2 ชิ้น`, `31 ต.ค.`), a Latin unit from a fixed list (`20 ml`) or a lone
 *   currency or percent sign (`10 €`, `5 %`). Other words stay breakable
 *   (`8 รูปแบบ`, `23 ตุลาคม`, `THFTT858 ใบ`), as the G-TH draft marks them.
 * - **Dimensions.** No break around a free-standing `x` or `×` between numbers
 *   (`30 x 45`).
 * - **Currency glue.** No break between a prefix currency sign and its amount
 *   (`฿ 499`).
 *
 * Classes come from the pinned table, never from host `\p{…}` regexes, so the
 * result does not depend on the host's Unicode version.
 */
import {
  type LineBreakOpportunity,
  lineBreakOpportunities,
  lineBreakProperties,
} from "./line-break.js";

export const LINE_BREAK_TAILORING_POLICY = Object.freeze({
  id: "line-break-tailoring",
  version: "1.0.0",
  base: "line-break-uax14@17.0.0",
});

const MAIYAMOK = 0x0e46;
const PAIYANNOI = 0x0e2f;
const LATIN_UNITS = new Set([
  "cm",
  "g",
  "kg",
  "km",
  "l",
  "m",
  "mg",
  "ml",
  "mm",
  "oz",
  "pcs",
]);

/** Thai units, classifiers and month abbreviations; matched as a word prefix. */
const THAI_UNITS: readonly string[] = Object.freeze([
  "บาท",
  "สตางค์",
  "ล้าน",
  "แสน",
  "หมื่น",
  "พัน",
  "ชิ้น",
  "ครั้ง",
  "วัน",
  "สัปดาห์",
  "เดือน",
  "ปี",
  "ชั่วโมง",
  "ชม.",
  "นาที",
  "วินาที",
  "นาฬิกา",
  "น.",
  "หน้า",
  "สี",
  "ซม.",
  "มม.",
  "กม.",
  "มล.",
  "ลิตร",
  "กก.",
  "กรัม",
  "เมตร",
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
]);
const AMOUNT_CLASSES = new Set(["NU", "IS", "SY", "HH", "HY", "PR", "PO"]);

const lineBreakClass = (codePoint: number): string =>
  lineBreakProperties(codePoint).lineBreakClass;
const isNumber = (codePoint: number | undefined): boolean =>
  codePoint !== undefined && lineBreakClass(codePoint) === "NU";
/** A word of digits and numeric punctuation that ends in a digit. */
function isAmount(word: string): boolean {
  let last: number | undefined;
  for (let offset = 0; offset < word.length;) {
    last = word.codePointAt(offset)!;
    if (!AMOUNT_CLASSES.has(lineBreakClass(last))) return false;
    offset += last > 0xffff ? 2 : 1;
  }
  return isNumber(last);
}
const isMultiplier = (word: string): boolean => word === "x" || word === "×";

/** The word (maximal run without spaces) that starts at `offset`. */
function wordAt(text: string, offset: number): string {
  let end = offset;
  while (end < text.length && text[end] !== " ") end += 1;
  return text.slice(offset, end);
}

/** The word that ends before the spaces that end at `offset`, if any. */
function wordBefore(text: string, offset: number): { word: string; start: number } {
  let end = offset;
  while (end > 0 && text[end - 1] === " ") end -= 1;
  let start = end;
  while (start > 0 && text[start - 1] !== " ") start -= 1;
  return { word: text.slice(start, end), start };
}

function lastCodePoint(word: string): number | undefined {
  if (word.length === 0) return undefined;
  const low = word.charCodeAt(word.length - 1);
  return low >= 0xdc00 && low <= 0xdfff && word.length > 1
    ? word.codePointAt(word.length - 2)
    : low;
}

/** True when the UAX #14 opportunity at `offset` is removed by a tailoring. */
function isSuppressed(text: string, offset: number): boolean {
  const next = text.codePointAt(offset)!;
  if (next === MAIYAMOK || next === PAIYANNOI) return true;

  const { word: before, start } = wordBefore(text, offset);
  const previous = lastCodePoint(before);
  if (previous === undefined) return false;
  const after = wordAt(text, offset);

  if (isAmount(before)) {
    if (THAI_UNITS.some((unit) => after.startsWith(unit))) return true;
    const unit = after.replace(/[.,;:!?)]+$/u, "").toLowerCase();
    if (LATIN_UNITS.has(unit) || isMultiplier(after)) return true;
    if (
      after === String.fromCodePoint(next) &&
      ["PO", "PR"].includes(lineBreakClass(next))
    ) {
      return true;
    }
  }
  if (
    lineBreakClass(previous) === "PR" &&
    before === String.fromCodePoint(previous) &&
    isNumber(next)
  ) {
    return true;
  }
  if (isMultiplier(before) && isNumber(next)) {
    return isNumber(lastCodePoint(wordBefore(text, start).word));
  }
  return false;
}

/** UAX #14 opportunities with the M3 tailorings applied. */
export function tailoredLineBreakOpportunities(text: string): LineBreakOpportunity[] {
  return lineBreakOpportunities(text).filter(
    (opportunity) => opportunity.required || !isSuppressed(text, opportunity.offset),
  );
}
