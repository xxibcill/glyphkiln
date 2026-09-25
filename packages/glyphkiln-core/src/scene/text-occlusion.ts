import { PNG } from "pngjs";

import type { AssetRegistry } from "../assets/index.js";
import type { QualityIssue } from "../domain/types.js";
import type { SceneEvidence } from "./evidence.js";
import type { SceneBounds, SceneDocument, SceneElement } from "./types.js";

type PaintEntry = {
  element: Exclude<SceneElement, { type: "group" }>;
  opacity: number;
  clipped: boolean;
  axisAligned: boolean;
  intentional: boolean;
};

/** Review fitted text against later paint, in the same depth-first order as SVG. */
export function reviewSceneTextOcclusion(
  document: SceneDocument,
  evidence: SceneEvidence,
  assets: AssetRegistry,
  intentionalOverlayIds: ReadonlySet<string>,
): QualityIssue[] {
  const bounds = new Map(evidence.text.map((text) => [text.id, text.bounds]));
  const images = new Map(evidence.images.map((image) => [image.id, image]));
  const elementBounds = new Map(
    evidence.elements.map((element) => [element.id, element.bounds]),
  );
  const entries = paintEntries(document.elements, intentionalOverlayIds);
  const earlierText: PaintEntry[] = [];
  const pngs = new Map<string, PNG>();
  const issues: QualityIssue[] = [];

  for (const entry of entries) {
    const { element } = entry;
    if (element.type === "text") {
      if (
        !entry.clipped &&
        entry.axisAligned &&
        entry.opacity > 0 &&
        isSolid(element.fill)
      ) {
        earlierText.push(entry);
      }
      continue;
    }
    if (
      entry.intentional ||
      entry.clipped ||
      !entry.axisAligned ||
      entry.opacity !== 1 ||
      (element.type !== "image" &&
        (element.type !== "rect" ||
          !isSolid(element.fill) ||
          (element.radius ?? 0) !== 0))
    ) {
      continue;
    }
    const image = element.type === "image" ? images.get(element.id) : undefined;
    const paintBounds =
      image?.visibleBounds ??
      (element.type === "rect"
        ? rectFillBounds(element, elementBounds.get(element.id))
        : undefined);
    if (paintBounds === undefined || paintBounds === null) continue;

    for (const text of earlierText) {
      const textBounds = bounds.get(text.element.id)!;
      const withinPaint = intersection(textBounds, paintBounds);
      if (withinPaint === null) continue;
      const overlap = intersection(withinPaint, {
        x: 0,
        y: 0,
        ...document.dimensions,
      });
      if (overlap === null) continue;
      let overlapArea = overlap.width * overlap.height;
      if (element.type === "image" && image !== undefined) {
        const asset = assets.get(element.assetId);
        if (asset.mimeType === "image/png") {
          let png = pngs.get(element.assetId);
          if (png === undefined) {
            png = PNG.sync.read(Buffer.from(asset.bytes), { checkCRC: true });
            pngs.set(element.assetId, png);
          }
          overlapArea = opaquePngArea(overlap, image.renderedBounds, png);
        }
      }
      if (overlapArea <= 0) continue;
      issues.push({
        code: "SCENE_TEXT_OCCLUDED",
        severity: "warning",
        layerId: text.element.id,
        message: `Later-painted element "${element.id}" covers visible text "${text.element.id}".`,
        details: {
          textElementId: text.element.id,
          occludingElementId: element.id,
          overlapArea: Math.round(overlapArea * 1_000_000) / 1_000_000,
        },
      });
      if (issues.length >= 128) return issues;
    }
  }
  return issues;
}

function paintEntries(
  elements: readonly SceneElement[],
  intentionalOverlayIds: ReadonlySet<string>,
): PaintEntry[] {
  const entries: PaintEntry[] = [];
  const pending = elements
    .map((element) => ({
      element,
      opacity: 1,
      clipped: false,
      axisAligned: true,
      intentional: intentionalOverlayIds.has(element.id),
    }))
    .reverse();
  while (pending.length > 0) {
    const entry = pending.pop()!;
    const opacity = entry.opacity * (entry.element.opacity ?? 1);
    if (entry.element.type !== "group") {
      entries.push({ ...entry, element: entry.element, opacity });
      continue;
    }
    const clipped = entry.clipped || entry.element.clip !== undefined;
    const axisAligned =
      entry.axisAligned &&
      (entry.element.transforms ?? []).every(
        (transform) =>
          transform.type === "translate" ||
          (transform.type === "scale" && transform.x > 0 && transform.y > 0) ||
          (transform.type === "rotate" && transform.degrees === 0),
      );
    for (let index = entry.element.elements.length - 1; index >= 0; index -= 1) {
      pending.push({
        element: entry.element.elements[index]!,
        opacity,
        clipped,
        axisAligned,
        intentional:
          entry.intentional ||
          intentionalOverlayIds.has(entry.element.elements[index]!.id),
      });
    }
  }
  return entries;
}

function isSolid(paint: string): boolean {
  return paint !== "none" && paint !== "transparent";
}

function rectFillBounds(
  element: Extract<SceneElement, { type: "rect" }>,
  measured: SceneBounds | null | undefined,
): SceneBounds | null | undefined {
  if (measured === null || measured === undefined) return measured;
  const pad =
    element.stroke === undefined || element.stroke === "none"
      ? 0
      : (element.strokeWidth ?? 1) / 2;
  const scaleX = measured.width / (element.width + 2 * pad);
  const scaleY = measured.height / (element.height + 2 * pad);
  return {
    x: measured.x + pad * scaleX,
    y: measured.y + pad * scaleY,
    width: element.width * scaleX,
    height: element.height * scaleY,
  };
}

function intersection(left: SceneBounds, right: SceneBounds): SceneBounds | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.min(left.x + left.width, right.x + right.width) - x;
  const height = Math.min(left.y + left.height, right.y + right.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

function opaquePngArea(overlap: SceneBounds, rendered: SceneBounds, png: PNG): number {
  const pixelWidth = rendered.width / png.width;
  const pixelHeight = rendered.height / png.height;
  const xStart = Math.max(0, Math.floor((overlap.x - rendered.x) / pixelWidth));
  const yStart = Math.max(0, Math.floor((overlap.y - rendered.y) / pixelHeight));
  const xEnd = Math.min(
    png.width,
    Math.ceil((overlap.x + overlap.width - rendered.x) / pixelWidth),
  );
  const yEnd = Math.min(
    png.height,
    Math.ceil((overlap.y + overlap.height - rendered.y) / pixelHeight),
  );
  let area = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] !== 255) continue;
      const pixel = {
        x: rendered.x + x * pixelWidth,
        y: rendered.y + y * pixelHeight,
        width: pixelWidth,
        height: pixelHeight,
      };
      const covered = intersection(overlap, pixel);
      if (covered !== null) area += covered.width * covered.height;
    }
  }
  return area;
}
