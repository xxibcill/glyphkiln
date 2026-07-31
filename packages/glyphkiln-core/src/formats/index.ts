import type { Dimensions } from "../domain/types.js";

export const FORMAT_REGISTRY = {
  "linkedin-landscape": {
    width: 1200,
    height: 627,
    label: "LinkedIn landscape",
  },
  "instagram-square": {
    width: 1080,
    height: 1080,
    label: "Instagram square",
  },
  "instagram-portrait": {
    width: 1080,
    height: 1350,
    label: "Instagram portrait",
  },
  "instagram-story": {
    width: 1080,
    height: 1920,
    label: "Instagram story",
  },
  "tiktok-carousel": {
    width: 1080,
    height: 1920,
    label: "TikTok carousel (9:16)",
  },
  "x-landscape": {
    width: 1200,
    height: 675,
    label: "X landscape (16:9)",
  },
  "youtube-thumbnail": {
    width: 1280,
    height: 720,
    label: "YouTube thumbnail",
  },
} as const;

export type FormatId = keyof typeof FORMAT_REGISTRY;

export const FORMAT_IDS = Object.freeze(Object.keys(FORMAT_REGISTRY) as FormatId[]);

export function getFormatDimensions(format: FormatId): Dimensions {
  const entry = FORMAT_REGISTRY[format];
  return { width: entry.width, height: entry.height };
}
