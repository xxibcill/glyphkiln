import { GlyphkilnError } from "../domain/types.js";
import {
  BIDI_CLASS_AL_RANGES,
  BIDI_CLASS_R_RANGES,
  BIDI_CONTROL_RANGES,
  MONGOLIAN_SCRIPT_RANGES,
  PHAGS_PA_SCRIPT_RANGES,
  UNICODE_TEXT_LAYOUT_DATA_VERSION,
  VERTICAL_DECOMPOSITION_RANGES,
  type TextLayoutRange,
} from "./text-layout-data.generated.js";

export const TEXT_LAYOUT_DIAGNOSTICS_VERSION =
  `unicode-${UNICODE_TEXT_LAYOUT_DATA_VERSION}/ltr-horizontal-v1` as const;

export type TextLayoutDiagnosticCode =
  | "BIDI_CONTROL_UNSUPPORTED"
  | "BIDI_LAYOUT_UNSUPPORTED"
  | "VERTICAL_LAYOUT_UNSUPPORTED";

export type TextLayoutMatchProperty =
  | "Bidi_Control"
  | "Bidi_Class=R"
  | "Bidi_Class=AL"
  | "Script=Mongolian"
  | "Script=Phags_Pa"
  | "Decomposition_Type=Vertical";

export type TextLayoutMatch = {
  codePoint: number;
  scalarIndex: number;
  property: TextLayoutMatchProperty;
};

export type TextLayoutDiagnostic = {
  code: TextLayoutDiagnosticCode;
  message: string;
  totalMatches: number;
  matches: readonly TextLayoutMatch[];
  truncated: boolean;
};

export type TextLayoutAnalysis = {
  version: typeof TEXT_LAYOUT_DIAGNOSTICS_VERSION;
  supported: boolean;
  diagnostics: readonly TextLayoutDiagnostic[];
};

type Classification = {
  code: TextLayoutDiagnosticCode;
  property: TextLayoutMatchProperty;
};

type ClassificationRule = Classification & {
  ranges: readonly TextLayoutRange[];
};

type DiagnosticAccumulator = {
  totalMatches: number;
  matches: TextLayoutMatch[];
};

const MAX_MATCHES_PER_DIAGNOSTIC = 16;
const DIAGNOSTIC_CODES: readonly TextLayoutDiagnosticCode[] = [
  "BIDI_CONTROL_UNSUPPORTED",
  "BIDI_LAYOUT_UNSUPPORTED",
  "VERTICAL_LAYOUT_UNSUPPORTED",
];
const DIAGNOSTIC_MESSAGES: Readonly<Record<TextLayoutDiagnosticCode, string>> = {
  BIDI_CONTROL_UNSUPPORTED:
    "Text contains bidirectional controls that the LTR-horizontal renderer does not support.",
  BIDI_LAYOUT_UNSUPPORTED:
    "Text requires bidirectional layout that the LTR-horizontal renderer does not support.",
  VERTICAL_LAYOUT_UNSUPPORTED:
    "Text contains vertical-primary characters that the LTR-horizontal renderer does not support.",
};
const CLASSIFICATION_RULES: readonly ClassificationRule[] = [
  {
    code: "BIDI_CONTROL_UNSUPPORTED",
    property: "Bidi_Control",
    ranges: BIDI_CONTROL_RANGES,
  },
  {
    code: "BIDI_LAYOUT_UNSUPPORTED",
    property: "Bidi_Class=R",
    ranges: BIDI_CLASS_R_RANGES,
  },
  {
    code: "BIDI_LAYOUT_UNSUPPORTED",
    property: "Bidi_Class=AL",
    ranges: BIDI_CLASS_AL_RANGES,
  },
  {
    code: "VERTICAL_LAYOUT_UNSUPPORTED",
    property: "Script=Mongolian",
    ranges: MONGOLIAN_SCRIPT_RANGES,
  },
  {
    code: "VERTICAL_LAYOUT_UNSUPPORTED",
    property: "Script=Phags_Pa",
    ranges: PHAGS_PA_SCRIPT_RANGES,
  },
  {
    code: "VERTICAL_LAYOUT_UNSUPPORTED",
    property: "Decomposition_Type=Vertical",
    ranges: VERTICAL_DECOMPOSITION_RANGES,
  },
];

export function analyzeTextLayoutSupport(text: string): TextLayoutAnalysis {
  if (typeof text !== "string") {
    throw new GlyphkilnError(
      "Text-layout analysis requires a string.",
      "INVALID_TEXT_INPUT",
    );
  }
  const accumulators = createAccumulators();
  let scalarIndex = 0;
  for (const scalar of text) {
    const codePoint = scalar.codePointAt(0)!;
    const classification = classifyCodePoint(codePoint);
    if (classification !== undefined) {
      retainMatch(accumulators[classification.code], {
        codePoint,
        scalarIndex,
        property: classification.property,
      });
    }
    scalarIndex += 1;
  }
  const diagnostics = createDiagnostics(accumulators);
  return {
    version: TEXT_LAYOUT_DIAGNOSTICS_VERSION,
    supported: diagnostics.length === 0,
    diagnostics,
  };
}

function createAccumulators(): Record<TextLayoutDiagnosticCode, DiagnosticAccumulator> {
  return {
    BIDI_CONTROL_UNSUPPORTED: { totalMatches: 0, matches: [] },
    BIDI_LAYOUT_UNSUPPORTED: { totalMatches: 0, matches: [] },
    VERTICAL_LAYOUT_UNSUPPORTED: { totalMatches: 0, matches: [] },
  };
}

function retainMatch(accumulator: DiagnosticAccumulator, match: TextLayoutMatch): void {
  accumulator.totalMatches += 1;
  if (accumulator.matches.length < MAX_MATCHES_PER_DIAGNOSTIC) {
    accumulator.matches.push(match);
  }
}

function createDiagnostics(
  accumulators: Record<TextLayoutDiagnosticCode, DiagnosticAccumulator>,
): TextLayoutDiagnostic[] {
  return DIAGNOSTIC_CODES.flatMap((code) => {
    const accumulator = accumulators[code];
    if (accumulator.totalMatches === 0) return [];
    return [
      {
        code,
        message: DIAGNOSTIC_MESSAGES[code],
        totalMatches: accumulator.totalMatches,
        matches: accumulator.matches,
        truncated: accumulator.totalMatches > accumulator.matches.length,
      },
    ];
  });
}

function classifyCodePoint(codePoint: number): Classification | undefined {
  for (const rule of CLASSIFICATION_RULES) {
    if (isInRanges(codePoint, rule.ranges)) {
      return { code: rule.code, property: rule.property };
    }
  }
  return undefined;
}

function isInRanges(codePoint: number, ranges: readonly TextLayoutRange[]): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const range = ranges[middle]!;
    if (codePoint < range[0]) {
      high = middle - 1;
    } else if (codePoint > range[1]) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}
