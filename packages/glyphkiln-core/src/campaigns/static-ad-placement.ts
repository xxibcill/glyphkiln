import { FORMAT_REGISTRY } from "../formats/index.js";
import type { Bounds, QualityIssue } from "../domain/types.js";
import type { RenderEvidence } from "../renderer/evidence.js";

export const STATIC_AD_PLACEMENT_VERSION = "1.0.0" as const;
export const STATIC_AD_FORMATS = [
  "instagram-square",
  "instagram-portrait",
  "instagram-story",
  "linkedin-landscape",
] as const;
export type StaticAdFormat = (typeof STATIC_AD_FORMATS)[number];
export const STATIC_AD_TEMPLATE_IDS = [
  "product-announcement",
  "benefit-proof",
  "testimonial-evidence",
  "comparison",
  "problem-solution",
  "offer-urgency",
] as const;
export type StaticAdTemplateId = (typeof STATIC_AD_TEMPLATE_IDS)[number];

export type StaticAdPlacementReview = {
  version: typeof STATIC_AD_PLACEMENT_VERSION;
  format: StaticAdFormat;
  dimensions: { width: number; height: number };
  safeArea: Bounds;
  previewWidth: 360;
  minimumTextPixels: 12;
  policy: "glyphkiln-advisory";
  issues: {
    code: "SAFE_ZONE" | "SMALL_TEXT" | "OVERFLOW" | "QUALITY" | "MISSING_EVIDENCE";
    layerId?: string;
    message: string;
  }[];
};

export function isStaticAdFormat(format: string): format is StaticAdFormat {
  return STATIC_AD_FORMATS.some((candidate) => candidate === format);
}

/** Review-only policy: never alters a document or the renderer's output. */
export function reviewStaticAdPlacement(
  format: StaticAdFormat,
  evidence: RenderEvidence,
  qualityIssues: readonly QualityIssue[] = [],
): StaticAdPlacementReview {
  const { width, height } = FORMAT_REGISTRY[format];
  const story = format === "instagram-story";
  const safeArea = {
    x: width * 0.05,
    y: height * (story ? 0.14 : 0.05),
    width: width * 0.9,
    height: height * (story ? 0.66 : 0.9),
  };
  const issues: StaticAdPlacementReview["issues"] = [];
  if (evidence.text.length === 0)
    issues.push({
      code: "MISSING_EVIDENCE",
      message: "No text evidence is available; readability has not been checked.",
    });
  for (const text of evidence.text) {
    const { bounds } = text;
    if (
      bounds.x < safeArea.x ||
      bounds.y < safeArea.y ||
      bounds.x + bounds.width > safeArea.x + safeArea.width ||
      bounds.y + bounds.height > safeArea.y + safeArea.height
    )
      issues.push({
        code: "SAFE_ZONE",
        layerId: text.layerId,
        message:
          "Text enters the advisory placement overlay; review it in the target placement.",
      });
    if ((text.fontSize * 360) / width < 12)
      issues.push({
        code: "SMALL_TEXT",
        layerId: text.layerId,
        message: "Text is smaller than 12 px at a 360 px viewing width.",
      });
    if (text.overflow)
      issues.push({
        code: "OVERFLOW",
        layerId: text.layerId,
        message: "Text exceeds its layout box.",
      });
  }
  for (const issue of qualityIssues)
    issues.push({
      code: "QUALITY",
      ...(issue.layerId === undefined ? {} : { layerId: issue.layerId }),
      message: issue.message,
    });
  return {
    version: STATIC_AD_PLACEMENT_VERSION,
    format,
    dimensions: { width, height },
    safeArea,
    previewWidth: 360,
    minimumTextPixels: 12,
    policy: "glyphkiln-advisory",
    issues,
  };
}
