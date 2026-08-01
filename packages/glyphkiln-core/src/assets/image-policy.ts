import type { ImageTreatmentId } from "../schema/index.js";

export const IMAGE_TREATMENT_POLICY_VERSION = "image-treatment-v1" as const;
export const IMAGE_CONTRAST_POLICY_VERSION = "composited-srgb-grid-5x5-v1" as const;

export const IMAGE_TREATMENTS = Object.freeze({
  none: Object.freeze({ color: "#000000", opacity: 0 }),
  "dark-scrim": Object.freeze({ color: "#000000", opacity: 0.56 }),
  "light-scrim": Object.freeze({ color: "#FFFFFF", opacity: 0.78 }),
} satisfies Record<ImageTreatmentId, { color: string; opacity: number }>);
