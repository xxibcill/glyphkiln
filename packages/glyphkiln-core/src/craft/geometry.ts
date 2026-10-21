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

const PATH_TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const PARAMETER_COUNTS: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/**
 * Conservative axis-aligned bounds of SVG path data: the hull of every end and
 * control point. Arcs contribute their end points expanded by their radii.
 * Returns null for empty or unparseable data.
 */
export function pathDataBounds(data: string): Bounds | null {
  const tokens = data.match(PATH_TOKEN) ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number, pad = 0): void => {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  };
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = "";
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (/[A-Za-z]/.test(token)) {
      command = token;
      index += 1;
      if (command === "Z" || command === "z") {
        x = startX;
        y = startY;
        command = "";
      }
      continue;
    }
    if (command === "") return null;
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const count = PARAMETER_COUNTS[upper]!;
    const values = tokens.slice(index, index + count).map(Number);
    if (values.length < count || values.some((value) => !Number.isFinite(value))) {
      return null;
    }
    index += count;
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    switch (upper) {
      case "M":
      case "L":
      case "T":
        x = ox + values[0]!;
        y = oy + values[1]!;
        include(x, y);
        if (upper === "M") {
          startX = x;
          startY = y;
          command = relative ? "l" : "L";
        }
        break;
      case "H":
        x = ox + values[0]!;
        include(x, y);
        break;
      case "V":
        y = oy + values[0]!;
        include(x, y);
        break;
      case "C":
      case "S":
      case "Q":
        for (let pair = 0; pair < count; pair += 2) {
          include(ox + values[pair]!, oy + values[pair + 1]!);
        }
        x = ox + values[count - 2]!;
        y = oy + values[count - 1]!;
        break;
      case "A": {
        const radius = Math.max(Math.abs(values[0]!), Math.abs(values[1]!));
        include(x, y, radius);
        x = ox + values[5]!;
        y = oy + values[6]!;
        include(x, y, radius);
        break;
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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
