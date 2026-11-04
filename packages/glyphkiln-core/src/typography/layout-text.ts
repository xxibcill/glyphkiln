import type { Bounds, QualityIssue } from "../domain/types.js";
import type {
  FontRegistry,
  OpenTypeFeatureMap,
  PositionedGlyph,
} from "../fonts/index.js";
import type { TextEmphasisSpan, TextEmphasisStyleId } from "../schema/index.js";
import { fitText, type FittedText, type TextMeasurer } from "./index.js";
import type { SegmentationPolicy, SegmentationPolicyVersion } from "./segmentation.js";
import {
  createEmphasisMeasurer,
  createFeatureMeasurer,
  outlineRichLines,
  type EmphasisFace,
  type RichLineOutline,
} from "./rich-text.js";

/**
 * The one internal text layout path (typography plan M0). Template text
 * (`addText`, `measureText`), B2 typesetting (`templates/typeset.ts`), the
 * editorial-fill quote mark, the roles coverage predictor and Scene Kernel
 * `resolveText` all call `layoutText`, and only `layoutText` calls the fitter
 * and the registry's setters. It reproduces the pre-M0 behaviour of every
 * caller exactly: the request names the caller's sizing, setting and coverage
 * rules instead of each caller re-implementing them.
 *
 * Not a public API. Later milestones change what happens inside (script runs,
 * fallback stacks, a composer) behind this request and result.
 */

export type LayoutTextFace = {
  family: string;
  weight: number;
  style: "normal" | "italic";
};

export type LayoutTextSizing =
  | {
      /** Fit down from the preferred size (`fitText`). */
      mode: "fit";
      preferredFontSize: number;
      minimumFontSize: number;
      maximumLines: number;
      keepTogether?: readonly string[];
    }
  | {
      /**
       * Set at one size without line breaking: `lines` when given, else the
       * text's own newline-separated lines.
       */
      mode: "fixed";
      fontSize: number;
      lines?: readonly string[];
    };

export type LayoutTextSetting =
  | {
      /** Constant leading factor and letter spacing in px (Scene Kernel). */
      kind: "absolute";
      lineHeight: number;
      letterSpacing?: number;
    }
  | {
      /** Constant leading factor and letter spacing in em (templates). */
      kind: "em";
      lineHeight: number;
      letterSpacingEm?: number;
    }
  | {
      /** Size-dependent setting (B2 `size-setting@1.0.0`). */
      kind: "at-size";
      atSize: (fontSize: number) => { lineHeight: number; letterSpacingEm: number };
    };

export type LayoutTextRequest = {
  text: string;
  registry: FontRegistry;
  face: LayoutTextFace;
  box: Bounds;
  layerId: string;
  sizing: LayoutTextSizing;
  setting: LayoutTextSetting;
  align: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  features?: OpenTypeFeatureMap;
  /** B2 emphasis spans, already checked for face availability. */
  emphasis?: readonly TextEmphasisSpan[];
  /**
   * `measure` stops after line breaking (no shaping of final lines);
   * `glyphs` also sets every rendered line and returns outlines and glyphs.
   */
  detail: "measure" | "glyphs";
  /** Keep at most this many fitted lines in the rendered result. */
  renderedLineLimit?: number;
  /** Which text the face-coverage check reads (`glyphs` detail only). */
  coverage?: "rendered-lines" | "source-text";
};

export type TextLayoutGlyphRun = {
  text: string;
  /** UTF-16 offset of the run within its line. */
  start: number;
  face: LayoutTextFace;
  fontSize: number;
  emphasis: TextEmphasisStyleId | undefined;
  x: number;
  width: number;
  glyphs: PositionedGlyph[];
};

export type TextLayoutLine = {
  text: string;
  /** Measured width in px (from line breaking). */
  width: number;
  /** Present with `glyphs` detail. */
  set?: {
    x: number;
    baseline: number;
    /** Base-face outline path of the line. */
    outline: string;
    emphasis: RichLineOutline["emphasis"];
    runs: TextLayoutGlyphRun[];
  };
};

export type TextLayoutEvidence = {
  shaper: string;
  brokeLongWord: boolean;
  orphanLineCount: number;
  usesBalancedLineBreaking: boolean;
  segmentationPolicy: SegmentationPolicy | undefined;
  segmentationPolicyVersion: SegmentationPolicyVersion | undefined;
};

export type TextLayout = {
  face: LayoutTextFace;
  fontSize: number;
  lineHeight: number;
  /** Letter spacing in px applied while setting, if any. */
  letterSpacing: number | undefined;
  /** The anchor the lines are aligned to (x by alignment, y top of block). */
  anchor: { x: number; y: number };
  bounds: Bounds;
  /** Rendered lines (after `renderedLineLimit`). */
  lines: TextLayoutLine[];
  metrics: { width: number; height: number; lineWidths: number[] };
  /** The fitter's result in `fit` sizing; undefined in `fixed` sizing. */
  fitted: FittedText | undefined;
  /** Fitter issues (overflow, broken words, orphans), in fitter order. */
  issues: QualityIssue[];
  /** Code points the face cannot draw (`glyphs` detail with coverage). */
  missingCodePoints: number[];
  evidence: TextLayoutEvidence;
};

export function layoutText(request: LayoutTextRequest): TextLayout {
  const { registry, face } = request;
  const spans = request.emphasis ?? [];
  const sized = size(request, spans);
  const lines =
    request.renderedLineLimit === undefined
      ? sized.lines
      : sized.lines.slice(0, request.renderedLineLimit);
  const lineWidths = sized.lineWidths.slice(0, lines.length);
  const y = verticallyAlignedY(request, sized.height);
  const x = anchorX(request.box, request.align);
  const bounds = {
    x: alignedBoundsX(request.box, request.align, sized.width),
    y,
    width: sized.width,
    height: sized.height,
  };
  const layoutLines: TextLayoutLine[] = lines.map((text, index) => ({
    text,
    width: lineWidths[index] ?? 0,
  }));
  let missingCodePoints: number[] = [];
  if (request.detail === "glyphs") {
    if (request.coverage !== undefined) {
      missingCodePoints = registry.missingCodePoints(
        request.coverage === "source-text" ? request.text : lines.join(""),
        face.family,
        face.weight,
        face.style,
      );
    }
    setLines(request, spans, layoutLines, {
      x,
      y,
      fontSize: sized.fontSize,
      lineHeight: sized.lineHeight,
      letterSpacing: sized.letterSpacing,
    });
  }
  return {
    face,
    fontSize: sized.fontSize,
    lineHeight: sized.lineHeight,
    letterSpacing: sized.letterSpacing,
    anchor: { x, y },
    bounds,
    lines: layoutLines,
    metrics: { width: sized.width, height: sized.height, lineWidths },
    fitted: sized.fitted,
    issues: sized.fitted?.issues ?? [],
    missingCodePoints,
    evidence: {
      shaper: registry.shaperId,
      brokeLongWord: sized.fitted?.brokeLongWord ?? false,
      orphanLineCount: sized.fitted?.orphanLines.length ?? 0,
      usesBalancedLineBreaking: sized.fitted?.usesBalancedLineBreaking ?? false,
      segmentationPolicy: sized.fitted?.segmentationPolicy,
      segmentationPolicyVersion: sized.fitted?.segmentationPolicyVersion,
    },
  };
}

/** The `MISSING_GLYPH` issue every text path reports for uncovered text. */
export function missingGlyphIssue(
  layerId: string,
  message: string,
  codePoints: readonly number[],
): QualityIssue {
  return {
    code: "MISSING_GLYPH",
    severity: "error",
    message,
    layerId,
    details: {
      codePoints: codePoints.map(
        (codePoint) => `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
      ),
    },
  };
}

type Sized = {
  lines: string[];
  lineWidths: number[];
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number | undefined;
  fitted: FittedText | undefined;
};

function size(request: LayoutTextRequest, spans: readonly TextEmphasisSpan[]): Sized {
  const { face, setting, sizing } = request;
  const measurer = measurerFor(request.registry, spans, request.features);
  if (sizing.mode === "fixed") {
    const fontSize = sizing.fontSize;
    const resolved = settingAt(setting, fontSize);
    const lines = [...(sizing.lines ?? request.text.split("\n"))];
    const style = {
      family: face.family,
      weight: face.weight,
      style: face.style,
      fontSize,
      lineHeight: resolved.lineHeight,
    };
    const lineWidths = lines.map((line) =>
      measurer.measure(
        line,
        style.family,
        style.weight,
        style.style,
        fontSize,
        resolved.letterSpacing,
      ),
    );
    return {
      lines,
      lineWidths,
      width: Math.max(0, ...lineWidths),
      height: lines.length * fontSize * resolved.lineHeight,
      fontSize,
      lineHeight: resolved.lineHeight,
      letterSpacing: resolved.letterSpacing,
      fitted: undefined,
    };
  }
  const fitted = fitText({
    text: request.text,
    registry: measurer,
    style: {
      family: face.family,
      weight: face.weight,
      style: face.style,
      lineHeight: setting.kind === "at-size" ? 1 : setting.lineHeight,
      ...(setting.kind === "absolute" && setting.letterSpacing !== undefined
        ? { letterSpacing: setting.letterSpacing }
        : {}),
    },
    box: request.box,
    preferredFontSize: sizing.preferredFontSize,
    minimumFontSize: sizing.minimumFontSize,
    maximumLines: sizing.maximumLines,
    layerId: request.layerId,
    ...(sizing.keepTogether === undefined ? {} : { keepTogether: sizing.keepTogether }),
    ...(setting.kind === "em" && setting.letterSpacingEm !== undefined
      ? { letterSpacingEm: setting.letterSpacingEm }
      : {}),
    ...(setting.kind === "at-size" ? { settingAtSize: setting.atSize } : {}),
  });
  const resolved = settingAt(setting, fitted.fontSize, fitted.setting);
  return {
    lines: fitted.lines,
    lineWidths: fitted.lineWidths,
    width: fitted.width,
    height: fitted.height,
    fontSize: fitted.fontSize,
    lineHeight: resolved.lineHeight,
    letterSpacing: resolved.letterSpacing,
    fitted,
  };
}

function settingAt(
  setting: LayoutTextSetting,
  fontSize: number,
  applied?: { lineHeight: number; letterSpacingEm: number },
): { lineHeight: number; letterSpacing: number | undefined } {
  switch (setting.kind) {
    case "absolute":
      return { lineHeight: setting.lineHeight, letterSpacing: setting.letterSpacing };
    case "em":
      return {
        lineHeight: setting.lineHeight,
        letterSpacing:
          setting.letterSpacingEm === undefined
            ? undefined
            : setting.letterSpacingEm * fontSize,
      };
    case "at-size": {
      const resolved = applied ?? setting.atSize(fontSize);
      return {
        lineHeight: resolved.lineHeight,
        letterSpacing: resolved.letterSpacingEm * fontSize,
      };
    }
  }
}

function measurerFor(
  registry: FontRegistry,
  spans: readonly TextEmphasisSpan[],
  features: OpenTypeFeatureMap | undefined,
): TextMeasurer {
  if (spans.length > 0) return createEmphasisMeasurer(registry, spans, features);
  if (features !== undefined) return createFeatureMeasurer(registry, features);
  return registry;
}

function setLines(
  request: LayoutTextRequest,
  spans: readonly TextEmphasisSpan[],
  lines: TextLayoutLine[],
  placement: {
    x: number;
    y: number;
    fontSize: number;
    lineHeight: number;
    letterSpacing: number | undefined;
  },
): void {
  const { registry, face } = request;
  const features = request.features === undefined ? {} : { features: request.features };
  const letterSpacing =
    placement.letterSpacing === undefined
      ? {}
      : { letterSpacing: placement.letterSpacing };
  const texts = lines.map((line) => line.text);
  if (spans.length === 0) {
    const set = registry.setLines({
      lines: texts,
      family: face.family,
      weight: face.weight,
      style: face.style,
      fontSize: placement.fontSize,
      lineHeight: placement.lineHeight,
      x: placement.x,
      y: placement.y,
      align: request.align,
      ...letterSpacing,
      ...features,
    });
    for (const [index, line] of set.entries()) {
      lines[index]!.set = {
        x: line.x,
        baseline: line.baseline,
        outline: line.path,
        emphasis: [],
        runs: [
          {
            text: texts[index]!,
            start: 0,
            face,
            fontSize: placement.fontSize,
            emphasis: undefined,
            x: line.x,
            width: line.width,
            glyphs: line.glyphs,
          },
        ],
      };
    }
    return;
  }
  const rich = outlineRichLines({
    registry,
    lines: texts,
    spans,
    family: face.family,
    weight: face.weight,
    fontSize: placement.fontSize,
    lineHeight: placement.lineHeight,
    x: placement.x,
    y: placement.y,
    align: request.align,
    ...letterSpacing,
    ...features,
  });
  for (const [index, line] of rich.entries()) {
    lines[index]!.set = {
      x: line.x,
      baseline: line.baseline,
      outline: line.base,
      emphasis: line.emphasis,
      runs: line.runs.map((run) => ({
        text: run.text,
        start: run.start,
        face: runFace(face, run.face),
        fontSize: placement.fontSize,
        emphasis: run.style,
        x: run.x,
        width: run.width,
        glyphs: run.glyphs,
      })),
    };
  }
}

function runFace(base: LayoutTextFace, face: EmphasisFace): LayoutTextFace {
  return { family: base.family, weight: face.weight, style: face.style };
}

function anchorX(box: Bounds, align: LayoutTextRequest["align"]): number {
  switch (align) {
    case "left":
      return box.x;
    case "center":
      return box.x + box.width / 2;
    case "right":
      return box.x + box.width;
  }
}

function alignedBoundsX(
  box: Bounds,
  align: LayoutTextRequest["align"],
  width: number,
): number {
  switch (align) {
    case "left":
      return box.x;
    case "center":
      return box.x + (box.width - width) / 2;
    case "right":
      return box.x + box.width - width;
  }
}

function verticallyAlignedY(request: LayoutTextRequest, height: number): number {
  const box = request.box;
  switch (request.verticalAlign ?? "top") {
    case "top":
      return box.y;
    case "middle":
      return box.y + Math.max(0, (box.height - height) / 2);
    case "bottom":
      return box.y + Math.max(0, box.height - height);
  }
}
