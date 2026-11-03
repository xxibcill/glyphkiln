import { GlyphkilnError, type Bounds, type Dimensions } from "../domain/types.js";
import { reviewImageColors, type CraftImageMetric } from "./color.js";
import { normalizeHexColor, parseHexColor } from "./geometry.js";
import { describeLayout, type CraftLayoutElement } from "./layout.js";
import type { CraftElement, CraftModel, CraftRaster } from "./model.js";
import {
  CRAFT_BACKGROUND_AREA,
  CRAFT_MARK_PIXEL_DIFFERENCE,
  CRAFT_MINIMUM_CONTAINER_AREA,
  CRAFT_PIXEL_TOLERANCE,
  CRAFT_REVIEW_DEFAULTS,
  CRAFT_REVIEW_POLICY_VERSION,
  type CraftFindingCode,
  type CraftReviewThresholds,
} from "./policy.js";

export type CraftFinding = {
  code: CraftFindingCode;
  /** Craft findings are always advisory and never block rendering. */
  severity: "advisory";
  message: string;
  elementId?: string;
  details: Record<string, unknown>;
};

export type CraftTextMetric = {
  elementId: string;
  fontSize: number;
  displayedFontSize: number;
  displayedXHeight: number;
};

export type CraftContainerMetric = {
  elementId: string;
  bounds: Bounds;
  emptyFraction: number;
  largestEmptyBand: number;
  largestEmptyBandAxis: "rows" | "columns";
};

export type CraftMarkMetric = {
  elementId: string;
  /** Share of the mark's box whose pixels differ from the canvas without it. */
  visibleFraction: number;
  /** Median WCAG contrast between each visible mark pixel and the ground behind it. */
  medianContrast: number | null;
  /** Longer side of the visible mark, in display pixels. */
  displayedSize: number;
};

export type CraftEmptyBand = {
  axis: "rows" | "columns";
  start: number;
  end: number;
  fraction: number;
};

export type CraftReview = {
  policyVersion: typeof CRAFT_REVIEW_POLICY_VERSION;
  thresholds: CraftReviewThresholds;
  canvas: Dimensions;
  findings: CraftFinding[];
  metrics: {
    text: CraftTextMetric[];
    dominance: {
      firstElementId: string | null;
      secondElementId: string | null;
      ratio: number | null;
    };
    containers: CraftContainerMetric[];
    canvasEmptyBand: CraftEmptyBand | null;
    accent: {
      colors: string[];
      areaFraction: number | null;
      usageCount: number;
      elementIds: string[];
    };
    marks: CraftMarkMetric[];
    /** Dominant source colors of each photograph, rendered versus source. */
    images: CraftImageMetric[];
    /** Normalized text, image, and mark layout in reading order. */
    layout: CraftLayoutElement[];
  };
};

export function resolveCraftThresholds(input: unknown = {}): CraftReviewThresholds {
  const thresholds = { ...CRAFT_REVIEW_DEFAULTS };
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new GlyphkilnError(
      "Craft thresholds must be an object.",
      "INVALID_CRAFT_REVIEW_OPTIONS",
    );
  }
  const overrides = input as Partial<Record<keyof CraftReviewThresholds, unknown>>;
  for (const key of Object.keys(overrides)) {
    if (!(key in CRAFT_REVIEW_DEFAULTS)) {
      throw new GlyphkilnError(
        `Unknown craft threshold "${key}".`,
        "INVALID_CRAFT_REVIEW_OPTIONS",
        { threshold: key },
      );
    }
  }
  for (const key of Object.keys(
    CRAFT_REVIEW_DEFAULTS,
  ) as (keyof CraftReviewThresholds)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new GlyphkilnError(
        `Craft threshold "${key}" must be a positive finite number.`,
        "INVALID_CRAFT_REVIEW_OPTIONS",
        { threshold: key },
      );
    }
    thresholds[key] = value;
  }
  return thresholds;
}

/** Pure, deterministic craft analysis of a rendered canvas and its geometry. */
export function analyzeCraft(
  model: CraftModel,
  overrides: Partial<CraftReviewThresholds> = {},
): CraftReview {
  const thresholds = resolveCraftThresholds(overrides);
  const findings: CraftFinding[] = [];
  const content = model.elements.filter(
    (element) => !element.decoration && element.opacity > 0,
  );

  const text = reviewTextSize(model, content, thresholds, findings);
  const dominance = reviewDominance(content, thresholds, findings);
  const containers = reviewContainers(model, content, thresholds, findings);
  const canvasEmptyBand = reviewCanvasSpace(model, content, thresholds, findings);
  const accent = reviewAccent(model, content, thresholds, findings);
  const marks = reviewMarks(model, thresholds, findings);
  const images = reviewProductColor(model, thresholds, findings);
  const layout = describeLayout(model);

  return {
    policyVersion: CRAFT_REVIEW_POLICY_VERSION,
    thresholds,
    canvas: { ...model.canvas },
    findings,
    metrics: {
      text,
      dominance,
      containers,
      canvasEmptyBand,
      accent,
      marks,
      images,
      layout,
    },
  };
}

function reviewProductColor(
  model: CraftModel,
  thresholds: CraftReviewThresholds,
  findings: CraftFinding[],
): CraftImageMetric[] {
  const results = reviewImageColors(model, thresholds);
  for (const { metric, dimmed } of results) {
    if (dimmed.length === 0) continue;
    const worst = [...dimmed].sort(
      (left, right) =>
        left.chromaRetention - right.chromaRetention ||
        left.lightnessChange - right.lightnessChange,
    )[0]!;
    findings.push({
      code: "CRAFT_PRODUCT_COLOR_DIMMED",
      severity: "advisory",
      message: `Image "${metric.elementId}" loses its own color in the render: ${dimmed.length} of ${metric.colors.length} dominant colors are dimmed (hue ${worst.hueRange[0]}–${worst.hueRange[1]}° keeps ${Math.round(worst.chromaRetention * 100)}% of its chroma, lightness ${worst.lightnessChange >= 0 ? "+" : ""}${round(worst.lightnessChange, 3)}); protect the product: put contrast treatment only behind the copy, move the copy to a quiet area, or lighten the treatment.`,
      elementId: metric.elementId,
      details: {
        dimmedColors: dimmed,
        sampleCount: metric.sampleCount,
        imageChromaRetention: thresholds.imageChromaRetention,
        imageLightnessDrop: thresholds.imageLightnessDrop,
      },
    });
  }
  return results.map((result) => result.metric);
}

function reviewTextSize(
  model: CraftModel,
  content: readonly CraftElement[],
  thresholds: CraftReviewThresholds,
  findings: CraftFinding[],
): CraftTextMetric[] {
  const scale = thresholds.displayWidth / model.canvas.width;
  const metrics: CraftTextMetric[] = [];
  for (const element of content) {
    if (element.text === undefined) continue;
    const displayedFontSize = element.text.fontSize * scale;
    const displayedXHeight = displayedFontSize * element.text.xHeightRatio;
    metrics.push({
      elementId: element.id,
      fontSize: round(element.text.fontSize),
      displayedFontSize: round(displayedFontSize),
      displayedXHeight: round(displayedXHeight),
    });
    if (displayedXHeight >= thresholds.minimumXHeight) continue;
    findings.push({
      code: "CRAFT_TEXT_SMALL_AT_DELIVERY",
      severity: "advisory",
      message: `Text "${element.id}" has a ${round(displayedXHeight, 2)} px x-height when the canvas is shown ${thresholds.displayWidth} px wide; enlarge it, move it to publishing copy, or confirm it is intentionally secondary.`,
      elementId: element.id,
      details: {
        displayWidth: thresholds.displayWidth,
        fontSize: round(element.text.fontSize),
        displayedFontSize: round(displayedFontSize),
        displayedXHeight: round(displayedXHeight),
        minimumXHeight: thresholds.minimumXHeight,
      },
    });
  }
  return metrics;
}

function reviewDominance(
  content: readonly CraftElement[],
  thresholds: CraftReviewThresholds,
  findings: CraftFinding[],
): CraftReview["metrics"]["dominance"] {
  const ranked = content
    .filter((element) => element.text !== undefined)
    .map((element, order) => ({ element, order }))
    .sort(
      (left, right) =>
        right.element.text!.fontSize - left.element.text!.fontSize ||
        left.order - right.order,
    );
  const first = ranked[0]?.element;
  const second = ranked[1]?.element;
  if (first === undefined || second === undefined) {
    return {
      firstElementId: first?.id ?? null,
      secondElementId: null,
      ratio: null,
    };
  }
  const ratio = first.text!.fontSize / second.text!.fontSize;
  if (ratio < thresholds.minimumDominanceRatio) {
    const competing = ranked
      .filter(
        ({ element }) =>
          first.text!.fontSize / element.text!.fontSize <
          thresholds.minimumDominanceRatio,
      )
      .map(({ element }) => element.id);
    findings.push({
      code: "CRAFT_WEAK_SCALE_CONTRAST",
      severity: "advisory",
      message: `The largest text "${first.id}" is only ${round(ratio, 2)}× the next text "${second.id}"; give one element clear dominance or group the competing elements deliberately.`,
      elementId: first.id,
      details: {
        ratio: round(ratio),
        minimumDominanceRatio: thresholds.minimumDominanceRatio,
        competingElementIds: competing,
      },
    });
  }
  return { firstElementId: first.id, secondElementId: second.id, ratio: round(ratio) };
}

function reviewContainers(
  model: CraftModel,
  content: readonly CraftElement[],
  thresholds: CraftReviewThresholds,
  findings: CraftFinding[],
): CraftContainerMetric[] {
  const canvasArea = model.canvas.width * model.canvas.height;
  const metrics: CraftContainerMetric[] = [];
  for (const element of content) {
    if (element.kind !== "rect" || element.bounds === null) continue;
    if (element.opacity < 0.95) continue;
    const fill = parseHexColor(element.fill ?? undefined);
    if (fill === null) continue;
    const share = (element.bounds.width * element.bounds.height) / canvasArea;
    if (share < CRAFT_MINIMUM_CONTAINER_AREA || share >= CRAFT_BACKGROUND_AREA)
      continue;
    const sample = sampleEmptiness(model.raster, element.bounds, fill);
    if (sample === null) continue;
    const metric: CraftContainerMetric = {
      elementId: element.id,
      bounds: roundBounds(element.bounds),
      emptyFraction: round(sample.emptyFraction),
      largestEmptyBand: round(sample.largestBand),
      largestEmptyBandAxis: sample.axis,
    };
    metrics.push(metric);
    if (
      sample.emptyFraction < thresholds.containerEmptyFraction ||
      sample.largestBand < thresholds.containerEmptyBand
    ) {
      continue;
    }
    findings.push({
      code: "CRAFT_DEAD_SPACE",
      severity: "advisory",
      message: `Container "${element.id}" shows its bare fill over ${Math.round(sample.emptyFraction * 100)}% of its area, with an empty band across ${Math.round(sample.largestBand * 100)}% of its ${sample.axis === "rows" ? "height" : "width"}; resize it to its content, give the space a job, or remove the container.`,
      elementId: element.id,
      details: {
        scope: "container",
        emptyFraction: metric.emptyFraction,
        largestEmptyBand: metric.largestEmptyBand,
        axis: sample.axis,
        containerEmptyFraction: thresholds.containerEmptyFraction,
        containerEmptyBand: thresholds.containerEmptyBand,
      },
    });
  }
  return metrics;
}

function sampleEmptiness(
  raster: CraftRaster,
  bounds: Bounds,
  fill: readonly [number, number, number],
): { emptyFraction: number; largestBand: number; axis: "rows" | "columns" } | null {
  // Inset by two pixels so anti-aliased container edges are not counted.
  const x0 = Math.max(0, Math.ceil(bounds.x) + 2);
  const y0 = Math.max(0, Math.ceil(bounds.y) + 2);
  const x1 = Math.min(raster.width, Math.floor(bounds.x + bounds.width) - 2);
  const y1 = Math.min(raster.height, Math.floor(bounds.y + bounds.height) - 2);
  const width = x1 - x0;
  const height = y1 - y0;
  if (width <= 0 || height <= 0) return null;
  const columnMatches = new Uint32Array(width);
  let matches = 0;
  let rowRun = 0;
  let longestRowRun = 0;
  for (let y = y0; y < y1; y += 1) {
    let rowMatches = 0;
    for (let x = x0; x < x1; x += 1) {
      if (!pixelMatches(raster, x, y, fill)) continue;
      rowMatches += 1;
      columnMatches[x - x0]! += 1;
    }
    matches += rowMatches;
    rowRun = rowMatches >= width * 0.99 ? rowRun + 1 : 0;
    longestRowRun = Math.max(longestRowRun, rowRun);
  }
  let columnRun = 0;
  let longestColumnRun = 0;
  for (const count of columnMatches) {
    columnRun = count >= height * 0.99 ? columnRun + 1 : 0;
    longestColumnRun = Math.max(longestColumnRun, columnRun);
  }
  const rowBand = longestRowRun / height;
  const columnBand = longestColumnRun / width;
  return {
    emptyFraction: matches / (width * height),
    largestBand: Math.max(rowBand, columnBand),
    axis: columnBand > rowBand ? "columns" : "rows",
  };
}

function reviewCanvasSpace(
  model: CraftModel,
  content: readonly CraftElement[],
  thresholds: CraftReviewThresholds,
  findings: CraftFinding[],
): CraftEmptyBand | null {
  const { width, height } = model.canvas;
  const canvasArea = width * height;
  const occupied = content
    .filter(
      (element) =>
        element.kind !== "rect" ||
        element.bounds === null ||
        (element.bounds.width * element.bounds.height) / canvasArea <
          CRAFT_BACKGROUND_AREA,
    )
    .map((element) => element.bounds)
    .filter(
      (bounds): bounds is Bounds =>
        bounds !== null && bounds.width > 0 && bounds.height > 0,
    )
    .map((bounds) => clipBounds(bounds, width, height))
    .filter((bounds): bounds is Bounds => bounds !== null);
  const rows = longestEmptyRun(occupied, "rows", height, width, thresholds);
  const columns = longestEmptyRun(occupied, "columns", width, height, thresholds);
  const band = columns.fraction > rows.fraction ? columns : rows;
  if (band.fraction <= 0) return null;
  const result: CraftEmptyBand = {
    axis: band.axis,
    start: band.start,
    end: band.end,
    fraction: round(band.fraction),
  };
  if (band.fraction >= thresholds.canvasEmptyBand) {
    findings.push({
      code: "CRAFT_DEAD_SPACE",
      severity: "advisory",
      message: `${Math.round(band.fraction * 100)}% of the canvas ${band.axis === "rows" ? "height" : "width"} (${band.start}–${band.end} px) carries almost no content; confirm the space is intentional or recompose to use it.`,
      details: {
        scope: "canvas",
        axis: band.axis,
        start: band.start,
        end: band.end,
        fraction: result.fraction,
        canvasEmptyBand: thresholds.canvasEmptyBand,
        emptyLineCoverage: thresholds.emptyLineCoverage,
      },
    });
  }
  return result;
}

function longestEmptyRun(
  occupied: readonly Bounds[],
  axis: "rows" | "columns",
  length: number,
  span: number,
  thresholds: CraftReviewThresholds,
): CraftEmptyBand {
  let run = 0;
  let best = { start: 0, end: 0 };
  for (let line = 0; line < length; line += 1) {
    const center = line + 0.5;
    const intervals: [number, number][] = [];
    for (const bounds of occupied) {
      const [from, size, crossFrom, crossSize] =
        axis === "rows"
          ? [bounds.y, bounds.height, bounds.x, bounds.width]
          : [bounds.x, bounds.width, bounds.y, bounds.height];
      if (center < from || center > from + size) continue;
      intervals.push([crossFrom, crossFrom + crossSize]);
    }
    const covered = mergedLength(intervals) / span;
    if (covered < thresholds.emptyLineCoverage) {
      run += 1;
      if (run > best.end - best.start) best = { start: line + 1 - run, end: line + 1 };
    } else {
      run = 0;
    }
  }
  return {
    axis,
    start: best.start,
    end: best.end,
    fraction: (best.end - best.start) / length,
  };
}

function mergedLength(intervals: [number, number][]): number {
  intervals.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let total = 0;
  let currentStart = -Infinity;
  let currentEnd = -Infinity;
  for (const [start, end] of intervals) {
    if (start > currentEnd) {
      if (currentEnd > currentStart) total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    } else {
      currentEnd = Math.max(currentEnd, end);
    }
  }
  if (currentEnd > currentStart) total += currentEnd - currentStart;
  return total;
}

function reviewAccent(
  model: CraftModel,
  content: readonly CraftElement[],
  thresholds: CraftReviewThresholds,
  findings: CraftFinding[],
): CraftReview["metrics"]["accent"] {
  if (model.accentColors.length === 0) {
    return { colors: [], areaFraction: null, usageCount: 0, elementIds: [] };
  }
  const accents = model.accentColors
    .map((color) => parseHexColor(color))
    .filter((color): color is readonly [number, number, number] => color !== null);
  const photographs = content
    .filter((element) => element.kind === "image" && element.bounds !== null)
    .map((element) => element.bounds!);
  const { raster } = model;
  let counted = 0;
  let accentPixels = 0;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (photographs.some((bounds) => contains(bounds, x + 0.5, y + 0.5))) continue;
      counted += 1;
      if (accents.some((accent) => pixelMatches(raster, x, y, accent)))
        accentPixels += 1;
    }
  }
  const accentSet = new Set(
    model.accentColors.map((color) => normalizeHexColor(color)),
  );
  const isAccent = (color: string | null): boolean =>
    color !== null && accentSet.has(normalizeHexColor(color));
  const elementIds = content
    .filter((element) => isAccent(element.fill) || isAccent(element.stroke))
    .map((element) => element.id);
  const usages = accentUsageCount(
    content.filter((element) => elementIds.includes(element.id)),
  );
  const areaFraction = counted === 0 ? 0 : accentPixels / counted;
  if (
    areaFraction > thresholds.accentAreaFraction ||
    usages > thresholds.accentUsageCount
  ) {
    findings.push({
      code: "CRAFT_ACCENT_OVERUSE",
      severity: "advisory",
      message: `The accent color has ${usages} distinct uses across ${elementIds.length} elements and ${round(areaFraction * 100, 1)}% of non-photographic pixels; reserve it for the dominant element or the action so it still signals priority.`,
      details: {
        colors: model.accentColors,
        areaFraction: round(areaFraction),
        usageCount: usages,
        elementCount: elementIds.length,
        elementIds,
        accentAreaFraction: thresholds.accentAreaFraction,
        accentUsageCount: thresholds.accentUsageCount,
      },
    });
  }
  return {
    colors: model.accentColors,
    areaFraction: round(areaFraction),
    usageCount: usages,
    elementIds,
  };
}

/**
 * Repeated same-size marks, such as every stage number in a process, form one
 * systematic use. Count distinct kind-and-size signatures instead of elements.
 */
function accentUsageCount(elements: readonly CraftElement[]): number {
  const signatures = new Set<string>();
  for (const element of elements) {
    if (element.text !== undefined) {
      signatures.add(`text:${Math.round(element.text.fontSize)}`);
      continue;
    }
    const bounds = element.bounds;
    signatures.add(
      bounds === null
        ? `${element.kind}:${element.id}`
        : `${element.kind}:${Math.round(bounds.width)}x${Math.round(bounds.height)}`,
    );
  }
  return signatures.size;
}

function reviewMarks(
  model: CraftModel,
  thresholds: CraftReviewThresholds,
  findings: CraftFinding[],
): CraftMarkMetric[] {
  const background = model.marks.background;
  if (background === null) return [];
  const scale = thresholds.displayWidth / model.canvas.width;
  const metrics: CraftMarkMetric[] = [];
  for (const id of model.marks.elementIds) {
    const element = model.elements.find((candidate) => candidate.id === id);
    if (element?.bounds == null) continue;
    const box = clipBounds(element.bounds, model.canvas.width, model.canvas.height);
    if (box === null) continue;
    const x0 = Math.floor(box.x);
    const y0 = Math.floor(box.y);
    const x1 = Math.ceil(box.x + box.width);
    const y1 = Math.ceil(box.y + box.height);
    const ratios: number[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const offset = (y * model.raster.width + x) * 4;
        const foreground = model.raster.data.subarray(offset, offset + 3);
        const ground = background.data.subarray(offset, offset + 3);
        if (
          Math.max(
            Math.abs(foreground[0]! - ground[0]!),
            Math.abs(foreground[1]! - ground[1]!),
            Math.abs(foreground[2]! - ground[2]!),
          ) <= CRAFT_MARK_PIXEL_DIFFERENCE
        ) {
          continue;
        }
        ratios.push(pixelContrast(foreground, ground));
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + 1);
        maxY = Math.max(maxY, y + 1);
      }
    }
    ratios.sort((left, right) => left - right);
    const boxArea = Math.max(1, (x1 - x0) * (y1 - y0));
    const medianContrast =
      ratios.length === 0 ? null : ratios[Math.floor((ratios.length - 1) / 2)]!;
    const displayedSize =
      ratios.length === 0 ? 0 : Math.max(maxX - minX, maxY - minY) * scale;
    const metric: CraftMarkMetric = {
      elementId: id,
      visibleFraction: round(ratios.length / boxArea),
      medianContrast: medianContrast === null ? null : round(medianContrast),
      displayedSize: round(displayedSize),
    };
    metrics.push(metric);
    if (
      medianContrast !== null &&
      medianContrast >= thresholds.markMinimumContrast &&
      displayedSize >= thresholds.markMinimumSize
    ) {
      continue;
    }
    const reasons = [
      ...(medianContrast === null || medianContrast < thresholds.markMinimumContrast
        ? [
            `median contrast ${medianContrast === null ? "none" : round(medianContrast, 2)}:1 against its ground`,
          ]
        : []),
      ...(displayedSize < thresholds.markMinimumSize
        ? [`${round(displayedSize, 1)} px across at ${thresholds.displayWidth} px wide`]
        : []),
    ];
    findings.push({
      code: "CRAFT_MARK_LOW_VISIBILITY",
      severity: "advisory",
      message: `Mark "${id}" may not be recognizable: ${reasons.join("; ")}. Use an approved light, dark, or one-color variant, give it a quieter ground, or enlarge it.`,
      elementId: id,
      details: {
        ...metric,
        displayWidth: thresholds.displayWidth,
        markMinimumContrast: thresholds.markMinimumContrast,
        markMinimumSize: thresholds.markMinimumSize,
      },
    });
  }
  return metrics;
}

function pixelContrast(
  foreground: ArrayLike<number>,
  background: ArrayLike<number>,
): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function luminance(rgb: ArrayLike<number>): number {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(rgb[0]!) + 0.7152 * linear(rgb[1]!) + 0.0722 * linear(rgb[2]!);
}

function pixelMatches(
  raster: CraftRaster,
  x: number,
  y: number,
  color: readonly [number, number, number],
): boolean {
  const offset = (y * raster.width + x) * 4;
  return (
    Math.abs(raster.data[offset]! - color[0]) <= CRAFT_PIXEL_TOLERANCE &&
    Math.abs(raster.data[offset + 1]! - color[1]) <= CRAFT_PIXEL_TOLERANCE &&
    Math.abs(raster.data[offset + 2]! - color[2]) <= CRAFT_PIXEL_TOLERANCE &&
    raster.data[offset + 3]! >= 250
  );
}

function contains(bounds: Bounds, x: number, y: number): boolean {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

function clipBounds(bounds: Bounds, width: number, height: number): Bounds | null {
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(width, bounds.x + bounds.width);
  const bottom = Math.min(height, bounds.y + bounds.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundBounds(bounds: Bounds): Bounds {
  return {
    x: round(bounds.x),
    y: round(bounds.y),
    width: round(bounds.width),
    height: round(bounds.height),
  };
}
