import { z } from "zod";

import {
  SCENE_RESOURCE_LIMITS,
  getSceneInputResourceProblems,
} from "../resources/index.js";
import { AssetDeclarationSchema } from "../schema/design-document.js";
import { isXml10Compatible } from "../security/xml.js";
import { getScenePathDataProblem } from "./path-data.js";
import {
  SCENE_DOCUMENT_VERSION,
  type SceneDocument,
  type SceneElement,
  type SceneFontDeclaration,
  type SceneValidationResult,
} from "./types.js";

const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const sha256Hash = z.string().regex(/^[0-9a-f]{64}$/);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const paint = z.union([z.literal("none"), z.literal("transparent"), hexColor]);
const opacity = z.number().min(0).max(1);
const coordinate = z
  .number()
  .min(-SCENE_RESOURCE_LIMITS.maxCoordinateMagnitude)
  .max(SCENE_RESOURCE_LIMITS.maxCoordinateMagnitude)
  .multipleOf(SCENE_RESOURCE_LIMITS.serializationResolution);
const positiveGeometry = z
  .number()
  .min(SCENE_RESOURCE_LIMITS.serializationResolution)
  .max(SCENE_RESOURCE_LIMITS.maxCoordinateMagnitude)
  .multipleOf(SCENE_RESOURCE_LIMITS.serializationResolution);
const nonNegativeGeometry = z
  .number()
  .min(0)
  .max(SCENE_RESOURCE_LIMITS.maxCoordinateMagnitude)
  .multipleOf(SCENE_RESOURCE_LIMITS.serializationResolution);
const strokeWidth = z
  .number()
  .min(SCENE_RESOURCE_LIMITS.serializationResolution)
  .max(1_024)
  .multipleOf(SCENE_RESOURCE_LIMITS.serializationResolution);
const textSize = z
  .number()
  .min(SCENE_RESOURCE_LIMITS.serializationResolution)
  .max(1_024)
  .multipleOf(SCENE_RESOURCE_LIMITS.serializationResolution);
const lineCap = z.enum(["round", "square", "butt"]);
const lineJoin = z.enum(["round", "bevel", "miter"]);
const pathData = z
  .string()
  .min(1)
  .max(SCENE_RESOURCE_LIMITS.maxPathDataCharacters)
  .superRefine((data, context) => {
    const problem = getScenePathDataProblem(
      data,
      SCENE_RESOURCE_LIMITS.maxCoordinateMagnitude,
      SCENE_RESOURCE_LIMITS.serializationResolution,
    );
    if (problem === undefined) return;
    addSceneIssue(context, problem.code, problem.message, []);
  });

const PointSchema = z
  .object({
    x: coordinate,
    y: coordinate,
  })
  .strict();

const BoundsSchema = z
  .object({
    x: coordinate,
    y: coordinate,
    width: positiveGeometry,
    height: positiveGeometry,
  })
  .strict();

const SceneSemanticSchema = z
  .object({
    role: z.enum(["content", "annotation", "connector", "decoration"]),
    conceptId: identifier.optional(),
    label: xmlText(z.string().min(1).max(500)).optional(),
    description: xmlText(z.string().min(1).max(2_000)).optional(),
  })
  .strict();

const elementBase = {
  id: identifier,
  opacity: opacity.optional(),
  semantic: SceneSemanticSchema.optional(),
};

const strokeFields = {
  stroke: paint.optional(),
  strokeWidth: strokeWidth.optional(),
};

const RectElementSchema = z
  .object({
    ...elementBase,
    ...strokeFields,
    type: z.literal("rect"),
    x: coordinate,
    y: coordinate,
    width: positiveGeometry,
    height: positiveGeometry,
    fill: paint,
    radius: nonNegativeGeometry.optional(),
  })
  .strict();

const CircleElementSchema = z
  .object({
    ...elementBase,
    ...strokeFields,
    type: z.literal("circle"),
    cx: coordinate,
    cy: coordinate,
    radius: positiveGeometry,
    fill: paint,
  })
  .strict();

const PathElementSchema = z
  .object({
    ...elementBase,
    ...strokeFields,
    type: z.literal("path"),
    data: pathData,
    fill: paint,
    lineCap: lineCap.optional(),
    lineJoin: lineJoin.optional(),
  })
  .strict();

const ImageElementSchema = z
  .object({
    ...elementBase,
    type: z.literal("image"),
    assetId: identifier,
    x: coordinate,
    y: coordinate,
    width: positiveGeometry,
    height: positiveGeometry,
    fit: z.enum(["contain", "cover"]),
  })
  .strict();

const keepTogetherPhrase = z
  .string()
  .min(1)
  .max(200)
  .refine((phrase) => phrase.trim() === phrase, {
    message: "Keep-together phrases must not have surrounding whitespace.",
  })
  .refine((phrase) => !/[\r\n]/.test(phrase), {
    message: "Keep-together phrases cannot cross an explicit line break.",
  });

const TextFitSchema = z
  .object({
    preferredFontSize: textSize,
    minimumFontSize: textSize,
    maximumLines: z.number().int().positive().max(128),
    lineHeight: z.number().min(0.5).max(4),
    align: z.enum(["left", "center", "right"]),
    verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
    letterSpacing: z.number().min(-128).max(128).optional(),
    keepTogether: z
      .array(keepTogetherPhrase)
      .max(20)
      .refine((phrases) => new Set(phrases).size === phrases.length, {
        message: "Keep-together phrases must be unique.",
      })
      .optional(),
  })
  .strict()
  .superRefine((fit, context) => {
    if (fit.minimumFontSize <= fit.preferredFontSize) return;
    addSceneIssue(
      context,
      "SCENE_TEXT_FIT_INVALID",
      "minimumFontSize must be less than or equal to preferredFontSize.",
      ["minimumFontSize"],
    );
  });

const TextElementSchema = z
  .object({
    ...elementBase,
    type: z.literal("text"),
    text: xmlText(z.string().min(1).max(SCENE_RESOURCE_LIMITS.maxTextCharacters)),
    box: BoundsSchema,
    font: z
      .object({
        family: xmlText(z.string().min(1).max(120)),
        weight: z.number().int().min(100).max(900).multipleOf(100),
        style: z.enum(["normal", "italic"]),
      })
      .strict(),
    fit: TextFitSchema,
    fill: paint,
    textMode: z.enum(["outline", "outline-with-selectable-text"]),
  })
  .strict();

const TranslateTransformSchema = z
  .object({
    type: z.literal("translate"),
    x: coordinate,
    y: coordinate,
  })
  .strict();

const ScaleTransformSchema = z
  .object({
    type: z.literal("scale"),
    x: z
      .number()
      .min(-100)
      .max(100)
      .multipleOf(SCENE_RESOURCE_LIMITS.serializationResolution),
    y: z
      .number()
      .min(-100)
      .max(100)
      .multipleOf(SCENE_RESOURCE_LIMITS.serializationResolution),
  })
  .strict()
  .superRefine((transform, context) => {
    if (Math.abs(transform.x) < SCENE_RESOURCE_LIMITS.serializationResolution) {
      addSceneIssue(
        context,
        "SCENE_TRANSFORM_INVALID",
        `Scale x magnitude must be at least ${SCENE_RESOURCE_LIMITS.serializationResolution.toString()}.`,
        ["x"],
      );
    }
    if (Math.abs(transform.y) < SCENE_RESOURCE_LIMITS.serializationResolution) {
      addSceneIssue(
        context,
        "SCENE_TRANSFORM_INVALID",
        `Scale y magnitude must be at least ${SCENE_RESOURCE_LIMITS.serializationResolution.toString()}.`,
        ["y"],
      );
    }
  });

const RotateTransformSchema = z
  .object({
    type: z.literal("rotate"),
    degrees: z
      .number()
      .min(-360)
      .max(360)
      .multipleOf(SCENE_RESOURCE_LIMITS.serializationResolution),
    cx: coordinate.optional(),
    cy: coordinate.optional(),
  })
  .strict()
  .superRefine((transform, context) => {
    if ((transform.cx === undefined) === (transform.cy === undefined)) return;
    addSceneIssue(
      context,
      "SCENE_TRANSFORM_INVALID",
      "Rotate transforms must provide both cx and cy or neither.",
      transform.cx === undefined ? ["cx"] : ["cy"],
    );
  });

const SceneTransformSchema = z.discriminatedUnion("type", [
  TranslateTransformSchema,
  ScaleTransformSchema,
  RotateTransformSchema,
]);

const RectClipSchema = z
  .object({
    type: z.literal("rect"),
    x: coordinate,
    y: coordinate,
    width: positiveGeometry,
    height: positiveGeometry,
    radius: nonNegativeGeometry.optional(),
  })
  .strict();

const CircleClipSchema = z
  .object({
    type: z.literal("circle"),
    cx: coordinate,
    cy: coordinate,
    radius: positiveGeometry,
  })
  .strict();

const PathClipSchema = z
  .object({
    type: z.literal("path"),
    data: pathData,
  })
  .strict();

const SceneClipSchema = z.discriminatedUnion("type", [
  RectClipSchema,
  CircleClipSchema,
  PathClipSchema,
]);

export const SceneElementSchema = z.lazy(
  () => SceneElementUnionSchema,
) as unknown as z.ZodType<SceneElement>;

const GroupElementSchema = z
  .object({
    ...elementBase,
    type: z.literal("group"),
    elements: z.array(SceneElementSchema).min(1),
    transforms: z
      .array(SceneTransformSchema)
      .max(SCENE_RESOURCE_LIMITS.maxTransformsPerGroup)
      .optional(),
    clip: SceneClipSchema.optional(),
  })
  .strict();

const ConnectorElementSchema = z
  .object({
    ...elementBase,
    type: z.literal("connector"),
    fromId: identifier,
    toId: identifier,
    points: z.array(PointSchema).min(2).max(SCENE_RESOURCE_LIMITS.maxConnectorPoints),
    stroke: paint,
    strokeWidth,
    markers: z
      .object({
        start: z.enum(["none", "arrow"]),
        end: z.enum(["none", "arrow"]),
      })
      .strict(),
    lineCap: lineCap.optional(),
    lineJoin: lineJoin.optional(),
  })
  .strict();

const SceneElementUnionSchema = z.discriminatedUnion("type", [
  RectElementSchema,
  CircleElementSchema,
  PathElementSchema,
  ImageElementSchema,
  TextElementSchema,
  GroupElementSchema,
  ConnectorElementSchema,
]);

export const SceneFontDeclarationSchema: z.ZodType<SceneFontDeclaration> = z
  .object({
    family: xmlText(z.string().min(1).max(120)),
    weight: z.number().int().min(100).max(900).multipleOf(100),
    style: z.enum(["normal", "italic"]),
    sha256: sha256Hash,
  })
  .strict();

export const SceneDocumentSchema = z
  .object({
    schemaVersion: z.literal(SCENE_DOCUMENT_VERSION),
    id: identifier,
    seed: z.string().min(1).max(256),
    dimensions: z
      .object({
        width: z
          .number()
          .int()
          .positive()
          .max(SCENE_RESOURCE_LIMITS.maxCanvasDimension),
        height: z
          .number()
          .int()
          .positive()
          .max(SCENE_RESOURCE_LIMITS.maxCanvasDimension),
      })
      .strict(),
    title: xmlText(z.string().min(1).max(500)),
    description: xmlText(z.string().min(1).max(4_000)),
    backgroundColor: hexColor,
    assets: z.array(AssetDeclarationSchema).max(SCENE_RESOURCE_LIMITS.maxAssets),
    fonts: z.array(SceneFontDeclarationSchema).max(SCENE_RESOURCE_LIMITS.maxFonts),
    elements: z.array(SceneElementSchema).min(1),
    readingOrder: z.array(identifier).max(SCENE_RESOURCE_LIMITS.maxReadingOrderEntries),
    metadata: z.record(z.string(), z.json()).optional(),
  })
  .strict()
  .superRefine((document, context) => {
    refineSceneDocument(document as SceneDocument, context);
  });

export const SCENE_DOCUMENT_RUNTIME_REFINEMENTS = [
  {
    code: "UNIQUE_SCENE_ELEMENT_IDS",
    path: "$.elements[*].id",
    description: "Element IDs must be unique across the complete scene tree.",
  },
  {
    code: "UNIQUE_SCENE_DERIVED_IDS",
    path: "$.elements[*].id",
    description:
      "Element IDs must not collide with root, clip, text-line, or connector IDs generated by Core.",
  },
  {
    code: "SCENE_ELEMENT_LIMIT",
    path: "$.elements",
    description: `A scene may contain at most ${SCENE_RESOURCE_LIMITS.maxElements.toString()} elements across the complete tree.`,
  },
  {
    code: "SCENE_CANVAS_PIXEL_LIMIT",
    path: "$.dimensions",
    description: `A scene canvas may contain at most ${SCENE_RESOURCE_LIMITS.maxCanvasPixels.toString()} pixels.`,
  },
  {
    code: "SCENE_ELEMENT_DEPTH_LIMIT",
    path: "$.elements",
    description: `Scene element nesting may be at most ${SCENE_RESOURCE_LIMITS.maxElementDepth.toString()} levels deep.`,
  },
  {
    code: "SCENE_RESOURCE_REFERENCES",
    path: "$.elements[*]",
    description:
      "Every image and text element must reference a declared asset or font.",
  },
  {
    code: "SCENE_CONNECTOR_REFERENCES",
    path: "$.elements[*].fromId|toId",
    description:
      "Every connector endpoint must reference a different element in the scene.",
  },
  {
    code: "SCENE_CONNECTOR_GEOMETRY",
    path: "$.elements[*].points",
    description: "Connector routes must not contain zero-length adjacent segments.",
  },
  {
    code: "SCENE_CONNECTOR_SEMANTICS",
    path: "$.elements[*].semantic.role",
    description:
      "Connector semantic metadata, when present, must use the connector role.",
  },
  {
    code: "SCENE_READING_ORDER_REFERENCES",
    path: "$.readingOrder[*]",
    description:
      "Reading-order IDs must be unique and reference non-connector scene elements outside decorative subtrees.",
  },
  {
    code: "SCENE_AGGREGATE_CONTENT_LIMITS",
    path: "$.elements",
    description: "Total path data, text, and connector points are bounded.",
  },
  {
    code: "SCENE_PATH_DATA_GRAMMAR",
    path: "$.elements[*].data|clip.data",
    description:
      "Path data must use complete supported SVG command groups with finite, bounded resolved geometry.",
  },
  {
    code: "SCENE_XML_TEXT",
    path: "$.title|description|elements[*].text|semantic|font.family",
    description:
      "Every string serialized into SVG must contain only XML 1.0 characters.",
  },
] as const;

export function validateSceneDocument(input: unknown): SceneValidationResult {
  const resourceProblems = getSceneInputResourceProblems(input);
  if (resourceProblems.length > 0) {
    return { success: false, problems: resourceProblems };
  }
  const result = SceneDocumentSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as SceneDocument, problems: [] };
  }
  return {
    success: false,
    problems: result.error.issues.map((issue) => ({
      path: formatIssuePath(issue.path),
      code:
        issue.code === "custom" && typeof issue.params?.["sceneCode"] === "string"
          ? issue.params["sceneCode"]
          : issue.code,
      message: issue.message,
    })),
  };
}

export function getSceneDocumentJsonSchema(): object {
  const schema = z.toJSONSchema(SceneDocumentSchema, {
    io: "input",
    target: "draft-2020-12",
    unrepresentable: "throw",
  });
  return {
    ...schema,
    $comment:
      "Run validateSceneDocument after JSON Schema validation for the refinements exported as SCENE_DOCUMENT_RUNTIME_REFINEMENTS.",
  };
}

type SceneElementEntry = {
  element: SceneElement;
  path: (string | number)[];
  depth: number;
  decorativeAncestor: boolean;
};

function refineSceneDocument(document: SceneDocument, context: z.RefinementCtx): void {
  const canvasPixels = document.dimensions.width * document.dimensions.height;
  if (canvasPixels > SCENE_RESOURCE_LIMITS.maxCanvasPixels) {
    addSceneIssue(
      context,
      "SCENE_CANVAS_PIXEL_LIMIT_EXCEEDED",
      `Scene canvas contains ${canvasPixels.toString()} pixels; at most ${SCENE_RESOURCE_LIMITS.maxCanvasPixels.toString()} are allowed.`,
      ["dimensions"],
    );
  }
  checkUniqueAssetIds(document, context);
  checkUniqueFontFaces(document, context);

  const entries = collectElementEntries(document.elements);
  if (entries.length > SCENE_RESOURCE_LIMITS.maxElements) {
    addSceneIssue(
      context,
      "SCENE_ELEMENT_LIMIT_EXCEEDED",
      `Scene contains ${entries.length.toString()} elements; at most ${SCENE_RESOURCE_LIMITS.maxElements.toString()} are allowed.`,
      ["elements"],
    );
  }

  const elementsById = new Map<string, SceneElementEntry>();
  for (const entry of entries) {
    if (entry.depth > SCENE_RESOURCE_LIMITS.maxElementDepth) {
      addSceneIssue(
        context,
        "SCENE_ELEMENT_DEPTH_LIMIT_EXCEEDED",
        `Scene element nesting exceeds ${SCENE_RESOURCE_LIMITS.maxElementDepth.toString()} levels.`,
        [...entry.path],
      );
    }
    const previous = elementsById.get(entry.element.id);
    if (previous !== undefined) {
      addSceneIssue(
        context,
        "DUPLICATE_SCENE_ELEMENT_ID",
        `Duplicate scene element ID "${entry.element.id}".`,
        [...entry.path, "id"],
      );
      continue;
    }
    elementsById.set(entry.element.id, entry);
  }

  checkDerivedIds(entries, elementsById, context);
  checkResourceReferences(document, entries, context);
  checkConnectorReferences(entries, elementsById, context);
  checkReadingOrder(document, elementsById, context);
  checkAggregateContentLimits(entries, context);
}

function collectElementEntries(elements: readonly SceneElement[]): SceneElementEntry[] {
  const entries: SceneElementEntry[] = [];
  const pending: SceneElementEntry[] = [];
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    pending.push({
      element: elements[index]!,
      path: ["elements", index],
      depth: 1,
      decorativeAncestor: false,
    });
  }
  while (pending.length > 0) {
    const entry = pending.pop()!;
    entries.push(entry);
    if (entry.element.type !== "group") continue;
    const decorativeAncestor =
      entry.decorativeAncestor || entry.element.semantic?.role === "decoration";
    for (let index = entry.element.elements.length - 1; index >= 0; index -= 1) {
      pending.push({
        element: entry.element.elements[index]!,
        path: [...entry.path, "elements", index],
        depth: entry.depth + 1,
        decorativeAncestor,
      });
    }
  }
  return entries;
}

function checkUniqueAssetIds(document: SceneDocument, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const [index, asset] of document.assets.entries()) {
    if (seen.has(asset.id)) {
      addSceneIssue(
        context,
        "DUPLICATE_SCENE_ASSET_ID",
        `Duplicate scene asset ID "${asset.id}".`,
        ["assets", index, "id"],
      );
    }
    seen.add(asset.id);
  }
}

function checkUniqueFontFaces(document: SceneDocument, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const [index, font] of document.fonts.entries()) {
    const key = fontKey(font.family, font.weight, font.style);
    if (seen.has(key)) {
      addSceneIssue(
        context,
        "DUPLICATE_SCENE_FONT_FACE",
        `Duplicate scene font face "${font.family}" (${font.weight.toString()} ${font.style}).`,
        ["fonts", index],
      );
    }
    seen.add(key);
  }
}

function checkDerivedIds(
  entries: readonly SceneElementEntry[],
  elementsById: ReadonlyMap<string, SceneElementEntry>,
  context: z.RefinementCtx,
): void {
  const claimed = new Map<string, (string | number)[]>([
    ["title", ["title"]],
    ["desc", ["description"]],
  ]);
  for (const entry of entries) {
    const idPath = [...entry.path, "id"];
    const rootClaim = claimed.get(entry.element.id);
    if (rootClaim !== undefined) {
      addSceneIssue(
        context,
        "SCENE_DERIVED_ID_COLLISION",
        `Scene element ID "${entry.element.id}" collides with a Core-owned SVG ID.`,
        idPath,
      );
    }
    claimed.set(entry.element.id, idPath);
  }

  for (const entry of entries) {
    for (const derivedId of derivedIds(entry.element)) {
      const collision = claimed.get(derivedId);
      if (collision !== undefined || elementsById.has(derivedId)) {
        addSceneIssue(
          context,
          "SCENE_DERIVED_ID_COLLISION",
          `Core-derived SVG ID "${derivedId}" collides with another scene ID.`,
          [...entry.path, "id"],
        );
      }
      claimed.set(derivedId, [...entry.path, "id"]);
    }
  }
}

function derivedIds(element: SceneElement): string[] {
  if (element.type === "group" && element.clip !== undefined) {
    return [`clip-${element.id}`];
  }
  if (element.type === "text") {
    const ids = Array.from(
      { length: element.fit.maximumLines },
      (_, index) => `${element.id}-line-${index.toString()}`,
    );
    if (element.textMode === "outline-with-selectable-text") {
      ids.push(`${element.id}-selectable-text`);
    }
    return ids;
  }
  if (element.type === "connector") {
    return [
      `${element.id}-shaft`,
      ...(element.markers.start === "arrow" ? [`${element.id}-marker-start`] : []),
      ...(element.markers.end === "arrow" ? [`${element.id}-marker-end`] : []),
    ];
  }
  return [];
}

function checkResourceReferences(
  document: SceneDocument,
  entries: readonly SceneElementEntry[],
  context: z.RefinementCtx,
): void {
  const assetIds = new Set(document.assets.map((asset) => asset.id));
  const fonts = new Set(
    document.fonts.map((font) => fontKey(font.family, font.weight, font.style)),
  );
  for (const entry of entries) {
    if (entry.element.type === "image" && !assetIds.has(entry.element.assetId)) {
      addSceneIssue(
        context,
        "UNDECLARED_SCENE_ASSET_REFERENCE",
        `Image references undeclared asset "${entry.element.assetId}".`,
        [...entry.path, "assetId"],
      );
    }
    if (entry.element.type !== "text") continue;
    const { family, weight, style } = entry.element.font;
    if (fonts.has(fontKey(family, weight, style))) continue;
    addSceneIssue(
      context,
      "UNDECLARED_SCENE_FONT_REFERENCE",
      `Text references undeclared font "${family}" (${weight.toString()} ${style}).`,
      [...entry.path, "font"],
    );
  }
}

function checkConnectorReferences(
  entries: readonly SceneElementEntry[],
  elementsById: ReadonlyMap<string, SceneElementEntry>,
  context: z.RefinementCtx,
): void {
  for (const entry of entries) {
    if (entry.element.type !== "connector") continue;
    if (entry.element.fromId === entry.element.toId) {
      addSceneIssue(
        context,
        "SCENE_CONNECTOR_SELF_REFERENCE",
        "Connector source and target must reference different elements.",
        [...entry.path, "toId"],
      );
    }
    if (!elementsById.has(entry.element.fromId)) {
      addSceneIssue(
        context,
        "SCENE_CONNECTOR_REFERENCE_MISSING",
        `Connector source "${entry.element.fromId}" does not exist.`,
        [...entry.path, "fromId"],
      );
    }
    if (!elementsById.has(entry.element.toId)) {
      addSceneIssue(
        context,
        "SCENE_CONNECTOR_REFERENCE_MISSING",
        `Connector target "${entry.element.toId}" does not exist.`,
        [...entry.path, "toId"],
      );
    }
    if (
      entry.element.semantic !== undefined &&
      entry.element.semantic.role !== "connector"
    ) {
      addSceneIssue(
        context,
        "SCENE_CONNECTOR_SEMANTIC_ROLE_INVALID",
        'Connector semantic metadata must use role "connector".',
        [...entry.path, "semantic", "role"],
      );
    }
    for (let index = 1; index < entry.element.points.length; index += 1) {
      const previous = entry.element.points[index - 1]!;
      const current = entry.element.points[index]!;
      if (previous.x !== current.x || previous.y !== current.y) continue;
      addSceneIssue(
        context,
        "SCENE_CONNECTOR_ZERO_LENGTH_SEGMENT",
        "Adjacent connector points must define a non-zero-length segment.",
        [...entry.path, "points", index],
      );
    }
  }
}

function checkReadingOrder(
  document: SceneDocument,
  elementsById: ReadonlyMap<string, SceneElementEntry>,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, id] of document.readingOrder.entries()) {
    if (seen.has(id)) {
      addSceneIssue(
        context,
        "DUPLICATE_SCENE_READING_ORDER_ID",
        `Reading-order ID "${id}" appears more than once.`,
        ["readingOrder", index],
      );
    }
    seen.add(id);
    const entry = elementsById.get(id);
    if (entry === undefined) {
      addSceneIssue(
        context,
        "SCENE_READING_ORDER_REFERENCE_MISSING",
        `Reading-order ID "${id}" does not exist.`,
        ["readingOrder", index],
      );
      continue;
    }
    if (
      entry.element.type === "connector" ||
      entry.element.semantic?.role === "connector" ||
      entry.element.semantic?.role === "decoration" ||
      entry.decorativeAncestor
    ) {
      addSceneIssue(
        context,
        "SCENE_READING_ORDER_ROLE_INVALID",
        `Reading-order ID "${id}" refers to a connector or decorative subtree.`,
        ["readingOrder", index],
      );
    }
  }
}

function checkAggregateContentLimits(
  entries: readonly SceneElementEntry[],
  context: z.RefinementCtx,
): void {
  let pathCharacters = 0;
  let textCharacters = 0;
  let connectorPoints = 0;
  for (const entry of entries) {
    if (entry.element.type === "path") pathCharacters += entry.element.data.length;
    if (entry.element.type === "text") textCharacters += entry.element.text.length;
    if (entry.element.type === "connector") {
      connectorPoints += entry.element.points.length;
    }
    if (entry.element.type === "group" && entry.element.clip?.type === "path") {
      pathCharacters += entry.element.clip.data.length;
    }
  }
  if (pathCharacters > SCENE_RESOURCE_LIMITS.maxTotalPathDataCharacters) {
    addSceneIssue(
      context,
      "SCENE_PATH_DATA_LIMIT_EXCEEDED",
      `Scene path data exceeds ${SCENE_RESOURCE_LIMITS.maxTotalPathDataCharacters.toString()} characters.`,
      ["elements"],
    );
  }
  if (textCharacters > SCENE_RESOURCE_LIMITS.maxTotalTextCharacters) {
    addSceneIssue(
      context,
      "SCENE_TEXT_LIMIT_EXCEEDED",
      `Scene text exceeds ${SCENE_RESOURCE_LIMITS.maxTotalTextCharacters.toString()} characters.`,
      ["elements"],
    );
  }
  if (connectorPoints > SCENE_RESOURCE_LIMITS.maxTotalConnectorPoints) {
    addSceneIssue(
      context,
      "SCENE_CONNECTOR_POINT_LIMIT_EXCEEDED",
      `Scene connectors exceed ${SCENE_RESOURCE_LIMITS.maxTotalConnectorPoints.toString()} points.`,
      ["elements"],
    );
  }
}

function fontKey(family: string, weight: number, style: string): string {
  return `${family.toLocaleLowerCase("en-US")}\u0000${weight.toString()}\u0000${style}`;
}

function addSceneIssue(
  context: z.RefinementCtx,
  sceneCode: string,
  message: string,
  path: PropertyKey[],
): void {
  context.addIssue({
    code: "custom",
    message,
    path,
    params: { sceneCode },
  });
}

function xmlText(schema: z.ZodString): z.ZodString {
  return schema.superRefine((value, context) => {
    if (isXml10Compatible(value)) return;
    addSceneIssue(
      context,
      "SCENE_XML_TEXT_INVALID",
      "SVG text must contain only XML 1.0 characters.",
      [],
    );
  });
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "$";
  return path.reduce<string>((output, part) => {
    if (typeof part === "number") return `${output}[${part.toString()}]`;
    const segment = String(part);
    return output.length === 0 ? segment : `${output}.${segment}`;
  }, "");
}
