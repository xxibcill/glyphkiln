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
  /**
   * Images only: canvas-space region where the image is actually painted
   * (placed image within its box and clip), or null when it cannot be mapped
   * axis-aligned. `bounds` keeps the full placement box.
   */
  visibleBounds?: Bounds | null;
};

/**
 * Source pixels of a placed image and where they land on the canvas, so
 * rendered pixels can be compared with the asset at the same positions.
 */
export type CraftImageSource = {
  elementId: string;
  source: CraftRaster;
  /** Canvas-space rectangle covered by the whole (unclipped) source image. */
  placed: Bounds;
  /** Canvas-space region where the image is visible. */
  visible: Bounds;
};

export type CraftModel = {
  canvas: Dimensions;
  raster: CraftRaster;
  /** Flattened primitives in paint order. */
  elements: CraftElement[];
  accentColors: string[];
  /** Brand marks to review, with the same canvas rendered without them. */
  marks: { elementIds: string[]; background: CraftRaster | null };
  /** Decoded image sources for the product-color check; absent means none. */
  images?: CraftImageSource[];
};

/** Decodes an image href to straight RGBA pixels, or null when it cannot. */
export type CraftImageDecoder = (href: string) => CraftRaster | null;

/** Typical lowercase x-height ratio used only when a face cannot report one. */
const FALLBACK_X_HEIGHT_RATIO = 0.5;

export function buildCraftModel(input: {
  scene: SceneKernel;
  raster: CraftRaster;
  fonts: FontRegistry;
  accentColors: readonly string[];
  markIds?: readonly string[];
  markBackground?: CraftRaster | null;
  decodeImage?: CraftImageDecoder;
}): CraftModel {
  const elements: CraftElement[] = [];
  const images: CraftImageSource[] = [];
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
    if (element.type === "image") {
      const source = input.decodeImage?.(element.href) ?? null;
      const placement = imagePlacement(element, matrix, source);
      record.visibleBounds = placement?.visible ?? null;
      if (source !== null && placement !== null && placement.placed !== null) {
        images.push({
          elementId: element.id,
          source,
          placed: placement.placed,
          visible: placement.visible,
        });
      }
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
    marks: {
      elementIds: [...(input.markIds ?? [])],
      background: input.markBackground ?? null,
    },
    images,
  };
}

/**
 * Where an image is painted, following the SVG serializer: the source is
 * fitted into its box (xMidYMid meet for "contain", slice for "cover"), clipped
 * to the box for "cover" and to `clipBounds` when present. Only axis-aligned
 * transforms can be mapped; rotated images return null. Without decoded
 * source dimensions the visible region is the box and clip intersection.
 */
function imagePlacement(
  element: Extract<SceneKernelElement, { type: "image" }>,
  matrix: Matrix,
  source: CraftRaster | null,
): { placed: Bounds | null; visible: Bounds } | null {
  const [, b, c] = matrix;
  if (Math.abs(b) > 1e-9 || Math.abs(c) > 1e-9) return null;
  const box = {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
  let placed: Bounds | null = null;
  let visible: Bounds | null = box;
  if (source !== null && source.width > 0 && source.height > 0) {
    const scale =
      element.fit === "cover"
        ? Math.max(box.width / source.width, box.height / source.height)
        : Math.min(box.width / source.width, box.height / source.height);
    const width = source.width * scale;
    const height = source.height * scale;
    placed = {
      x: box.x + (box.width - width) / 2,
      y: box.y + (box.height - height) / 2,
      width,
      height,
    };
    visible = intersectBounds(box, placed);
  }
  if (visible !== null && element.clipBounds !== undefined) {
    visible = intersectBounds(visible, element.clipBounds);
  }
  if (visible === null) return null;
  return {
    placed: placed === null ? null : transformBounds(placed, matrix),
    visible: transformBounds(visible, matrix),
  };
}

function intersectBounds(left: Bounds, right: Bounds): Bounds | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const x1 = Math.min(left.x + left.width, right.x + right.width);
  const y1 = Math.min(left.y + left.height, right.y + right.height);
  if (x1 <= x || y1 <= y) return null;
  return { x, y, width: x1 - x, height: y1 - y };
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
