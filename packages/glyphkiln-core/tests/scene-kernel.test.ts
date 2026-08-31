import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { DEVELOPMENT_FONT_SHA256, sha256 } from "../src/index.js";
import {
  SCENE_DOCUMENT_VERSION,
  SCENE_KERNEL_VERSION,
  SCENE_RENDER_MANIFEST_VERSION,
  renderScene,
  validateSceneDocument,
  verifySceneReproduction,
  type SceneDocument,
} from "../src/scene/index.js";

const TIMESTAMP = "2026-08-29T00:00:00.000Z";

describe("Scene Kernel v1", () => {
  it("renders one validated scene through groups, transforms, clips, connectors, and selectable text", async () => {
    const document = createSceneDocument();
    const first = await renderScene(document, {
      formats: ["svg", "png"],
      creationTimestamp: TIMESTAMP,
    });
    const second = await renderScene(document, {
      formats: ["svg", "png"],
      creationTimestamp: TIMESTAMP,
    });

    expect(first.document).toEqual(document);
    expect(first.qualityIssues).toEqual(second.qualityIssues);
    expect(first.outputs.map(({ bytes }) => sha256(bytes))).toEqual(
      second.outputs.map(({ bytes }) => sha256(bytes)),
    );

    const svgOutput = first.outputs.find(({ format }) => format === "svg")!;
    const pngOutput = first.outputs.find(({ format }) => format === "png")!;
    const svg = new TextDecoder().decode(svgOutput.bytes);
    expect(svg).toContain(
      '<clipPath id="clip-translated-stage" clipPathUnits="userSpaceOnUse">',
    );
    expect(svg).toContain('transform="translate(12 8) rotate(2 80 60)"');
    expect(svg).toContain('id="explanation-selectable-text"');
    expect(svg).toContain("<text ");
    expect(svg).toContain('id="selection-route-shaft"');
    expect(svg).toContain('id="selection-route-marker-end"');
    expect(svg).toContain('data-from="candidate-field" data-to="selected-token"');
    expect(svg).toContain('data-reading-order="1"');
    expect(svg).toContain('data-semantic-role="decoration" aria-hidden="true"');
    expect(svg).not.toMatch(/<script|<foreignObject|href="https?:|url\(https?:/);
    expect([...pngOutput.bytes.slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    expect(svgOutput.manifest).toMatchObject({
      manifestVersion: SCENE_RENDER_MANIFEST_VERSION,
      sceneKernelVersion: SCENE_KERNEL_VERSION,
      input: {
        kind: "scene",
        sceneVersion: SCENE_DOCUMENT_VERSION,
        sceneId: document.id,
      },
      accessibility: {
        readingOrder: document.readingOrder,
        selectableText: true,
      },
      output: {
        format: "svg",
        sha256: sha256(svgOutput.bytes),
      },
    });
    expect(svgOutput.manifest.fonts).toEqual([
      {
        family: "Inter",
        weight: 700,
        style: "normal",
        sha256: DEVELOPMENT_FONT_SHA256,
      },
    ]);
    expect(
      verifySceneReproduction({
        document,
        bytes: svgOutput.bytes,
        manifest: svgOutput.manifest,
      }),
    ).toEqual([]);
  });

  it("keeps timestamps and scene identity out of pixel fingerprints", async () => {
    const document = createSceneDocument();
    const first = (
      await renderScene(document, {
        creationTimestamp: "2026-08-29T00:00:00.000Z",
      })
    ).outputs[0]!;
    const second = (
      await renderScene(
        {
          ...document,
          id: "scene-kernel-smoke-copy",
          metadata: { review: "different non-rendering note" },
        },
        { creationTimestamp: "2026-08-30T00:00:00.000Z" },
      )
    ).outputs[0]!;

    expect(first.bytes).toEqual(second.bytes);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.manifest.creationTimestamp).not.toBe(
      second.manifest.creationTimestamp,
    );
    expect(first.manifest.input.sceneHash).not.toBe(second.manifest.input.sceneHash);
  });

  it("keeps unused font declarations out of pixel fingerprints", async () => {
    const document = createSceneDocument();
    const withUnusedFont = structuredClone(document);
    withUnusedFont.fonts.push({
      family: "Inter",
      weight: 400,
      style: "normal",
      sha256: DEVELOPMENT_FONT_SHA256,
    });
    const usedOnly = (
      await renderScene(document, {
        formats: ["svg"],
        creationTimestamp: TIMESTAMP,
      })
    ).outputs[0]!;
    const declaredButUnused = (
      await renderScene(withUnusedFont, {
        formats: ["svg"],
        creationTimestamp: TIMESTAMP,
      })
    ).outputs[0]!;

    expect(declaredButUnused.bytes).toEqual(usedOnly.bytes);
    expect(declaredButUnused.fingerprint).toBe(usedOnly.fingerprint);
  });

  it("keeps resource declaration order out of pixel fingerprints", async () => {
    const document = createSceneDocument();
    document.fonts.push({
      family: "Inter",
      weight: 400,
      style: "normal",
      sha256: DEVELOPMENT_FONT_SHA256,
    });
    const stage = document.elements[0];
    if (stage?.type !== "group") throw new Error("Scene stage is missing.");
    stage.elements.push({
      id: "candidate-note",
      type: "text",
      text: "Candidates",
      box: { x: 14, y: 60, width: 124, height: 14 },
      font: { family: "Inter", weight: 400, style: "normal" },
      fit: {
        preferredFontSize: 12,
        minimumFontSize: 8,
        maximumLines: 1,
        lineHeight: 1.15,
        align: "left",
      },
      fill: "#17262F",
      textMode: "outline",
    });

    const reordered = structuredClone(document);
    reordered.fonts.reverse();
    const first = (
      await renderScene(document, {
        formats: ["svg"],
        creationTimestamp: TIMESTAMP,
      })
    ).outputs[0]!;
    const second = (
      await renderScene(reordered, {
        formats: ["svg"],
        creationTimestamp: TIMESTAMP,
      })
    ).outputs[0]!;

    expect(second.bytes).toEqual(first.bytes);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("keeps selectable SVG identity stable across resolved font casing", async () => {
    const document = createSceneDocument();
    const bundled = (
      await renderScene(document, {
        formats: ["svg"],
        creationTimestamp: TIMESTAMP,
      })
    ).outputs[0]!;
    const fontBytes = new Uint8Array(
      await readFile(new URL("../assets/fonts/Inter-Variable.ttf", import.meta.url)),
    );
    const callerResolved = (
      await renderScene(document, {
        formats: ["svg"],
        creationTimestamp: TIMESTAMP,
        fonts: [
          {
            family: "INTER",
            weight: 700,
            style: "normal",
            sha256: DEVELOPMENT_FONT_SHA256,
            bytes: fontBytes,
          },
        ],
      })
    ).outputs[0]!;

    expect(callerResolved.bytes).toEqual(bundled.bytes);
    expect(callerResolved.fingerprint).toBe(bundled.fingerprint);
  });

  it("bounds expanded raster bytes across repeated image references", async () => {
    const imageBytes = new Uint8Array(
      await readFile(
        new URL(
          "../fixtures/scene-kernel/generated/editorial-decoder-spread-v1.png",
          import.meta.url,
        ),
      ),
    );
    const asset = {
      id: "shared-image",
      mimeType: "image/png" as const,
      sha256: sha256(imageBytes),
      width: 1800,
      height: 1100,
      origin: { kind: "generated" as const },
      bytes: imageBytes,
    };
    const document = {
      schemaVersion: SCENE_DOCUMENT_VERSION,
      id: "repeated-raster-scene",
      seed: "repeated-raster-scene-v1",
      dimensions: { width: 320, height: 180 },
      title: "Repeated raster references",
      description: "A bounded image-reference expansion check.",
      backgroundColor: "#FFFFFF" as const,
      assets: [
        {
          id: asset.id,
          mimeType: asset.mimeType,
          sha256: asset.sha256,
          width: asset.width,
          height: asset.height,
          origin: asset.origin,
        },
      ],
      fonts: [],
      elements: Array.from({ length: 256 }, (_, index) => ({
        id: `image-${index.toString()}`,
        type: "image" as const,
        assetId: asset.id,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        fit: "contain" as const,
      })),
      readingOrder: [],
    } satisfies SceneDocument;

    expect(validateSceneDocument(document).success).toBe(true);
    await expect(
      renderScene(document, { formats: ["svg"], assets: [asset] }),
    ).rejects.toMatchObject({ code: "SCENE_EMBEDDED_RASTER_BYTES_LIMIT_EXCEEDED" });
  });

  it("reports bounded scene text diagnostics before resolving resources", async () => {
    const document = createSceneDocument();
    const imageDeclaration = {
      id: "missing-image",
      mimeType: "image/png" as const,
      sha256: "f".repeat(64),
      width: 1,
      height: 1,
      origin: { kind: "unknown" as const },
    };
    document.assets = [imageDeclaration];
    document.elements = [
      {
        id: "missing-image-reference",
        type: "image",
        assetId: imageDeclaration.id,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        fit: "contain",
      },
      {
        id: "unsupported-text",
        type: "text",
        text: "\u200F\u05D0\u1820",
        box: { x: 0, y: 0, width: 120, height: 40 },
        font: { family: "Inter", weight: 700, style: "normal" },
        fit: {
          preferredFontSize: 14,
          minimumFontSize: 10,
          maximumLines: 2,
          lineHeight: 1.2,
          align: "left",
        },
        fill: "#17262F",
        textMode: "outline",
      },
    ];
    document.readingOrder = ["unsupported-text"];

    expect(validateSceneDocument(document).success).toBe(true);
    await expect(renderScene(document, { formats: ["svg"] })).rejects.toMatchObject({
      code: "SCENE_QUALITY_VALIDATION_FAILED",
      details: {
        textLayout: {
          retainedDiagnostics: 3,
          truncated: false,
        },
      },
    });

    const cappedDocument = {
      ...document,
      id: "capped-text-scene",
      assets: [],
      elements: Array.from({ length: 50 }, (_, index) => ({
        id: `unsupported-${index.toString()}`,
        type: "text" as const,
        text: "\u200F\u05D0\u1820",
        box: { x: 0, y: 0, width: 120, height: 40 },
        font: { family: "Inter", weight: 700, style: "normal" as const },
        fit: {
          preferredFontSize: 14,
          minimumFontSize: 10,
          maximumLines: 2,
          lineHeight: 1.2,
          align: "left" as const,
        },
        fill: "#17262F" as const,
        textMode: "outline" as const,
      })),
      readingOrder: [],
    } satisfies SceneDocument;
    await expect(
      renderScene(cappedDocument, { formats: ["svg"] }),
    ).rejects.toMatchObject({
      code: "SCENE_QUALITY_VALIDATION_FAILED",
      details: {
        textLayout: {
          totalDiagnostics: 150,
          retainedDiagnostics: 128,
          truncated: true,
        },
      },
    });
  });

  it("allows XML-safe prose that resembles an SVG attribute", async () => {
    const document = createSceneDocument();
    document.title = "Benign onclick=example prose";
    await expect(
      renderScene(document, {
        formats: ["svg"],
        creationTimestamp: TIMESTAMP,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects serializer-shaped text and image inputs at the public seam", () => {
    const document = createSceneDocument();
    const unsafeText = structuredClone(document) as unknown as Record<string, unknown>;
    const elements = unsafeText["elements"] as Record<string, unknown>[];
    const group = elements[0]!;
    const children = group["elements"] as Record<string, unknown>[];
    const text = children.find((element) => element["type"] === "text")!;
    text["outlines"] = ["M 0 0 L 1 1"];
    const unsafeTextResult = validateSceneDocument(unsafeText);
    expect(unsafeTextResult.success).toBe(false);
    if (unsafeTextResult.success) throw new Error("Unsafe text was accepted.");
    expect(
      unsafeTextResult.problems.some((problem) => problem.code === "unrecognized_keys"),
    ).toBe(true);

    const unsafeImage = structuredClone(document) as unknown as Record<string, unknown>;
    (unsafeImage["elements"] as unknown[]).push({
      id: "external-image",
      type: "image",
      href: "https://example.invalid/image.png",
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      fit: "cover",
    });
    expect(validateSceneDocument(unsafeImage).success).toBe(false);
  });

  it("rejects dangling and self-referential connector endpoints", () => {
    const missing = createSceneDocument();
    const connector = missing.elements[2];
    if (connector?.type !== "connector") throw new Error("Missing connector.");
    connector.toId = "missing-target";
    const missingResult = validateSceneDocument(missing);
    expect(missingResult.success).toBe(false);
    if (missingResult.success) throw new Error("Dangling connector was accepted.");
    expect(
      missingResult.problems.some(
        (problem) => problem.code === "SCENE_CONNECTOR_REFERENCE_MISSING",
      ),
    ).toBe(true);

    const self = createSceneDocument();
    const selfConnector = self.elements[2];
    if (selfConnector?.type !== "connector") throw new Error("Missing connector.");
    selfConnector.toId = selfConnector.fromId;
    const selfResult = validateSceneDocument(self);
    expect(selfResult.success).toBe(false);
    if (selfResult.success) throw new Error("Self connector was accepted.");
    expect(
      selfResult.problems.some(
        (problem) => problem.code === "SCENE_CONNECTOR_SELF_REFERENCE",
      ),
    ).toBe(true);
  });

  it("blocks XML-forbidden control characters before SVG or PNG rendering", async () => {
    const document = createSceneDocument();
    document.description = "invalid\u0001description";
    await expect(
      renderScene(document, { formats: ["svg", "png"] }),
    ).rejects.toMatchObject({ code: "INVALID_SCENE_DOCUMENT" });
  });

  it("rejects falsified or incomplete reproduction provenance", async () => {
    const document = createSceneDocument();
    const output = (
      await renderScene(document, {
        formats: ["svg"],
        creationTimestamp: TIMESTAMP,
      })
    ).outputs[0]!;
    const codesFor = (manifest: unknown): string[] =>
      verifySceneReproduction({
        document,
        bytes: output.bytes,
        manifest,
      }).map((issue) => issue.code);

    const manifestVersion = structuredClone(output.manifest) as unknown as {
      manifestVersion: string;
    };
    manifestVersion.manifestVersion = "9.0.0";
    expect(codesFor(manifestVersion)).toContain("SCENE_MANIFEST_VERSION_MISMATCH");

    const inputIdentity = structuredClone(output.manifest) as unknown as {
      input: { sceneId: string };
    };
    inputIdentity.input.sceneId = "falsified-scene";
    expect(codesFor(inputIdentity)).toContain("SCENE_MANIFEST_INPUT_MISMATCH");

    const kernel = structuredClone(output.manifest) as unknown as {
      sceneKernelVersion: string;
    };
    kernel.sceneKernelVersion = "9.0.0";
    expect(codesFor(kernel)).toContain("SCENE_KERNEL_VERSION_MISMATCH");

    const renderer = structuredClone(output.manifest) as unknown as {
      renderer: { version: string };
    };
    renderer.renderer.version = "9.0.0";
    expect(codesFor(renderer)).toContain("SCENE_RENDERER_IDENTITY_MISMATCH");

    const renderId = structuredClone(output.manifest) as unknown as {
      renderId: string;
    };
    renderId.renderId = "scene_falsified";
    expect(codesFor(renderId)).toContain("SCENE_RENDER_ID_MISMATCH");

    const fonts = structuredClone(output.manifest) as unknown as {
      fonts: { sha256: string }[];
    };
    fonts.fonts[0]!.sha256 = "f".repeat(64);
    expect(codesFor(fonts)).toContain("SCENE_MANIFEST_FONTS_MISMATCH");

    const dimensions = structuredClone(output.manifest) as unknown as {
      dimensions: { width: number };
    };
    dimensions.dimensions.width += 1;
    expect(codesFor(dimensions)).toContain("SCENE_MANIFEST_DIMENSIONS_MISMATCH");

    const accessibility = structuredClone(output.manifest) as unknown as {
      accessibility: { title: string };
    };
    accessibility.accessibility.title = "Falsified title";
    expect(codesFor(accessibility)).toContain("SCENE_MANIFEST_ACCESSIBILITY_MISMATCH");

    const productClaim = structuredClone(output.manifest) as unknown as {
      productClaim: string;
    };
    productClaim.productClaim = "Unreviewed claim";
    expect(codesFor(productClaim)).toContain("SCENE_PRODUCT_CLAIM_MISMATCH");

    const method = structuredClone(output.manifest) as unknown as {
      renderingMethod: string;
    };
    method.renderingMethod = "falsified";
    expect(codesFor(method)).toContain("SCENE_RENDERING_METHOD_MISMATCH");

    const malformedQualityEvidence = structuredClone(output.manifest) as unknown as {
      qualityIssues: unknown[];
    };
    malformedQualityEvidence.qualityIssues = [null];
    expect(codesFor(malformedQualityEvidence)).toEqual([
      "INVALID_SCENE_RENDER_MANIFEST",
    ]);

    const impossibleBlockingEvidence = structuredClone(output.manifest) as unknown as {
      qualityIssues: unknown[];
    };
    impossibleBlockingEvidence.qualityIssues = [
      {
        code: "BLOCKING_ISSUE",
        severity: "error",
        message: "Successful Scene renders cannot retain blocking issues.",
      },
    ];
    expect(codesFor(impossibleBlockingEvidence)).toEqual([
      "INVALID_SCENE_RENDER_MANIFEST",
    ]);

    let manifestGetterCalls = 0;
    const accessorManifest = structuredClone(output.manifest) as object;
    Object.defineProperty(accessorManifest, "productClaim", {
      enumerable: true,
      get: () => {
        manifestGetterCalls += 1;
        return "unsafe";
      },
    });
    expect(codesFor(accessorManifest)).toEqual(["INVALID_SCENE_RENDER_MANIFEST"]);
    expect(manifestGetterCalls).toBe(0);

    const format = structuredClone(output.manifest) as unknown as {
      output: { format: string };
    };
    format.output.format = "png";
    expect(codesFor(format)).toContain("SCENE_OUTPUT_FORMAT_MISMATCH");

    expect(codesFor({})).toEqual(["INVALID_SCENE_RENDER_MANIFEST"]);

    const unknownField = structuredClone(output.manifest) as Record<string, unknown>;
    unknownField["unversionedClaim"] = "trusted";
    expect(codesFor(unknownField)).toEqual(["INVALID_SCENE_RENDER_MANIFEST"]);
  });
});

function createSceneDocument(): SceneDocument {
  return {
    schemaVersion: SCENE_DOCUMENT_VERSION,
    id: "scene-kernel-smoke",
    seed: "scene-kernel-smoke-v1",
    dimensions: { width: 320, height: 180 },
    title: "A validated scene-kernel proof",
    description:
      "A clipped and transformed group connects a neutral candidate field to a selected token.",
    backgroundColor: "#F6F1E7",
    assets: [],
    fonts: [
      {
        family: "Inter",
        weight: 700,
        style: "normal",
        sha256: DEVELOPMENT_FONT_SHA256,
      },
    ],
    elements: [
      {
        id: "translated-stage",
        type: "group",
        transforms: [
          { type: "translate", x: 12, y: 8 },
          { type: "rotate", degrees: 2, cx: 80, cy: 60 },
        ],
        clip: { type: "rect", x: 0, y: 0, width: 150, height: 120, radius: 8 },
        semantic: {
          role: "content",
          conceptId: "candidate-selection",
          label: "Candidate selection",
        },
        elements: [
          {
            id: "stage-paper",
            type: "rect",
            x: 0,
            y: 0,
            width: 150,
            height: 120,
            fill: "#F6F1E7",
            stroke: "#17262F",
            strokeWidth: 2,
            semantic: { role: "decoration" },
          },
          {
            id: "explanation",
            type: "text",
            text: "Greedy decoding selects one candidate.",
            box: { x: 12, y: 14, width: 124, height: 48 },
            font: { family: "Inter", weight: 700, style: "normal" },
            fit: {
              preferredFontSize: 15,
              minimumFontSize: 11,
              maximumLines: 3,
              lineHeight: 1.15,
              align: "left",
            },
            fill: "#17262F",
            textMode: "outline-with-selectable-text",
            semantic: {
              role: "content",
              label: "Greedy decoding explanation",
            },
          },
          {
            id: "candidate-field",
            type: "rect",
            x: 14,
            y: 76,
            width: 52,
            height: 26,
            fill: "#F6F1E7",
            stroke: "#17262F",
            strokeWidth: 2,
            semantic: { role: "content", label: "Neutral candidates" },
          },
        ],
      },
      {
        id: "selected-token",
        type: "rect",
        x: 238,
        y: 84,
        width: 54,
        height: 28,
        fill: "#B94A35",
        semantic: { role: "content", label: "Selected token clear" },
      },
      {
        id: "selection-route",
        type: "connector",
        fromId: "candidate-field",
        toId: "selected-token",
        points: [
          { x: 78, y: 98 },
          { x: 194, y: 98 },
          { x: 238, y: 98 },
        ],
        stroke: "#17262F",
        strokeWidth: 2,
        markers: { start: "none", end: "arrow" },
        lineCap: "round",
        lineJoin: "round",
        semantic: {
          role: "connector",
          conceptId: "greedy-selection",
          label: "Selection route",
        },
      },
    ],
    readingOrder: ["explanation", "candidate-field", "selected-token"],
  };
}
