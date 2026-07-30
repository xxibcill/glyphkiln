import type { NormalizedRect } from "../domain/types.js";
import type { ProceduralStyleId } from "../schema/index.js";
import { createSeededRandom, type SeededRandom } from "../seed/index.js";
import type { SceneElement } from "../renderer/scene.js";

export const PROCEDURAL_ALGORITHM_VERSIONS: Readonly<
  Record<ProceduralStyleId, string>
> = Object.freeze({
  "flow-field": "1.1.0",
  "layered-waves": "1.1.0",
  "topographic-contours": "1.1.0",
  "recursive-subdivision": "1.1.0",
});

export type ProceduralBackgroundInput = {
  width: number;
  height: number;
  seed: string;
  palette: readonly string[];
  backgroundColor: string;
  intensity: number;
  density: number;
  complexity: number;
  contrast: number;
  quietRegion: NormalizedRect;
  mode: "light" | "dark";
};

export type ProceduralBackgroundResult = {
  style: ProceduralStyleId;
  version: string;
  elements: SceneElement[];
  quietRegion: NormalizedRect;
};

export function createProceduralBackground(
  style: ProceduralStyleId,
  input: ProceduralBackgroundInput,
): ProceduralBackgroundResult {
  const random = createSeededRandom(`${input.seed}\u0000background:${style}`);
  const generated = {
    "flow-field": generateFlowField,
    "layered-waves": generateLayeredWaves,
    "topographic-contours": generateContours,
    "recursive-subdivision": generateSubdivision,
  }[style](input, random);
  const exclusion = {
    canvas: { width: input.width, height: input.height },
    bounds: denormalizeQuietRegion(input),
  };
  return {
    style,
    version: PROCEDURAL_ALGORITHM_VERSIONS[style],
    elements: generated.map((element) => ({ ...element, exclusion })),
    quietRegion: input.quietRegion,
  };
}

function generateFlowField(
  input: ProceduralBackgroundInput,
  random: SeededRandom,
): SceneElement[] {
  const count = Math.round(24 + input.density * 100);
  const step = 8 + input.complexity * 8;
  const iterations = Math.round(8 + input.complexity * 20);
  const elements: SceneElement[] = [];
  const phaseX = random.float(0, Math.PI * 2);
  const phaseY = random.float(0, Math.PI * 2);
  for (let index = 0; index < count; index += 1) {
    let x = random.float(0, input.width);
    let y = random.float(0, input.height);
    let path = `M ${coordinate(x)} ${coordinate(y)}`;
    for (let point = 0; point < iterations; point += 1) {
      const angle =
        Math.sin((x / input.width) * 8 + phaseX) * 1.4 +
        Math.cos((y / input.height) * 7 + phaseY) * 1.2;
      const nextX = clamp(x + Math.cos(angle) * step, 0, input.width);
      const nextY = clamp(y + Math.sin(angle) * step, 0, input.height);
      if (insideQuietRegion(nextX, nextY, input)) break;
      x = nextX;
      y = nextY;
      path += ` L ${coordinate(x)} ${coordinate(y)}`;
    }
    elements.push({
      id: `flow-${index}`,
      type: "path",
      data: path,
      fill: "none",
      stroke: random.pick(input.palette),
      strokeWidth: 1 + input.intensity * 4,
      opacity: 0.08 + input.contrast * 0.3,
      lineCap: "round",
    });
  }
  return elements;
}

function generateLayeredWaves(
  input: ProceduralBackgroundInput,
  random: SeededRandom,
): SceneElement[] {
  const count = Math.round(4 + input.density * 10);
  const elements: SceneElement[] = [];
  for (let index = 0; index < count; index += 1) {
    const baseline = input.height * (0.45 + (index / Math.max(1, count - 1)) * 0.65);
    const amplitude = input.height * (0.03 + input.intensity * 0.08);
    const frequency = 1.3 + input.complexity * 3 + random.float(-0.2, 0.2);
    const phase = random.float(0, Math.PI * 2);
    let path = `M 0 ${coordinate(clamp(baseline, 0, input.height))}`;
    const segments = 48;
    for (let segment = 1; segment <= segments; segment += 1) {
      const x = (segment / segments) * input.width;
      const y = clamp(
        baseline +
          Math.sin((segment / segments) * Math.PI * 2 * frequency + phase) * amplitude,
        0,
        input.height,
      );
      path += ` L ${coordinate(x)} ${coordinate(y)}`;
    }
    path += ` L ${input.width} ${input.height} L 0 ${input.height} Z`;
    elements.push({
      id: `wave-${index}`,
      type: "path",
      data: path,
      fill: input.palette[index % input.palette.length]!,
      opacity: 0.06 + input.contrast * 0.16,
    });
  }
  return elements;
}

function generateContours(
  input: ProceduralBackgroundInput,
  random: SeededRandom,
): SceneElement[] {
  const centers = Math.round(2 + input.complexity * 3);
  const rings = Math.round(4 + input.density * 12);
  const elements: SceneElement[] = [];
  for (let center = 0; center < centers; center += 1) {
    const centerX = random.float(input.width * 0.1, input.width * 0.9);
    const centerY = random.float(input.height * 0.1, input.height * 0.9);
    const phase = random.float(0, Math.PI * 2);
    for (let ring = 1; ring <= rings; ring += 1) {
      const radius = (ring / rings) * Math.min(input.width, input.height) * 0.45;
      const points = 72;
      let path = "";
      for (let point = 0; point <= points; point += 1) {
        const angle = (point / points) * Math.PI * 2;
        const variation =
          1 + Math.sin(angle * (3 + center) + phase) * (0.03 + input.complexity * 0.09);
        const x = clamp(centerX + Math.cos(angle) * radius * variation, 0, input.width);
        const y = clamp(
          centerY + Math.sin(angle) * radius * 0.68 * variation,
          0,
          input.height,
        );
        path += `${point === 0 ? "M" : " L"} ${coordinate(x)} ${coordinate(y)}`;
      }
      path += " Z";
      elements.push({
        id: `contour-${center}-${ring}`,
        type: "path",
        data: path,
        fill: "none",
        stroke: input.palette[(center + ring) % input.palette.length]!,
        strokeWidth: 0.8 + input.intensity * 1.8,
        opacity: 0.08 + input.contrast * 0.22,
      });
    }
  }
  return elements;
}

function generateSubdivision(
  input: ProceduralBackgroundInput,
  random: SeededRandom,
): SceneElement[] {
  type Cell = { x: number; y: number; width: number; height: number; depth: number };
  const maximumDepth = Math.round(2 + input.complexity * 4);
  const minimumSize = Math.min(input.width, input.height) * 0.08;
  const pending: Cell[] = [
    { x: 0, y: 0, width: input.width, height: input.height, depth: 0 },
  ];
  const leaves: Cell[] = [];
  while (pending.length > 0) {
    const cell = pending.pop()!;
    const maySplit =
      cell.depth < maximumDepth &&
      Math.min(cell.width, cell.height) > minimumSize &&
      random.boolean(0.5 + input.density * 0.4);
    if (!maySplit) {
      leaves.push(cell);
      continue;
    }
    const ratio = random.float(0.34, 0.66);
    if (cell.width >= cell.height) {
      const firstWidth = cell.width * ratio;
      pending.push(
        { ...cell, width: firstWidth, depth: cell.depth + 1 },
        {
          ...cell,
          x: cell.x + firstWidth,
          width: cell.width - firstWidth,
          depth: cell.depth + 1,
        },
      );
    } else {
      const firstHeight = cell.height * ratio;
      pending.push(
        { ...cell, height: firstHeight, depth: cell.depth + 1 },
        {
          ...cell,
          y: cell.y + firstHeight,
          height: cell.height - firstHeight,
          depth: cell.depth + 1,
        },
      );
    }
  }
  return leaves.map((cell, index) => ({
    id: `subdivision-${index}`,
    type: "rect",
    x: cell.x,
    y: cell.y,
    width: cell.width,
    height: cell.height,
    fill: random.pick(input.palette),
    stroke: input.backgroundColor,
    strokeWidth: 2 + input.intensity * 5,
    opacity: 0.06 + input.contrast * 0.24,
  }));
}

function denormalizeQuietRegion(input: ProceduralBackgroundInput): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const region = input.quietRegion;
  return {
    x: region.x * input.width,
    y: region.y * input.height,
    width: region.width * input.width,
    height: region.height * input.height,
  };
}

function insideQuietRegion(
  x: number,
  y: number,
  input: ProceduralBackgroundInput,
): boolean {
  const region = input.quietRegion;
  return (
    x >= region.x * input.width &&
    x <= (region.x + region.width) * input.width &&
    y >= region.y * input.height &&
    y <= (region.y + region.height) * input.height
  );
}

function coordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
