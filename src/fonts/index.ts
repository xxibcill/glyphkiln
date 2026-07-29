import { readFileSync } from "node:fs";

import * as fontkit from "fontkit";
import type { Font } from "fontkit";

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
  ): number {
    const key = fontKey(family, weight, style);
    const font = this.get(family, weight, style);
    let face = this.#faces.get(key);
    if (face === undefined) {
      const created = fontkit.create(Buffer.from(font.bytes));
      if (!("layout" in created)) {
        throw new GlyphkilnError(
          `Font "${font.family}" resolved to a collection instead of a face.`,
          "FONT_COLLECTION_UNSUPPORTED",
        );
      }
      face = created;
      this.#faces.set(key, face);
    }
    const run = face.layout(text);
    return (run.advanceWidth / face.unitsPerEm) * fontSize;
  }

  public list(): ResolvedFont[] {
    return [...this.#fonts.values()];
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
