import { GlyphkilnError } from "../domain/types.js";
import type { LegacyImageTreatmentId, LocalImageTreatmentId } from "../schema/index.js";

export const IMAGE_TREATMENT_POLICY_VERSION = "image-treatment-v1" as const;
export const IMAGE_CONTRAST_POLICY_VERSION = "composited-srgb-grid-5x5-v1" as const;

export const IMAGE_TREATMENTS = Object.freeze({
  none: Object.freeze({ color: "#000000", opacity: 0 }),
  "dark-scrim": Object.freeze({ color: "#000000", opacity: 0.56 }),
  "light-scrim": Object.freeze({ color: "#FFFFFF", opacity: 0.78 }),
} satisfies Record<LegacyImageTreatmentId, { color: string; opacity: number }>);

/**
 * Local treatments (DesignDocument 1.7.0) darken or lighten only a feathered
 * field behind copy and never inside a declared subject region. Only template
 * versions that pin this policy accept them; older templates reject them.
 */
export const LOCAL_IMAGE_TREATMENT_POLICY_VERSION = "local-copy-scrim-v1" as const;

export const LOCAL_IMAGE_TREATMENTS = Object.freeze({
  "local-dark-scrim": Object.freeze({ color: "#000000", opacity: 0.6, steps: 24 }),
  "local-light-scrim": Object.freeze({ color: "#FFFFFF", opacity: 0.8, steps: 24 }),
} satisfies Record<
  LocalImageTreatmentId,
  { color: string; opacity: number; steps: number }
>);

/** Color and opacity a treatment composites over the image where copy sits. */
export function treatmentFill(id: LegacyImageTreatmentId | LocalImageTreatmentId): {
  color: string;
  opacity: number;
} {
  return id in LOCAL_IMAGE_TREATMENTS
    ? LOCAL_IMAGE_TREATMENTS[id as LocalImageTreatmentId]
    : IMAGE_TREATMENTS[id as LegacyImageTreatmentId];
}

/**
 * Legacy templates composite one global treatment. Local treatments never
 * reach them: checkTemplateRequirements rejects them first. This guard keeps
 * that rule explicit if a caller bypasses the check.
 */
export function legacyTreatment(id: LegacyImageTreatmentId | LocalImageTreatmentId): {
  color: string;
  opacity: number;
} {
  if (id in LOCAL_IMAGE_TREATMENTS) {
    throw new GlyphkilnError(
      `Image treatment "${id}" needs a template version with local treatments.`,
      "IMAGE_TREATMENT_UNSUPPORTED",
      { treatment: id },
    );
  }
  return IMAGE_TREATMENTS[id as LegacyImageTreatmentId];
}
