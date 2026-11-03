import type { Bounds, Dimensions } from "../domain/types.js";

/**
 * Accent area measurement for brand color roles (DesignDocument 1.7.0).
 *
 * Coverage is the share of canvas sample points inside the union of all
 * accent-colored shapes. Shapes are outline path data (as produced by the
 * glyph outliner: M, L, Q, C, Z with absolute coordinates) or rectangles.
 * Curves are flattened into eight segments, and inside-ness uses the nonzero
 * winding rule, so overlapping glyph contours count once. Samples sit at the
 * centers of a square grid whose pitch is 1/270 of the canvas short side
 * (4 px on a 1080 px side). The result is deterministic for identical input.
 */
export const ACCENT_COVERAGE_POLICY_VERSION = "accent-coverage-grid@1.0.0" as const;

export type AccentShape =
  { kind: "path"; data: string } | { kind: "rect"; bounds: Bounds };

type Edge = { x0: number; y0: number; x1: number; y1: number };

const CURVE_SEGMENTS = 8;
const GRID_DIVISIONS = 270;

export function accentCoverage(
  shapes: readonly AccentShape[],
  dimensions: Dimensions,
): number {
  const edges = shapes.flatMap((shape) =>
    shape.kind === "rect" ? rectEdges(shape.bounds) : pathEdges(shape.data),
  );
  const pitch = Math.min(dimensions.width, dimensions.height) / GRID_DIVISIONS;
  const columns = Math.max(1, Math.floor(dimensions.width / pitch));
  const rows = Math.max(1, Math.floor(dimensions.height / pitch));
  const cellWidth = dimensions.width / columns;
  const cellHeight = dimensions.height / rows;
  let covered = 0;
  for (let row = 0; row < rows; row += 1) {
    const y = (row + 0.5) * cellHeight;
    const crossings: { x: number; direction: number }[] = [];
    for (const edge of edges) {
      const upward = edge.y0 <= y && edge.y1 > y;
      const downward = edge.y1 <= y && edge.y0 > y;
      if (!upward && !downward) continue;
      const t = (y - edge.y0) / (edge.y1 - edge.y0);
      crossings.push({
        x: edge.x0 + t * (edge.x1 - edge.x0),
        direction: upward ? 1 : -1,
      });
    }
    if (crossings.length === 0) continue;
    crossings.sort(
      (left, right) => left.x - right.x || left.direction - right.direction,
    );
    let winding = 0;
    for (const [index, crossing] of crossings.entries()) {
      winding += crossing.direction;
      if (winding === 0) continue;
      const next = crossings[index + 1];
      if (next === undefined) break;
      covered += samplesBetween(crossing.x, next.x, cellWidth, columns);
    }
  }
  return covered / (columns * rows);
}

/** Sample centers x = (column + 0.5) * cellWidth with start <= x < end. */
function samplesBetween(
  start: number,
  end: number,
  cellWidth: number,
  columns: number,
): number {
  const first = Math.max(0, Math.ceil(start / cellWidth - 0.5));
  const last = Math.min(columns - 1, Math.ceil(end / cellWidth - 0.5) - 1);
  return Math.max(0, last - first + 1);
}

function rectEdges(bounds: Bounds): Edge[] {
  const { x, y, width, height } = bounds;
  return polygonEdges([
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ]);
}

function polygonEdges(points: readonly (readonly [number, number])[]): Edge[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length]!;
    return { x0: point[0], y0: point[1], x1: next[0], y1: next[1] };
  });
}

/** Flatten outline path data into closed polygon edges. */
export function pathEdges(data: string): Edge[] {
  const tokens = data
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  const edges: Edge[] = [];
  let index = 0;
  let current: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  const read = (): number => Number(tokens[index++]);
  const lineTo = (point: [number, number]): void => {
    edges.push({ x0: current[0], y0: current[1], x1: point[0], y1: point[1] });
    current = point;
  };
  const close = (): void => {
    if (current[0] !== start[0] || current[1] !== start[1]) lineTo(start);
  };
  while (index < tokens.length) {
    const command = tokens[index++];
    switch (command) {
      case "M":
        close();
        current = [read(), read()];
        start = current;
        break;
      case "L":
        lineTo([read(), read()]);
        break;
      case "Q": {
        const from = current;
        const control: [number, number] = [read(), read()];
        const to: [number, number] = [read(), read()];
        for (let step = 1; step <= CURVE_SEGMENTS; step += 1) {
          const t = step / CURVE_SEGMENTS;
          const u = 1 - t;
          lineTo([
            u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
            u * u * from[1] + 2 * u * t * control[1] + t * t * to[1],
          ]);
        }
        break;
      }
      case "C": {
        const from = current;
        const first: [number, number] = [read(), read()];
        const second: [number, number] = [read(), read()];
        const to: [number, number] = [read(), read()];
        for (let step = 1; step <= CURVE_SEGMENTS; step += 1) {
          const t = step / CURVE_SEGMENTS;
          const u = 1 - t;
          lineTo([
            u * u * u * from[0] +
              3 * u * u * t * first[0] +
              3 * u * t * t * second[0] +
              t * t * t * to[0],
            u * u * u * from[1] +
              3 * u * u * t * first[1] +
              3 * u * t * t * second[1] +
              t * t * t * to[1],
          ]);
        }
        break;
      }
      case "Z":
        close();
        current = start;
        break;
      default:
        // Outline data is generated by Core; an unknown token ends parsing.
        return edges;
    }
  }
  close();
  return edges;
}
