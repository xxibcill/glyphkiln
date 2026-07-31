import { readFileSync } from "node:fs";

import * as fontkit from "fontkit";
import type { Font, GlyphRun, PathCommand } from "fontkit";

import { sha256 } from "../cache/canonical.js";
import { GlyphkilnError, type ResolvedFont } from "../domain/types.js";
import { assertFontResources } from "../resources/index.js";
import type { FontDeclaration } from "../schema/index.js";

const DEVELOPMENT_FONT_PATH = new URL(
  "../../assets/fonts/Inter-Variable.ttf",
  import.meta.url,
);
export const DEVELOPMENT_FONT_SHA256 =
  "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031";

export class FontRegistry {
  readonly #fonts = new Map<string, ResolvedFont>();
  readonly #faces = new Map<string, Font>();

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
    const font = this.#fonts.get(fontKey(family, weight, style));
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
  ): number {
    const face = this.#getFace(family, weight, style);
    const run = face.layout(text);
    return (
      (run.advanceWidth / face.unitsPerEm) * fontSize +
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
      if (!face.hasGlyphForCodePoint(codePoint)) missing.add(codePoint);
    }
    return Array.from(missing);
  }

  public outlineText(input: {
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
  }): string[] {
    const face = this.#getFace(input.family, input.weight, input.style);
    const scale = input.fontSize / face.unitsPerEm;
    const firstBaseline = input.y + face.ascent * scale;
    return input.lines.map((line, lineIndex) => {
      const run = face.layout(line);
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
      return outlineRun(run, lineX, baseline, scale, input.letterSpacing ?? 0);
    });
  }

  public list(): ResolvedFont[] {
    return [...this.#fonts.values()];
  }

  #getFace(family: string, weight: number, style: ResolvedFont["style"]): Font {
    const key = fontKey(family, weight, style);
    const font = this.get(family, weight, style);
    let face = this.#faces.get(key);
    if (face !== undefined) return face;
    const created = fontkit.create(Buffer.from(font.bytes));
    if (!("layout" in created)) {
      throw new GlyphkilnError(
        `Font "${font.family}" resolved to a collection instead of a face.`,
        "FONT_COLLECTION_UNSUPPORTED",
      );
    }
    face =
      created.variationAxes["wght"] === undefined
        ? created
        : created.getVariation({ wght: weight });
    this.#faces.set(key, face);
    return face;
  }

  #addAlias(font: ResolvedFont, weight: number): void {
    this.#fonts.set(fontKey(font.family, weight, font.style), {
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
      fontKey(verified.family, verified.weight, verified.style),
      verified,
    );
    if (verified.family === "Inter" && verified.style === "normal") {
      for (let weight = 100; weight <= 900; weight += 100) {
        this.#addAlias(verified, weight);
      }
    }
  }
}

function outlineRun(
  run: GlyphRun,
  startX: number,
  baseline: number,
  scale: number,
  letterSpacing: number,
): string {
  const paths: string[] = [];
  let penX = startX;
  let penY = baseline;
  for (const [index, glyph] of run.glyphs.entries()) {
    if (glyph.layers !== undefined && glyph.layers.length > 0) {
      throw new GlyphkilnError(
        `Color glyph "${glyph.name}" cannot be represented by the portable SVG outliner.`,
        "COLOR_GLYPH_UNSUPPORTED",
        { glyphId: glyph.id, glyphName: glyph.name },
      );
    }
    const position = run.positions[index]!;
    paths.push(
      serializePath(
        glyph.path.commands,
        scale,
        penX + position.xOffset * scale,
        penY - position.yOffset * scale,
      ),
    );
    penX += position.xAdvance * scale + letterSpacing;
    penY -= position.yAdvance * scale;
  }
  return paths.join(" ");
}

function serializePath(
  commands: readonly PathCommand[],
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

function fontKey(family: string, weight: number, style: ResolvedFont["style"]): string {
  return `${family.toLocaleLowerCase("en-US")}\u0000${weight}\u0000${style}`;
}

function fontLabel(font: FontDeclaration): string {
  return `"${font.family}" (${font.weight} ${font.style})`;
}
