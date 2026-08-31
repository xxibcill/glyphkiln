import { hashCanonical, sha256 } from "../cache/canonical.js";
import {
  RENDERER_NAME,
  RENDERER_VERSION,
  type Dimensions,
  type OutputFormat,
  type QualityIssue,
  type RenderingMethod,
} from "../domain/types.js";
import type { ManifestAsset, ManifestFont } from "../provenance/index.js";
import {
  RENDER_RESOURCE_LIMITS,
  getSceneInputResourceProblems,
} from "../resources/index.js";
import { validateSceneDocument } from "./schema.js";
import { createSceneFingerprint, SCENE_KERNEL_VERSION } from "./fingerprint.js";
import { flattenElements } from "./flatten.js";
import { fontReferenceKey } from "../fonts/key.js";
import type { SceneDocument, SceneElement } from "./types.js";

export const SCENE_RENDER_MANIFEST_VERSION = "1.0.0" as const;
export const SCENE_PRODUCT_CLAIM =
  "Rendered deterministically from a validated Glyphkiln scene; authorship, subject accuracy, and comprehension require separate review." as const;

export type SceneRenderManifest = {
  manifestVersion: typeof SCENE_RENDER_MANIFEST_VERSION;
  renderId: string;
  renderFingerprint: string;
  input: {
    kind: "scene";
    sceneVersion: SceneDocument["schemaVersion"];
    sceneId: string;
    sceneHash: string;
  };
  sceneKernelVersion: typeof SCENE_KERNEL_VERSION;
  renderer: {
    name: typeof RENDERER_NAME;
    version: typeof RENDERER_VERSION;
  };
  assets: ManifestAsset[];
  fonts: ManifestFont[];
  dimensions: Dimensions;
  output: {
    format: OutputFormat;
    sha256: string;
    byteSize: number;
  };
  creationTimestamp: string;
  renderingMethod: RenderingMethod;
  qualityIssues: QualityIssue[];
  accessibility: {
    title: string;
    description: string;
    readingOrder: string[];
    selectableText: boolean;
  };
  productClaim: typeof SCENE_PRODUCT_CLAIM;
};

export type CreateSceneRenderManifestInput = {
  document: SceneDocument;
  fingerprint: string;
  assets: ManifestAsset[];
  fonts: ManifestFont[];
  outputFormat: OutputFormat;
  outputHash: string;
  outputByteSize: number;
  creationTimestamp: string;
  renderingMethod: RenderingMethod;
  qualityIssues: QualityIssue[];
  selectableText: boolean;
};

export function createSceneRenderManifest(
  input: CreateSceneRenderManifestInput,
): SceneRenderManifest {
  return {
    manifestVersion: SCENE_RENDER_MANIFEST_VERSION,
    renderId: `scene_${input.fingerprint.slice(0, 24)}`,
    renderFingerprint: input.fingerprint,
    input: {
      kind: "scene",
      sceneVersion: input.document.schemaVersion,
      sceneId: input.document.id,
      sceneHash: hashCanonical(input.document),
    },
    sceneKernelVersion: SCENE_KERNEL_VERSION,
    renderer: { name: RENDERER_NAME, version: RENDERER_VERSION },
    assets: input.assets,
    fonts: input.fonts,
    dimensions: { ...input.document.dimensions },
    output: {
      format: input.outputFormat,
      sha256: input.outputHash,
      byteSize: input.outputByteSize,
    },
    creationTimestamp: input.creationTimestamp,
    renderingMethod: input.renderingMethod,
    qualityIssues: input.qualityIssues,
    accessibility: {
      title: input.document.title,
      description: input.document.description,
      readingOrder: [...input.document.readingOrder],
      selectableText: input.selectableText,
    },
    productClaim: SCENE_PRODUCT_CLAIM,
  };
}

export function verifySceneReproduction(input: {
  document: unknown;
  bytes: Uint8Array;
  manifest: unknown;
}): QualityIssue[] {
  if (!isSceneRenderManifestInput(input.manifest)) {
    return [
      {
        code: "INVALID_SCENE_RENDER_MANIFEST",
        severity: "error",
        message: "The reproduction manifest is not a complete scene manifest.",
      },
    ];
  }
  const validation = validateSceneDocument(input.document);
  if (!validation.success) {
    return [
      {
        code: "INVALID_REPRODUCTION_SCENE",
        severity: "error",
        message: "The reproduction input is not a valid scene document.",
        details: { problems: validation.problems },
      },
    ];
  }
  const document = validation.data;
  const issues: QualityIssue[] = [];
  const sceneHash = hashCanonical(document);
  if (input.manifest.manifestVersion !== SCENE_RENDER_MANIFEST_VERSION) {
    issues.push(
      mismatch(
        "SCENE_MANIFEST_VERSION_MISMATCH",
        "The scene manifest version does not match this verifier.",
        SCENE_RENDER_MANIFEST_VERSION,
        input.manifest.manifestVersion,
      ),
    );
  }
  if (
    input.manifest.input.kind !== "scene" ||
    input.manifest.input.sceneVersion !== document.schemaVersion ||
    input.manifest.input.sceneId !== document.id
  ) {
    issues.push({
      code: "SCENE_MANIFEST_INPUT_MISMATCH",
      severity: "error",
      message: "The scene manifest input identity does not match the document.",
      details: {
        expected: {
          kind: "scene",
          sceneVersion: document.schemaVersion,
          sceneId: document.id,
        },
        actual: {
          kind: input.manifest.input.kind,
          sceneVersion: input.manifest.input.sceneVersion,
          sceneId: input.manifest.input.sceneId,
        },
      },
    });
  }
  if (input.manifest.sceneKernelVersion !== SCENE_KERNEL_VERSION) {
    issues.push(
      mismatch(
        "SCENE_KERNEL_VERSION_MISMATCH",
        "The scene manifest kernel version does not match this verifier.",
        SCENE_KERNEL_VERSION,
        input.manifest.sceneKernelVersion,
      ),
    );
  }
  if (
    input.manifest.renderer.name !== RENDERER_NAME ||
    input.manifest.renderer.version !== RENDERER_VERSION
  ) {
    issues.push({
      code: "SCENE_RENDERER_IDENTITY_MISMATCH",
      severity: "error",
      message: "The scene manifest renderer identity does not match this verifier.",
      details: {
        expected: { name: RENDERER_NAME, version: RENDERER_VERSION },
        actual: input.manifest.renderer,
      },
    });
  }
  if (sceneHash !== input.manifest.input.sceneHash) {
    issues.push({
      code: "SCENE_DOCUMENT_HASH_MISMATCH",
      severity: "error",
      message: "The scene document does not match the scene render manifest.",
      details: {
        expected: input.manifest.input.sceneHash,
        actual: sceneHash,
      },
    });
  }

  const elements = flattenElements(document.elements, (element) =>
    element.type === "group" ? element.elements : undefined,
  );
  const assets = expectedManifestAssets(document, elements);
  const fonts = expectedManifestFonts(document, elements);
  if (!sameCanonical(assets, input.manifest.assets)) {
    issues.push({
      code: "SCENE_MANIFEST_ASSETS_MISMATCH",
      severity: "error",
      message: "The scene manifest assets do not match used document declarations.",
      details: {
        expected: assets,
        actual: input.manifest.assets,
      },
    });
  }
  if (!sameCanonical(fonts, input.manifest.fonts)) {
    issues.push({
      code: "SCENE_MANIFEST_FONTS_MISMATCH",
      severity: "error",
      message: "The scene manifest fonts do not match used document declarations.",
      details: {
        expected: fonts,
        actual: input.manifest.fonts,
      },
    });
  }
  if (!sameCanonical(document.dimensions, input.manifest.dimensions)) {
    issues.push({
      code: "SCENE_MANIFEST_DIMENSIONS_MISMATCH",
      severity: "error",
      message: "The scene manifest dimensions do not match the document.",
      details: {
        expected: document.dimensions,
        actual: input.manifest.dimensions,
      },
    });
  }

  const accessibility = {
    title: document.title,
    description: document.description,
    readingOrder: [...document.readingOrder],
    selectableText: elements.some(
      (element) =>
        element.type === "text" && element.textMode === "outline-with-selectable-text",
    ),
  };
  if (!sameCanonical(accessibility, input.manifest.accessibility)) {
    issues.push({
      code: "SCENE_MANIFEST_ACCESSIBILITY_MISMATCH",
      severity: "error",
      message: "The scene manifest accessibility mirror does not match the document.",
      details: {
        expected: accessibility,
        actual: input.manifest.accessibility,
      },
    });
  }
  if (input.manifest.productClaim !== SCENE_PRODUCT_CLAIM) {
    issues.push(
      mismatch(
        "SCENE_PRODUCT_CLAIM_MISMATCH",
        "The scene manifest product claim does not match this verifier.",
        SCENE_PRODUCT_CLAIM,
        input.manifest.productClaim,
      ),
    );
  }

  const format = input.manifest.output.format;
  if (format !== "svg" && format !== "png") {
    issues.push({
      code: "SCENE_OUTPUT_FORMAT_INVALID",
      severity: "error",
      message: "The scene manifest output format is not supported.",
      details: { actual: format, supported: ["svg", "png"] },
    });
  } else {
    const fingerprint = createSceneFingerprint({
      document,
      outputFormat: format,
      assets,
      fonts,
    });
    if (fingerprint !== input.manifest.renderFingerprint) {
      issues.push({
        code: "SCENE_RENDER_FINGERPRINT_MISMATCH",
        severity: "error",
        message:
          "The scene document and declared resources do not reproduce the render fingerprint.",
        details: {
          expected: input.manifest.renderFingerprint,
          actual: fingerprint,
        },
      });
    }
    const renderId = `scene_${fingerprint.slice(0, 24)}`;
    if (input.manifest.renderId !== renderId) {
      issues.push(
        mismatch(
          "SCENE_RENDER_ID_MISMATCH",
          "The scene render ID does not derive from the reproduced fingerprint.",
          renderId,
          input.manifest.renderId,
        ),
      );
    }
    const renderingMethod =
      format === "svg"
        ? "deterministic-code-rendering/direct-svg"
        : "deterministic-code-rendering/resvg";
    if (input.manifest.renderingMethod !== renderingMethod) {
      issues.push(
        mismatch(
          "SCENE_RENDERING_METHOD_MISMATCH",
          "The scene rendering method does not match the output format.",
          renderingMethod,
          input.manifest.renderingMethod,
        ),
      );
    }
    if (!bytesMatchFormat(input.bytes, format)) {
      issues.push(
        mismatch(
          "SCENE_OUTPUT_FORMAT_MISMATCH",
          "The reproduced bytes do not match the manifest output format.",
          format,
          detectedFormat(input.bytes) ?? "unknown",
        ),
      );
    }
  }
  if (input.bytes.byteLength !== input.manifest.output.byteSize) {
    issues.push({
      code: "OUTPUT_SIZE_MISMATCH",
      severity: "error",
      message: "The reproduced output byte size does not match the manifest.",
      details: {
        expected: input.manifest.output.byteSize,
        actual: input.bytes.byteLength,
      },
    });
  }
  const outputHash = sha256(input.bytes);
  if (outputHash !== input.manifest.output.sha256) {
    issues.push({
      code: "OUTPUT_HASH_MISMATCH",
      severity: "error",
      message: "The reproduced output hash does not match the manifest.",
      details: {
        expected: input.manifest.output.sha256,
        actual: outputHash,
      },
    });
  }
  return issues;
}

function expectedManifestAssets(
  document: SceneDocument,
  elements: readonly SceneElement[],
): ManifestAsset[] {
  const usedIds = new Set(
    elements.flatMap((element) => (element.type === "image" ? [element.assetId] : [])),
  );
  return document.assets
    .filter((asset) => usedIds.has(asset.id))
    .map((asset) => ({
      id: asset.id,
      sha256: asset.sha256,
      origin: asset.origin,
    }));
}

function expectedManifestFonts(
  document: SceneDocument,
  elements: readonly SceneElement[],
): ManifestFont[] {
  const usedKeys = new Set(
    elements.flatMap((element) =>
      element.type === "text"
        ? [
            fontReferenceKey(
              element.font.family,
              element.font.weight,
              element.font.style,
            ),
          ]
        : [],
    ),
  );
  return document.fonts
    .filter((font) =>
      usedKeys.has(fontReferenceKey(font.family, font.weight, font.style)),
    )
    .map((font) => ({ ...font }));
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return hashCanonical(left) === hashCanonical(right);
  } catch {
    return false;
  }
}

function mismatch(
  code: string,
  message: string,
  expected: unknown,
  actual: unknown,
): QualityIssue {
  return {
    code,
    severity: "error",
    message,
    details: { expected, actual },
  };
}

function bytesMatchFormat(bytes: Uint8Array, format: OutputFormat): boolean {
  return detectedFormat(bytes) === format;
}

function detectedFormat(bytes: Uint8Array): OutputFormat | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x3c &&
    bytes[1] === 0x73 &&
    bytes[2] === 0x76 &&
    bytes[3] === 0x67
  ) {
    return "svg";
  }
  return undefined;
}

type SceneRenderManifestInput = {
  manifestVersion: string;
  renderId: string;
  renderFingerprint: string;
  input: {
    kind: string;
    sceneVersion: string;
    sceneId: string;
    sceneHash: string;
  };
  sceneKernelVersion: string;
  renderer: { name: string; version: string };
  assets: ManifestAsset[];
  fonts: ManifestFont[];
  dimensions: Dimensions;
  output: { format: string; sha256: string; byteSize: number };
  creationTimestamp: string;
  renderingMethod: string;
  qualityIssues: QualityIssue[];
  accessibility: {
    title: string;
    description: string;
    readingOrder: string[];
    selectableText: boolean;
  };
  productClaim: string;
};

function isSceneRenderManifestInput(value: unknown): value is SceneRenderManifestInput {
  if (getSceneInputResourceProblems(value).length > 0 || !isRecord(value)) return false;
  if (
    !hasOnlyKeys(value, [
      "manifestVersion",
      "renderId",
      "renderFingerprint",
      "input",
      "sceneKernelVersion",
      "renderer",
      "assets",
      "fonts",
      "dimensions",
      "output",
      "creationTimestamp",
      "renderingMethod",
      "qualityIssues",
      "accessibility",
      "productClaim",
    ])
  ) {
    return false;
  }
  const manifestInput = value["input"];
  const renderer = value["renderer"];
  const dimensions = value["dimensions"];
  const output = value["output"];
  const accessibility = value["accessibility"];
  return (
    typeof value["manifestVersion"] === "string" &&
    typeof value["renderId"] === "string" &&
    typeof value["renderFingerprint"] === "string" &&
    isRecord(manifestInput) &&
    hasOnlyKeys(manifestInput, ["kind", "sceneVersion", "sceneId", "sceneHash"]) &&
    typeof manifestInput["kind"] === "string" &&
    typeof manifestInput["sceneVersion"] === "string" &&
    typeof manifestInput["sceneId"] === "string" &&
    typeof manifestInput["sceneHash"] === "string" &&
    typeof value["sceneKernelVersion"] === "string" &&
    isRecord(renderer) &&
    hasOnlyKeys(renderer, ["name", "version"]) &&
    typeof renderer["name"] === "string" &&
    typeof renderer["version"] === "string" &&
    isDenseArrayOf(value["assets"], isManifestAssetInput) &&
    isDenseArrayOf(value["fonts"], isManifestFontInput) &&
    isRecord(dimensions) &&
    hasOnlyKeys(dimensions, ["width", "height"]) &&
    isPositiveInteger(dimensions["width"]) &&
    isPositiveInteger(dimensions["height"]) &&
    isRecord(output) &&
    hasOnlyKeys(output, ["format", "sha256", "byteSize"]) &&
    typeof output["format"] === "string" &&
    typeof output["sha256"] === "string" &&
    isNonNegativeInteger(output["byteSize"]) &&
    typeof value["creationTimestamp"] === "string" &&
    Buffer.byteLength(value["creationTimestamp"]) <=
      RENDER_RESOURCE_LIMITS.maxCreationTimestampBytes &&
    typeof value["renderingMethod"] === "string" &&
    isDenseArrayOf(value["qualityIssues"], isQualityIssueInput) &&
    isRecord(accessibility) &&
    hasOnlyKeys(accessibility, [
      "title",
      "description",
      "readingOrder",
      "selectableText",
    ]) &&
    typeof accessibility["title"] === "string" &&
    typeof accessibility["description"] === "string" &&
    isDenseArrayOf(
      accessibility["readingOrder"],
      (entry): entry is string => typeof entry === "string",
    ) &&
    typeof accessibility["selectableText"] === "boolean" &&
    typeof value["productClaim"] === "string"
  );
}

function isManifestAssetInput(value: unknown): value is ManifestAsset {
  if (!isRecord(value) || !isRecord(value["origin"])) return false;
  const origin = value["origin"];
  return (
    hasOnlyKeys(value, ["id", "sha256", "origin"]) &&
    hasOnlyKeys(origin, [
      "kind",
      "sourceName",
      "sourceReference",
      "generativeImageModel",
    ]) &&
    typeof value["id"] === "string" &&
    isSha256(value["sha256"]) &&
    (origin["kind"] === "user-upload" ||
      origin["kind"] === "licensed-library" ||
      origin["kind"] === "generated" ||
      origin["kind"] === "unknown") &&
    isOptionalString(origin["sourceName"]) &&
    isOptionalString(origin["sourceReference"]) &&
    isOptionalString(origin["generativeImageModel"])
  );
}

function isManifestFontInput(value: unknown): value is ManifestFont {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["family", "weight", "style", "sha256"]) &&
    typeof value["family"] === "string" &&
    Number.isInteger(value["weight"]) &&
    (value["style"] === "normal" || value["style"] === "italic") &&
    isSha256(value["sha256"])
  );
}

function isQualityIssueInput(value: unknown): value is QualityIssue {
  if (!isRecord(value)) return false;
  return (
    hasOnlyKeys(value, ["code", "severity", "message", "layerId", "details"]) &&
    isBoundedString(value["code"], 1, 128) &&
    value["severity"] === "warning" &&
    isBoundedString(value["message"], 1, 4_000) &&
    (value["layerId"] === undefined || isBoundedString(value["layerId"], 1, 128)) &&
    (value["details"] === undefined ||
      (isRecord(value["details"]) && isJsonValue(value["details"])))
  );
}

function isDenseArrayOf<T>(
  value: unknown,
  predicate: (entry: unknown) => entry is T,
): value is T[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !predicate(value[index])) return false;
  }
  return true;
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index) || !isJsonValue(value[index])) return false;
    }
    return true;
  }
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimumLength &&
    value.length <= maximumLength
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
