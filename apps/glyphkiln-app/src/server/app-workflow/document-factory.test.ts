import { describe, expect, it } from "vitest";

import { DESIGN_DOCUMENT_VERSION } from "@glyphkiln/core";
import type { BrandSnapshot, DesignLayer } from "@glyphkiln/core";

import { constructManualDocument } from "./document-factory";

describe("constructManualDocument", () => {
  it("resolves trusted template, brand, font, and document identities server-side", () => {
    const result = constructManualDocument({
      documentId: "design_trusted",
      brand: brandSnapshot(),
      draft: {
        templateId: "quote-card",
        format: "instagram-square",
        seed: "manual-seed",
        mode: "light",
        layers: quoteLayers(),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid manual document.");
    expect(result.document).toMatchObject({
      schemaVersion: DESIGN_DOCUMENT_VERSION,
      id: "design_trusted",
      template: { id: "quote-card", version: "1.1.0" },
      brand: { snapshotId: "brand_kit_trusted", version: "1.0.3" },
      assets: [],
      metadata: { source: "glyphkiln-app-manual" },
    });
    expect(result.document.fonts).toHaveLength(5);
    expect(
      result.document.fonts.every(
        (font) => font.family === "Inter" && font.sha256?.length === 64,
      ),
    ).toBe(true);
  });

  it("returns Core path-aware validation problems for invalid inert layers", () => {
    const invalidLayer = {
      id: "headline",
      type: "headline",
      visible: true,
      text: "",
    } as DesignLayer;
    const result = constructManualDocument({
      documentId: "design_invalid",
      brand: brandSnapshot(),
      draft: {
        templateId: "quote-card",
        format: "instagram-square",
        seed: "manual-seed",
        mode: "light",
        layers: [invalidLayer],
      },
    });

    expect(result).toMatchObject({
      ok: false,
      problems: [{ path: "layers[0].text" }],
    });
  });

  it("orders user-controlled Unicode font families without host locale collation", () => {
    const resourceVersions = {
      assets: [],
      fonts: [fontVersion("font-z", "z"), fontVersion("font-a-umlaut", "ä")],
    };
    const result = constructManualDocument({
      documentId: "design_unicode_fonts",
      brand: brandSnapshot(),
      draft: {
        templateId: "quote-card",
        format: "instagram-square",
        seed: "manual-seed",
        mode: "light",
        layers: quoteLayers(),
      },
      fonts: resourceVersions.fonts.map((font) => ({
        family: font.family,
        weight: font.weight,
        style: font.style,
        sha256: font.sha256,
      })),
      resourceVersions,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid manual document.");
    expect(result.document.fonts.slice(-2).map((font) => font.family)).toEqual([
      "z",
      "ä",
    ]);
    expect(result.document.metadata).toMatchObject({
      resourceVersions: {
        fonts: [{ family: "z" }, { family: "ä" }],
      },
    });
  });
});

function fontVersion(id: string, family: string) {
  return {
    id,
    family,
    weight: 400,
    style: "normal" as const,
    sha256: id === "font-z" ? "a".repeat(64) : "b".repeat(64),
    origin: { kind: "licensed-library" as const },
    license: { status: "licensed" as const, identifier: `${id}-license` },
  };
}

function brandSnapshot(): BrandSnapshot {
  return {
    snapshotId: "brand_kit_trusted",
    version: "1.0.3",
    name: "Trusted brand",
    palette: {
      primary: "#A4462A",
      secondary: "#47665C",
      accent: "#A4462A",
      neutrals: ["#F4EEDF", "#262119"],
    },
    themes: {
      light: {
        background: "#F4EEDF",
        surface: "#FBF8F0",
        text: "#262119",
        mutedText: "#665E51",
      },
      dark: {
        background: "#262119",
        surface: "#342E25",
        text: "#F4EEDF",
        mutedText: "#C8BCAA",
      },
    },
    typography: {
      headlineFamily: "Inter",
      bodyFamily: "Inter",
      monospaceFamily: "Inter",
    },
    spacingScale: [4, 8, 12, 16, 24, 32],
    borderRadii: [0, 12, 24],
    visualDensity: "balanced",
    preferredProceduralStyles: ["layered-waves"],
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    prohibitedColors: [],
    prohibitedStyles: [],
  };
}

function quoteLayers(): DesignLayer[] {
  return [
    { id: "background", type: "background", visible: true },
    {
      id: "procedure",
      type: "procedural-decoration",
      visible: true,
      style: "layered-waves",
      intensity: 0.5,
      density: 0.5,
      complexity: 0.5,
      contrast: 0.4,
      quietRegion: { x: 0.05, y: 0.1, width: 0.7, height: 0.7 },
    },
    {
      id: "quote",
      type: "headline",
      visible: true,
      text: "Persist the exact contract.",
    },
    {
      id: "attribution",
      type: "attribution",
      visible: true,
      text: "Glyphkiln",
    },
  ];
}
