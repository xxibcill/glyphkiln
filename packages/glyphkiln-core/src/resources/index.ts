import {
  GlyphkilnError,
  type ResolvedAsset,
  type ResolvedFont,
} from "../domain/types.js";

export type RenderResourceLimits = {
  maxDesignDocumentBytes: number;
  maxDesignDocumentDepth: number;
  maxDesignDocumentEntries: number;
  maxMetadataBytes: number;
  maxMetadataDepth: number;
  maxMetadataEntries: number;
  maxAssets: number;
  maxAssetBytes: number;
  maxTotalAssetBytes: number;
  maxAssetDimension: number;
  maxAssetPixels: number;
  maxTotalAssetPixels: number;
  maxFonts: number;
  maxFontBytes: number;
  maxTotalFontBytes: number;
  maxOutputFormats: number;
  maxCreationTimestampBytes: number;
};

export const RENDER_RESOURCE_LIMITS: Readonly<RenderResourceLimits> = Object.freeze({
  maxDesignDocumentBytes: 1_048_576,
  maxDesignDocumentDepth: 32,
  maxDesignDocumentEntries: 10_000,
  maxMetadataBytes: 65_536,
  maxMetadataDepth: 12,
  maxMetadataEntries: 2_048,
  maxAssets: 100,
  maxAssetBytes: 16_777_216,
  maxTotalAssetBytes: 50_331_648,
  maxAssetDimension: 8_192,
  maxAssetPixels: 40_000_000,
  maxTotalAssetPixels: 80_000_000,
  maxFonts: 32,
  maxFontBytes: 10_485_760,
  maxTotalFontBytes: 33_554_432,
  maxOutputFormats: 2,
  maxCreationTimestampBytes: 128,
});

export type SceneResourceLimits = {
  maxSceneDocumentBytes: number;
  maxSceneDocumentDepth: number;
  maxSceneDocumentEntries: number;
  maxMetadataBytes: number;
  maxMetadataDepth: number;
  maxMetadataEntries: number;
  maxAssets: number;
  maxFonts: number;
  maxCanvasDimension: number;
  maxCanvasPixels: number;
  maxCoordinateMagnitude: number;
  serializationResolution: number;
  maxElements: number;
  maxElementDepth: number;
  maxPathDataCharacters: number;
  maxTotalPathDataCharacters: number;
  maxTextCharacters: number;
  maxTotalTextCharacters: number;
  maxConnectorPoints: number;
  maxTotalConnectorPoints: number;
  maxTransformsPerGroup: number;
  maxReadingOrderEntries: number;
  maxEmbeddedRasterBytes: number;
};

export const SCENE_RESOURCE_LIMITS: Readonly<SceneResourceLimits> = Object.freeze({
  maxSceneDocumentBytes: 1_048_576,
  maxSceneDocumentDepth: 64,
  maxSceneDocumentEntries: 20_000,
  maxMetadataBytes: RENDER_RESOURCE_LIMITS.maxMetadataBytes,
  maxMetadataDepth: RENDER_RESOURCE_LIMITS.maxMetadataDepth,
  maxMetadataEntries: RENDER_RESOURCE_LIMITS.maxMetadataEntries,
  maxAssets: RENDER_RESOURCE_LIMITS.maxAssets,
  maxFonts: RENDER_RESOURCE_LIMITS.maxFonts,
  maxCanvasDimension: RENDER_RESOURCE_LIMITS.maxAssetDimension,
  maxCanvasPixels: 16_777_216,
  maxCoordinateMagnitude: RENDER_RESOURCE_LIMITS.maxAssetDimension * 4,
  serializationResolution: 0.001,
  maxElements: 2_048,
  maxElementDepth: 16,
  maxPathDataCharacters: 65_536,
  maxTotalPathDataCharacters: 262_144,
  maxTextCharacters: 16_384,
  maxTotalTextCharacters: 65_536,
  maxConnectorPoints: 256,
  maxTotalConnectorPoints: 4_096,
  maxTransformsPerGroup: 16,
  maxReadingOrderEntries: 2_048,
  maxEmbeddedRasterBytes: 33_554_432,
});

export type RenderWorkerProfile = {
  executionBoundary: "node-child-process";
  timeoutMilliseconds: number;
  maxConcurrentRenders: 1;
  networkAccess: "not-exposed-to-render-input";
  fileSystemAccess: "package-read-and-temporary-write";
  subprocessAccess: "deny";
  nodeResourceLimits: {
    maxOldGenerationSizeMb: number;
    maxYoungGenerationSizeMb: number;
    stackSizeMb: number;
  };
};

export const RENDER_WORKER_PROFILE: Readonly<RenderWorkerProfile> = Object.freeze({
  executionBoundary: "node-child-process",
  timeoutMilliseconds: 15_000,
  maxConcurrentRenders: 1,
  networkAccess: "not-exposed-to-render-input",
  fileSystemAccess: "package-read-and-temporary-write",
  subprocessAccess: "deny",
  nodeResourceLimits: Object.freeze({
    maxOldGenerationSizeMb: 256,
    maxYoungGenerationSizeMb: 64,
    stackSizeMb: 4,
  }),
});

export type ResourceProblem = {
  path: string;
  code: string;
  message: string;
};

type JsonInspectionLimits = {
  maxBytes: number;
  maxDepth: number;
  maxEntries: number;
  codePrefix: "DESIGN" | "METADATA" | "SCENE" | "SCENE_METADATA";
  cyclicCode: "CYCLIC_DESIGN_INPUT" | "CYCLIC_SCENE_INPUT";
  unsafeCode: "UNSAFE_DESIGN_INPUT" | "UNSAFE_SCENE_INPUT";
};

type PendingValue =
  | { action: "visit"; value: unknown; depth: number; path: string }
  | { action: "leave"; value: object };

export function getDesignInputResourceProblems(input: unknown): ResourceProblem[] {
  const documentProblem = inspectJsonValue(input, {
    maxBytes: RENDER_RESOURCE_LIMITS.maxDesignDocumentBytes,
    maxDepth: RENDER_RESOURCE_LIMITS.maxDesignDocumentDepth,
    maxEntries: RENDER_RESOURCE_LIMITS.maxDesignDocumentEntries,
    codePrefix: "DESIGN",
    cyclicCode: "CYCLIC_DESIGN_INPUT",
    unsafeCode: "UNSAFE_DESIGN_INPUT",
  });
  if (documentProblem !== undefined) return [documentProblem];
  const metadata = ownDataProperty(input, "metadata");
  if (!metadata.found) return [];
  const metadataProblem = inspectJsonValue(metadata.value, {
    maxBytes: RENDER_RESOURCE_LIMITS.maxMetadataBytes,
    maxDepth: RENDER_RESOURCE_LIMITS.maxMetadataDepth,
    maxEntries: RENDER_RESOURCE_LIMITS.maxMetadataEntries,
    codePrefix: "METADATA",
    cyclicCode: "CYCLIC_DESIGN_INPUT",
    unsafeCode: "UNSAFE_DESIGN_INPUT",
  });
  return metadataProblem === undefined ? [] : [metadataProblem];
}

export function assertDesignInputResources(input: unknown): void {
  const problems = getDesignInputResourceProblems(input);
  if (problems.length === 0) return;
  throw new GlyphkilnError(
    "Design input exceeds the renderer resource boundary.",
    "DESIGN_RESOURCE_LIMIT_EXCEEDED",
    { problems },
  );
}

export function getSceneInputResourceProblems(input: unknown): ResourceProblem[] {
  const sceneProblem = inspectJsonValue(input, {
    maxBytes: SCENE_RESOURCE_LIMITS.maxSceneDocumentBytes,
    maxDepth: SCENE_RESOURCE_LIMITS.maxSceneDocumentDepth,
    maxEntries: SCENE_RESOURCE_LIMITS.maxSceneDocumentEntries,
    codePrefix: "SCENE",
    cyclicCode: "CYCLIC_SCENE_INPUT",
    unsafeCode: "UNSAFE_SCENE_INPUT",
  });
  if (sceneProblem !== undefined) return [sceneProblem];
  const metadata = ownDataProperty(input, "metadata");
  if (!metadata.found) return [];
  const metadataProblem = inspectJsonValue(metadata.value, {
    maxBytes: SCENE_RESOURCE_LIMITS.maxMetadataBytes,
    maxDepth: SCENE_RESOURCE_LIMITS.maxMetadataDepth,
    maxEntries: SCENE_RESOURCE_LIMITS.maxMetadataEntries,
    codePrefix: "SCENE_METADATA",
    cyclicCode: "CYCLIC_SCENE_INPUT",
    unsafeCode: "UNSAFE_SCENE_INPUT",
  });
  return metadataProblem === undefined ? [] : [metadataProblem];
}

export function assertSceneInputResources(input: unknown): void {
  const problems = getSceneInputResourceProblems(input);
  if (problems.length === 0) return;
  throw new GlyphkilnError(
    "Scene input exceeds the renderer resource boundary.",
    "SCENE_RESOURCE_LIMIT_EXCEEDED",
    { problems },
  );
}

export function assertAssetResources(assets: readonly ResolvedAsset[]): void {
  if (assets.length > RENDER_RESOURCE_LIMITS.maxAssets) {
    throw new GlyphkilnError(
      `At most ${RENDER_RESOURCE_LIMITS.maxAssets} resolved assets are accepted.`,
      "ASSET_COUNT_LIMIT_EXCEEDED",
      { maximum: RENDER_RESOURCE_LIMITS.maxAssets, actual: assets.length },
    );
  }
  let totalBytes = 0;
  for (const asset of assets) {
    if (!(asset.bytes instanceof Uint8Array)) {
      throw new GlyphkilnError(
        `Asset "${asset.id}" must provide Uint8Array bytes.`,
        "INVALID_ASSET_BYTES",
        { assetId: asset.id },
      );
    }
    if (asset.bytes.byteLength > RENDER_RESOURCE_LIMITS.maxAssetBytes) {
      throw new GlyphkilnError(
        `Asset "${asset.id}" exceeds the per-asset byte limit.`,
        "ASSET_BYTES_LIMIT_EXCEEDED",
        {
          assetId: asset.id,
          maximum: RENDER_RESOURCE_LIMITS.maxAssetBytes,
          actual: asset.bytes.byteLength,
        },
      );
    }
    totalBytes += asset.bytes.byteLength;
    if (totalBytes > RENDER_RESOURCE_LIMITS.maxTotalAssetBytes) {
      throw new GlyphkilnError(
        "Resolved assets exceed the total byte limit.",
        "TOTAL_ASSET_BYTES_LIMIT_EXCEEDED",
        {
          maximum: RENDER_RESOURCE_LIMITS.maxTotalAssetBytes,
          actual: totalBytes,
        },
      );
    }
  }
}

export function assertFontResources(fonts: readonly ResolvedFont[]): void {
  if (fonts.length > RENDER_RESOURCE_LIMITS.maxFonts) {
    throw new GlyphkilnError(
      `At most ${RENDER_RESOURCE_LIMITS.maxFonts} caller-supplied fonts are accepted.`,
      "FONT_COUNT_LIMIT_EXCEEDED",
      { maximum: RENDER_RESOURCE_LIMITS.maxFonts, actual: fonts.length },
    );
  }
  let totalBytes = 0;
  for (const font of fonts) {
    if (!(font.bytes instanceof Uint8Array)) {
      throw new GlyphkilnError(
        `Font "${font.family}" must provide Uint8Array bytes.`,
        "INVALID_FONT_BYTES",
      );
    }
    if (font.bytes.byteLength > RENDER_RESOURCE_LIMITS.maxFontBytes) {
      throw new GlyphkilnError(
        `Font "${font.family}" exceeds the per-font byte limit.`,
        "FONT_BYTES_LIMIT_EXCEEDED",
        {
          family: font.family,
          maximum: RENDER_RESOURCE_LIMITS.maxFontBytes,
          actual: font.bytes.byteLength,
        },
      );
    }
    totalBytes += font.bytes.byteLength;
    if (totalBytes > RENDER_RESOURCE_LIMITS.maxTotalFontBytes) {
      throw new GlyphkilnError(
        "Caller-supplied fonts exceed the total byte limit.",
        "TOTAL_FONT_BYTES_LIMIT_EXCEEDED",
        {
          maximum: RENDER_RESOURCE_LIMITS.maxTotalFontBytes,
          actual: totalBytes,
        },
      );
    }
  }
}

function inspectJsonValue(
  input: unknown,
  limits: JsonInspectionLimits,
): ResourceProblem | undefined {
  const activeObjects = new WeakSet();
  const pending: PendingValue[] = [
    { action: "visit", value: input, depth: 0, path: "$" },
  ];
  let bytes = 0;
  let entries = 0;
  while (pending.length > 0) {
    const item = pending.pop()!;
    if (item.action === "leave") {
      activeObjects.delete(item.value);
      continue;
    }
    if (item.depth > limits.maxDepth) {
      return problem(
        item.path,
        `${limits.codePrefix}_DEPTH_LIMIT_EXCEEDED`,
        `${label(limits)} exceeds the maximum depth of ${limits.maxDepth}.`,
      );
    }
    if (typeof item.value !== "object" || item.value === null) {
      bytes += primitiveJsonBytes(item.value);
    } else {
      if (activeObjects.has(item.value)) {
        return problem(
          item.path,
          limits.cyclicCode,
          `${label(limits)} must be acyclic JSON data.`,
        );
      }
      activeObjects.add(item.value);
      pending.push({ action: "leave", value: item.value });
      const children = getJsonChildren(
        item.value,
        item.path,
        limits,
        limits.maxEntries - entries,
      );
      if ("problem" in children) return children.problem;
      if ("entryLimitExceeded" in children) {
        return problem(
          item.path,
          `${limits.codePrefix}_ENTRIES_LIMIT_EXCEEDED`,
          `${label(limits)} exceeds the maximum entry count of ${limits.maxEntries}.`,
        );
      }
      entries += children.values.length;
      bytes += children.containerBytes;
      for (const child of children.values) {
        pending.push({
          action: "visit",
          value: child.value,
          depth: item.depth + 1,
          path: child.path,
        });
      }
    }
    if (bytes > limits.maxBytes) {
      return problem(
        item.path,
        `${limits.codePrefix}_BYTES_LIMIT_EXCEEDED`,
        `${label(limits)} exceeds the maximum encoded size of ${limits.maxBytes} bytes.`,
      );
    }
  }
  return undefined;
}

function getJsonChildren(
  value: object,
  path: string,
  limits: JsonInspectionLimits,
  maximumEntries: number,
):
  | {
      containerBytes: number;
      values: { value: unknown; path: string }[];
    }
  | { entryLimitExceeded: true }
  | { problem: ResourceProblem } {
  if (Array.isArray(value)) {
    if (value.length > maximumEntries) return { entryLimitExceeded: true };
    const values: { value: unknown; path: string }[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor !== undefined && !("value" in descriptor)) {
        return {
          problem: unsafePropertyProblem(`${path}[${index}]`, limits),
        };
      }
      values.push({
        value: descriptor?.value ?? null,
        path: `${path}[${index}]`,
      });
    }
    return {
      containerBytes: 2 + Math.max(0, value.length - 1),
      values,
    };
  }
  let prototype: unknown;
  let ownKeys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value) as unknown;
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return { problem: unsafePropertyProblem(path, limits) };
  }
  if (prototype !== Object.prototype && prototype !== null) {
    return {
      problem: problem(
        path,
        limits.unsafeCode,
        `${label(limits)} must contain only plain JSON objects and arrays.`,
      ),
    };
  }
  const keys: string[] = [];
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      return { problem: unsafePropertyProblem(path, limits) };
    }
    keys.push(key);
    if (keys.length > maximumEntries) return { entryLimitExceeded: true };
  }
  const values: { value: unknown; path: string }[] = [];
  let containerBytes = 2 + Math.max(0, keys.length - 1);
  for (const key of keys) {
    const childPath = `${path}.${key}`;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return { problem: unsafePropertyProblem(childPath, limits) };
    }
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable
    ) {
      return { problem: unsafePropertyProblem(childPath, limits) };
    }
    containerBytes += Buffer.byteLength(JSON.stringify(key)) + 1;
    values.push({ value: descriptor.value, path: childPath });
  }
  return { containerBytes, values };
}

function ownDataProperty(
  value: unknown,
  key: string,
): { found: false } | { found: true; value: unknown } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { found: false };
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor
    ? { found: true, value: descriptor.value }
    : { found: false };
}

function primitiveJsonBytes(value: unknown): number {
  if (typeof value === "string") return Buffer.byteLength(JSON.stringify(value));
  if (typeof value === "number") {
    return Buffer.byteLength(Number.isFinite(value) ? String(value) : "null");
  }
  if (typeof value === "boolean") return value ? 4 : 5;
  if (value === null) return 4;
  return 4;
}

function unsafePropertyProblem(
  path: string,
  limits: JsonInspectionLimits,
): ResourceProblem {
  return problem(
    path,
    limits.unsafeCode,
    `${label(limits)} properties must be enumerable string data values.`,
  );
}

function problem(path: string, code: string, message: string): ResourceProblem {
  return { path, code, message };
}

function label(limits: JsonInspectionLimits): string {
  switch (limits.codePrefix) {
    case "DESIGN":
      return "Design input";
    case "METADATA":
      return "Design metadata";
    case "SCENE":
      return "Scene input";
    case "SCENE_METADATA":
      return "Scene metadata";
  }
}
