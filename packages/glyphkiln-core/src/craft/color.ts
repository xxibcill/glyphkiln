import type { Bounds } from "../domain/types.js";
import type {
  CraftElement,
  CraftImageSource,
  CraftModel,
  CraftRaster,
} from "./model.js";
import {
  CRAFT_IMAGE_CHROMATIC_MINIMUM,
  CRAFT_IMAGE_COLOR_MINIMUM_SAMPLES,
  CRAFT_IMAGE_COLOR_SHARE,
  CRAFT_IMAGE_HUE_BINS,
  CRAFT_IMAGE_MAXIMUM_COLORS,
  CRAFT_IMAGE_MINIMUM_AREA,
  CRAFT_IMAGE_SAMPLE_GRID,
  type CraftReviewThresholds,
} from "./policy.js";

export type CraftImageColorMetric = {
  /** Hue range, in OKLab hue degrees, of this dominant color. */
  hueRange: [number, number];
  /** Share of the image's compared samples that fall in this color. */
  share: number;
  sourceLightness: number;
  renderedLightness: number;
  sourceChroma: number;
  renderedChroma: number;
  /** Rendered chroma divided by source chroma at the same positions. */
  chromaRetention: number;
  /** Rendered minus source OKLab lightness; negative means darker. */
  lightnessChange: number;
  dimmed: boolean;
};

export type CraftImageMetric = {
  elementId: string;
  /** Samples where the image is not covered by later opaque content. */
  sampleCount: number;
  /** Samples whose source color is chromatic enough to carry a hue. */
  chromaticSampleCount: number;
  /** Dominant chromatic colors, most frequent first. */
  colors: CraftImageColorMetric[];
};

export type CraftImageColorResult = {
  metric: CraftImageMetric;
  dimmed: CraftImageColorMetric[];
};

type Lab = readonly [number, number, number];

/**
 * Compares the rendered canvas with the source asset at the same mapped
 * positions inside the image's visible region. Later opaque content (text,
 * marks, cards) is excluded; translucent overlays such as scrims are not,
 * because they are what changes the photograph's color.
 */
export function reviewImageColors(
  model: CraftModel,
  thresholds: CraftReviewThresholds,
): CraftImageColorResult[] {
  const canvasArea = model.canvas.width * model.canvas.height;
  const marks = new Set(model.marks.elementIds);
  const results: CraftImageColorResult[] = [];
  for (const image of model.images ?? []) {
    if (marks.has(image.elementId)) continue;
    const index = model.elements.findIndex((element) => element.id === image.elementId);
    const element = model.elements[index];
    if (element === undefined || element.decoration || element.opacity <= 0) continue;
    const visible = clip(image.visible, model.raster);
    if (visible === null) continue;
    if ((visible.width * visible.height) / canvasArea < CRAFT_IMAGE_MINIMUM_AREA) {
      continue;
    }
    const occluders = model.elements
      .slice(index + 1)
      .filter(isOccluder)
      .map((item) => item.bounds!);
    results.push(compareImage(model.raster, image, visible, occluders, thresholds));
  }
  return results;
}

function isOccluder(element: CraftElement): boolean {
  if (element.bounds === null || element.opacity <= 0) return false;
  if (element.kind === "text") return true;
  // Translucent rectangles and paths are treatments over the photograph.
  return (
    element.opacity >= 0.95 || (element.kind !== "rect" && element.kind !== "path")
  );
}

function compareImage(
  raster: CraftRaster,
  image: CraftImageSource,
  visible: Bounds,
  occluders: readonly Bounds[],
  thresholds: CraftReviewThresholds,
): CraftImageColorResult {
  const bins = Array.from({ length: CRAFT_IMAGE_HUE_BINS }, () => ({
    count: 0,
    sourceL: 0,
    renderedL: 0,
    sourceC: 0,
    renderedC: 0,
  }));
  let sampleCount = 0;
  let chromaticCount = 0;
  const { source, placed } = image;
  const x0 = Math.ceil(visible.x) + 1;
  const y0 = Math.ceil(visible.y) + 1;
  const x1 = Math.floor(visible.x + visible.width) - 1;
  const y1 = Math.floor(visible.y + visible.height) - 1;
  const stepX = Math.max(1, (x1 - x0) / CRAFT_IMAGE_SAMPLE_GRID);
  const stepY = Math.max(1, (y1 - y0) / CRAFT_IMAGE_SAMPLE_GRID);
  for (let y = y0 + stepY / 2; y < y1; y += stepY) {
    const py = Math.floor(y);
    for (let x = x0 + stepX / 2; x < x1; x += stepX) {
      const px = Math.floor(x);
      const cx = px + 0.5;
      const cy = py + 0.5;
      if (occluders.some((bounds) => inside(bounds, cx, cy))) continue;
      const sx = clamp(
        Math.floor(((cx - placed.x) / placed.width) * source.width),
        source.width - 1,
      );
      const sy = clamp(
        Math.floor(((cy - placed.y) / placed.height) * source.height),
        source.height - 1,
      );
      const sourceOffset = (sy * source.width + sx) * 4;
      if (source.data[sourceOffset + 3]! < 250) continue;
      sampleCount += 1;
      const before = oklab(source.data, sourceOffset);
      const chroma = Math.hypot(before[1], before[2]);
      if (chroma < CRAFT_IMAGE_CHROMATIC_MINIMUM) continue;
      chromaticCount += 1;
      const after = oklab(raster.data, (py * raster.width + px) * 4);
      const hue = (Math.atan2(before[2], before[1]) * 180) / Math.PI;
      const bin = Math.min(
        CRAFT_IMAGE_HUE_BINS - 1,
        Math.floor((((hue % 360) + 360) % 360) / (360 / CRAFT_IMAGE_HUE_BINS)),
      );
      const record = bins[bin]!;
      record.count += 1;
      record.sourceL += before[0];
      record.renderedL += after[0];
      record.sourceC += chroma;
      record.renderedC += Math.hypot(after[1], after[2]);
    }
  }
  const width = 360 / CRAFT_IMAGE_HUE_BINS;
  const minimum = Math.max(
    CRAFT_IMAGE_COLOR_MINIMUM_SAMPLES,
    chromaticCount * CRAFT_IMAGE_COLOR_SHARE,
  );
  const colors = bins
    .map((record, bin) => ({ record, bin }))
    .filter(({ record }) => record.count >= minimum)
    .sort(
      (left, right) => right.record.count - left.record.count || left.bin - right.bin,
    )
    .slice(0, CRAFT_IMAGE_MAXIMUM_COLORS)
    .map(({ record, bin }): CraftImageColorMetric => {
      const chromaRetention = record.renderedC / record.sourceC;
      const lightnessChange = (record.renderedL - record.sourceL) / record.count;
      return {
        hueRange: [bin * width, (bin + 1) * width],
        share: round(record.count / sampleCount),
        sourceLightness: round(record.sourceL / record.count),
        renderedLightness: round(record.renderedL / record.count),
        sourceChroma: round(record.sourceC / record.count),
        renderedChroma: round(record.renderedC / record.count),
        chromaRetention: round(chromaRetention),
        lightnessChange: round(lightnessChange),
        dimmed:
          chromaRetention < thresholds.imageChromaRetention ||
          lightnessChange < -thresholds.imageLightnessDrop,
      };
    });
  return {
    metric: {
      elementId: image.elementId,
      sampleCount,
      chromaticSampleCount: chromaticCount,
      colors,
    },
    dimmed: colors.filter((color) => color.dimmed),
  };
}

/** sRGB bytes to OKLab (Ottosson 2020), L in 0–1. */
function oklab(data: ArrayLike<number>, offset: number): Lab {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(data[offset]!);
  const g = linear(data[offset + 1]!);
  const b = linear(data[offset + 2]!);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function clip(bounds: Bounds, raster: CraftRaster): Bounds | null {
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(raster.width, bounds.x + bounds.width);
  const bottom = Math.min(raster.height, bounds.y + bounds.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function inside(bounds: Bounds, x: number, y: number): boolean {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

function clamp(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, value));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
