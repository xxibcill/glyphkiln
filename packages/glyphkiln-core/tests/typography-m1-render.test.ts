import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  GlyphkilnError,
  LEGACY_MANIFEST_VERSION,
  LEGACY_RENDERER_VERSION,
  MANIFEST_VERSION,
  RENDERER_VERSION,
  bundledFontFile,
  renderGraphic,
  type DesignDocument,
} from "../src/index.js";
import {
  LEGACY_SCENE_RENDER_MANIFEST_VERSION,
  SCENE_RENDER_MANIFEST_VERSION,
  renderScene,
  validateSceneDocument,
  verifySceneReproduction,
} from "../src/scene/index.js";

const TIMESTAMP = "2026-11-04T00:00:00.000Z";

function quoteDocument(): DesignDocument {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../../Deliverables/benchmarks/p1-craft-2026-10-b2/designs/quote.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as DesignDocument;
}

function asM1(document: DesignDocument): DesignDocument {
  return {
    ...document,
    schemaVersion: "1.8.0",
    template: { ...document.template, version: "1.4.0" },
  };
}

function declare(family: string, weight: number) {
  return {
    family,
    weight,
    style: "normal" as const,
    sha256: bundledFontFile(family, weight, "normal")!.sha256,
  };
}

describe("M1 template versions (Q1 provisional: opt in by new versions)", () => {
  it("leaves quote-card@1.3.0 exactly as before and records the legacy identity", async () => {
    const legacy = await renderGraphic(quoteDocument(), {
      formats: ["svg"],
      creationTimestamp: TIMESTAMP,
    });
    const manifest = legacy.outputs[0]!.manifest;
    expect(manifest.manifestVersion).toBe(LEGACY_MANIFEST_VERSION);
    expect(manifest.renderer.version).toBe(LEGACY_RENDERER_VERSION);
    expect("textStacks" in manifest).toBe(false);
    expect(Object.keys(manifest)).toEqual([
      "manifestVersion",
      "renderId",
      "renderFingerprint",
      "designDocumentId",
      "designDocumentHash",
      "seed",
      "template",
      "renderer",
      "typographyPolicy",
      "proceduralAlgorithmVersions",
      "assets",
      "fonts",
      "dimensions",
      "output",
      "creationTimestamp",
      "compositionGenerativeImageModelUsed",
      "includedGenerativeAssetUsed",
      "renderingMethod",
      "qualityIssues",
      "productClaim",
    ]);
  });

  it("sets quote-card@1.4.0 on HarfBuzz with font identity v2", async () => {
    const result = await renderGraphic(asM1(quoteDocument()), {
      formats: ["svg"],
      creationTimestamp: TIMESTAMP,
    });
    const manifest = result.outputs[0]!.manifest;
    expect(manifest.manifestVersion).toBe(MANIFEST_VERSION);
    expect(manifest.renderer.version).toBe(RENDERER_VERSION);
    if (manifest.manifestVersion !== "1.3.0")
      throw new Error("expected manifest 1.3.0");
    expect(manifest.typographyPolicy.m1.shaper).toEqual({
      id: "harfbuzzjs@1.6.4/harfbuzz@15.0.0",
      wasmSha256: "6eeed8e1bc9ad7773038e48ff8f9e07e0ad228572c594b45e5357e9c2f7a0b2e",
    });
    expect(manifest.typographyPolicy.m1.scriptRuns.version).toBe("script-runs@1.0.0");
    expect(manifest.fonts[0]).toMatchObject({
      family: "Inter",
      weight: 700,
      coordinates: { opsz: 32, wght: 700 },
      role: "primary",
      scripts: ["Latin"],
    });
    expect(manifest.textStacks.map((stack) => stack.layerId)).toEqual([
      "quote",
      "attribution",
    ]);
    const legacy = await renderGraphic(quoteDocument(), {
      formats: ["svg"],
      creationTimestamp: TIMESTAMP,
    });
    expect(result.outputs[0]!.bytes).not.toEqual(legacy.outputs[0]!.bytes);
    expect(result.outputs[0]!.fingerprint).not.toBe(legacy.outputs[0]!.fingerprint);
    const again = await renderGraphic(asM1(quoteDocument()), {
      formats: ["svg"],
      creationTimestamp: TIMESTAMP,
    });
    expect(again.outputs[0]!.bytes).toEqual(result.outputs[0]!.bytes);
  });

  it("rejects 1.8.0 font-model layer fields on versions that do not implement them", async () => {
    const document = quoteDocument();
    const upgraded = {
      ...document,
      schemaVersion: "1.8.0",
      layers: document.layers.map((layer) =>
        layer.id === "quote" ? { ...layer, opticalSizing: "none" } : layer,
      ),
    } as DesignDocument;
    const error: unknown = await renderGraphic(upgraded).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(GlyphkilnError);
    const issues = (error as GlyphkilnError).details?.["issues"] as {
      code: string;
      details?: { feature?: string };
    }[];
    expect(
      issues.some(
        (issue) =>
          issue.code === "TEMPLATE_FEATURE_UNSUPPORTED" &&
          issue.details?.feature === "fontModel",
      ),
    ).toBe(true);
    const m1 = asM1(upgraded);
    await expect(
      renderGraphic(m1, { creationTimestamp: TIMESTAMP }),
    ).resolves.toBeDefined();
  });

  it("sets a Thai quote through a role fallback stack and reports the stack tried", async () => {
    const document = asM1(quoteDocument());
    const brand = document.brand as { typography: object };
    brand.typography = {
      ...brand.typography,
      headlineFamily: "IBM Plex Sans",
      roles: {
        display: {
          family: "IBM Plex Sans",
          weight: 700,
          lineHeight: 1.1,
          tracking: 0,
          fallback: [{ family: "IBM Plex Sans Thai", scale: "auto" }],
        },
      },
    };
    document.fonts = [
      ...document.fonts,
      declare("IBM Plex Sans", 700),
      declare("IBM Plex Sans Thai", 700),
    ];
    document.layers = document.layers.map((layer) =>
      layer.id === "quote"
        ? { ...layer, text: "วางแผน AI Pilot ให้ชัด", emphasis: undefined }
        : layer,
    );
    const result = await renderGraphic(document, {
      formats: ["svg"],
      creationTimestamp: TIMESTAMP,
    });
    const manifest = result.outputs[0]!.manifest;
    if (manifest.manifestVersion !== "1.3.0")
      throw new Error("expected manifest 1.3.0");
    const quote = manifest.textStacks.find((stack) => stack.layerId === "quote")!;
    expect(quote.stack).toEqual(["IBM Plex Sans", "IBM Plex Sans Thai"]);
    const thai = manifest.fonts.find((face) => face.family === "IBM Plex Sans Thai")!;
    expect(thai.role).toBe("fallback");
    expect(thai.scripts).toEqual(["Thai"]);
    expect(thai.scale).not.toBe(1);

    // Without the fallback the Thai copy is a blocking MISSING_GLYPH.
    brand.typography = { ...brand.typography, roles: undefined };
    await expect(renderGraphic(document)).rejects.toBeInstanceOf(GlyphkilnError);
  });
});

function scene(version: "1.0.0" | "1.1.0", font: Record<string, unknown>) {
  return {
    schemaVersion: version,
    id: "m1-scene",
    seed: "m1",
    dimensions: { width: 1080, height: 1080 },
    title: "Scene",
    description: "Scene 1.1.0 text",
    backgroundColor: "#F4F0E6",
    assets: [],
    fonts: [declare("Noto Sans Thai", 400), declare("Barlow Condensed", 400)],
    elements: [
      {
        id: "headline",
        type: "text",
        text: "ราคา 499 บาท SALE",
        box: { x: 80, y: 80, width: 920, height: 400 },
        font: {
          family: "Noto Sans Thai",
          weight: 400,
          style: "normal",
          ...(font as object),
        },
        fit: {
          preferredFontSize: 96,
          minimumFontSize: 40,
          maximumLines: 3,
          lineHeight: 1.2,
          align: "left",
          letterSpacing: 4,
        },
        fill: "#242829",
        textMode: "outline",
      },
    ],
    readingOrder: ["headline"],
  };
}

describe("Scene 1.1.0", () => {
  it("rejects M1 font fields in Scene 1.0.0 and undeclared stack faces", () => {
    const legacy = validateSceneDocument(scene("1.0.0", { opticalSizing: "none" }));
    expect(legacy.success).toBe(false);
    if (!legacy.success) {
      expect(legacy.problems.map((problem) => problem.code)).toContain(
        "SCENE_FIELD_REQUIRES_VERSION",
      );
    }
    const undeclared = validateSceneDocument(
      scene("1.1.0", { scriptFaces: { latn: { family: "Kanit" } } }),
    );
    expect(undeclared.success).toBe(false);
    if (!undeclared.success) {
      expect(undeclared.problems.map((problem) => problem.code)).toContain(
        "UNDECLARED_SCENE_FONT_REFERENCE",
      );
    }
  });

  it("renders with script faces and records scene manifest 1.1.0", async () => {
    const document = scene("1.1.0", {
      axes: { wdth: 87.5 },
      scriptFaces: { latn: { family: "Barlow Condensed", scale: "auto" } },
    });
    const result = await renderScene(document, {
      formats: ["svg"],
      creationTimestamp: TIMESTAMP,
    });
    const manifest = result.outputs[0]!.manifest;
    expect(manifest.manifestVersion).toBe(SCENE_RENDER_MANIFEST_VERSION);
    expect(manifest.renderer.version).toBe(RENDERER_VERSION);
    expect(manifest.fonts.map((font) => font.family)).toEqual([
      "Noto Sans Thai",
      "Barlow Condensed",
    ]);
    expect(
      manifest.fontFaces?.map((face) => [face.family, face.role, face.scripts]),
    ).toEqual([
      ["Noto Sans Thai", "primary", ["Thai"]],
      ["Barlow Condensed", "script:latn", ["Latin"]],
    ]);
    expect(manifest.fontFaces?.[0]?.coordinates).toEqual({ wdth: 87.5, wght: 400 });
    expect(manifest.textStacks).toEqual([
      expect.objectContaining({
        layerId: "headline",
        stack: ["Barlow Condensed", "Noto Sans Thai"],
      }),
    ]);
    expect(
      verifySceneReproduction({
        document,
        bytes: result.outputs[0]!.bytes,
        manifest,
      }),
    ).toEqual([]);
  });

  it("keeps Scene 1.0.0 on the legacy identity", async () => {
    const document = scene("1.0.0", {});
    const result = await renderScene(document, {
      formats: ["svg"],
      creationTimestamp: TIMESTAMP,
    });
    const manifest = result.outputs[0]!.manifest;
    expect(manifest.manifestVersion).toBe(LEGACY_SCENE_RENDER_MANIFEST_VERSION);
    expect(manifest.renderer.version).toBe(LEGACY_RENDERER_VERSION);
    expect("fontFaces" in manifest).toBe(false);
  });
});
