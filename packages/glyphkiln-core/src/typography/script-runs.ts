import {
  SCRIPT_DATA_SOURCE_SHA256,
  SCRIPT_DATA_UNICODE_VERSION,
  SCRIPT_NAMES,
  SCRIPT_RANGES,
} from "./script-data.generated.js";

/**
 * Policy `script-runs@1.0.0` (typography plan M1b). Text is itemized with the
 * Unicode 17.0.0 Script property (generated from the vendored, hash-checked
 * `Scripts.txt`). Common and Inherited code points attach to the preceding
 * run, or to the following run when they open the text; text with no strong
 * script is one Common run. Each run is shaped alone with its script.
 */
export const SCRIPT_RUNS_POLICY_VERSION = "script-runs@1.0.0" as const;
export const SCRIPT_RUNS_POLICY = Object.freeze({
  version: SCRIPT_RUNS_POLICY_VERSION,
  unicodeVersion: SCRIPT_DATA_UNICODE_VERSION,
  scriptsSha256: SCRIPT_DATA_SOURCE_SHA256,
  neutral: "attach-preceding-else-following",
});

export type ScriptRun = {
  /** Unicode Script long name (`Latin`, `Thai`, `Common`). */
  script: string;
  /** UTF-16 offsets, end exclusive. */
  start: number;
  end: number;
};

const NEUTRAL = new Set(["Common", "Inherited"]);

/**
 * ISO 15924 codes passed to the shaper for scripts Core sets explicitly. A
 * run in any other script still gets its own run; HarfBuzz then reads the
 * script from that single-script run, which gives the same script.
 */
const ISO_15924: Readonly<Record<string, string>> = Object.freeze({
  Arabic: "Arab",
  Armenian: "Armn",
  Bengali: "Beng",
  Common: "Zyyy",
  Cyrillic: "Cyrl",
  Devanagari: "Deva",
  Georgian: "Geor",
  Greek: "Grek",
  Han: "Hani",
  Hangul: "Hang",
  Hebrew: "Hebr",
  Hiragana: "Hira",
  Katakana: "Kana",
  Khmer: "Khmr",
  Lao: "Laoo",
  Latin: "Latn",
  Myanmar: "Mymr",
  Tamil: "Taml",
  Thai: "Thai",
});

/** The ISO 15924 tag Core passes to the shaper, if it pins one. */
export function scriptTag(script: string): string | undefined {
  return ISO_15924[script];
}

/** Unicode 17 Script property of one code point. */
export function scriptOf(codePoint: number): string {
  let low = 0;
  let high = SCRIPT_RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [start, end, index] = SCRIPT_RANGES[middle]!;
    if (codePoint < start) high = middle - 1;
    else if (codePoint > end) low = middle + 1;
    else return SCRIPT_NAMES[index]!;
  }
  return "Unknown";
}

export function itemizeScripts(text: string): ScriptRun[] {
  const runs: ScriptRun[] = [];
  let offset = 0;
  for (const character of text) {
    const script = scriptOf(character.codePointAt(0)!);
    const last = runs.at(-1);
    if (NEUTRAL.has(script)) {
      if (last !== undefined) last.end += character.length;
    } else if (last?.script === script) {
      last.end += character.length;
    } else {
      runs.push({
        script,
        start: last === undefined ? 0 : offset,
        end: offset + character.length,
      });
    }
    offset += character.length;
  }
  if (runs.length === 0)
    return text.length === 0 ? [] : [{ script: "Common", start: 0, end: text.length }];
  return runs;
}
