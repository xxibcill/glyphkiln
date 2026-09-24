import { GlyphkilnError } from "../domain/types.js";
import { SCENE_RESOURCE_LIMITS } from "../resources/index.js";
import {
  connectorArrowheadSize,
  type SceneKernel,
  type SceneKernelElement,
  type SceneTransform,
} from "../renderer/scene.js";
import type { SceneBounds } from "./types.js";

export const SCENE_EVIDENCE_VERSION = "1.0.0" as const;

type Matrix = readonly [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];

export type SceneElementEvidence = {
  id: string;
  type: SceneKernelElement["type"];
  /** Axis-aligned canvas-space bounds before clipping; null for paths and groups. */
  bounds: SceneBounds | null;
};

export type SceneTextEvidence = {
  id: string;
  bounds: SceneBounds;
  fittedFontSize: number;
  lineCount: number;
  lines: string[];
  wrap: {
    lineWidths: number[];
    brokeLongWord: boolean;
    orphanLineCount: number;
    usesBalancedLineBreaking: boolean;
    segmentationPolicy: string;
    segmentationPolicyVersion: string;
  };
};

export type SceneImageEvidence = {
  id: string;
  assetId: string;
  destinationBounds: SceneBounds;
  visibleBounds: SceneBounds;
  sourceBounds: SceneBounds;
  renderedBounds: SceneBounds;
  fit: "contain" | "cover";
};

export type SceneEvidence = {
  version: typeof SCENE_EVIDENCE_VERSION;
  coordinateSpace: "canvas";
  boundsPolicy: "axis-aligned-before-clipping";
  elements: SceneElementEvidence[];
  text: SceneTextEvidence[];
  images: SceneImageEvidence[];
};

export type TextWrapFacts = Pick<
  SceneTextEvidence["wrap"],
  | "brokeLongWord"
  | "lineWidths"
  | "orphanLineCount"
  | "usesBalancedLineBreaking"
  | "segmentationPolicy"
  | "segmentationPolicyVersion"
>;

export type SceneImageResource = {
  id: string;
  width: number;
  height: number;
};

export function createSceneEvidence(
  scene: SceneKernel,
  textWraps: ReadonlyMap<string, TextWrapFacts>,
  imageResources: ReadonlyMap<string, SceneImageResource>,
): SceneEvidence {
  const evidence: SceneEvidence = {
    version: SCENE_EVIDENCE_VERSION,
    coordinateSpace: "canvas",
    boundsPolicy: "axis-aligned-before-clipping",
    elements: [],
    text: [],
    images: [],
  };
  const pending = scene.elements
    .map((element) => ({ element, matrix: identity }))
    .reverse();
  while (pending.length > 0) {
    const { element, matrix } = pending.pop()!;
    if (element.type === "group") {
      evidence.elements.push({ id: element.id, type: element.type, bounds: null });
      const childMatrix = (element.transforms ?? []).reduce<Matrix>(
        (current, transform) => multiply(current, transformMatrix(transform)),
        matrix,
      );
      for (let index = element.elements.length - 1; index >= 0; index -= 1) {
        pending.push({ element: element.elements[index]!, matrix: childMatrix });
      }
      continue;
    }
    const bounds = primitiveBounds(element);
    const canvasBounds = bounds === null ? null : transformBounds(bounds, matrix);
    evidence.elements.push({
      id: element.id,
      type: element.type,
      bounds: canvasBounds,
    });
    if (element.type === "text") {
      const wrap = textWraps.get(element.id)!;
      evidence.text.push({
        id: element.id,
        bounds: canvasBounds!,
        fittedFontSize: element.fontSize,
        lineCount: element.lines.length,
        lines: [...element.lines],
        wrap: { ...wrap, lineWidths: [...wrap.lineWidths] },
      });
    }
    if (element.type === "image") {
      const declaration = imageResources.get(element.id);
      if (declaration === undefined) {
        throw new GlyphkilnError(
          `Resolved scene image "${element.id}" has no evidence resource.`,
          "SCENE_EVIDENCE_RESOURCE_MISSING",
          { elementId: element.id },
        );
      }
      const scale =
        element.fit === "cover"
          ? Math.max(
              element.width / declaration.width,
              element.height / declaration.height,
            )
          : Math.min(
              element.width / declaration.width,
              element.height / declaration.height,
            );
      const width = declaration.width * scale;
      const height = declaration.height * scale;
      const rendered = {
        x: element.x + (element.width - width) / 2,
        y: element.y + (element.height - height) / 2,
        width,
        height,
      };
      const sourceBounds =
        element.fit === "cover"
          ? {
              x: (width - element.width) / (2 * scale),
              y: (height - element.height) / (2 * scale),
              width: element.width / scale,
              height: element.height / scale,
            }
          : { x: 0, y: 0, width: declaration.width, height: declaration.height };
      evidence.images.push({
        id: element.id,
        assetId: declaration.id,
        destinationBounds: canvasBounds!,
        visibleBounds: transformBounds(
          element.fit === "cover" ? bounds! : rendered,
          matrix,
        ),
        sourceBounds,
        renderedBounds: transformBounds(rendered, matrix),
        fit: element.fit,
      });
    }
  }
  return evidence;
}

function primitiveBounds(
  element: Exclude<SceneKernelElement, { type: "group" }>,
): SceneBounds | null {
  switch (element.type) {
    case "rect": {
      const pad = shapeStrokePadding(element);
      return {
        x: element.x - pad,
        y: element.y - pad,
        width: element.width + 2 * pad,
        height: element.height + 2 * pad,
      };
    }
    case "image":
      return {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      };
    case "circle": {
      const radius = element.radius + shapeStrokePadding(element);
      return {
        x: element.cx - radius,
        y: element.cy - radius,
        width: 2 * radius,
        height: 2 * radius,
      };
    }
    case "text":
      return { ...element.bounds };
    case "connector": {
      const xs = element.points.map((point) => point.x);
      const ys = element.points.map((point) => point.y);
      // SVG defaults to a miter limit of 4; arrow coordinates are grid-rounded.
      const joinPad =
        element.lineJoin === "round" || element.lineJoin === "bevel"
          ? element.strokeWidth / 2
          : element.strokeWidth * 4;
      const capPad =
        element.lineCap === "square"
          ? element.strokeWidth / Math.SQRT2
          : element.strokeWidth / 2;
      const markerPad =
        element.startMarker === "arrow" || element.endMarker === "arrow"
          ? connectorArrowheadSize(element.strokeWidth) +
            SCENE_RESOURCE_LIMITS.serializationResolution
          : 0;
      const pad = Math.max(joinPad, capPad, markerPad);
      return {
        x: Math.min(...xs) - pad,
        y: Math.min(...ys) - pad,
        width: Math.max(...xs) - Math.min(...xs) + 2 * pad,
        height: Math.max(...ys) - Math.min(...ys) + 2 * pad,
      };
    }
    case "path":
      return null;
  }
}

function shapeStrokePadding(element: {
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
}): number {
  return element.stroke === undefined || element.stroke === "none"
    ? 0
    : (element.strokeWidth ?? 1) / 2;
}

function transformBounds(bounds: SceneBounds, matrix: Matrix): SceneBounds {
  const corners = [
    point(bounds.x, bounds.y, matrix),
    point(bounds.x + bounds.width, bounds.y, matrix),
    point(bounds.x, bounds.y + bounds.height, matrix),
    point(bounds.x + bounds.width, bounds.y + bounds.height, matrix),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function point(x: number, y: number, m: Matrix): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function transformMatrix(transform: SceneTransform): Matrix {
  if (transform.type === "translate") return [1, 0, 0, 1, transform.x, transform.y];
  if (transform.type === "scale") return [transform.x, 0, 0, transform.y, 0, 0];
  const radians = (transform.degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return multiply(
    multiply(
      [1, 0, 0, 1, transform.cx, transform.cy],
      [cosine, sine, -sine, cosine, 0, 0],
    ),
    [1, 0, 0, 1, -transform.cx, -transform.cy],
  );
}
