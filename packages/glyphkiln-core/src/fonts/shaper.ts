import * as fontkit from "fontkit";
import type { Font, GlyphRun } from "fontkit";

import { GlyphkilnError } from "../domain/types.js";

/**
 * Internal shaping boundary (typography plan M0). Every glyph that Core sets
 * is chosen and positioned through a `Shaper`; nothing outside `fonts/` calls
 * a shaping library directly. The interface carries the inputs a professional
 * shaper needs (script, language, direction, features and variation
 * coordinates) explicitly, so a later shaper can be qualified behind it
 * without changing callers.
 *
 * This is not a public API. It is an internal seam used by `FontRegistry` and
 * by development-only oracles.
 */

/** Closed OpenType feature map: a tag switched on (true) or off (false). */
export type ShaperFeatureMap = Readonly<Record<string, boolean>>;

/** Variation coordinates by axis tag, in user units (`wght` 700, `opsz` 32). */
export type VariationCoordinates = Readonly<Record<string, number>>;

/**
 * Text direction. Only `ltr` is accepted today; the other slots exist so bidi
 * and vertical text (plan T32, open-work D-2) do not need a new interface.
 */
export type ShapingDirection = "ltr" | "rtl" | "ttb" | "btt";

export type ShapeRequest = {
  text: string;
  /**
   * OpenType script tag (`latn`, `thai`). Undefined means "let the shaper
   * choose", which is the legacy behaviour: fontkit picks the first strong
   * script of the whole string.
   */
  script?: string;
  /** OpenType language system tag (`ENG`, `THA`). Undefined = default. */
  language?: string;
  direction?: ShapingDirection;
  /**
   * Undefined means the shaper's default feature set. An explicit map is
   * applied on top of the defaults.
   */
  features?: ShaperFeatureMap;
};

/** One shaped glyph in font units. */
export type ShapedGlyph = {
  id: number;
  /**
   * UTF-16 offset in the shaped text of the first code point this glyph
   * represents (character-level clusters, HarfBuzz cluster level 2). Marks
   * keep their own offset; grouping into grapheme clusters is the caller's.
   */
  cluster: number;
  /** Number of code points the glyph represents (2+ for ligatures). */
  codePointCount: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
};

export type ShapedRun = {
  glyphs: readonly ShapedGlyph[];
  /** Sum of x advances, in font units. */
  advanceWidth: number;
  unitsPerEm: number;
  /** Script the shaper actually used (resolved when the request had none). */
  script: string | undefined;
  direction: ShapingDirection;
};

export type OutlineCommand = {
  command: "moveTo" | "lineTo" | "quadraticCurveTo" | "bezierCurveTo" | "closePath";
  args: readonly number[];
};

export type GlyphOutline = {
  commands: readonly OutlineCommand[];
  /** True for colour (COLR) glyphs, which the SVG outliner refuses. */
  color: boolean;
  name: string | undefined;
};

export type FaceMetrics = {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  xHeight: number;
  capHeight: number;
};

export type VariationAxis = { min: number; default: number; max: number };

/** An opaque loaded face owned by one shaper. */
export type ShaperFace = { readonly shaper: string };

export type Shaper = {
  /** Stable identity, recorded in evidence and (from M2) in the policy. */
  readonly id: string;
  /** Parse exact font bytes into a face at its default instance. */
  loadFace(bytes: Uint8Array): ShaperFace;
  /** `fvar` axes of a face. */
  variationAxes(face: ShaperFace): Readonly<Partial<Record<string, VariationAxis>>>;
  /** A face instance at explicit coordinates. Axes not named stay at default. */
  instantiate(face: ShaperFace, coordinates: VariationCoordinates): ShaperFace;
  shape(face: ShaperFace, request: ShapeRequest): ShapedRun;
  glyphOutline(face: ShaperFace, glyphId: number): GlyphOutline;
  metrics(face: ShaperFace): FaceMetrics;
  hasGlyphForCodePoint(face: ShaperFace, codePoint: number): boolean;
  availableFeatures(face: ShaperFace): readonly string[];
};

export const FONTKIT_SHAPER_ID = "fontkit@2.0.4" as const;

type FontkitFace = ShaperFace & { readonly font: Font };

/**
 * The shaper behind every existing policy. It reproduces the pre-M0 calls
 * exactly: without a script, `face.layout(text)` or `face.layout(text,
 * features)`; fontkit mutates the feature object it receives, so each call
 * gets a fresh copy.
 */
export const fontkitShaper: Shaper = {
  id: FONTKIT_SHAPER_ID,
  loadFace(bytes) {
    const created = fontkit.create(Buffer.from(bytes));
    if (!("layout" in created)) {
      throw new GlyphkilnError(
        "Font bytes resolved to a collection instead of a face.",
        "FONT_COLLECTION_UNSUPPORTED",
      );
    }
    return wrap(created);
  },
  variationAxes(face) {
    return unwrap(face).variationAxes;
  },
  instantiate(face, coordinates) {
    return wrap(unwrap(face).getVariation({ ...coordinates }));
  },
  shape(face, request) {
    assertDirection(request.direction);
    const font = unwrap(face);
    const run = layoutWithFontkit(font, request);
    return toShapedRun(run, font.unitsPerEm, request.text);
  },
  glyphOutline(face, glyphId) {
    const glyph = unwrap(face).getGlyph(glyphId);
    return {
      commands: glyph.path.commands,
      color: glyph.layers !== undefined && glyph.layers.length > 0,
      name: glyph.name,
    };
  },
  metrics(face) {
    const font = unwrap(face);
    return {
      unitsPerEm: font.unitsPerEm,
      ascent: font.ascent,
      descent: font.descent,
      xHeight: font.xHeight,
      capHeight: font.capHeight,
    };
  },
  hasGlyphForCodePoint(face, codePoint) {
    return unwrap(face).hasGlyphForCodePoint(codePoint);
  },
  availableFeatures(face) {
    return unwrap(face).availableFeatures;
  },
};

function wrap(font: Font): FontkitFace {
  return Object.freeze({ shaper: FONTKIT_SHAPER_ID, font });
}

function unwrap(face: ShaperFace): Font {
  if (face.shaper !== FONTKIT_SHAPER_ID) {
    throw new GlyphkilnError(
      `A ${face.shaper} face cannot be shaped by ${FONTKIT_SHAPER_ID}.`,
      "SHAPER_FACE_MISMATCH",
    );
  }
  return (face as FontkitFace).font;
}

function assertDirection(direction: ShapingDirection | undefined): void {
  if (direction === undefined || direction === "ltr") return;
  throw new GlyphkilnError(
    `Shaping direction "${direction}" is not supported.`,
    "SHAPING_DIRECTION_UNSUPPORTED",
    { direction },
  );
}

function layoutWithFontkit(font: Font, request: ShapeRequest): GlyphRun {
  const features = request.features === undefined ? undefined : { ...request.features };
  if (request.script === undefined && request.language === undefined) {
    return features === undefined
      ? font.layout(request.text)
      : font.layout(request.text, features);
  }
  return font.layout(request.text, features ?? {}, request.script, request.language);
}

/**
 * fontkit does not expose clusters. Glyphs come back in logical order for
 * left-to-right text, each carrying the code points it represents, so the
 * cluster of a glyph is the running UTF-16 offset. When a glyph repeats the
 * code points of the previous glyph instead of the next ones (fontkit's `ccmp`
 * decomposition of Thai sara am gives nikhahit and sara aa, both reporting
 * U+0E33, or none at all when inserted by a multiple substitution), or
 * matches neither the text at the cursor while the next glyph does, it joins
 * the previous glyph's cluster with a code-point count of 0.
 * fontkit also caches glyph objects by id, so a glyph reached both from one
 * code point and from a ligature reports the code points of its first use; the
 * harness flags any run whose code-point total does not match the text.
 */
function toShapedRun(run: GlyphRun, unitsPerEm: number, text: string): ShapedRun {
  const glyphs: ShapedGlyph[] = [];
  let offset = 0;
  let previous: { cluster: number; codePoints: readonly number[] } | undefined;
  for (const [index, glyph] of run.glyphs.entries()) {
    const position = run.positions[index]!;
    const codePoints = glyph.codePoints;
    const next = run.glyphs[index + 1];
    const repeatsPrevious =
      previous !== undefined &&
      (codePoints.length === 0 ||
        (!startsWithCodePoints(text, offset, codePoints) &&
          (sameCodePoints(codePoints, previous.codePoints) ||
            (next === undefined
              ? offset >= text.length
              : startsWithCodePoints(text, offset, next.codePoints)))));
    const cluster = repeatsPrevious ? previous!.cluster : Math.min(offset, text.length);
    glyphs.push({
      id: glyph.id,
      cluster,
      codePointCount: repeatsPrevious ? 0 : codePoints.length,
      xAdvance: position.xAdvance,
      yAdvance: position.yAdvance,
      xOffset: position.xOffset,
      yOffset: position.yOffset,
    });
    if (repeatsPrevious) continue;
    previous = { cluster, codePoints };
    for (const codePoint of codePoints) offset += codePoint > 0xffff ? 2 : 1;
  }
  return {
    glyphs,
    advanceWidth: run.advanceWidth,
    unitsPerEm,
    script: run.script,
    direction: "ltr",
  };
}

function startsWithCodePoints(
  text: string,
  offset: number,
  codePoints: readonly number[],
): boolean {
  let cursor = offset;
  for (const codePoint of codePoints) {
    if (text.codePointAt(cursor) !== codePoint) return false;
    cursor += codePoint > 0xffff ? 2 : 1;
  }
  return true;
}

function sameCodePoints(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}
