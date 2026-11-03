import { GlyphkilnError, type Bounds, type Dimensions } from "../domain/types.js";
import type { CraftElement, CraftModel } from "./model.js";
import {
  CRAFT_FORMAT_SET_MAXIMUM,
  CRAFT_REVIEW_DEFAULTS,
  CRAFT_REVIEW_POLICY_VERSION,
  type CraftReviewThresholds,
} from "./policy.js";

export type CraftLayoutRole = "text" | "image" | "mark";

export type CraftLayoutElement = {
  elementId: string;
  role: CraftLayoutRole;
  /** Visible bounds as fractions of the canvas width and height (0–1). */
  bounds: Bounds;
};

/**
 * Text, image, and mark elements in reading order (normalized vertical, then
 * horizontal, center), with canvas-normalized bounds. This is what a
 * format-set review compares; it removes the canvas aspect ratio.
 */
export function describeLayout(model: CraftModel): CraftLayoutElement[] {
  const marks = new Set(model.marks.elementIds);
  const { width, height } = model.canvas;
  const layout: { element: CraftLayoutElement; order: number }[] = [];
  model.elements.forEach((element, order) => {
    if (element.decoration || element.opacity <= 0) return;
    const role = layoutRole(element, marks);
    if (role === null) return;
    const source = element.visibleBounds ?? element.bounds;
    if (source == null) return;
    const x = Math.max(0, source.x);
    const y = Math.max(0, source.y);
    const right = Math.min(width, source.x + source.width);
    const bottom = Math.min(height, source.y + source.height);
    if (right <= x || bottom <= y) return;
    layout.push({
      order,
      element: {
        elementId: element.id,
        role,
        bounds: {
          x: round(x / width),
          y: round(y / height),
          width: round((right - x) / width),
          height: round((bottom - y) / height),
        },
      },
    });
  });
  return layout
    .sort((left, right) => {
      const a = left.element.bounds;
      const b = right.element.bounds;
      return (
        a.y + a.height / 2 - (b.y + b.height / 2) ||
        a.x + a.width / 2 - (b.x + b.width / 2) ||
        left.order - right.order
      );
    })
    .map(({ element }) => element);
}

function layoutRole(
  element: CraftElement,
  marks: ReadonlySet<string>,
): CraftLayoutRole | null {
  if (marks.has(element.id)) return "mark";
  if (element.kind === "text") return "text";
  if (element.kind === "image") return "image";
  return null;
}

export type CraftFormatSetEntry = {
  /** Caller label for the format, such as "instagram-square". */
  format: string;
  review: {
    policyVersion: string;
    canvas: Dimensions;
    metrics: { layout: readonly CraftLayoutElement[] };
  };
};

export type CraftFormatPairMetric = {
  formats: [string, string];
  /** Elements present in both layouts, matched by element ID. */
  sharedElementIds: string[];
  /** Elements present in only one of the two layouts. */
  unmatchedElementIds: string[];
  /**
   * Mean over all elements of normalized center displacement plus mean
   * normalized size difference; unmatched elements count as 1.
   */
  layoutDistance: number;
  /** Shared elements appear in the same reading order in both formats. */
  sameReadingOrder: boolean;
  notRecomposed: boolean;
};

export type CraftFormatSetFinding = {
  code: "CRAFT_FORMATS_NOT_RECOMPOSED";
  severity: "advisory";
  message: string;
  details: Record<string, unknown>;
};

export type CraftFormatSetReview = {
  policyVersion: typeof CRAFT_REVIEW_POLICY_VERSION;
  formatLayoutDistance: number;
  formats: { format: string; canvas: Dimensions }[];
  findings: CraftFormatSetFinding[];
  metrics: { pairs: CraftFormatPairMetric[] };
};

/**
 * Advisory set-level review of one design delivered in several formats. It
 * compares the normalized layouts of reviews from `reviewGraphicCraft` or
 * `reviewSceneCraft` and flags each pair of formats whose layouts are
 * near-identical after removing the aspect ratio: the same composition
 * resized rather than recomposed for each shape. Pure and deterministic.
 */
export function reviewFormatSet(
  input: readonly CraftFormatSetEntry[],
  options: {
    thresholds?: Pick<Partial<CraftReviewThresholds>, "formatLayoutDistance">;
  } = {},
): CraftFormatSetReview {
  const entries = validateEntries(input);
  const limit = options.thresholds?.formatLayoutDistance;
  if (
    limit !== undefined &&
    (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0)
  ) {
    throw new GlyphkilnError(
      'Craft threshold "formatLayoutDistance" must be a positive finite number.',
      "INVALID_CRAFT_REVIEW_OPTIONS",
      { threshold: "formatLayoutDistance" },
    );
  }
  const formatLayoutDistance = limit ?? CRAFT_REVIEW_DEFAULTS.formatLayoutDistance;
  const pairs: CraftFormatPairMetric[] = [];
  const findings: CraftFormatSetFinding[] = [];
  for (let first = 0; first < entries.length; first += 1) {
    for (let second = first + 1; second < entries.length; second += 1) {
      const left = entries[first]!;
      const right = entries[second]!;
      const pair = comparePair(left, right, formatLayoutDistance);
      pairs.push(pair);
      if (!pair.notRecomposed) continue;
      findings.push({
        code: "CRAFT_FORMATS_NOT_RECOMPOSED",
        severity: "advisory",
        message: `"${left.format}" and "${right.format}" place their text, image, and mark elements in nearly the same normalized positions and reading order (layout distance ${round(pair.layoutDistance, 3)}); recompose each format for its shape instead of resizing one composition.`,
        details: {
          formats: pair.formats,
          layoutDistance: pair.layoutDistance,
          sameReadingOrder: pair.sameReadingOrder,
          sharedElementIds: pair.sharedElementIds,
          formatLayoutDistance,
        },
      });
    }
  }
  return {
    policyVersion: CRAFT_REVIEW_POLICY_VERSION,
    formatLayoutDistance,
    formats: entries.map((entry) => ({
      format: entry.format,
      canvas: { width: entry.review.canvas.width, height: entry.review.canvas.height },
    })),
    findings,
    metrics: { pairs },
  };
}

function validateEntries(value: unknown): CraftFormatSetEntry[] {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > CRAFT_FORMAT_SET_MAXIMUM
  ) {
    throw new GlyphkilnError(
      `A format set needs 2 to ${CRAFT_FORMAT_SET_MAXIMUM} reviews.`,
      "INVALID_CRAFT_REVIEW_OPTIONS",
    );
  }
  return value.map((item: unknown) => {
    const entry = item as {
      format?: unknown;
      review?: {
        policyVersion?: unknown;
        canvas?: { width?: unknown; height?: unknown };
        metrics?: { layout?: unknown };
      };
    } | null;
    const review = entry?.review;
    if (
      typeof entry?.format !== "string" ||
      entry.format.length === 0 ||
      entry.format.length > 200 ||
      review?.policyVersion !== CRAFT_REVIEW_POLICY_VERSION ||
      typeof review.canvas?.width !== "number" ||
      typeof review.canvas.height !== "number" ||
      !Array.isArray(review.metrics?.layout)
    ) {
      throw new GlyphkilnError(
        `Each format-set entry needs a format label and a craft review made under policy ${CRAFT_REVIEW_POLICY_VERSION}.`,
        "INVALID_CRAFT_REVIEW_OPTIONS",
      );
    }
    return entry as CraftFormatSetEntry;
  });
}

function comparePair(
  left: CraftFormatSetEntry,
  right: CraftFormatSetEntry,
  formatLayoutDistance: number,
): CraftFormatPairMetric {
  const leftLayout = left.review.metrics.layout;
  const rightLayout = right.review.metrics.layout;
  const rightById = new Map(rightLayout.map((element) => [element.elementId, element]));
  const leftIds = new Set(leftLayout.map((element) => element.elementId));
  const shared = leftLayout.filter((element) => rightById.has(element.elementId));
  const unmatched = [
    ...leftLayout.filter((element) => !rightById.has(element.elementId)),
    ...rightLayout.filter((element) => !leftIds.has(element.elementId)),
  ].map((element) => element.elementId);
  let total = unmatched.length;
  for (const element of shared) {
    total += elementDistance(element.bounds, rightById.get(element.elementId)!.bounds);
  }
  const count = shared.length + unmatched.length;
  const layoutDistance = count === 0 ? 1 : total / count;
  const sharedIds = new Set(shared.map((element) => element.elementId));
  const rightOrder = rightLayout
    .filter((element) => sharedIds.has(element.elementId))
    .map((element) => element.elementId);
  const leftOrder = shared.map((element) => element.elementId);
  const sameReadingOrder = leftOrder.every((id, index) => rightOrder[index] === id);
  return {
    formats: [left.format, right.format],
    sharedElementIds: leftOrder,
    unmatchedElementIds: unmatched,
    layoutDistance: round(layoutDistance),
    sameReadingOrder,
    notRecomposed:
      shared.length > 0 && sameReadingOrder && layoutDistance <= formatLayoutDistance,
  };
}

/** Normalized center displacement plus mean absolute size difference. */
function elementDistance(left: Bounds, right: Bounds): number {
  const displacement = Math.hypot(
    left.x + left.width / 2 - (right.x + right.width / 2),
    left.y + left.height / 2 - (right.y + right.height / 2),
  );
  const size =
    (Math.abs(left.width - right.width) + Math.abs(left.height - right.height)) / 2;
  return displacement + size;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
