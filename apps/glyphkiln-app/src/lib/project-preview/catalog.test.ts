import { describe, expect, it } from "vitest";

import corePackage from "@glyphkiln/core/package.json";
import {
  DESIGN_DOCUMENT_VERSION,
  DEVELOPMENT_FONT_SHA256,
  FORMAT_IDS,
  FORMAT_REGISTRY,
  MANIFEST_VERSION,
  PROCEDURAL_ALGORITHM_VERSIONS,
  PROCEDURAL_STYLE_IDS,
  PRODUCT_CLAIM,
  RENDERER_NAME,
  RENDERER_VERSION,
  RENDER_CONFIGURATION,
  TEMPLATE_REGISTRY,
} from "@glyphkiln/core";

import { PREVIEW_TEMPLATE_IDS, createPreviewCatalog } from "./catalog";

describe("createPreviewCatalog", () => {
  it("exposes every Core format without changing its dimensions or label", () => {
    const catalog = createPreviewCatalog();

    expect(catalog.formats).toEqual(
      FORMAT_IDS.map((id) => ({
        id,
        ...FORMAT_REGISTRY[id],
      })),
    );
  });

  it("exposes every resource-free preview template with exact Core constraints", () => {
    const catalog = createPreviewCatalog();

    expect(catalog.templates.map((template) => template.id)).toEqual(
      PREVIEW_TEMPLATE_IDS,
    );
    for (const templateId of PREVIEW_TEMPLATE_IDS) {
      const template = catalog.templates.find(
        (candidate) => candidate.id === templateId,
      );

      expect(template).toMatchObject({
        id: templateId,
        version: TEMPLATE_REGISTRY[templateId].version,
        supportedFormats: TEMPLATE_REGISTRY[templateId].supportedFormats,
        requiredLayers: TEMPLATE_REGISTRY[templateId].requiredLayers,
        description: TEMPLATE_REGISTRY[templateId].constraints.layout,
      });
    }
  });

  it("does not expose Core templates that require selected asset bytes", () => {
    const catalog = createPreviewCatalog();

    expect(catalog.templates).not.toContainEqual(
      expect.objectContaining({ id: "image-led-campaign" }),
    );
    expect(TEMPLATE_REGISTRY["image-led-campaign"].requiredAssetFits).toEqual([
      { layerType: "image", fit: "cover" },
      { layerType: "logo", fit: "contain" },
    ]);
  });

  it("exposes every procedural style with its exact algorithm version", () => {
    const catalog = createPreviewCatalog();

    expect(catalog.proceduralStyles.map((style) => style.id)).toEqual(
      PROCEDURAL_STYLE_IDS,
    );
    expect(
      Object.fromEntries(
        catalog.proceduralStyles.map((style) => [style.id, style.version]),
      ),
    ).toEqual(PROCEDURAL_ALGORITHM_VERSIONS);
  });

  it("reports the exact Core schema, package, renderer, font, and product claim", () => {
    expect(createPreviewCatalog()).toMatchObject({
      schemaVersion: DESIGN_DOCUMENT_VERSION,
      manifestVersion: MANIFEST_VERSION,
      coreVersion: corePackage.version,
      renderer: {
        name: RENDERER_NAME,
        version: RENDERER_VERSION,
      },
      developmentFontSha256: DEVELOPMENT_FONT_SHA256,
      productClaim: PRODUCT_CLAIM,
      rendererConfiguration: RENDER_CONFIGURATION,
    });
  });
});
