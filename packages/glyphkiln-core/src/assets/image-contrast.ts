import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

import type { Bounds, ResolvedAsset } from "../domain/types.js";
import { contrastRatio } from "../layout/index.js";
import type { ImageTreatmentId } from "../schema/index.js";
import type { ContrastEvidence } from "../renderer/evidence.js";
import type { FocalCropGeometry } from "./focal-crop.js";
import { IMAGE_CONTRAST_POLICY_VERSION, IMAGE_TREATMENTS } from "./image-policy.js";

const SAMPLE_GRID_SIZE = 5;
const MINIMUM_CONTRAST_RATIO = 4.5;

export type ContrastRaster = {
  width: number;
  height: number;
  data: Uint8Array;
};

export function inspectImageTextContrast(input: {
  layerId: string;
  raster: ContrastRaster;
  crop: FocalCropGeometry;
  textBounds: Bounds;
  foreground: string;
  sceneBackground: string;
  treatment: ImageTreatmentId;
}): ContrastEvidence {
  const raster = input.raster;
  const treatment = IMAGE_TREATMENTS[input.treatment];
  const samples: ContrastEvidence["samples"] = [];

  for (let row = 0; row < SAMPLE_GRID_SIZE; row += 1) {
    for (let column = 0; column < SAMPLE_GRID_SIZE; column += 1) {
      const canvasX =
        input.textBounds.x +
        (input.textBounds.width * (column + 0.5)) / SAMPLE_GRID_SIZE;
      const canvasY =
        input.textBounds.y + (input.textBounds.height * (row + 0.5)) / SAMPLE_GRID_SIZE;
      const sourceX = clamp(
        Math.floor(
          ((canvasX - input.crop.renderedBounds.x) / input.crop.renderedBounds.width) *
            raster.width,
        ),
        0,
        raster.width - 1,
      );
      const sourceY = clamp(
        Math.floor(
          ((canvasY - input.crop.renderedBounds.y) / input.crop.renderedBounds.height) *
            raster.height,
        ),
        0,
        raster.height - 1,
      );
      const offset = (sourceY * raster.width + sourceX) * 4;
      const source = {
        red: raster.data[offset]!,
        green: raster.data[offset + 1]!,
        blue: raster.data[offset + 2]!,
        alpha: raster.data[offset + 3]! / 255,
      };
      const sourceOverScene = composite(source, parseHex(input.sceneBackground));
      const composed = composite(
        { ...parseHex(treatment.color), alpha: treatment.opacity },
        sourceOverScene,
      );
      const background = toHex(composed);
      samples.push({
        canvasPoint: { x: round(canvasX), y: round(canvasY) },
        sourcePixel: { x: sourceX, y: sourceY },
        background,
        ratio: contrastRatio(input.foreground, background),
      });
    }
  }

  const ratios = samples.map((sample) => sample.ratio);
  return {
    layerId: input.layerId,
    policyVersion: IMAGE_CONTRAST_POLICY_VERSION,
    foreground: input.foreground,
    minimumRequired: MINIMUM_CONTRAST_RATIO,
    minimumRatio: Math.min(...ratios),
    maximumRatio: Math.max(...ratios),
    samples,
  };
}

export function decodeRasterForContrast(asset: ResolvedAsset): ContrastRaster {
  if (asset.mimeType === "image/png") {
    const decoded = PNG.sync.read(Buffer.from(asset.bytes), { checkCRC: true });
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  const decoded = decodeJpeg(asset.bytes, {
    useTArray: true,
    formatAsRGBA: true,
  });
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

function parseHex(value: string): { red: number; green: number; blue: number } {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}

function composite(
  foreground: { red: number; green: number; blue: number; alpha: number },
  background: { red: number; green: number; blue: number },
): { red: number; green: number; blue: number } {
  return {
    red: Math.round(
      foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    ),
    green: Math.round(
      foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    ),
    blue: Math.round(
      foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    ),
  };
}

function toHex(color: { red: number; green: number; blue: number }): string {
  return `#${[color.red, color.green, color.blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
