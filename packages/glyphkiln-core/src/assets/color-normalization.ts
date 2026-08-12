import { fork, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GlyphkilnError, type ResolvedAsset } from "../domain/types.js";
import { RENDER_RESOURCE_LIMITS, RENDER_WORKER_PROFILE } from "../resources/index.js";

export const COLOR_NORMALIZATION_POLICY_VERSION = "canonical-srgb-png-v1";

export const COLOR_NORMALIZATION_IMPLEMENTATION = Object.freeze({
  littleCmsWasm: "@kittl/little-cms@1.0.3",
  littleCmsAdapter: "glyphkiln-raw-wasm-adapter-v1",
  pngjs: "7.0.0",
  jpegJs: "0.4.4",
});

export const COLOR_NORMALIZATION_LIMITS = Object.freeze({
  maxInputBytes: RENDER_RESOURCE_LIMITS.maxAssetBytes,
  maxOutputBytes: RENDER_RESOURCE_LIMITS.maxAssetBytes,
  maxDimension: RENDER_RESOURCE_LIMITS.maxAssetDimension,
  maxPixels: RENDER_RESOURCE_LIMITS.maxAssetPixels,
  maxColorProfileBytes: 1_048_576,
  maxJpegColorProfileChunks: 255,
  timeoutMilliseconds: RENDER_WORKER_PROFILE.timeoutMilliseconds,
  maxConcurrentNormalizations: 1,
});

type RasterMimeType = ResolvedAsset["mimeType"];

export type ColorNormalizationInput = {
  bytes: Uint8Array;
  mimeType: RasterMimeType;
};

export type ColorNormalizationProfile =
  | { kind: "implicit-srgb" }
  | { kind: "declared-srgb" }
  | {
      kind: "embedded-icc";
      byteLength: number;
      sha256: string;
    };

export type ColorNormalizationReport = {
  policyVersion: typeof COLOR_NORMALIZATION_POLICY_VERSION;
  implementation: typeof COLOR_NORMALIZATION_IMPLEMENTATION;
  source: {
    mimeType: RasterMimeType;
    byteLength: number;
    sha256: string;
    width: number;
    height: number;
    colorSpace: "srgb" | "cmyk" | "grayscale" | "other";
    profile: ColorNormalizationProfile;
    orientation: number;
  };
  output: {
    mimeType: "image/png";
    byteLength: number;
    sha256: string;
    width: number;
    height: number;
    colorSpace: "srgb";
    hasAlpha: true;
  };
  changes: {
    colorConversion: "embedded-profile-to-srgb" | "assumed-or-declared-srgb";
    orientationApplied: boolean;
    metadataStripped: true;
    reencoded: true;
  };
};

export type NormalizedRasterColor = {
  bytes: Uint8Array;
  report: ColorNormalizationReport;
};

type ProcessSuccess = {
  ok: true;
  result: NormalizedRasterColor;
};

type ProcessFailure = {
  ok: false;
  error: {
    name: string;
    message: string;
    code?: string;
    details?: Record<string, unknown>;
  };
};

type ProcessResponse = ProcessSuccess | ProcessFailure;

let normalizationQueue: Promise<void> = Promise.resolve();

export function normalizeRasterColor(input: unknown): Promise<NormalizedRasterColor> {
  const normalizedInput = readInput(input);
  const sourceBytes = new Uint8Array(normalizedInput.bytes);
  assertInputByteLimit(sourceBytes);
  assertMimeType(sourceBytes, normalizedInput.mimeType);
  const request = {
    bytes: sourceBytes,
    mimeType: normalizedInput.mimeType,
  } satisfies ColorNormalizationInput;
  const normalization = normalizationQueue.then(
    () => runNormalizationProcess(request),
    () => runNormalizationProcess(request),
  );
  normalizationQueue = normalization.then(
    () => undefined,
    () => undefined,
  );
  return normalization;
}

function runNormalizationProcess(
  input: ColorNormalizationInput,
): Promise<NormalizedRasterColor> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = createNormalizationProcess();
    let settled = false;
    const timer = setTimeout(() => {
      finish(() => {
        child.kill("SIGKILL");
        rejectPromise(
          new GlyphkilnError(
            `Color normalization exceeded ${COLOR_NORMALIZATION_LIMITS.timeoutMilliseconds} milliseconds.`,
            "COLOR_NORMALIZATION_TIMEOUT",
            { maximum: COLOR_NORMALIZATION_LIMITS.timeoutMilliseconds },
          ),
        );
      });
    }, COLOR_NORMALIZATION_LIMITS.timeoutMilliseconds);

    child.once("message", (message: unknown) => {
      finish(() => {
        const response = parseProcessResponse(message);
        if (response.ok) {
          resolvePromise(response.result);
          return;
        }
        rejectPromise(deserializeProcessError(response.error));
      });
    });
    child.once("error", (error) => {
      finish(() => {
        rejectPromise(
          new GlyphkilnError(
            "The color-normalization process could not be started.",
            "COLOR_NORMALIZATION_PROCESS_FAILED",
            { cause: error.message },
          ),
        );
      });
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      finish(() => {
        rejectPromise(
          new GlyphkilnError(
            "The color-normalization process exited without returning a result.",
            "COLOR_NORMALIZATION_PROCESS_EXITED",
            { exitCode: code, signal },
          ),
        );
      });
    });
    child.send({ input }, (error) => {
      if (error === null) return;
      finish(() => {
        rejectPromise(
          new GlyphkilnError(
            "The color-normalization request could not be sent to its process.",
            "COLOR_NORMALIZATION_PROCESS_IPC_FAILED",
            { cause: error.message },
          ),
        );
      });
    });

    function finish(callback: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners();
      if (child.connected) child.disconnect();
      callback();
    }
  });
}

function createNormalizationProcess(): ChildProcess {
  const processPath = fileURLToPath(
    new URL("./color-normalization-process.js", import.meta.url),
  );
  if (!existsSync(processPath)) {
    throw new GlyphkilnError(
      "The color-normalization process is unavailable before the package is built.",
      "COLOR_NORMALIZATION_PROCESS_NOT_BUILT",
      { entry: basename(processPath) },
    );
  }
  const packageRoot = resolve(dirname(processPath), "../..");
  const dependencyReadRoots = findDependencyReadRoots(packageRoot);
  return fork(processPath, {
    serialization: "advanced",
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    execArgv: [
      "--permission",
      `--allow-fs-read=${packageRoot}`,
      ...dependencyReadRoots.map((root) => `--allow-fs-read=${root}`),
      `--max-old-space-size=${RENDER_WORKER_PROFILE.nodeResourceLimits.maxOldGenerationSizeMb}`,
      `--max-semi-space-size=${Math.floor(
        RENDER_WORKER_PROFILE.nodeResourceLimits.maxYoungGenerationSizeMb / 3,
      )}`,
      `--stack-size=${RENDER_WORKER_PROFILE.nodeResourceLimits.stackSizeMb * 1_024}`,
    ],
  });
}

function readInput(input: unknown): ColorNormalizationInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throwInvalidInput();
  }
  const prototype = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) throwInvalidInput();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Object.keys(descriptors).sort();
  if (keys.length !== 2 || keys[0] !== "bytes" || keys[1] !== "mimeType") {
    throwInvalidInput();
  }
  const bytesDescriptor = descriptors["bytes"];
  const mimeDescriptor = descriptors["mimeType"];
  const bytesValue = dataDescriptorValue(bytesDescriptor);
  const mimeValue = dataDescriptorValue(mimeDescriptor);
  if (
    bytesDescriptor === undefined ||
    mimeDescriptor === undefined ||
    !bytesDescriptor.enumerable ||
    !mimeDescriptor.enumerable ||
    !(bytesValue instanceof Uint8Array) ||
    (mimeValue !== "image/png" && mimeValue !== "image/jpeg")
  ) {
    throwInvalidInput();
  }
  return { bytes: bytesValue, mimeType: mimeValue };
}

function dataDescriptorValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (descriptor === undefined || !("value" in descriptor)) return undefined;
  return descriptor.value as unknown;
}

function throwInvalidInput(): never {
  throw new GlyphkilnError(
    "Color normalization accepts only explicit PNG or JPEG Uint8Array data.",
    "INVALID_COLOR_NORMALIZATION_INPUT",
  );
}

function assertInputByteLimit(bytes: Uint8Array): void {
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > COLOR_NORMALIZATION_LIMITS.maxInputBytes
  ) {
    throw new GlyphkilnError(
      "Raster input exceeds the color-normalization byte limit.",
      "COLOR_NORMALIZATION_INPUT_LIMIT_EXCEEDED",
      {
        maximum: COLOR_NORMALIZATION_LIMITS.maxInputBytes,
        actual: bytes.byteLength,
      },
    );
  }
}

function assertMimeType(bytes: Uint8Array, mimeType: RasterMimeType): void {
  const detected = detectMimeType(bytes);
  if (detected !== mimeType) {
    throw new GlyphkilnError(
      "Raster bytes do not match the declared color-normalization MIME type.",
      "COLOR_NORMALIZATION_MIME_MISMATCH",
      { expected: mimeType, actual: detected ?? "unsupported" },
    );
  }
}

function detectMimeType(bytes: Uint8Array): RasterMimeType | undefined {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  return undefined;
}

function parseProcessResponse(value: unknown): ProcessResponse {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    throw new GlyphkilnError(
      "The color-normalization process returned an invalid response.",
      "INVALID_COLOR_NORMALIZATION_PROCESS_RESPONSE",
    );
  }
  return value as ProcessResponse;
}

function deserializeProcessError(error: ProcessFailure["error"]): Error {
  if (error.code !== undefined) {
    return new GlyphkilnError(error.message, error.code, error.details);
  }
  const restored = new Error(error.message);
  restored.name = error.name;
  return restored;
}

function findDependencyReadRoots(packageRoot: string): string[] {
  const roots = new Set<string>();
  for (const dependency of readDependencyNames(packageRoot)) {
    const entryPath = fileURLToPath(import.meta.resolve(dependency));
    const nodeModulesRoot = findAncestorNamed(entryPath, "node_modules");
    if (nodeModulesRoot === undefined) continue;
    roots.add(nodeModulesRoot);
    roots.add(realpathSync(nodeModulesRoot));
    const pnpmStoreRoot = findAncestorNamed(nodeModulesRoot, ".pnpm");
    if (pnpmStoreRoot !== undefined) roots.add(pnpmStoreRoot);
  }
  roots.delete(packageRoot);
  return [...roots].filter((root) => existsSync(root)).sort();
}

function readDependencyNames(packageRoot: string): string[] {
  const packageJson = JSON.parse(
    readFileSync(resolve(packageRoot, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, unknown> };
  return Object.keys(packageJson.dependencies ?? {}).sort();
}

function findAncestorNamed(path: string, name: string): string | undefined {
  let current = path;
  while (dirname(current) !== current) {
    if (basename(current) === name) return current;
    current = dirname(current);
  }
  return undefined;
}
