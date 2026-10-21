import type { Bounds, Dimensions } from "../domain/types.js";
import type { FontRegistry } from "../fonts/index.js";
import type { SceneKernel, SceneKernelElement } from "../renderer/scene.js";
import {
  IDENTITY,
  matrixScale,
  multiply,
  normalizeHexColor,
  pathDataBounds,
  transformBounds,
  transformMatrix,
  unionBounds,
  type Matrix,
} from "./geometry.js";

/** Straight RGBA pixels of the exact rendered canvas, row-major. */
export type CraftRaster = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type CraftTextFacts = {
  /** Font size in canvas pixels after group transforms. */
  fontSize: number;
  /** Em-relative x-height of the exact face used. */
  xHeightRatio: number;
  lineCount: number;
};

export type CraftElement = {
  id: string;
  kind: Exclude<SceneKernelElement["type"], "group">;
  /** Procedural background texture; excluded from content analysis. */
  decoration: boolean;
  /** Canvas-space axis-aligned painted bounds; text uses glyph-outline bounds. */
  bounds: Bounds | null;
  fill: string | null;
  stroke: string | null;
  opacity: number;
  text?: CraftTextFacts;
};

export type CraftModel = {
  canvas: Dimensions;
  raster: CraftRaster;
  /** Flattened primitives in paint order. */
  elements: CraftElement[];
  accentColors: string[];
};

/** Typical lowercase x-height ratio used only when a face cannot report one. */
const FALLBACK_X_HEIGHT_RATIO = 0.5;

export function buildCraftModel(input: {
  scene: SceneKernel;
  raster: CraftRaster;
  fonts: FontRegistry;
  accentColors: readonly string[];
}): CraftModel {
  const elements: CraftElement[] = [];
  const metrics = new Map<string, number>();
  const visit = (
    element: SceneKernelElement,
    matrix: Matrix,
    opacity: number,
    decoration: boolean,
  ): void => {
    const elementOpacity = opacity * (element.opacity ?? 1);
    // Only procedural texture is excluded. Accessibility "decoration" roles
    // mark non-reading content, but such cards and rules still compose the page.
    const isDecoration = decoration || element.exclusion !== undefined;
    if (element.type === "group") {
      const childMatrix = (element.transforms ?? []).reduce<Matrix>(
        (current, transform) => multiply(current, transformMatrix(transform)),
        matrix,
      );
      for (const child of element.elements) {
        visit(child, childMatrix, elementOpacity, isDecoration);
      }
      return;
    }
    const local = localBounds(element);
    const record: CraftElement = {
      id: element.id,
      kind: element.type,
      decoration: isDecoration,
      bounds: local === null ? null : transformBounds(local, matrix),
      fill: "fill" in element ? normalizeHexColor(element.fill) : null,
      stroke:
        "stroke" in element
          ? normalizeHexColor(element.stroke === "none" ? undefined : element.stroke)
          : null,
      opacity: elementOpacity,
    };
    if (element.type === "text") {
      const key = `${element.fontFamily}\u0000${element.fontWeight}\u0000${element.fontStyle}`;
      let ratio = metrics.get(key);
      if (ratio === undefined) {
        ratio = xHeightRatio(input.fonts, element);
        metrics.set(key, ratio);
      }
      record.text = {
        fontSize: element.fontSize * matrixScale(matrix),
        xHeightRatio: ratio,
        lineCount: element.lines.length,
      };
    }
    elements.push(record);
  };
  for (const element of input.scene.elements) visit(element, IDENTITY, 1, false);
  const accentColors = [
    ...new Set(
      input.accentColors
        .map((color) => normalizeHexColor(color))
        .filter((color): color is string => color !== null),
    ),
  ];
  return {
    canvas: { ...input.scene.dimensions },
    raster: input.raster,
    elements,
    accentColors,
  };
}

function xHeightRatio(
  fonts: FontRegistry,
  element: Extract<SceneKernelElement, { type: "text" }>,
): number {
  try {
    const ratio = fonts.verticalMetrics(
      element.fontFamily,
      element.fontWeight,
      element.fontStyle,
    ).xHeight;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : FALLBACK_X_HEIGHT_RATIO;
  } catch {
    return FALLBACK_X_HEIGHT_RATIO;
  }
}

function localBounds(
  element: Exclude<SceneKernelElement, { type: "group" }>,
): Bounds | null {
  switch (element.type) {
    case "rect":
    case "image":
      return {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      };
    case "circle":
      return {
        x: element.cx - element.radius,
        y: element.cy - element.radius,
        width: element.radius * 2,
        height: element.radius * 2,
      };
    case "text":
      return unionBounds(element.outlines.map(pathDataBounds)) ?? { ...element.bounds };
    case "path":
      return pathDataBounds(element.data);
    case "connector": {
      const xs = element.points.map((point) => point.x);
      const ys = element.points.map((point) => point.y);
      if (xs.length === 0) return null;
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
  }
}
