import { PNG } from "pngjs";

import {
  GlyphkilnError,
  type ResolvedAsset,
  type ResolvedFont,
} from "../domain/types.js";
import type { FontRegistry } from "../fonts/index.js";
import { rasterizeSvg } from "../renderer/png.js";
import type { SceneKernel } from "../renderer/scene.js";
import { renderSceneToSvg } from "../renderer/svg.js";
import { analyzeCraft, type CraftReview } from "./analyze.js";
import { buildCraftModel, type CraftRaster } from "./model.js";
import type { CraftReviewThresholds } from "./policy.js";

export type CraftReviewOptions = {
  assets?: readonly ResolvedAsset[];
  fonts?: readonly ResolvedFont[];
  /** Override documented starting thresholds, such as the display width. */
  thresholds?: Partial<CraftReviewThresholds>;
  /**
   * Accent colors to budget, as #RRGGBB. Design documents default to the
   * brand snapshot accent; scenes have no implicit accent.
   */
  accentColors?: readonly string[];
};

const MAXIMUM_ACCENT_COLORS = 16;

export async function reviewSceneKernelCraft(
  scene: SceneKernel,
  fonts: FontRegistry,
  rasterFonts: readonly ResolvedFont[],
  accentColors: readonly string[],
  thresholds: CraftReviewThresholds,
): Promise<CraftReview> {
  const svg = renderSceneToSvg(scene);
  const raster = decodeRaster(await rasterizeSvg(svg, rasterFonts));
  const model = buildCraftModel({ scene, raster, fonts, accentColors });
  return analyzeCraft(model, thresholds);
}

function decodeRaster(bytes: Uint8Array): CraftRaster {
  const png = PNG.sync.read(Buffer.from(bytes), { checkCRC: true });
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function validateAccentColors(colors: unknown): string[] {
  if (
    !Array.isArray(colors) ||
    colors.length > MAXIMUM_ACCENT_COLORS ||
    colors.some(
      (color) => typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color),
    )
  ) {
    throw new GlyphkilnError(
      `Accent colors must be an array of at most ${MAXIMUM_ACCENT_COLORS} #RRGGBB strings.`,
      "INVALID_CRAFT_REVIEW_OPTIONS",
    );
  }
  return colors as string[];
}
