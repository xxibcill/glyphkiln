import { readFileSync } from "node:fs";

import { sha256 } from "../cache/canonical.js";
import { GlyphkilnError, type ResolvedFont } from "../domain/types.js";
import { assertFontResources } from "../resources/index.js";
import type { FontDeclaration } from "../schema/index.js";
import { fontReferenceKey } from "./key.js";
import {
  fontkitShaper,
  type OutlineCommand,
  type ShapedRun,
  type ShapeRequest,
  type Shaper,
  type ShaperFace,
} from "./shaper.js";

const DEVELOPMENT_FONT_PATH = new URL(
  "../../assets/fonts/Inter-Variable.ttf",
  import.meta.url,
);
/** Closed OpenType feature map: a tag switched on (true) or off (false). */
export type OpenTypeFeatureMap = Readonly<Record<string, boolean>>;

/** A glyph placed on the canvas, in px. Internal layout evidence. */
export type PositionedGlyph = {
  id: number;
  /** UTF-16 offset of the glyph's first code point in the shaped run text. */
  cluster: number;
  codePointCount: number;
  /** Glyph origin (pen position plus offset). */
  x: number;
  y: number;
  /** Advance applied after the glyph, including letter spacing. */
  advance: number;
};

/** One line set by FontRegistry.setLines: its path and glyph evidence. */
export type SetLine = {
  path: string;
  x: number;
  baseline: number;
  width: number;
  glyphs: PositionedGlyph[];
};

/** One styled segment set by FontRegistry.setSegments. */
export type SetSegment = {
  path: string;
  x: number;
  width: number;
  glyphs: PositionedGlyph[];
};

export type SetLinesInput = {
  lines: readonly string[];
  family: string;
  weight: number;
  style: ResolvedFont["style"];
  fontSize: number;
  lineHeight: number;
  x: number;
  y: number;
  align: "left" | "center" | "right";
  letterSpacing?: number;
  features?: OpenTypeFeatureMap;
};

export type SetSegmentsInput = {
  segments: readonly OutlineSegment[];
  family: string;
  fontSize: number;
  x: number;
  baseline: number;
  letterSpacing?: number;
  features?: OpenTypeFeatureMap;
};

/** One styled run of a line laid out by outlineSegments. */
export type OutlineSegment = {
  text: string;
  weight: number;
  style: ResolvedFont["style"];
};

export const DEVELOPMENT_FONT_SHA256 =
  "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031";

export class FontRegistry {
  readonly #fonts = new Map<string, ResolvedFont>();
  readonly #faces = new Map<string, ShaperFace>();
  readonly #shaper: Shaper = fontkitShaper;

  public constructor(fonts: readonly ResolvedFont[] = []) {
    assertFontResources(fonts);
    for (const font of [createDevelopmentFont(), ...fonts]) {
      this.add(font);
    }
  }

  public validateDeclarations(declarations: readonly FontDeclaration[]): void {
    for (const declaration of declarations) {
      const font = this.get(declaration.family, declaration.weight, declaration.style);
      if (declaration.sha256 !== undefined && declaration.sha256 !== font.sha256) {
        throw new GlyphkilnError(
          `Font hash mismatch for ${fontLabel(declaration)}.`,
          "FONT_HASH_MISMATCH",
          { expected: declaration.sha256, actual: font.sha256 },
        );
      }
    }
  }

  public get(
    family: string,
    weight = 400,
    style: ResolvedFont["style"] = "normal",
  ): ResolvedFont {
    const font = this.#fonts.get(fontReferenceKey(family, weight, style));
    if (font === undefined) {
      throw new GlyphkilnError(
        `Unsupported font "${family}" (${weight} ${style}). Supply its bytes explicitly.`,
        "UNSUPPORTED_FONT",
        { family, weight, style },
      );
    }
    return font;
  }

  public measure(
    text: string,
    family: string,
    weight: number,
    style: ResolvedFont["style"],
    fontSize: number,
    letterSpacing = 0,
    features?: OpenTypeFeatureMap,
  ): number {
    const run = this.shape(text, family, weight, style, features);
    return (
      (run.advanceWidth / run.unitsPerEm) * fontSize +
      Math.max(0, run.glyphs.length - 1) * letterSpacing
    );
  }

  public missingCodePoints(
    text: string,
    family: string,
    weight: number,
    style: ResolvedFont["style"],
  ): number[] {
    const face = this.#getFace(family, weight, style);
    const missing = new Set<number>();
    for (const character of text) {
      const codePoint = character.codePointAt(0)!;
      if (!this.#shaper.hasGlyphForCodePoint(face, codePoint)) missing.add(codePoint);
    }
    return Array.from(missing);
  }

  /** Identity of the shaper behind this registry. @internal */
  public get shaperId(): string {
    return this.#shaper.id;
  }

  /**
   * Shape one run with an exact registered face. Without a script or language
   * this is the legacy fontkit call, byte for byte.
   * @internal Used by layoutText and the typography harness; not a stable API.
   */
  public shape(
    text: string,
    family: string,
    weight: number,
    style: ResolvedFont["style"],
    features?: OpenTypeFeatureMap,
    options: Omit<ShapeRequest, "text" | "features"> = {},
  ): ShapedRun {
    const face = this.#getFace(family, weight, style);
    return this.#shaper.shape(face, {
      ...options,
      text,
      ...(features === undefined ? {} : { features }),
    });
  }

  public outlineText(input: SetLinesInput): string[] {
    return this.setLines(input).map((line) => line.path);
  }

  /**
   * Set whole lines on shared baselines: paths plus glyph evidence.
   * @internal Used by layoutText; not a stable API.
   */
  public setLines(input: SetLinesInput): SetLine[] {
    const face = this.#getFace(input.family, input.weight, input.style);
    const metrics = this.#shaper.metrics(face);
    const scale = input.fontSize / metrics.unitsPerEm;
    const firstBaseline = input.y + metrics.ascent * scale;
    return input.lines.map((line, lineIndex) => {
      const run = this.#shaper.shape(face, {
        text: line,
        ...(input.features === undefined ? {} : { features: input.features }),
      });
      const lineWidth =
        run.advanceWidth * scale +
        Math.max(0, run.glyphs.length - 1) * (input.letterSpacing ?? 0);
      const lineX =
        input.align === "center"
          ? input.x - lineWidth / 2
          : input.align === "right"
            ? input.x - lineWidth
            : input.x;
      const baseline = firstBaseline + lineIndex * input.fontSize * input.lineHeight;
      const set = this.#outlineRun(
        face,
        run,
        lineX,
        baseline,
        scale,
        input.letterSpacing ?? 0,
      );
      return {
        path: set.path,
        x: lineX,
        baseline,
        width: lineWidth,
        glyphs: set.glyphs,
      };
    });
  }

  /**
   * Outline one line made of styled runs, set left to right from `x` on one
   * shared baseline. Letter spacing also separates adjacent runs. Returns one
   * path per run and the total advance width.
   */
  public outlineSegments(input: SetSegmentsInput): { paths: string[]; width: number } {
    const set = this.setSegments(input);
    return { paths: set.segments.map((segment) => segment.path), width: set.width };
  }

  /**
   * outlineSegments with glyph evidence per segment.
   * @internal Used by layoutText; not a stable API.
   */
  public setSegments(input: SetSegmentsInput): {
    segments: SetSegment[];
    width: number;
  } {
    const letterSpacing = input.letterSpacing ?? 0;
    const segments: SetSegment[] = [];
    let penX = input.x;
    for (const [index, segment] of input.segments.entries()) {
      if (index > 0) penX += letterSpacing;
      const face = this.#getFace(input.family, segment.weight, segment.style);
      const scale = input.fontSize / this.#shaper.metrics(face).unitsPerEm;
      const run = this.#shaper.shape(face, {
        text: segment.text,
        ...(input.features === undefined ? {} : { features: input.features }),
      });
      const set = this.#outlineRun(
        face,
        run,
        penX,
        input.baseline,
        scale,
        letterSpacing,
      );
      const width =
        run.advanceWidth * scale + Math.max(0, run.glyphs.length - 1) * letterSpacing;
      segments.push({ path: set.path, x: penX, width, glyphs: set.glyphs });
      penX += width;
    }
    return { segments, width: penX - input.x };
  }

  /** Em-relative ascent of an exact registered face. */
  public ascent(family: string, weight: number, style: ResolvedFont["style"]): number {
    const metrics = this.#shaper.metrics(this.#getFace(family, weight, style));
    return metrics.ascent / metrics.unitsPerEm;
  }

  /** Whether an exact registered face declares an OpenType feature tag. */
  public hasFeature(
    family: string,
    weight: number,
    style: ResolvedFont["style"],
    tag: string,
  ): boolean {
    return this.#shaper
      .availableFeatures(this.#getFace(family, weight, style))
      .includes(tag);
  }

  /** Whether a face is registered for this exact family, weight, and style. */
  public has(family: string, weight: number, style: ResolvedFont["style"]): boolean {
    return this.#fonts.has(fontReferenceKey(family, weight, style));
  }

  /** Em-relative x-height and cap height of an exact registered face. */
  public verticalMetrics(
    family: string,
    weight: number,
    style: ResolvedFont["style"],
  ): { xHeight: number; capHeight: number } {
    const metrics = this.#shaper.metrics(this.#getFace(family, weight, style));
    return {
      xHeight: metrics.xHeight / metrics.unitsPerEm,
      capHeight: metrics.capHeight / metrics.unitsPerEm,
    };
  }

  public list(): ResolvedFont[] {
    return [...this.#fonts.values()];
  }

  #getFace(family: string, weight: number, style: ResolvedFont["style"]): ShaperFace {
    const key = fontReferenceKey(family, weight, style);
    const font = this.get(family, weight, style);
    let face = this.#faces.get(key);
    if (face !== undefined) return face;
    let created: ShaperFace;
    try {
      created = this.#shaper.loadFace(font.bytes);
    } catch (error) {
      if (
        error instanceof GlyphkilnError &&
        error.code === "FONT_COLLECTION_UNSUPPORTED"
      ) {
        throw new GlyphkilnError(
          `Font "${font.family}" resolved to a collection instead of a face.`,
          "FONT_COLLECTION_UNSUPPORTED",
        );
      }
      throw error;
    }
    // Only the weight axis is set today (plan §3.2); every other axis stays at
    // its default until the M1 font model.
    face =
      this.#shaper.variationAxes(created)["wght"] === undefined
        ? created
        : this.#shaper.instantiate(created, { wght: weight });
    this.#faces.set(key, face);
    return face;
  }

  #outlineRun(
    face: ShaperFace,
    run: ShapedRun,
    startX: number,
    baseline: number,
    scale: number,
    letterSpacing: number,
  ): { path: string; glyphs: PositionedGlyph[] } {
    const paths: string[] = [];
    const glyphs: PositionedGlyph[] = [];
    let penX = startX;
    let penY = baseline;
    for (const glyph of run.glyphs) {
      const outline = this.#shaper.glyphOutline(face, glyph.id);
      if (outline.color) {
        throw new GlyphkilnError(
          `Color glyph "${outline.name}" cannot be represented by the portable SVG outliner.`,
          "COLOR_GLYPH_UNSUPPORTED",
          { glyphId: glyph.id, glyphName: outline.name },
        );
      }
      const originX = penX + glyph.xOffset * scale;
      const originY = penY - glyph.yOffset * scale;
      paths.push(serializePath(outline.commands, scale, originX, originY));
      const advance = glyph.xAdvance * scale + letterSpacing;
      glyphs.push({
        id: glyph.id,
        cluster: glyph.cluster,
        codePointCount: glyph.codePointCount,
        x: originX,
        y: originY,
        advance,
      });
      penX += advance;
      penY -= glyph.yAdvance * scale;
    }
    return { path: paths.join(" "), glyphs };
  }

  #addAlias(font: ResolvedFont, weight: number): void {
    this.#fonts.set(fontReferenceKey(font.family, weight, font.style), {
      ...font,
      weight,
    });
  }

  #verify(font: ResolvedFont): ResolvedFont {
    const actualHash = sha256(font.bytes);
    if (font.sha256 !== undefined && font.sha256 !== actualHash) {
      throw new GlyphkilnError(
        `Font bytes for "${font.family}" do not match the declared SHA-256.`,
        "FONT_HASH_MISMATCH",
        { expected: font.sha256, actual: actualHash },
      );
    }
    return { ...font, sha256: actualHash };
  }

  private add(font: ResolvedFont): void {
    const verified = this.#verify(font);
    this.#fonts.set(
      fontReferenceKey(verified.family, verified.weight, verified.style),
      verified,
    );
    if (verified.family === "Inter" && verified.style === "normal") {
      for (let weight = 100; weight <= 900; weight += 100) {
        this.#addAlias(verified, weight);
      }
    }
  }
}

function serializePath(
  commands: readonly OutlineCommand[],
  scale: number,
  offsetX: number,
  offsetY: number,
): string {
  return commands
    .map((command) => {
      const points = transformArguments(command.args, scale, offsetX, offsetY);
      switch (command.command) {
        case "moveTo":
          return `M ${points.join(" ")}`;
        case "lineTo":
          return `L ${points.join(" ")}`;
        case "quadraticCurveTo":
          return `Q ${points.join(" ")}`;
        case "bezierCurveTo":
          return `C ${points.join(" ")}`;
        case "closePath":
          return "Z";
      }
    })
    .join(" ");
}

function transformArguments(
  values: readonly number[],
  scale: number,
  offsetX: number,
  offsetY: number,
): string[] {
  return values.map((value, index) =>
    coordinate(index % 2 === 0 ? offsetX + value * scale : offsetY - value * scale),
  );
}

function coordinate(value: number): string {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function createDevelopmentFont(): ResolvedFont {
  return {
    family: "Inter",
    weight: 400,
    style: "normal",
    sha256: DEVELOPMENT_FONT_SHA256,
    bytes: readFileSync(DEVELOPMENT_FONT_PATH),
  };
}

function fontLabel(font: FontDeclaration): string {
  return `"${font.family}" (${font.weight} ${font.style})`;
}
