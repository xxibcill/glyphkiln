import { GlyphkilnError, type Bounds, type Dimensions } from "../domain/types.js";
import type { FocalPoint } from "../schema/index.js";

export const FOCAL_CROP_POLICY_VERSION = "focal-cover-v1" as const;

export type FocalCropGeometry = {
  policyVersion: typeof FOCAL_CROP_POLICY_VERSION;
  focalPoint: FocalPoint;
  destinationBounds: Bounds;
  sourceBounds: Bounds;
  renderedBounds: Bounds;
  scale: number;
};

export function calculateFocalCrop(input: {
  source: Dimensions;
  destination: Bounds;
  focalPoint: FocalPoint;
}): FocalCropGeometry {
  assertPositiveDimensions(input.source, "source");
  assertPositiveDimensions(input.destination, "destination");
  assertFiniteDestinationOrigin(input.destination);
  assertFocalPoint(input.focalPoint);

  const scale = Math.max(
    input.destination.width / input.source.width,
    input.destination.height / input.source.height,
  );
  const visibleWidth = input.destination.width / scale;
  const visibleHeight = input.destination.height / scale;
  const sourceX = clamp(
    input.focalPoint.x * input.source.width - visibleWidth / 2,
    0,
    input.source.width - visibleWidth,
  );
  const sourceY = clamp(
    input.focalPoint.y * input.source.height - visibleHeight / 2,
    0,
    input.source.height - visibleHeight,
  );

  return {
    policyVersion: FOCAL_CROP_POLICY_VERSION,
    focalPoint: { ...input.focalPoint },
    destinationBounds: { ...input.destination },
    sourceBounds: {
      x: sourceX,
      y: sourceY,
      width: visibleWidth,
      height: visibleHeight,
    },
    renderedBounds: {
      x: input.destination.x - sourceX * scale,
      y: input.destination.y - sourceY * scale,
      width: input.source.width * scale,
      height: input.source.height * scale,
    },
    scale,
  };
}

function assertPositiveDimensions(value: Dimensions, label: string): void {
  if (
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height) ||
    value.width <= 0 ||
    value.height <= 0
  ) {
    throw new GlyphkilnError(
      `Focal crop ${label} dimensions must be finite and positive.`,
      "INVALID_FOCAL_CROP_GEOMETRY",
      { label, value },
    );
  }
}

function assertFiniteDestinationOrigin(value: Bounds): void {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new GlyphkilnError(
      "Focal crop destination origin must be finite.",
      "INVALID_FOCAL_CROP_GEOMETRY",
      { label: "destination", value },
    );
  }
}

function assertFocalPoint(value: FocalPoint): void {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    value.x < 0 ||
    value.x > 1 ||
    value.y < 0 ||
    value.y > 1
  ) {
    throw new GlyphkilnError(
      "Focal point coordinates must be finite normalized values.",
      "INVALID_FOCAL_POINT",
      { value },
    );
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
