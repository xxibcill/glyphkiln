/**
 * UAX #14 line-break opportunities (policy `line-break-uax14@17.0.0`).
 *
 * A pure function over the generated Unicode 17.0.0 tables: no host `Intl`, no
 * ICU, no I/O. The rules are the untailored default algorithm (LB1–LB31) of
 * UAX #14 revision 55, so the output is checked against `LineBreakTest.txt`.
 * Tailorings are applied by callers on top of these opportunities.
 */
import {
  LINE_BREAK_CLASSES,
  LINE_BREAK_DATA_SOURCE_SHA256,
  LINE_BREAK_DATA_UNICODE_VERSION,
  LINE_BREAK_FLAG_EAST_ASIAN,
  LINE_BREAK_FLAG_MARK,
  LINE_BREAK_FLAG_PF,
  LINE_BREAK_FLAG_PI,
  LINE_BREAK_FLAG_PICTOGRAPHIC_UNASSIGNED,
  LINE_BREAK_RANGE_STARTS,
  LINE_BREAK_RANGE_VALUES,
} from "./line-break-data.generated.js";

export const LINE_BREAK_POLICY = Object.freeze({
  id: "line-break-uax14",
  version: "17.0.0",
  unicodeVersion: LINE_BREAK_DATA_UNICODE_VERSION,
  sourceSha256: LINE_BREAK_DATA_SOURCE_SHA256,
});

/** A position where a line may (or, when `required`, must) end. */
export type LineBreakOpportunity = {
  /** UTF-16 offset of the first code unit of the next line. */
  readonly offset: number;
  /** True for a mandatory break (after BK, CR, LF or NL). */
  readonly required: boolean;
};

type CodePointProperties = {
  readonly lineBreakClass: string;
  readonly flags: number;
};

/** Raw Line_Break class and property flags of a code point. */
export function lineBreakProperties(codePoint: number): CodePointProperties {
  let low = 0;
  let high = LINE_BREAK_RANGE_STARTS.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (LINE_BREAK_RANGE_STARTS[middle]! <= codePoint) low = middle;
    else high = middle - 1;
  }
  const value = LINE_BREAK_RANGE_VALUES[low]!;
  return { lineBreakClass: LINE_BREAK_CLASSES[value & 63]!, flags: value & ~63 };
}

/** LB1: resolve AI, SG, XX, SA and CJ to the classes the rules use. */
function resolveClass({ lineBreakClass, flags }: CodePointProperties): string {
  switch (lineBreakClass) {
    case "AI":
    case "SG":
    case "XX":
      return "AL";
    case "SA":
      return (flags & LINE_BREAK_FLAG_MARK) !== 0 ? "CM" : "AL";
    case "CJ":
      return "NS";
    default:
      return lineBreakClass;
  }
}

type Base = {
  /** Resolved class after LB9/LB10. */
  readonly cls: string;
  readonly flags: number;
  readonly codePoint: number;
};

const HARD_BREAK = new Set(["BK", "CR", "LF", "NL"]);
const NOT_A_BASE = new Set(["BK", "CR", "LF", "NL", "SP", "ZW"]);
const AK_DOTTED = (base: Base | undefined): boolean =>
  base !== undefined &&
  (base.cls === "AK" || base.cls === "AS" || base.codePoint === 0x25cc);
const AK_OR_DOTTED = (base: Base | undefined): boolean =>
  base !== undefined && (base.cls === "AK" || base.codePoint === 0x25cc);

/**
 * Break opportunities of `text` under the untailored UAX #14 algorithm. Every
 * interior position where a break is allowed is returned in ascending order;
 * the end of text (LB3) is not included.
 */
export function lineBreakOpportunities(text: string): LineBreakOpportunity[] {
  const codePoints: number[] = [];
  const offsets: number[] = [];
  for (let offset = 0; offset < text.length;) {
    const codePoint = text.codePointAt(offset)!;
    codePoints.push(codePoint);
    offsets.push(offset);
    offset += codePoint > 0xffff ? 2 : 1;
  }
  const count = codePoints.length;
  const raw: string[] = [];
  const rawFlags: number[] = [];
  for (const codePoint of codePoints) {
    const properties = lineBreakProperties(codePoint);
    raw.push(resolveClass(properties));
    rawFlags.push(properties.flags);
  }

  // LB9/LB10: combining marks and ZWJ join a preceding base, else become AL.
  const bases: Base[] = [];
  const baseOf: number[] = [];
  const attached: boolean[] = [];
  for (let index = 0; index < count; index += 1) {
    const cls = raw[index]!;
    const previous = index > 0 ? raw[index - 1] : undefined;
    const joins =
      (cls === "CM" || cls === "ZWJ") &&
      index > 0 &&
      (attached[index - 1] === true || !NOT_A_BASE.has(previous!));
    attached.push(joins);
    if (joins) {
      baseOf.push(bases.length - 1);
    } else {
      baseOf.push(bases.length);
      bases.push({
        cls: cls === "CM" || cls === "ZWJ" ? "AL" : cls,
        flags: rawFlags[index]!,
        codePoint: codePoints[index]!,
      });
    }
  }

  const opportunities: LineBreakOpportunity[] = [];
  for (let index = 1; index < count; index += 1) {
    const decision = decideRaw(raw, attached, index);
    const allowed = decision ?? decideBases(bases, baseOf[index - 1]!, baseOf[index]!);
    if (allowed !== false) {
      opportunities.push({ offset: offsets[index]!, required: allowed === "required" });
    }
  }
  return opportunities;
}

type Decision = boolean | "required";

/** LB4–LB9, which look at raw classes. Undefined means "not decided". */
function decideRaw(
  raw: readonly string[],
  attached: readonly boolean[],
  index: number,
): Decision | undefined {
  const before = raw[index - 1]!;
  const after = raw[index]!;
  if (before === "BK") return "required"; // LB4
  if (before === "CR" && after === "LF") return false; // LB5
  if (before === "CR" || before === "LF" || before === "NL") return "required";
  if (HARD_BREAK.has(after)) return false; // LB6
  if (after === "SP" || after === "ZW") return false; // LB7
  let back = index - 1; // LB8
  while (back >= 0 && raw[back] === "SP") back -= 1;
  if (back >= 0 && raw[back] === "ZW") return true;
  if (before === "ZWJ") return false; // LB8a
  if (attached[index]) return false; // LB9
  return undefined;
}

const has = (base: Base | undefined, flag: number): boolean =>
  base !== undefined && (base.flags & flag) !== 0;
const isClass = (base: Base | undefined, ...classes: string[]): boolean =>
  base !== undefined && classes.includes(base.cls);

/** LB10–LB31 between the bases `left` and `right` (right === left + 1). */
function decideBases(bases: readonly Base[], left: number, right: number): boolean {
  const a = bases[left]!;
  const b = bases[right]!;
  const before = bases[left - 1];
  const next = bases[right + 1];
  const A = a.cls;
  const B = b.cls;
  const skipSpacesBack = (): Base | undefined => {
    let index = left;
    while (index >= 0 && bases[index]!.cls === "SP") index -= 1;
    return bases[index];
  };
  // LB11
  if (B === "WJ" || A === "WJ") return false;
  // LB12, LB12a
  if (A === "GL") return false;
  if (B === "GL" && !["SP", "BA", "HY", "HH"].includes(A)) return false;
  // LB13
  if (["CL", "CP", "EX", "SY"].includes(B)) return false;
  // LB14
  if (isClass(skipSpacesBack(), "OP")) return false;
  // LB15a
  {
    let index = left;
    while (index >= 0 && bases[index]!.cls === "SP") index -= 1;
    const quote = bases[index];
    if (isClass(quote, "QU") && has(quote, LINE_BREAK_FLAG_PI)) {
      const prior = bases[index - 1];
      if (
        prior === undefined ||
        isClass(prior, "BK", "CR", "LF", "NL", "OP", "QU", "GL", "SP", "ZW")
      ) {
        return false;
      }
    }
  }
  // LB15b
  if (
    B === "QU" &&
    has(b, LINE_BREAK_FLAG_PF) &&
    (next === undefined ||
      isClass(
        next,
        "SP",
        "GL",
        "WJ",
        "CL",
        "QU",
        "CP",
        "EX",
        "IS",
        "SY",
        "BK",
        "CR",
        "LF",
        "NL",
        "ZW",
      ))
  ) {
    return false;
  }
  // LB15c, LB15d
  if (A === "SP" && B === "IS" && isClass(next, "NU")) return true;
  if (B === "IS") return false;
  // LB16, LB17
  if (B === "NS" && isClass(skipSpacesBack(), "CL", "CP")) return false;
  if (B === "B2" && isClass(skipSpacesBack(), "B2")) return false;
  // LB18
  if (A === "SP") return true;
  // LB19
  if (B === "QU" && !has(b, LINE_BREAK_FLAG_PI)) return false;
  if (A === "QU" && !has(a, LINE_BREAK_FLAG_PF)) return false;
  // LB19a
  if (B === "QU") {
    if (!has(a, LINE_BREAK_FLAG_EAST_ASIAN)) return false;
    if (next === undefined || !has(next, LINE_BREAK_FLAG_EAST_ASIAN)) return false;
  }
  if (A === "QU") {
    if (!has(b, LINE_BREAK_FLAG_EAST_ASIAN)) return false;
    if (before === undefined || !has(before, LINE_BREAK_FLAG_EAST_ASIAN)) return false;
  }
  // LB20
  if (A === "CB" || B === "CB") return true;
  // LB20a
  if (
    (A === "HY" || A === "HH") &&
    (B === "AL" || B === "HL") &&
    (before === undefined ||
      isClass(before, "BK", "CR", "LF", "NL", "SP", "ZW", "CB", "GL"))
  ) {
    return false;
  }
  // LB21
  if (["BA", "HH", "HY", "NS"].includes(B) || A === "BB") return false;
  // LB21a
  if (isClass(before, "HL") && (A === "HY" || A === "HH") && B !== "HL") return false;
  // LB21b
  if (A === "SY" && B === "HL") return false;
  // LB22
  if (B === "IN") return false;
  // LB23
  if ((A === "AL" || A === "HL") && B === "NU") return false;
  if (A === "NU" && (B === "AL" || B === "HL")) return false;
  // LB23a
  if (A === "PR" && ["ID", "EB", "EM"].includes(B)) return false;
  if (["ID", "EB", "EM"].includes(A) && B === "PO") return false;
  // LB24
  if ((A === "PR" || A === "PO") && (B === "AL" || B === "HL")) return false;
  if ((A === "AL" || A === "HL") && (B === "PR" || B === "PO")) return false;
  const isNumberStart = (index: number): boolean =>
    isClass(bases[index], "NU") ||
    (isClass(bases[index], "IS") && isClass(bases[index + 1], "NU"));
  // LB25: (PR | PO) × (OP | HY)? IS? NU; (OP | HY) × IS? NU; IS × NU; …
  if ((A === "PR" || A === "PO") && isNumberStart(right)) return false;
  if (
    (A === "PR" || A === "PO") &&
    (B === "OP" || B === "HY") &&
    isNumberStart(right + 1)
  ) {
    return false;
  }
  if ((A === "OP" || A === "HY" || A === "IS") && B === "NU") return false;
  const numericRunBefore = (end: number): boolean => {
    for (let index = end; index >= 0; index -= 1) {
      const cls = bases[index]!.cls;
      if (cls === "NU") return true;
      if (cls !== "SY" && cls !== "IS") return false;
    }
    return false;
  };
  if (["NU", "SY", "IS", "CL", "CP"].includes(B) && numericRunBefore(left))
    return false;
  if (B === "PO" || B === "PR") {
    const end = A === "CL" || A === "CP" ? left - 1 : left;
    if (numericRunBefore(end)) return false;
  }
  // LB26
  if (A === "JL" && ["JL", "JV", "H2", "H3"].includes(B)) return false;
  if ((A === "JV" || A === "H2") && (B === "JV" || B === "JT")) return false;
  if ((A === "JT" || A === "H3") && B === "JT") return false;
  // LB27
  const korean = ["JL", "JV", "JT", "H2", "H3"];
  if (korean.includes(A) && B === "PO") return false;
  if (A === "PR" && korean.includes(B)) return false;
  // LB28
  if ((A === "AL" || A === "HL") && (B === "AL" || B === "HL")) return false;
  // LB28a
  if (A === "AP" && AK_DOTTED(b)) return false;
  if (AK_DOTTED(a) && (B === "VF" || B === "VI")) return false;
  if (A === "VI" && AK_DOTTED(before) && AK_OR_DOTTED(b)) return false;
  if (AK_DOTTED(a) && AK_DOTTED(b) && isClass(next, "VF")) return false;
  // LB29
  if (A === "IS" && (B === "AL" || B === "HL")) return false;
  // LB30
  if (
    (A === "AL" || A === "HL" || A === "NU") &&
    B === "OP" &&
    !has(b, LINE_BREAK_FLAG_EAST_ASIAN)
  ) {
    return false;
  }
  if (
    A === "CP" &&
    !has(a, LINE_BREAK_FLAG_EAST_ASIAN) &&
    (B === "AL" || B === "HL" || B === "NU")
  ) {
    return false;
  }
  // LB30a
  if (A === "RI" && B === "RI") {
    let run = 0;
    for (let index = left; index >= 0 && bases[index]!.cls === "RI"; index -= 1) {
      run += 1;
    }
    if (run % 2 === 1) return false;
  }
  // LB30b
  if (B === "EM" && (A === "EB" || has(a, LINE_BREAK_FLAG_PICTOGRAPHIC_UNASSIGNED))) {
    return false;
  }
  // LB31
  return true;
}
