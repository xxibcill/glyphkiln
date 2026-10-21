import { GlyphkilnError } from "../domain/types.js";
import { prepareGraphicScene } from "../renderer/index.js";
import { validateDesignDocument } from "../schema/index.js";
import { resolveCraftThresholds, type CraftReview } from "./analyze.js";
import {
  reviewSceneKernelCraft,
  validateAccentColors,
  type CraftReviewOptions,
} from "./review.js";

/**
 * Advisory craft review of a design document. It renders the same scene and
 * PNG pixels as renderGraphic, produces no output files, and never changes
 * output bytes, manifests, or fingerprints.
 */
export async function reviewGraphicCraft(
  input: unknown,
  options: CraftReviewOptions = {},
): Promise<CraftReview> {
  const thresholds = resolveCraftThresholds(options.thresholds);
  const validation = validateDesignDocument(input);
  if (!validation.success) {
    throw new GlyphkilnError(
      "Design document validation failed.",
      "INVALID_DESIGN_DOCUMENT",
      { problems: validation.problems },
    );
  }
  const document = validation.data;
  const accentColors = validateAccentColors(
    options.accentColors ?? [document.brand.palette.accent],
  );
  const { templateResult, fonts } = prepareGraphicScene(document, options);
  return reviewSceneKernelCraft(
    templateResult.scene,
    fonts,
    fonts.list(),
    accentColors,
    thresholds,
  );
}

export type { CraftReviewOptions } from "./review.js";
