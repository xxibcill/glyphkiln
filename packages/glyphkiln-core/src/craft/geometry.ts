import type { Bounds } from "../domain/types.js";
import type { SceneTransform } from "../renderer/scene.js";

export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(left: Matrix, right: Matrix): Matrix {
  const [a, b, c, d, e, f] = left;
  const [g, h, i, j, k, l] = right;
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}

export function transformMatrix(transform: SceneTransform): Matrix {
  switch (transform.type) {
    case "translate":
      return [1, 0, 0, 1, transform.x, transform.y];
    case "scale":
      return [transform.x, 0, 0, transform.y, 0, 0];
    case "rotate": {
      const radians = (transform.degrees * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const { cx, cy } = transform;
      return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
    }
  }
}

/** Geometric mean of the axis scale factors, used for rendered text size. */
export function matrixScale(matrix: Matrix): number {
  const [a, b, c, d] = matrix;
  return Math.sqrt(Math.abs(a * d - b * c));
}

export function transformBounds(bounds: Bounds, matrix: Matrix): Bounds {
  const [a, b, c, d, e, f] = matrix;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ] as const) {
    xs.push(a * x + c * y + e);
    ys.push(b * x + d * y + f);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function unionBounds(items: readonly (Bounds | null)[]): Bounds | null {
  let result: Bounds | null = null;
  for (const item of items) {
    if (item === null) continue;
    if (result === null) {
      result = { ...item };
      continue;
    }
    const x = Math.min(result.x, item.x);
    const y = Math.min(result.y, item.y);
    result = {
      x,
      y,
      width: Math.max(result.x + result.width, item.x + item.width) - x,
      height: Math.max(result.y + result.height, item.y + item.height) - y,
    };
  }
  return result;
}

export function parseHexColor(
  value: string | undefined,
): readonly [number, number, number] | null {
  if (value === undefined) return null;
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  if (match === null) return null;
  const hex =
    match[1]!.length === 3
      ? match[1]!.replace(/./g, (character) => character + character)
      : match[1]!;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

export function normalizeHexColor(value: string | undefined): string | null {
  const rgb = parseHexColor(value);
  if (rgb === null) return null;
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
