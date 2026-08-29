import type { Bounds, Dimensions } from "../domain/types.js";

type BaseElement = {
  id: string;
  opacity?: number | undefined;
  semantic?: SceneSemantic | undefined;
  exclusion?:
    | {
        canvas: Dimensions;
        bounds: Bounds;
      }
    | undefined;
};

export type SceneSemantic = {
  role: "content" | "annotation" | "connector" | "decoration";
  conceptId?: string | undefined;
  label?: string | undefined;
  description?: string | undefined;
  readingOrder?: number | undefined;
};

export type SceneTransform =
  | { type: "translate"; x: number; y: number }
  | { type: "scale"; x: number; y: number }
  | { type: "rotate"; degrees: number; cx: number; cy: number };

export type SceneClip =
  | ({ type: "rect"; radius?: number | undefined } & Bounds)
  | { type: "circle"; cx: number; cy: number; radius: number }
  | { type: "path"; data: string };

export type RectElement = BaseElement & {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  radius?: number | undefined;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
};

export type CircleElement = BaseElement & {
  type: "circle";
  cx: number;
  cy: number;
  radius: number;
  fill: string;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
};

export type PathElement = BaseElement & {
  type: "path";
  data: string;
  fill: string;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
  lineCap?: "round" | "square" | "butt" | undefined;
  lineJoin?: "round" | "bevel" | "miter" | undefined;
};

export type TextElement = BaseElement & {
  type: "text";
  x: number;
  y: number;
  lines: string[];
  fill: string;
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  fontSize: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  letterSpacing?: number | undefined;
  bounds: Bounds;
  outlines: string[];
  textMode?: "outline" | "outline-with-selectable-text" | undefined;
};

export type ImageElement = BaseElement & {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  href: string;
  fit: "contain" | "cover";
  clipRadius?: number | undefined;
  clipBounds?: Bounds | undefined;
};

export type ConnectorElement = BaseElement & {
  type: "connector";
  fromId: string;
  toId: string;
  points: readonly { x: number; y: number }[];
  stroke: string;
  strokeWidth: number;
  startMarker: "none" | "arrow";
  endMarker: "none" | "arrow";
  lineCap?: "round" | "square" | "butt" | undefined;
  lineJoin?: "round" | "bevel" | "miter" | undefined;
};

export type GroupElement = BaseElement & {
  type: "group";
  elements: SceneKernelElement[];
  transforms?: readonly SceneTransform[] | undefined;
  clip?: SceneClip | undefined;
};

export type SceneElement =
  | RectElement
  | CircleElement
  | PathElement
  | TextElement
  | ImageElement;

export type SceneKernelElement = SceneElement | ConnectorElement | GroupElement;

export type Scene = {
  dimensions: Dimensions;
  title: string;
  description: string;
  backgroundColor: string;
  elements: SceneElement[];
};

export type SceneKernel = {
  dimensions: Dimensions;
  title: string;
  description: string;
  backgroundColor: string;
  elements: SceneKernelElement[];
};

export function flattenSceneElements(
  elements: readonly SceneKernelElement[],
): SceneKernelElement[] {
  const flattened: SceneKernelElement[] = [];
  const pending = [...elements].reverse();
  while (pending.length > 0) {
    const element = pending.pop()!;
    flattened.push(element);
    if (element.type !== "group") continue;
    for (let index = element.elements.length - 1; index >= 0; index -= 1) {
      pending.push(element.elements[index]!);
    }
  }
  return flattened;
}
