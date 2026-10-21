import { prepareSceneForReview } from "../scene/render.js";
import { resolveCraftThresholds, type CraftReview } from "./analyze.js";
import {
  reviewSceneKernelCraft,
  validateAccentColors,
  type CraftReviewOptions,
} from "./review.js";

/**
 * Advisory craft review of a Scene Kernel document. It resolves and
 * rasterizes the scene exactly as renderScene does, produces no output files,
 * and never changes output bytes, manifests, or fingerprints.
 */
export async function reviewSceneCraft(
  input: unknown,
  options: CraftReviewOptions = {},
): Promise<CraftReview> {
  const thresholds = resolveCraftThresholds(options.thresholds);
  const accentColors = validateAccentColors(options.accentColors ?? []);
  const { scene, fonts, rasterFonts } = prepareSceneForReview(input, options);
  return reviewSceneKernelCraft(scene, fonts, rasterFonts, accentColors, thresholds);
}
