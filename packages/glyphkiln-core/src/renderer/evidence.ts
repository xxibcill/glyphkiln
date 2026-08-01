import type { Bounds } from "../domain/types.js";
import type { FocalPoint, ImageTreatmentId } from "../schema/index.js";
import type { FocalCropGeometry } from "../assets/focal-crop.js";
import type { IMAGE_CONTRAST_POLICY_VERSION } from "../assets/image-policy.js";

export const RENDER_EVIDENCE_VERSION = "1.0.0" as const;

export type TextBoundsEvidence = {
  layerId: string;
  bounds: Bounds;
  lineCount: number;
  maximumLines: number;
  overflow: boolean;
};

export type ImageCropEvidence = {
  layerId: string;
  assetId: string;
  treatment: ImageTreatmentId;
  focalPoint: FocalPoint;
  policyVersion: FocalCropGeometry["policyVersion"];
  destinationBounds: Bounds;
  sourceBounds: Bounds;
  renderedBounds: Bounds;
};

export type ContrastSampleEvidence = {
  canvasPoint: { x: number; y: number };
  sourcePixel: { x: number; y: number };
  background: string;
  ratio: number;
};

export type ContrastEvidence = {
  layerId: string;
  policyVersion: typeof IMAGE_CONTRAST_POLICY_VERSION;
  foreground: string;
  minimumRequired: number;
  minimumRatio: number;
  maximumRatio: number;
  samples: ContrastSampleEvidence[];
};

export type RenderEvidence = {
  version: typeof RENDER_EVIDENCE_VERSION;
  safeArea: Bounds;
  text: TextBoundsEvidence[];
  crops: ImageCropEvidence[];
  contrast: ContrastEvidence[];
};

export function createRenderEvidence(safeArea: Bounds): RenderEvidence {
  return {
    version: RENDER_EVIDENCE_VERSION,
    safeArea: { ...safeArea },
    text: [],
    crops: [],
    contrast: [],
  };
}
