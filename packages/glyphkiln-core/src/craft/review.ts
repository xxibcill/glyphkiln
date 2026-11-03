import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

import {
  GlyphkilnError,
  type ResolvedAsset,
  type ResolvedFont,
} from "../domain/types.js";
import type { FontRegistry } from "../fonts/index.js";
import { RENDER_RESOURCE_LIMITS, RENDER_WORKER_PROFILE } from "../resources/index.js";
import { rasterizeSvg } from "../renderer/png.js";
import type { SceneKernel, SceneKernelElement } from "../renderer/scene.js";
import { renderSceneToSvg } from "../renderer/svg.js";
import { analyzeCraft, type CraftReview } from "./analyze.js";
import { buildCraftModel, type CraftImageDecoder, type CraftRaster } from "./model.js";
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
  /**
   * Scene element IDs of brand marks to check for visibility. Design
   * documents default to their visible logo layers; scenes have none.
   */
  markIds?: readonly string[];
};

const MAXIMUM_ACCENT_COLORS = 16;

export async function reviewSceneKernelCraft(
  scene: SceneKernel,
  fonts: FontRegistry,
  rasterFonts: readonly ResolvedFont[],
  accentColors: readonly string[],
  thresholds: CraftReviewThresholds,
  markIds: readonly string[] = [],
): Promise<CraftReview> {
  const svg = renderSceneToSvg(scene);
  const raster = decodeRaster(await rasterizeSvg(svg, rasterFonts));
  const known = collectElementIds(scene.elements);
  const unknown = markIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new GlyphkilnError(
      "Mark IDs must refer to scene elements.",
      "INVALID_CRAFT_REVIEW_OPTIONS",
      { unknown },
    );
  }
  const markBackground =
    markIds.length === 0
      ? null
      : decodeRaster(
          await rasterizeSvg(
            renderSceneToSvg({
              ...scene,
              elements: withoutElements(scene.elements, new Set(markIds)),
            }),
            rasterFonts,
          ),
        );
  const model = buildCraftModel({
    scene,
    raster,
    fonts,
    accentColors,
    markIds,
    markBackground,
    decodeImage: createCraftImageDecoder(),
  });
  return analyzeCraft(model, thresholds);
}

const DATA_URI = /^data:(image\/png|image\/jpeg);base64,([a-zA-Z0-9+/]+=*)$/;

/**
 * Decodes the embedded PNG or JPEG data URIs the serializer accepts. Repeated
 * hrefs decode once; anything else, or a decode failure, yields null so the
 * image is simply not color-reviewed.
 */
export function createCraftImageDecoder(): CraftImageDecoder {
  const cache = new Map<string, CraftRaster | null>();
  return (href) => {
    const cached = cache.get(href);
    if (cached !== undefined) return cached;
    const match = DATA_URI.exec(href);
    let raster: CraftRaster | null = null;
    if (match !== null) {
      try {
        const bytes = Buffer.from(match[2]!, "base64");
        if (match[1] === "image/png") {
          raster = decodeRaster(bytes);
        } else {
          const decoded = decodeJpeg(bytes, {
            useTArray: true,
            formatAsRGBA: true,
            maxResolutionInMP: Math.ceil(
              RENDER_RESOURCE_LIMITS.maxAssetPixels / 1_000_000,
            ),
            maxMemoryUsageInMB:
              RENDER_WORKER_PROFILE.nodeResourceLimits.maxOldGenerationSizeMb,
          });
          raster = {
            width: decoded.width,
            height: decoded.height,
            data: new Uint8Array(decoded.data),
          };
        }
      } catch {
        raster = null;
      }
    }
    cache.set(href, raster);
    return raster;
  };
}

function collectElementIds(elements: readonly SceneKernelElement[]): Set<string> {
  const ids = new Set<string>();
  for (const element of elements) {
    ids.add(element.id);
    if (element.type === "group") {
      for (const id of collectElementIds(element.elements)) ids.add(id);
    }
  }
  return ids;
}

function withoutElements<T extends SceneKernelElement>(
  elements: readonly T[],
  removed: ReadonlySet<string>,
): T[] {
  return elements
    .filter((element) => !removed.has(element.id))
    .map((element) =>
      element.type === "group"
        ? { ...element, elements: withoutElements(element.elements, removed) }
        : element,
    );
}

function decodeRaster(bytes: Uint8Array): CraftRaster {
  const png = PNG.sync.read(Buffer.from(bytes), { checkCRC: true });
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function validateMarkIds(ids: unknown): string[] {
  if (
    !Array.isArray(ids) ||
    ids.length > MAXIMUM_ACCENT_COLORS ||
    ids.some((id) => typeof id !== "string" || id.length === 0 || id.length > 200)
  ) {
    throw new GlyphkilnError(
      `Mark IDs must be an array of at most ${MAXIMUM_ACCENT_COLORS} element IDs.`,
      "INVALID_CRAFT_REVIEW_OPTIONS",
    );
  }
  return [...new Set(ids as string[])];
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
