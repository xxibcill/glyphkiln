import { GlyphkilnError, type Bounds, type Dimensions } from "../domain/types.js";
import { clipBounds, round } from "./geometry.js";
import type { CraftElement, CraftModel } from "./model.js";
import {
  CRAFT_FORMAT_SET_MAXIMUM,
  CRAFT_FORMAT_SET_MAXIMUM_ELEMENTS,
  CRAFT_FORMAT_SET_MINIMUM_SHARED,
  CRAFT_FORMAT_SET_ROW_TOLERANCE,
  CRAFT_FORMAT_SET_SHARED_SHARE,
  CRAFT_FORMAT_SET_DEFAULTS,
  CRAFT_REVIEW_POLICY_VERSION,
  type CraftFormatSetThresholds,
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
    const visible = clipBounds(source, width, height);
    if (visible === null) return;
    layout.push({
      order,
      element: {
        elementId: element.id,
        role,
        bounds: {
          x: round(visible.x / width),
          y: round(visible.y / height),
          width: round(visible.width / width),
          height: round(visible.height / height),
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
  /** Shared elements as a share of all elements in either layout (0–1). */
  sharedShare: number;
  /**
   * Mean over shared elements of normalized center displacement plus mean
   * normalized size difference; 1 when nothing is shared.
   */
  layoutDistance: number;
  /**
   * No two shared elements read in opposite order in the two formats
   * (elements on one row, within a small tolerance, read left to right).
   */
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
    thresholds?: Partial<CraftFormatSetThresholds>;
  } = {},
): CraftFormatSetReview {
  const entries = validateEntries(input);
  const limit = validateFormatSetOptions(options);
  const formatLayoutDistance = limit ?? CRAFT_FORMAT_SET_DEFAULTS.formatLayoutDistance;
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
          unmatchedElementIds: pair.unmatchedElementIds,
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
      !Array.isArray(review.metrics?.layout) ||
      review.metrics.layout.length > CRAFT_FORMAT_SET_MAXIMUM_ELEMENTS ||
      !review.metrics.layout.every(isLayoutElement)
    ) {
      throw new GlyphkilnError(
        `Each format-set entry needs a format label and a craft review made under policy ${CRAFT_REVIEW_POLICY_VERSION}, with at most ${CRAFT_FORMAT_SET_MAXIMUM_ELEMENTS} well-formed layout elements.`,
        "INVALID_CRAFT_REVIEW_OPTIONS",
      );
    }
    return entry as CraftFormatSetEntry;
  });
}

const LAYOUT_ROLES: ReadonlySet<unknown> = new Set(["text", "image", "mark"]);

function isLayoutElement(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const element = value as { elementId?: unknown; role?: unknown; bounds?: unknown };
  if (
    typeof element.elementId !== "string" ||
    element.elementId.length === 0 ||
    element.elementId.length > 200 ||
    !LAYOUT_ROLES.has(element.role) ||
    typeof element.bounds !== "object" ||
    element.bounds === null
  ) {
    return false;
  }
  const bounds = element.bounds as Record<string, unknown>;
  return (["x", "y", "width", "height"] as const).every(
    (key) =>
      typeof bounds[key] === "number" &&
      Number.isFinite(bounds[key]) &&
      (key === "x" || key === "y" || bounds[key] >= 0),
  );
}

/** Rejects unknown option keys, like `resolveCraftThresholds` does. */
function validateFormatSetOptions(options: unknown): number | undefined {
  const invalid = (message: string, details?: Record<string, unknown>) =>
    new GlyphkilnError(message, "INVALID_CRAFT_REVIEW_OPTIONS", details);
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw invalid("Format-set options must be an object.");
  }
  for (const key of Object.keys(options)) {
    if (key !== "thresholds") {
      throw invalid(`Unknown format-set option "${key}".`, { option: key });
    }
  }
  const thresholds = (options as { thresholds?: unknown }).thresholds;
  if (thresholds === undefined) return undefined;
  if (
    typeof thresholds !== "object" ||
    thresholds === null ||
    Array.isArray(thresholds)
  ) {
    throw invalid("Craft thresholds must be an object.");
  }
  for (const key of Object.keys(thresholds)) {
    if (key !== "formatLayoutDistance") {
      throw invalid(`Unknown format-set threshold "${key}".`, { threshold: key });
    }
  }
  const limit = (thresholds as { formatLayoutDistance?: unknown }).formatLayoutDistance;
  if (
    limit !== undefined &&
    (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0)
  ) {
    throw invalid(
      'Craft threshold "formatLayoutDistance" must be a positive finite number.',
      {
        threshold: "formatLayoutDistance",
      },
    );
  }
  return limit;
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
  const pairs = shared.map((element) => ({
    left: element.bounds,
    right: rightById.get(element.elementId)!.bounds,
  }));
  let total = 0;
  for (const pair of pairs) total += elementDistance(pair.left, pair.right);
  const layoutDistance = pairs.length === 0 ? 1 : total / pairs.length;
  const count = shared.length + unmatched.length;
  const sharedShare = count === 0 ? 0 : shared.length / count;
  const sameReadingOrder = readingOrderAgrees(pairs);
  return {
    formats: [left.format, right.format],
    sharedElementIds: shared.map((element) => element.elementId),
    unmatchedElementIds: unmatched,
    sharedShare: round(sharedShare),
    layoutDistance: round(layoutDistance),
    sameReadingOrder,
    notRecomposed:
      shared.length >= CRAFT_FORMAT_SET_MINIMUM_SHARED &&
      sharedShare >= CRAFT_FORMAT_SET_SHARED_SHARE &&
      sameReadingOrder &&
      layoutDistance <= formatLayoutDistance,
  };
}

/**
 * Whether no two shared elements read in opposite order in the two formats.
 * Elements whose centers lie within CRAFT_FORMAT_SET_ROW_TOLERANCE vertically
 * share a row and read left to right; within the tolerance on both axes they
 * are tied and compatible with either order.
 */
function readingOrderAgrees(
  pairs: readonly { left: Bounds; right: Bounds }[],
): boolean {
  for (let first = 0; first < pairs.length; first += 1) {
    for (let second = first + 1; second < pairs.length; second += 1) {
      const before = readsAfter(pairs[first]!.left, pairs[second]!.left);
      const after = readsAfter(pairs[first]!.right, pairs[second]!.right);
      if (before * after < 0) return false;
    }
  }
  return true;
}

/** 1 when `a` reads after `b`, -1 when before, 0 when tied. */
function readsAfter(a: Bounds, b: Bounds): number {
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);
  if (Math.abs(dy) > CRAFT_FORMAT_SET_ROW_TOLERANCE) return Math.sign(dy);
  const dx = a.x + a.width / 2 - (b.x + b.width / 2);
  return Math.abs(dx) > CRAFT_FORMAT_SET_ROW_TOLERANCE ? Math.sign(dx) : 0;
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
