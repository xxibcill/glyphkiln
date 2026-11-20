import type { Bounds } from "../domain/types.js";

/*
 * Render-side path geometry. Templates use it to place outlined glyphs, so it
 * lives outside the advisory craft review: a change here can move template
 * pixels and needs the owning template or renderer version bump.
 */

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
