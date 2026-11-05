import { prepareSceneForReview } from "../scene/render.js";
import { LEGACY_SCENE_DOCUMENT_VERSION } from "../scene/types.js";
import { loadTypographyEngine } from "../typography/engine.js";
import { resolveCraftThresholds, type CraftReview } from "./analyze.js";
import {
  reviewSceneKernelCraft,
  validateAccentColors,
  validateMarkIds,
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
  const markIds = validateMarkIds(options.markIds ?? []);
  // Scene 1.1.0 text is set on the M1 typography, as in renderScene.
  if (usesM1Typography(input)) await loadTypographyEngine();
  const { scene, fonts, rasterFonts } = prepareSceneForReview(input, options);
  return reviewSceneKernelCraft(
    scene,
    fonts,
    rasterFonts,
    accentColors,
    thresholds,
    markIds,
  );
}

function usesM1Typography(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion !== LEGACY_SCENE_DOCUMENT_VERSION
  );
}
