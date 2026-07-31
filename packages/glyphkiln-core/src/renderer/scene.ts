import type { Bounds, Dimensions } from "../domain/types.js";

type BaseElement = {
  id: string;
  opacity?: number;
  exclusion?: {
    canvas: Dimensions;
    bounds: Bounds;
  };
};

export type RectElement = BaseElement & {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  radius?: number;
  stroke?: string;
  strokeWidth?: number;
};

export type CircleElement = BaseElement & {
  type: "circle";
  cx: number;
  cy: number;
  radius: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
};

export type PathElement = BaseElement & {
  type: "path";
  data: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  lineCap?: "round" | "square" | "butt";
  lineJoin?: "round" | "bevel" | "miter";
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
  letterSpacing?: number;
  bounds: Bounds;
  outlines: string[];
};

export type ImageElement = BaseElement & {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  href: string;
  fit: "contain" | "cover";
  clipRadius?: number;
  clipBounds?: Bounds;
};

export type SceneElement =
  RectElement | CircleElement | PathElement | TextElement | ImageElement;

export type Scene = {
  dimensions: Dimensions;
  title: string;
  description: string;
  backgroundColor: string;
  elements: SceneElement[];
};
