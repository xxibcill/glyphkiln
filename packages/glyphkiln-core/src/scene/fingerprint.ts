import { hashCanonical } from "../cache/canonical.js";
import { RENDER_CONFIGURATION } from "../cache/fingerprint-contract.js";
import {
  LEGACY_RENDERER_VERSION,
  RENDERER_NAME,
  RENDERER_VERSION,
  type OutputFormat,
} from "../domain/types.js";
import { M1_TYPOGRAPHY_POLICY } from "../typography/typesetter.js";
import { canonicalJson } from "../cache/canonical-json.js";
import { fontReferenceKey } from "../fonts/key.js";
import type { ManifestAsset, ManifestFont } from "../provenance/index.js";
import type { SceneDocument } from "./types.js";

export const SCENE_KERNEL_VERSION = "1.0.0" as const;

export const SCENE_RENDER_CONFIGURATION = Object.freeze({
  ...RENDER_CONFIGURATION,
  sceneKernelVersion: SCENE_KERNEL_VERSION,
  connectorArrowGeometry: "closed-triangle-v1",
  selectableTextTechnique: "transparent-live-text-over-outlines-v1",
});

/** Scene 1.1.0 renders: the M1 typography policy joins the configuration. */
export const SCENE_M1_RENDER_CONFIGURATION = Object.freeze({
  ...SCENE_RENDER_CONFIGURATION,
  typographyPolicy: Object.freeze({
    ...SCENE_RENDER_CONFIGURATION.typographyPolicy,
    m1: M1_TYPOGRAPHY_POLICY,
  }),
});

export type SceneFingerprintInput = {
  document: SceneDocument;
  outputFormat: OutputFormat;
  assets: readonly ManifestAsset[];
  fonts: readonly ManifestFont[];
};

export function createSceneFingerprint(input: SceneFingerprintInput): string {
  return hashCanonical(createSceneFingerprintPayload(input));
}

export function createSceneFingerprintPayload(input: SceneFingerprintInput) {
  const usedAssetIds = new Set(input.assets.map((asset) => asset.id));
  const usedFontKeys = new Set(
    input.fonts.map((font) => fontReferenceKey(font.family, font.weight, font.style)),
  );
  const usedAssets = input.document.assets
    .filter((asset) => usedAssetIds.has(asset.id))
    .map((asset) => ({
      id: asset.id,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
    }))
    .sort(compareCanonical);
  const usedFonts = input.document.fonts
    .filter((font) =>
      usedFontKeys.has(fontReferenceKey(font.family, font.weight, font.style)),
    )
    .map((font) => ({
      family: font.family,
      weight: font.weight,
      style: font.style,
      sha256: font.sha256,
    }))
    .sort(compareCanonical);
  const pixelDocument = {
    ...Object.fromEntries(
      Object.entries(input.document).filter(
        ([key]) =>
          key !== "id" && key !== "metadata" && key !== "assets" && key !== "fonts",
      ),
    ),
    assets: usedAssets,
    fonts: usedFonts,
  };
  const legacy = input.document.schemaVersion === "1.0.0";
  return {
    sceneDocument: pixelDocument,
    sceneKernelVersion: SCENE_KERNEL_VERSION,
    renderer: {
      name: RENDERER_NAME,
      version: legacy ? LEGACY_RENDERER_VERSION : RENDERER_VERSION,
    },
    assets: input.assets
      .map((asset) => ({ id: asset.id, sha256: asset.sha256 }))
      .sort(compareCanonical),
    fonts: [...input.fonts].sort(compareCanonical),
    outputFormat: input.outputFormat,
    rendererConfiguration: legacy
      ? SCENE_RENDER_CONFIGURATION
      : SCENE_M1_RENDER_CONFIGURATION,
  };
}

function compareCanonical(left: unknown, right: unknown): number {
  const leftJson = canonicalJson(left);
  const rightJson = canonicalJson(right);
  return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
}
