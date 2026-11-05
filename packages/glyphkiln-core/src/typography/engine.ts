import type { FontRegistry } from "../fonts/index.js";
import {
  HARFBUZZ_SHAPER_IDENTITY,
  loadHarfBuzzShaper,
  loadedHarfBuzzShaper,
} from "../fonts/harfbuzz.js";
import type { FontModel } from "./font-model.js";
import { M1Typesetter } from "./typesetter.js";
import type { OpenTypeFeatureMap } from "../fonts/index.js";

/**
 * Load the M1 typography engine (HarfBuzz, ADR 0019) once per process.
 * `renderGraphic` and `renderScene` do this themselves when a template or
 * scene needs it; synchronous entry points (inspection, review) need it
 * loaded first and fail with `TYPOGRAPHY_ENGINE_NOT_LOADED` otherwise.
 * Legacy templates and Scene 1.0.0 never load it.
 */
export async function loadTypographyEngine(): Promise<typeof HARFBUZZ_SHAPER_IDENTITY> {
  await loadHarfBuzzShaper();
  return HARFBUZZ_SHAPER_IDENTITY;
}

export function createTypesetter(input: {
  registry: FontRegistry;
  model: FontModel;
  shortSidePx: number;
  layerId: string;
  requestedFeatures?: OpenTypeFeatureMap;
}): M1Typesetter {
  return new M1Typesetter({
    registry: input.registry,
    shaper: loadedHarfBuzzShaper(),
    model: input.model,
    shortSidePx: input.shortSidePx,
    layerId: input.layerId,
    ...(input.requestedFeatures === undefined
      ? {}
      : { requestedFeatures: input.requestedFeatures }),
  });
}
