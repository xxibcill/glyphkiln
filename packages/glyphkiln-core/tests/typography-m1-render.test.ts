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
  createRenderFingerprint,
  createRenderFingerprintPayload,
} from "../src/cache/fingerprint.js";
import { RENDER_CONFIGURATION } from "../src/cache/fingerprint-contract.js";
import { M1_TYPOGRAPHY_POLICY } from "../src/typography/typesetter.js";
import { loadHarfBuzzShaper } from "../src/fonts/harfbuzz.js";
import { FontRegistry } from "../src/fonts/index.js";
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

  it("rejects 1.8.0 font-model role fields on versions that do not read them", async () => {
    const m1 = thaiStackDocument({ scale: "auto" }, { opticalSizing: "none" });
    const legacy = {
      ...m1,
      template: { ...m1.template, version: "1.3.0" },
    } as DesignDocument;
    const error: unknown = await renderGraphic(legacy).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(GlyphkilnError);
    const issues = (error as GlyphkilnError).details?.["issues"] as {
      code: string;
      details?: { role?: string; fields?: string[] };
    }[];
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "TEMPLATE_FEATURE_UNSUPPORTED",
        details: expect.objectContaining({
          role: "display",
          fields: ["opticalSizing", "fallback"],
        }) as unknown,
      }),
    );
    await expect(
      renderGraphic(m1, { creationTimestamp: TIMESTAMP }),
    ).resolves.toBeDefined();
  });

  it("sets a Thai quote through a role fallback stack and reports the stack tried", async () => {
    const document = thaiStackDocument();
    const brand = document.brand as { typography: object };
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

/** quote-card@1.4.0 with Thai copy set through an IBM Plex role fallback. */
function thaiStackDocument(
  fallback: Record<string, unknown> = { scale: "auto" },
  display: Record<string, unknown> = {},
): DesignDocument {
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
        fallback: [{ family: "IBM Plex Sans Thai", ...fallback }],
        ...display,
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
  return document;
}

function withQuoteLayer(
  document: DesignDocument,
  fields: Record<string, unknown>,
): DesignDocument {
  return {
    ...document,
    layers: document.layers.map((layer) =>
      layer.id === "quote" ? { ...layer, ...fields } : layer,
    ),
  } as DesignDocument;
}

async function identityOf(document: DesignDocument) {
  const result = await renderGraphic(document, {
    formats: ["svg"],
    creationTimestamp: TIMESTAMP,
  });
  const output = result.outputs[0]!;
  if (output.manifest.manifestVersion !== "1.3.0")
    throw new Error("expected manifest 1.3.0");
  return {
    fingerprint: output.fingerprint,
    fonts: output.manifest.fonts,
    textStacks: output.manifest.textStacks,
  };
}

describe("T27: font identity v2 drives the fingerprint", () => {
  it("changes the recorded identity and fingerprint for each font-model input", async () => {
    const shaper = await loadHarfBuzzShaper();
    const inter = shaper.loadFace(new FontRegistry().get("Inter", 700).bytes);
    const instance = shaper
      .namedInstances(inter)
      .find((candidate) => candidate.coordinates["wght"] !== 700)!;
    const latin = asM1(quoteDocument());
    const variants: [string, DesignDocument, DesignDocument][] = [
      ["explicit opsz", latin, withQuoteLayer(latin, { opsz: 20 })],
      ["optical sizing off", latin, withQuoteLayer(latin, { opticalSizing: "none" })],
      ["explicit axis", latin, withQuoteLayer(latin, { axes: { wght: 640 } })],
      [
        "named instance",
        latin,
        withQuoteLayer(latin, { namedInstance: instance.name }),
      ],
      ["fallback scale", thaiStackDocument(), thaiStackDocument({ scale: 1.25 })],
      [
        "fallback baseline shift",
        thaiStackDocument(),
        thaiStackDocument({ scale: "auto", baselineShift: 0.05 }),
      ],
      [
        "stack role",
        thaiStackDocument(),
        thaiStackDocument(
          { scale: "auto" },
          {
            fallback: undefined,
            scriptFaces: { thai: { family: "IBM Plex Sans Thai", scale: "auto" } },
          },
        ),
      ],
    ];
    for (const [name, before, after] of variants) {
      const left = await identityOf(before);
      const right = await identityOf(after);
      expect(right.fonts, name).not.toEqual(left.fonts);
      expect(right.fingerprint, name).not.toBe(left.fingerprint);
    }
  });

  it("hashes font identity v2 itself, not only the document", () => {
    const document = asM1(quoteDocument());
    const face = {
      family: "Inter",
      weight: 700,
      style: "normal",
      sha256: bundledFontFile("Inter", 700, "normal")?.sha256 ?? "0".repeat(64),
      coordinates: { opsz: 32, wght: 700 },
      role: "primary",
      scale: 1,
      baselineShift: 0,
    };
    const fingerprint = (fonts: (typeof face & { namedInstance?: string })[]) =>
      createRenderFingerprint({
        document,
        outputFormat: "svg",
        assetHashes: [],
        proceduralAlgorithmVersions: {},
        rendererConfiguration: M1_RENDER_CONFIGURATION,
        fonts,
      });
    const base = fingerprint([face]);
    for (const changed of [
      { ...face, coordinates: { opsz: 20, wght: 700 } },
      { ...face, namedInstance: "Bold" },
      { ...face, role: "fallback" },
      { ...face, scale: 1.25 },
      { ...face, baselineShift: 0.05 },
    ]) {
      expect(fingerprint([changed])).not.toBe(base);
    }
  });
});

const M1_RENDER_CONFIGURATION = {
  ...RENDER_CONFIGURATION,
  typographyPolicy: {
    ...RENDER_CONFIGURATION.typographyPolicy,
    m1: M1_TYPOGRAPHY_POLICY,
  },
};

describe("fingerprint renderer identity", () => {
  const input = {
    document: asM1(quoteDocument()),
    outputFormat: "svg" as const,
    assetHashes: [],
    proceduralAlgorithmVersions: {},
    fontHashes: [],
  };

  it("derives the renderer from the configuration it hashes", () => {
    expect(createRenderFingerprintPayload(input).renderer.version).toBe(
      LEGACY_RENDERER_VERSION,
    );
    expect(
      createRenderFingerprintPayload({
        ...input,
        rendererConfiguration: M1_RENDER_CONFIGURATION,
      }).renderer.version,
    ).toBe(RENDERER_VERSION);
  });

  it("rejects an explicit renderer that disagrees with the configuration", () => {
    for (const mismatch of [
      { ...input, rendererVersion: RENDERER_VERSION },
      {
        ...input,
        rendererConfiguration: M1_RENDER_CONFIGURATION,
        rendererVersion: LEGACY_RENDERER_VERSION,
      },
    ]) {
      let caught: unknown;
      try {
        createRenderFingerprintPayload(mismatch);
      } catch (error) {
        caught = error;
      }
      expect((caught as GlyphkilnError).code).toBe("FINGERPRINT_RENDERER_MISMATCH");
    }
  });

  it("recomputes a rendered M1 fingerprint from its manifest", async () => {
    const document = asM1(quoteDocument());
    const result = await renderGraphic(document, {
      formats: ["svg"],
      creationTimestamp: TIMESTAMP,
    });
    const output = result.outputs[0]!;
    expect(
      createRenderFingerprint({
        document,
        outputFormat: "svg",
        assetHashes: [],
        proceduralAlgorithmVersions: output.manifest.proceduralAlgorithmVersions,
        fonts: output.manifest.fonts,
        rendererConfiguration: M1_RENDER_CONFIGURATION,
      }),
    ).toBe(output.fingerprint);
  });
});

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
