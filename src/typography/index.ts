import type { Bounds, QualityIssue } from "../domain/types.js";
import type { FontRegistry } from "../fonts/index.js";

export type TextStyle = {
  family: string;
  weight: number;
  style: "normal" | "italic";
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
};

export type WrappedText = {
  lines: string[];
  width: number;
  height: number;
  brokeLongWord: boolean;
};

export type FittedText = WrappedText & {
  fontSize: number;
  bounds: Bounds;
  issues: QualityIssue[];
};

export type FitTextOptions = {
  text: string;
  registry: FontRegistry;
  style: Omit<TextStyle, "fontSize">;
  box: Bounds;
  preferredFontSize: number;
  minimumFontSize: number;
  maximumLines: number;
  layerId: string;
};

export function wrapText(
  text: string,
  maxWidth: number,
  style: TextStyle,
  registry: FontRegistry,
): WrappedText {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  let brokeLongWord = false;

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    const words = paragraph.trim().split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (measure(candidate, style, registry) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current.length > 0) {
        lines.push(current);
      }
      if (measure(word, style, registry) <= maxWidth) {
        current = word;
        continue;
      }
      const fragments = breakLongToken(word, maxWidth, style, registry);
      brokeLongWord = true;
      lines.push(...fragments.slice(0, -1));
      current = fragments.at(-1) ?? "";
    }
    lines.push(current);
  }

  const widths = lines.map((line) => measure(line, style, registry));
  return {
    lines,
    width: Math.max(0, ...widths),
    height: lines.length * style.fontSize * style.lineHeight,
    brokeLongWord,
  };
}

export function fitText(options: FitTextOptions): FittedText {
  for (
    let fontSize = Math.max(options.preferredFontSize, options.minimumFontSize);
    fontSize >= options.minimumFontSize;
    fontSize -= 1
  ) {
    const style = { ...options.style, fontSize };
    const wrapped = wrapText(options.text, options.box.width, style, options.registry);
    if (
      wrapped.lines.length <= options.maximumLines &&
      wrapped.height <= options.box.height
    ) {
      return toFittedText(options, wrapped, fontSize, []);
    }
  }

  const style = { ...options.style, fontSize: options.minimumFontSize };
  const wrapped = wrapText(options.text, options.box.width, style, options.registry);
  const issues: QualityIssue[] = [
    {
      code: "TEXT_OVERFLOW",
      severity: "error",
      message: `Text does not fit within ${options.maximumLines} lines at the minimum font size.`,
      layerId: options.layerId,
      details: {
        lineCount: wrapped.lines.length,
        maximumLines: options.maximumLines,
        minimumFontSize: options.minimumFontSize,
      },
    },
  ];
  return toFittedText(options, wrapped, options.minimumFontSize, issues);
}

function toFittedText(
  options: FitTextOptions,
  wrapped: WrappedText,
  fontSize: number,
  issues: QualityIssue[],
): FittedText {
  if (wrapped.brokeLongWord) {
    issues.push({
      code: "LONG_WORD_BROKEN",
      severity: "warning",
      message: "An unbroken token was split to preserve the text boundary.",
      layerId: options.layerId,
    });
  }
  return {
    ...wrapped,
    fontSize,
    bounds: {
      x: options.box.x,
      y: options.box.y,
      width: wrapped.width,
      height: wrapped.height,
    },
    issues,
  };
}

function breakLongToken(
  token: string,
  maxWidth: number,
  style: TextStyle,
  registry: FontRegistry,
): string[] {
  const characters = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(token),
    (part) => part.segment,
  );
  const fragments: string[] = [];
  let current = "";
  for (const character of characters) {
    const candidate = current + character;
    if (current.length > 0 && measure(candidate, style, registry) > maxWidth) {
      fragments.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) fragments.push(current);
  return fragments;
}

function measure(text: string, style: TextStyle, registry: FontRegistry): number {
  const base = registry.measure(
    text,
    style.family,
    style.weight,
    style.style,
    style.fontSize,
  );
  return base + Math.max(0, text.length - 1) * (style.letterSpacing ?? 0);
}
