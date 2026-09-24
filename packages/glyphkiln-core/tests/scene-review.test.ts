import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { DEVELOPMENT_FONT_SHA256, sha256 } from "../src/index.js";
import { createSceneEvidence } from "../src/scene/evidence.js";
import { inspectScene } from "../src/scene/render.js";
import {
  SCENE_EVIDENCE_VERSION,
  renderScene,
  reviewSceneReadingOrder,
  validateSceneDocument,
  type SceneDocument,
} from "../src/scene/index.js";

const timestamp = "2026-09-24T00:00:00.000Z";

function document(): SceneDocument {
  return {
    schemaVersion: "1.0.0",
    id: "scene-review",
    seed: "review-v1",
    dimensions: { width: 320, height: 240 },
    title: "Scene review",
    description: "Two labels and an image",
    backgroundColor: "#ffffff",
    assets: [],
    fonts: [
      {
        family: "Inter",
        weight: 400,
        style: "normal",
        sha256: DEVELOPMENT_FONT_SHA256,
      },
    ],
    readingOrder: ["ordered-group"],
    elements: [
      {
        type: "group",
        id: "ordered-group",
        transforms: [{ type: "translate", x: 10, y: 20 }],
        elements: [
          {
            type: "rect",
            id: "protected-region",
            x: 0,
            y: 0,
            width: 100,
            height: 60,
            fill: "#eeeeee",
            semantic: { role: "decoration" },
          },
          {
            type: "text",
            id: "label",
            text: "Alpha beta",
            box: { x: 0, y: 0, width: 100, height: 40 },
            font: { family: "Inter", weight: 400, style: "normal" },
            fit: {
              preferredFontSize: 20,
              minimumFontSize: 10,
              maximumLines: 3,
              lineHeight: 1.2,
              align: "left",
            },
            fill: "#111111",
            textMode: "outline",
            semantic: { role: "content" },
          },
        ],
      },
    ],
  };
}

describe("Scene review evidence", () => {
  it("rejects a resolved image without its resource facts", () => {
    expect(() =>
      createSceneEvidence(
        {
          dimensions: { width: 20, height: 20 },
          title: "Missing image resource",
          description: "Missing image resource",
          backgroundColor: "#ffffff",
          elements: [
            {
              id: "missing-image",
              type: "image",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              href: "data:image/png;base64,AA==",
              fit: "cover",
            },
          ],
        },
        new Map(),
        new Map(),
      ),
    ).toThrow(/no evidence resource/);
  });

  it("reports fitted text and transformed bounds from the resolved render", async () => {
    const result = await renderScene(document(), { creationTimestamp: timestamp });
    expect(result.evidence.version).toBe(SCENE_EVIDENCE_VERSION);
    expect(
      result.evidence.elements.find((element) => element.id === "protected-region")
        ?.bounds,
    ).toEqual({ x: 10, y: 20, width: 100, height: 60 });
    const text = result.evidence.text[0]!;
    expect(text.id).toBe("label");
    expect(text.bounds.x).toBe(10);
    expect(text.bounds.y).toBe(20);
    expect(text.lineCount).toBe(text.lines.length);
    expect(text.wrap.lineWidths).toHaveLength(text.lineCount);
    expect(text.fittedFontSize).toBeLessThanOrEqual(20);
    expect(text.wrap.brokeLongWord).toBe(false);
    expect(typeof text.wrap.segmentationPolicy).toBe("string");
    expect(result.qualityIssues).toEqual([]);
  });

  it("reports resolved image crop geometry and stable IDs", async () => {
    const input = document();
    const image = new PNG({ width: 4, height: 2 });
    image.data.fill(255);
    const bytes = PNG.sync.write(image);
    input.assets.push({
      id: "photo",
      mimeType: "image/png",
      width: 4,
      height: 2,
      sha256: sha256(bytes),
      origin: { kind: "unknown" },
    });
    input.elements.push({
      id: "photo-element",
      type: "image",
      assetId: "photo",
      x: 100,
      y: 100,
      width: 80,
      height: 80,
      fit: "cover",
      semantic: { role: "decoration" },
    });
    const result = await renderScene(input, {
      assets: [{ ...input.assets[0]!, bytes }],
      creationTimestamp: timestamp,
    });
    expect(result.evidence.images).toEqual([
      {
        id: "photo-element",
        assetId: "photo",
        fit: "cover",
        destinationBounds: { x: 100, y: 100, width: 80, height: 80 },
        visibleBounds: { x: 100, y: 100, width: 80, height: 80 },
        sourceBounds: { x: 1, y: 0, width: 2, height: 2 },
        renderedBounds: { x: 60, y: 100, width: 160, height: 80 },
      },
    ]);
  });

  it("keeps strokes and connector arrowheads inside conservative bounds", async () => {
    const input = document();
    input.elements.push(
      {
        id: "stroked-rect",
        type: "rect",
        x: 100,
        y: 100,
        width: 10,
        height: 10,
        fill: "none",
        stroke: "#111111",
        strokeWidth: 8,
      },
      {
        id: "stroked-circle",
        type: "circle",
        cx: 160,
        cy: 120,
        radius: 10,
        fill: "none",
        stroke: "#111111",
        strokeWidth: 4,
      },
      {
        id: "arrow-connector",
        type: "connector",
        fromId: "stroked-rect",
        toId: "stroked-circle",
        points: [
          { x: 110, y: 130 },
          { x: 160, y: 130 },
        ],
        stroke: "#111111",
        strokeWidth: 2,
        markers: { start: "none", end: "arrow" },
        lineJoin: "round",
      },
    );
    const result = await renderScene(input, { creationTimestamp: timestamp });
    const bounds = new Map(
      result.evidence.elements.map((element) => [element.id, element.bounds]),
    );
    expect(bounds.get("stroked-rect")).toEqual({
      x: 96,
      y: 96,
      width: 18,
      height: 18,
    });
    expect(bounds.get("stroked-circle")).toEqual({
      x: 148,
      y: 108,
      width: 24,
      height: 24,
    });
    const connector = bounds.get("arrow-connector")!;
    const arrowHalfHeight = Math.sin(0.52) * 8;
    expect(connector.y).toBeLessThanOrEqual(130 - arrowHalfHeight);
    expect(connector.y + connector.height).toBeGreaterThanOrEqual(
      130 + arrowHalfHeight,
    );
  });

  it("includes diagonal square caps in connector evidence bounds", async () => {
    const input = document();
    input.elements.push(
      {
        id: "cap-start",
        type: "rect",
        x: 10,
        y: 10,
        width: 1,
        height: 1,
        fill: "none",
      },
      { id: "cap-end", type: "rect", x: 20, y: 20, width: 1, height: 1, fill: "none" },
      {
        id: "square-cap-connector",
        type: "connector",
        fromId: "cap-start",
        toId: "cap-end",
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
        stroke: "#000000",
        strokeWidth: 10,
        markers: { start: "none", end: "none" },
        lineCap: "square",
        lineJoin: "round",
      },
    );
    const result = await renderScene(input, {
      formats: ["png"],
      creationTimestamp: timestamp,
    });
    const bounds = result.evidence.elements.find(
      (element) => element.id === "square-cap-connector",
    )?.bounds;
    const png = PNG.sync.read(Buffer.from(result.outputs[0]!.bytes));
    for (const [x, y] of [
      [4, 10],
      [10, 4],
    ] as const) {
      const pixelOffset = (y * png.width + x) * 4;
      expect(png.data[pixelOffset]).toBe(0);
    }
    expect(bounds?.x).toBeLessThanOrEqual(4);
    expect(bounds?.y).toBeLessThanOrEqual(4);
  });

  it("rejects non-finite bounds from valid nested transforms", async () => {
    const input = document();
    input.fonts = [];
    input.readingOrder = [];
    let element: SceneDocument["elements"][number] = {
      id: "scaled-mark",
      type: "rect",
      x: 1,
      y: 1,
      width: 2,
      height: 2,
      fill: "#000000",
    };
    for (let depth = 0; depth < 10; depth += 1) {
      element = {
        id: `scaled-group-${depth}`,
        type: "group",
        transforms: Array.from({ length: 16 }, () => ({
          type: "scale",
          x: 100,
          y: 100,
        })),
        elements: [element],
      };
    }
    input.elements = [element];
    expect(validateSceneDocument(input).success).toBe(true);
    await expect(
      renderScene(input, { creationTimestamp: timestamp }),
    ).rejects.toMatchObject({
      code: "SCENE_EVIDENCE_BOUNDS_NON_FINITE",
    });
  });

  it("warns only when opted in and preserves default pixels and fingerprints", async () => {
    const input = document();
    input.readingOrder = [];
    const defaultResult = await renderScene(input, { creationTimestamp: timestamp });
    const reviewed = await renderScene(input, {
      creationTimestamp: timestamp,
      reviewReadingOrder: true,
    });
    expect(defaultResult.qualityIssues).toEqual([]);
    expect(reviewed.qualityIssues.map((issue) => [issue.code, issue.layerId])).toEqual([
      ["SCENE_READING_ORDER_UNCOVERED", "label"],
    ]);
    expect(reviewed.outputs[0]!.bytes).toEqual(defaultResult.outputs[0]!.bytes);
    expect(reviewed.outputs[0]!.fingerprint).toBe(
      defaultResult.outputs[0]!.fingerprint,
    );
    expect(reviewed.evidence).toEqual(defaultResult.evidence);
    expect(
      reviewSceneReadingOrder({
        ...input,
        elements: [
          {
            id: "ornament",
            type: "rect",
            x: 0,
            y: 0,
            width: 2,
            height: 2,
            fill: "#111111",
            semantic: { role: "decoration" },
          },
        ],
      }),
    ).toEqual([]);
  });

  it("keeps requested reading-order warnings with unsupported text diagnostics", () => {
    const input = document();
    input.readingOrder = [];
    const group = input.elements[0]!;
    if (group.type !== "group") throw new Error("Expected review group.");
    const label = group.elements[1]!;
    if (label.type !== "text") throw new Error("Expected review label.");
    label.text = "אב";

    const inspected = inspectScene(input, { reviewReadingOrder: true });
    expect(inspected.fingerprint).toBeNull();
    expect(inspected.evidence).toBeNull();
    expect(inspected.qualityIssues.map((issue) => issue.code)).toContain(
      "BIDI_LAYOUT_UNSUPPORTED",
    );
    expect(inspected.qualityIssues).toContainEqual(
      expect.objectContaining({
        code: "SCENE_READING_ORDER_UNCOVERED",
        layerId: "label",
      }),
    );
    expect(
      inspectScene(input).qualityIssues.some(
        (issue) => issue.code === "SCENE_READING_ORDER_UNCOVERED",
      ),
    ).toBe(false);
  });

  it("covers ordered ancestors while reporting uncovered content and annotation", () => {
    const input = document();
    input.elements.push(
      {
        id: "uncovered-note",
        type: "rect",
        x: 120,
        y: 0,
        width: 20,
        height: 10,
        fill: "#222222",
        semantic: { role: "annotation" },
      },
      {
        id: "uncovered-content",
        type: "circle",
        cx: 160,
        cy: 25,
        radius: 5,
        fill: "#222222",
        semantic: { role: "content" },
      },
    );
    expect(reviewSceneReadingOrder(input).map((issue) => issue.layerId)).toEqual([
      "uncovered-note",
      "uncovered-content",
    ]);
  });

  it("keeps the v0.8.0 Scene fixture's SVG and PNG hashes", async () => {
    const root = resolve("fixtures/scene-kernel");
    const input: unknown = JSON.parse(
      await readFile(resolve(root, "editorial-decoder-spread-v1.scene.json"), "utf8"),
    );
    const validation = validateSceneDocument(input);
    expect(validation.success).toBe(true);
    const expected = JSON.parse(
      await readFile(
        resolve(root, "editorial-decoder-spread-v1.expectations.json"),
        "utf8",
      ),
    ) as {
      outputHashes: { svgSha256: string; pngSha256: string };
    };
    const result = await renderScene(input, {
      formats: ["svg", "png"],
      creationTimestamp: "2026-08-29T00:00:00.000Z",
    });
    expect(sha256(result.outputs[0]!.bytes)).toBe(expected.outputHashes.svgSha256);
    expect(sha256(result.outputs[1]!.bytes)).toBe(expected.outputHashes.pngSha256);
  }, 60_000);
});
