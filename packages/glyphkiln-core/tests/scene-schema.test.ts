import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  SCENE_RESOURCE_LIMITS,
  assertSceneInputResources,
  getSceneInputResourceProblems,
} from "../src/resources/index.js";
import {
  SCENE_DOCUMENT_RUNTIME_REFINEMENTS,
  getSceneDocumentJsonSchema,
  validateSceneDocument,
} from "../src/scene/schema.js";
import {
  SCENE_DOCUMENT_VERSION,
  type SceneDocument,
  type SceneElement,
} from "../src/scene/types.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("SceneDocument v1 schema", () => {
  it("accepts the strict recursive scene contract and preserves ordered transforms", () => {
    const scene = validScene();
    const validation = validateSceneDocument(scene);

    expect(validation.success).toBe(true);
    if (!validation.success) return;
    expect(validation.data.schemaVersion).toBe(SCENE_DOCUMENT_VERSION);
    const group = validation.data.elements[0];
    expect(group?.type).toBe("group");
    if (group?.type !== "group") return;
    expect(group.transforms?.map((transform) => transform.type)).toEqual([
      "translate",
      "scale",
      "rotate",
    ]);
    expect(group.clip).toEqual({
      type: "rect",
      x: 40,
      y: 40,
      width: 720,
      height: 520,
      radius: 24,
    });
  });

  it("publishes draft 2020-12 JSON Schema plus runtime refinement metadata", () => {
    const schema = getSceneDocumentJsonSchema() as Record<string, unknown>;
    const validateJsonSchema = new Ajv2020().compile(schema);

    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema["$comment"]).toContain("SCENE_DOCUMENT_RUNTIME_REFINEMENTS");
    expect(JSON.stringify(schema)).toContain(SCENE_DOCUMENT_VERSION);
    expect(SCENE_DOCUMENT_RUNTIME_REFINEMENTS.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "UNIQUE_SCENE_ELEMENT_IDS",
        "UNIQUE_SCENE_DERIVED_IDS",
        "SCENE_CONNECTOR_REFERENCES",
        "SCENE_READING_ORDER_REFERENCES",
      ]),
    );
    expect(validateJsonSchema(validScene())).toBe(true);

    const structurallyInvalid = validScene() as SceneDocument & {
      arbitraryCss?: string;
    };
    structurallyInvalid.arbitraryCss = "body { display: none }";
    expect(validateJsonSchema(structurallyInvalid)).toBe(false);

    const runtimeOnlyInvalid = validScene();
    runtimeOnlyInvalid.elements.push({
      id: "state-prefix",
      type: "circle",
      cx: 20,
      cy: 20,
      radius: 10,
      fill: "#112233",
    });
    expect(validateJsonSchema(runtimeOnlyInvalid)).toBe(true);
    expect(validateSceneDocument(runtimeOnlyInvalid).success).toBe(false);
  });

  it("rejects unknown fields at every structural level", () => {
    const topLevel = validScene() as SceneDocument & { href?: string };
    topLevel.href = "https://example.com/scene.svg";
    expect(validateSceneDocument(topLevel)).toMatchObject({
      success: false,
      problems: [expect.objectContaining({ code: "unrecognized_keys", path: "$" })],
    });

    const nested = validScene();
    const group = nested.elements[0];
    if (group?.type !== "group") throw new Error("Fixture group is missing.");
    (group.clip as typeof group.clip & { url?: string }).url =
      "https://example.com/clip.svg";
    expect(validateSceneDocument(nested)).toMatchObject({
      success: false,
      problems: [
        expect.objectContaining({
          code: "unrecognized_keys",
          path: "elements[0].clip",
        }),
      ],
    });
  });

  it("rejects reading-order descendants of decorative groups", () => {
    const scene = validScene();
    const group = scene.elements[0];
    if (group?.type !== "group") throw new Error("Fixture group is missing.");
    group.semantic = { role: "decoration" };
    scene.readingOrder = ["decoder-label"];

    expect(problemCodes(scene)).toContain("SCENE_READING_ORDER_ROLE_INVALID");
  });

  it("accepts only closed paint and path-data vocabularies", () => {
    const paintUrl = validScene();
    const group = paintUrl.elements[0];
    if (group?.type !== "group") throw new Error("Fixture group is missing.");
    const rect = group.elements[0];
    if (rect?.type !== "rect") throw new Error("Fixture rectangle is missing.");
    rect.fill = "url(https://example.com/pattern.svg)" as `#${string}`;
    expect(validateSceneDocument(paintUrl).success).toBe(false);

    const activePath = validScene();
    activePath.elements.push({
      id: "unsafe-path",
      type: "path",
      data: 'M 0 0" onclick="alert(1)',
      fill: "none",
    });
    expect(validateSceneDocument(activePath)).toMatchObject({
      success: false,
      problems: [
        expect.objectContaining({
          code: "SCENE_PATH_DATA_SYNTAX_INVALID",
          path: "elements[3].data",
        }),
      ],
    });
  });

  it("parses complete finite path grammar and bounds resolved coordinates", () => {
    const cases = [
      {
        data: "M 1e999 0 L 0 0",
        code: "SCENE_PATH_NUMBER_NONFINITE",
      },
      { data: "M 0 0 L", code: "SCENE_PATH_DATA_SYNTAX_INVALID" },
      { data: "E", code: "SCENE_PATH_DATA_SYNTAX_INVALID" },
      {
        data: "M 32768 0 l 1 0",
        code: "SCENE_PATH_GEOMETRY_OUT_OF_BOUNDS",
      },
      {
        data: "M 0 0 A 10 10 0 2 0 20 20",
        code: "SCENE_PATH_DATA_SYNTAX_INVALID",
      },
    ] as const;
    for (const testCase of cases) {
      const scene = validScene();
      scene.elements.push({
        id: `invalid-path-${scene.elements.length.toString()}`,
        type: "path",
        data: testCase.data,
        fill: "none",
      });
      expect(problemCodes(scene)).toContain(testCase.code);
    }

    const complete = validScene();
    complete.elements.push({
      id: "complete-path",
      type: "path",
      data: "M 0 0 C 10 10 20 20 30 30 S 40 40 50 50 Q 60 60 70 70 T 80 80 A 5 5 0 0 1 90 90 Z",
      fill: "none",
    });
    expect(validateSceneDocument(complete).success).toBe(true);
  });

  it("bounds smooth-curve controls and rotated arc extrema", () => {
    const outOfBoundsPaths = [
      "M 32768 0 C -32768 0 -32768 0 32768 0 S 32768 0 32768 0",
      "M 32768 0 Q -32768 0 32768 0 T -32768 0 T 32768 0",
      "M 32768 0 A 32768 32768 0 1 1 32768 1",
    ];
    for (const [index, data] of outOfBoundsPaths.entries()) {
      const scene = validScene();
      scene.elements.push({
        id: `out-of-bounds-curve-${index.toString()}`,
        type: "path",
        data,
        fill: "none",
      });
      expect(problemCodes(scene)).toContain("SCENE_PATH_GEOMETRY_OUT_OF_BOUNDS");
    }

    const nearBound = validScene();
    const nearBoundPaths = [
      "M 32768 0 C -32768 0 -32768 0 32768 0 L 32768 1 S 32768 1 32768 2",
      "M 32768 0 Q -32768 0 32768 0 L 32768 1 T 32768 2",
      "M 32767 2 A 2 1 90 0 0 32767 -2",
    ];
    nearBound.elements.push(
      ...nearBoundPaths.map((data, index) => ({
        id: `near-bound-curve-${index.toString()}`,
        type: "path" as const,
        data,
        fill: "none" as const,
      })),
    );
    expect(validateSceneDocument(nearBound).success).toBe(true);
  });

  it("rejects XML 1.0-forbidden characters before serialization", () => {
    const title = validScene();
    title.title = "invalid\u0000title";
    expect(problemCodes(title)).toContain("SCENE_XML_TEXT_INVALID");

    const semantic = validScene();
    semantic.elements[0]!.semantic = {
      role: "content",
      label: "unpaired \uD800 surrogate",
    };
    expect(problemCodes(semantic)).toContain("SCENE_XML_TEXT_INVALID");

    const allowed = validScene();
    allowed.title = "Tabs\tand emoji 😀 remain valid";
    expect(validateSceneDocument(allowed).success).toBe(true);
  });

  it("requires exact font hashes and declared image/font references", () => {
    const missingHash = validScene() as unknown as {
      fonts: { family: string; weight: number; style: "normal" }[];
    };
    delete (missingHash.fonts[0] as { sha256?: string }).sha256;
    expect(validateSceneDocument(missingHash).success).toBe(false);

    const missingResources = validScene();
    missingResources.assets = [];
    missingResources.fonts = [];
    expect(problemCodes(missingResources)).toEqual(
      expect.arrayContaining([
        "UNDECLARED_SCENE_ASSET_REFERENCE",
        "UNDECLARED_SCENE_FONT_REFERENCE",
      ]),
    );
  });

  it("rejects duplicate element/resource identities and Core-derived ID collisions", () => {
    const duplicateElement = validScene();
    duplicateElement.elements.push({
      id: "state-prefix",
      type: "circle",
      cx: 100,
      cy: 100,
      radius: 10,
      fill: "#112233",
    });
    expect(problemCodes(duplicateElement)).toContain("DUPLICATE_SCENE_ELEMENT_ID");

    const duplicateAsset = validScene();
    duplicateAsset.assets.push({ ...duplicateAsset.assets[0]! });
    expect(problemCodes(duplicateAsset)).toContain("DUPLICATE_SCENE_ASSET_ID");

    const duplicateFont = validScene();
    duplicateFont.fonts.push({ ...duplicateFont.fonts[0]!, sha256: HASH_B });
    expect(problemCodes(duplicateFont)).toContain("DUPLICATE_SCENE_FONT_FACE");

    const derivedCollision = validScene();
    derivedCollision.elements.push({
      id: "clip-mechanism",
      type: "circle",
      cx: 20,
      cy: 20,
      radius: 10,
      fill: "#112233",
    });
    expect(problemCodes(derivedCollision)).toContain("SCENE_DERIVED_ID_COLLISION");
  });

  it("validates connector and reading-order references across nested groups", () => {
    const invalid = validScene();
    const connector = invalid.elements[2];
    if (connector?.type !== "connector") {
      throw new Error("Fixture connector is missing.");
    }
    connector.toId = "missing-target";
    invalid.readingOrder = ["state-prefix", "missing-reading", "state-prefix"];

    expect(problemCodes(invalid)).toEqual(
      expect.arrayContaining([
        "SCENE_CONNECTOR_REFERENCE_MISSING",
        "SCENE_READING_ORDER_REFERENCE_MISSING",
        "DUPLICATE_SCENE_READING_ORDER_ID",
      ]),
    );

    const connectorInOrder = validScene();
    connectorInOrder.readingOrder.push("state-to-label");
    expect(problemCodes(connectorInOrder)).toContain(
      "SCENE_READING_ORDER_ROLE_INVALID",
    );
  });

  it("rejects self connectors, zero-length route segments, and mismatched semantics", () => {
    const invalid = validScene();
    const connector = invalid.elements[2];
    if (connector?.type !== "connector") {
      throw new Error("Fixture connector is missing.");
    }
    connector.toId = connector.fromId;
    connector.points[1] = { ...connector.points[0]! };
    connector.semantic = { role: "annotation" };

    expect(problemCodes(invalid)).toEqual(
      expect.arrayContaining([
        "SCENE_CONNECTOR_SELF_REFERENCE",
        "SCENE_CONNECTOR_ZERO_LENGTH_SEGMENT",
        "SCENE_CONNECTOR_SEMANTIC_ROLE_INVALID",
      ]),
    );
  });

  it("rejects non-finite and out-of-bound geometry plus invalid text fitting", () => {
    const nonFinite = validScene();
    const group = nonFinite.elements[0];
    if (group?.type !== "group") throw new Error("Fixture group is missing.");
    const rect = group.elements[0];
    if (rect?.type !== "rect") throw new Error("Fixture rectangle is missing.");
    rect.x = Number.NaN;
    expect(validateSceneDocument(nonFinite).success).toBe(false);

    const outOfBounds = validScene();
    const outGroup = outOfBounds.elements[0];
    if (outGroup?.type !== "group") throw new Error("Fixture group is missing.");
    const outRect = outGroup.elements[0];
    if (outRect?.type !== "rect") throw new Error("Fixture rectangle is missing.");
    outRect.x = SCENE_RESOURCE_LIMITS.maxCoordinateMagnitude + 1;
    expect(validateSceneDocument(outOfBounds).success).toBe(false);

    const fit = validScene();
    const fitGroup = fit.elements[0];
    if (fitGroup?.type !== "group") throw new Error("Fixture group is missing.");
    const text = fitGroup.elements[1];
    if (text?.type !== "text") throw new Error("Fixture text is missing.");
    text.fit.minimumFontSize = text.fit.preferredFontSize + 1;
    expect(problemCodes(fit)).toContain("SCENE_TEXT_FIT_INVALID");
  });

  it("keeps accepted geometry above the serializer resolution", () => {
    const tinyGeometry = validScene();
    const group = tinyGeometry.elements[0];
    if (group?.type !== "group") throw new Error("Fixture group is missing.");
    const rect = group.elements[0];
    if (rect?.type !== "rect") throw new Error("Fixture rectangle is missing.");
    rect.width = 0.0001;
    rect.strokeWidth = 0.0001;
    expect(validateSceneDocument(tinyGeometry).success).toBe(false);

    const tinyText = validScene();
    const textGroup = tinyText.elements[0];
    if (textGroup?.type !== "group" || textGroup.elements[1]?.type !== "text") {
      throw new Error("Fixture text is missing.");
    }
    textGroup.elements[1].fit.preferredFontSize = 0.0001;
    textGroup.elements[1].fit.minimumFontSize = 0.0001;
    expect(validateSceneDocument(tinyText).success).toBe(false);

    const tinyScale = validScene();
    const scaled = tinyScale.elements[0];
    if (scaled?.type !== "group" || scaled.transforms?.[1]?.type !== "scale") {
      throw new Error("Fixture scale is missing.");
    }
    scaled.transforms[1].x = 0.0001;
    expect(validateSceneDocument(tinyScale).success).toBe(false);

    const pathPrecision = validScene();
    pathPrecision.elements.push({
      id: "sub-resolution-path",
      type: "path",
      data: "M 0 0 L 0.0001 1",
      fill: "none",
    });
    expect(problemCodes(pathPrecision)).toContain(
      "SCENE_PATH_NUMBER_PRECISION_UNSUPPORTED",
    );
  });

  it("bounds output canvas area before rasterization", () => {
    const oversizedCanvas = validScene();
    oversizedCanvas.dimensions = {
      width: SCENE_RESOURCE_LIMITS.maxCanvasDimension,
      height: SCENE_RESOURCE_LIMITS.maxCanvasDimension,
    };
    expect(problemCodes(oversizedCanvas)).toContain(
      "SCENE_CANVAS_PIXEL_LIMIT_EXCEEDED",
    );

    const boundedCanvas = validScene();
    boundedCanvas.dimensions = {
      width: 4_096,
      height: Math.floor(SCENE_RESOURCE_LIMITS.maxCanvasPixels / 4_096),
    };
    expect(validateSceneDocument(boundedCanvas).success).toBe(true);
  });

  it("enforces aggregate element depth and count before rendering", () => {
    const tooDeep = validScene();
    let nested: SceneElement = {
      id: "depth-leaf",
      type: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fill: "#112233",
    };
    for (let depth = 0; depth < SCENE_RESOURCE_LIMITS.maxElementDepth; depth += 1) {
      nested = {
        id: `depth-group-${depth.toString()}`,
        type: "group",
        elements: [nested],
      };
    }
    tooDeep.elements = [nested];
    tooDeep.readingOrder = ["depth-leaf"];
    expect(problemCodes(tooDeep)).toContain("SCENE_ELEMENT_DEPTH_LIMIT_EXCEEDED");

    const tooMany = validScene();
    tooMany.elements = Array.from(
      { length: SCENE_RESOURCE_LIMITS.maxElements + 1 },
      (_, index) => ({
        id: `element-${index.toString()}`,
        type: "rect" as const,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        fill: "#112233" as const,
      }),
    );
    tooMany.readingOrder = [];
    expect(problemCodes(tooMany)).toContain("SCENE_ELEMENT_LIMIT_EXCEEDED");
  });

  it("enforces aggregate path, text, and connector-point limits", () => {
    const paths = validScene();
    const longPath = "M 0 0 ".repeat(9_000);
    paths.elements = Array.from({ length: 5 }, (_, index) => ({
      id: `path-${index.toString()}`,
      type: "path" as const,
      data: longPath,
      fill: "none" as const,
    }));
    paths.readingOrder = [];
    expect(problemCodes(paths)).toContain("SCENE_PATH_DATA_LIMIT_EXCEEDED");

    const text = validScene();
    const textElement = text.elements[0];
    if (textElement?.type !== "group" || textElement.elements[1]?.type !== "text") {
      throw new Error("Fixture text is missing.");
    }
    const baseText = textElement.elements[1];
    text.elements = Array.from({ length: 5 }, (_, index) => ({
      ...baseText,
      id: `text-${index.toString()}`,
      text: "x".repeat(14_000),
    }));
    text.readingOrder = [];
    expect(problemCodes(text)).toContain("SCENE_TEXT_LIMIT_EXCEEDED");

    const points = validScene();
    const pointList = Array.from({ length: 256 }, (_, index) => ({
      x: index,
      y: index,
    }));
    points.elements = [
      {
        id: "anchor-a",
        type: "circle",
        cx: 10,
        cy: 10,
        radius: 5,
        fill: "#112233",
      },
      {
        id: "anchor-b",
        type: "circle",
        cx: 20,
        cy: 20,
        radius: 5,
        fill: "#112233",
      },
      ...Array.from({ length: 17 }, (_, index) => ({
        id: `connector-${index.toString()}`,
        type: "connector" as const,
        fromId: "anchor-a",
        toId: "anchor-b",
        points: pointList,
        stroke: "#112233" as const,
        strokeWidth: 2,
        markers: { start: "none" as const, end: "arrow" as const },
      })),
    ];
    points.readingOrder = [];
    expect(problemCodes(points)).toContain("SCENE_CONNECTOR_POINT_LIMIT_EXCEEDED");
  });
});

describe("Scene input resource preflight", () => {
  it("rejects cycles and accessor-backed properties with scene-specific codes", () => {
    const cyclic = validScene() as SceneDocument & { cycle?: unknown };
    cyclic.cycle = cyclic;
    expect(getSceneInputResourceProblems(cyclic)).toEqual([
      expect.objectContaining({ code: "CYCLIC_SCENE_INPUT" }),
    ]);

    const accessor = validScene();
    Object.defineProperty(accessor, "title", {
      enumerable: true,
      get: () => "unsafe",
    });
    expect(getSceneInputResourceProblems(accessor)).toEqual([
      expect.objectContaining({ code: "UNSAFE_SCENE_INPUT", path: "$.title" }),
    ]);
  });

  it("keeps scene and metadata byte limits distinct and stable", () => {
    const oversizedScene = validScene();
    oversizedScene.description = "x".repeat(
      SCENE_RESOURCE_LIMITS.maxSceneDocumentBytes + 1,
    );
    expect(getSceneInputResourceProblems(oversizedScene)).toEqual([
      expect.objectContaining({ code: "SCENE_BYTES_LIMIT_EXCEEDED" }),
    ]);

    const oversizedMetadata = validScene();
    oversizedMetadata.metadata = {
      note: "x".repeat(SCENE_RESOURCE_LIMITS.maxMetadataBytes + 1),
    };
    expect(getSceneInputResourceProblems(oversizedMetadata)).toEqual([
      expect.objectContaining({ code: "SCENE_METADATA_BYTES_LIMIT_EXCEEDED" }),
    ]);
    expect(() => assertSceneInputResources(oversizedMetadata)).toThrow(
      expect.objectContaining({ code: "SCENE_RESOURCE_LIMIT_EXCEEDED" }),
    );
  });
});

function problemCodes(input: unknown): string[] {
  const result = validateSceneDocument(input);
  return result.success ? [] : result.problems.map(({ code }) => code);
}

function validScene(): SceneDocument {
  return {
    schemaVersion: SCENE_DOCUMENT_VERSION,
    id: "scene-token-generation",
    seed: "scene-schema-test",
    dimensions: { width: 1_800, height: 1_100 },
    title: "How one token becomes an answer",
    description: "A bounded semantic scene-kernel fixture.",
    backgroundColor: "#F6F1E7",
    assets: [
      {
        id: "decoder-image",
        mimeType: "image/png",
        sha256: HASH_A,
        width: 640,
        height: 480,
        origin: { kind: "licensed-library", sourceName: "Scene schema fixture" },
      },
    ],
    fonts: [
      {
        family: "Inter",
        weight: 700,
        style: "normal",
        sha256: HASH_B,
      },
    ],
    elements: [
      {
        id: "mechanism",
        type: "group",
        semantic: {
          role: "content",
          conceptId: "token-mechanism",
          label: "Token generation mechanism",
        },
        transforms: [
          { type: "translate", x: 10, y: 20 },
          { type: "scale", x: 1, y: 1 },
          { type: "rotate", degrees: 2, cx: 400, cy: 300 },
        ],
        clip: {
          type: "rect",
          x: 40,
          y: 40,
          width: 720,
          height: 520,
          radius: 24,
        },
        elements: [
          {
            id: "state-prefix",
            type: "rect",
            x: 80,
            y: 120,
            width: 240,
            height: 120,
            radius: 18,
            fill: "#F6F1E7",
            stroke: "#17262F",
            strokeWidth: 3,
            semantic: {
              role: "content",
              conceptId: "accepted-prefix",
              label: "Accepted prefix",
            },
          },
          {
            id: "decoder-label",
            type: "text",
            text: "Greedy decoding selects the highest-scoring token.",
            box: { x: 380, y: 120, width: 300, height: 160 },
            font: { family: "Inter", weight: 700, style: "normal" },
            fit: {
              preferredFontSize: 32,
              minimumFontSize: 20,
              maximumLines: 4,
              lineHeight: 1.15,
              align: "left",
              verticalAlign: "middle",
              letterSpacing: 0,
              keepTogether: ["Greedy decoding"],
            },
            fill: "#17262F",
            textMode: "outline-with-selectable-text",
            semantic: {
              role: "annotation",
              conceptId: "decoder-rule",
              label: "Greedy decoder rule",
            },
          },
        ],
      },
      {
        id: "decoder-visual",
        type: "image",
        assetId: "decoder-image",
        x: 900,
        y: 160,
        width: 640,
        height: 480,
        fit: "contain",
        semantic: { role: "content", label: "Decoder cutaway" },
      },
      {
        id: "state-to-label",
        type: "connector",
        fromId: "state-prefix",
        toId: "decoder-label",
        points: [
          { x: 320, y: 180 },
          { x: 350, y: 180 },
          { x: 380, y: 200 },
        ],
        stroke: "#B94A35",
        strokeWidth: 4,
        markers: { start: "none", end: "arrow" },
        lineCap: "round",
        lineJoin: "round",
        semantic: {
          role: "connector",
          conceptId: "causal-selection",
          label: "Prefix flows to decoder",
        },
      },
    ],
    readingOrder: ["mechanism", "state-prefix", "decoder-label", "decoder-visual"],
    metadata: { fixture: true },
  };
}
