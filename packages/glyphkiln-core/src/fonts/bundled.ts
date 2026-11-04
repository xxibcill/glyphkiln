import { readFileSync } from "node:fs";

import { sha256 } from "../cache/canonical.js";
import { GlyphkilnError, type FontStyle, type ResolvedFont } from "../domain/types.js";
import {
  BUNDLED_FONT_FAMILY_TABLE,
  BUNDLED_FONT_FILE_TABLE,
  BUNDLED_FONT_SOURCE,
} from "./bundled-catalog.generated.js";
import { fontReferenceKey } from "./key.js";

/**
 * The twelve OFL families approved by the owner on 4 November 2026 (D3),
 * admitted from google/fonts at a pinned commit. Bytes live in the package
 * under `assets/fonts/<directory>/` next to each family's OFL text, exactly
 * like the Inter development font, and every file is bound to the SHA-256 in
 * this table. Bundling changes no existing render: a family only resolves
 * when a document names it, and caller-supplied bytes always win.
 */
export type BundledFontFamily = {
  family: string;
  /** OpenType script tags the family covers. */
  scripts: readonly string[];
  license: "OFL-1.1";
  licenseFile: string;
};

export type BundledFontFile = {
  family: string;
  style: FontStyle;
  /** Declarable weights this exact file serves (variable files serve many). */
  weights: readonly number[];
  file: string;
  sha256: string;
};

export { BUNDLED_FONT_SOURCE };

export const BUNDLED_FONT_FAMILIES: readonly BundledFontFamily[] = Object.freeze(
  BUNDLED_FONT_FAMILY_TABLE.map((family) => Object.freeze({ ...family })),
);

export const BUNDLED_FONT_FILES: readonly BundledFontFile[] = Object.freeze(
  BUNDLED_FONT_FILE_TABLE.map((file) => Object.freeze({ ...file })),
);

const FONTS_ROOT = new URL("../../assets/fonts/", import.meta.url);
const byKey = new Map<string, BundledFontFile>();
for (const file of BUNDLED_FONT_FILES) {
  for (const weight of file.weights) {
    byKey.set(fontReferenceKey(file.family, weight, file.style), file);
  }
}
const bytesByFile = new Map<string, Uint8Array>();

/** The bundled file for an exact family, weight and style, if any. */
export function bundledFontFile(
  family: string,
  weight: number,
  style: FontStyle,
): BundledFontFile | undefined {
  return byKey.get(fontReferenceKey(family, weight, style));
}

/**
 * Resolve a bundled face to verified bytes. Bytes are read once per process
 * and checked against the pinned hash; a modified install fails closed.
 */
export function resolveBundledFont(
  family: string,
  weight: number,
  style: FontStyle,
): ResolvedFont | undefined {
  const file = bundledFontFile(family, weight, style);
  if (file === undefined) return undefined;
  let bytes = bytesByFile.get(file.file);
  if (bytes === undefined) {
    const read = readFileSync(new URL(file.file, FONTS_ROOT));
    const actual = sha256(read);
    if (actual !== file.sha256) {
      throw new GlyphkilnError(
        `Bundled font file ${file.file} does not match its pinned SHA-256.`,
        "FONT_HASH_MISMATCH",
        { expected: file.sha256, actual },
      );
    }
    bytes = read;
    bytesByFile.set(file.file, bytes);
  }
  return { family: file.family, weight, style, sha256: file.sha256, bytes };
}
