import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import createLittleCmsModule from "../../vendor/little-cms/lcms.node.js";

type LittleCmsModule = {
  HEAPU8: Uint8Array;
  _malloc: (size: number) => number;
  _free: (pointer: number) => void;
  _cmsCreate_sRGBProfile: () => number;
  _cmsOpenProfileFromMem: (pointer: number, size: number) => number;
  _cmsGetColorSpace: (profile: number) => number;
  _cmsCloseProfile: (profile: number) => void;
  _cmsCreateTransform: (
    inputProfile: number,
    inputFormat: number,
    outputProfile: number,
    outputFormat: number,
    intent: number,
    flags: number,
  ) => number;
  _cmsDoTransform: (
    transform: number,
    input: number,
    output: number,
    pixelCount: number,
  ) => void;
  _cmsDeleteTransform: (transform: number) => void;
};

export type LittleCmsProfile = {
  handle: number;
  sourcePointer?: number;
};

export type LittleCmsTransform = {
  handle: number;
};

export const LITTLE_CMS_COLOR_SPACE = Object.freeze({
  rgb: 0x52474220,
  gray: 0x47524159,
  cmyk: 0x434d594b,
});

export type LittleCmsInputFormat = "rgb8" | "gray8";

const TYPE_GRAY_8 = (3 << 16) | (1 << 3) | 1;
const TYPE_RGB_8 = (4 << 16) | (3 << 3) | 1;
const INTENT_RELATIVE_COLORIMETRIC = 1;
const FLAGS_NO_CACHE_NO_OPTIMIZE = 0x0040 | 0x0100;

let modulePromise: Promise<LittleCmsModule> | undefined;

export async function initializeLittleCms(): Promise<void> {
  await getModule();
}

export async function openLittleCmsProfile(
  bytes: Uint8Array,
): Promise<LittleCmsProfile> {
  const module = await getModule();
  const sourcePointer = module._malloc(bytes.byteLength);
  if (sourcePointer === 0) throw new Error("LittleCMS profile allocation failed.");
  module.HEAPU8.set(bytes, sourcePointer);
  const handle = module._cmsOpenProfileFromMem(sourcePointer, bytes.byteLength);
  if (handle === 0) {
    module._free(sourcePointer);
    throw new Error("LittleCMS could not open the embedded profile.");
  }
  return { handle, sourcePointer };
}

export async function createLittleCmsSrgbProfile(): Promise<LittleCmsProfile> {
  const module = await getModule();
  const handle = module._cmsCreate_sRGBProfile();
  if (handle === 0) throw new Error("LittleCMS could not create an sRGB profile.");
  return { handle };
}

export async function getLittleCmsColorSpace(
  profile: LittleCmsProfile,
): Promise<number> {
  const module = await getModule();
  return module._cmsGetColorSpace(profile.handle);
}

export async function createLittleCmsTransform(
  inputProfile: LittleCmsProfile,
  inputFormat: LittleCmsInputFormat,
  outputProfile: LittleCmsProfile,
): Promise<LittleCmsTransform> {
  const module = await getModule();
  const handle = module._cmsCreateTransform(
    inputProfile.handle,
    inputFormat === "rgb8" ? TYPE_RGB_8 : TYPE_GRAY_8,
    outputProfile.handle,
    TYPE_RGB_8,
    INTENT_RELATIVE_COLORIMETRIC,
    FLAGS_NO_CACHE_NO_OPTIMIZE,
  );
  if (handle === 0) throw new Error("LittleCMS could not create a color transform.");
  return { handle };
}

export async function transformLittleCmsPixels(
  transform: LittleCmsTransform,
  input: Uint8Array,
  pixelCount: number,
): Promise<Uint8Array> {
  const module = await getModule();
  const inputPointer = module._malloc(input.byteLength);
  const outputLength = pixelCount * 3;
  const outputPointer = module._malloc(outputLength);
  if (inputPointer === 0 || outputPointer === 0) {
    if (inputPointer !== 0) module._free(inputPointer);
    if (outputPointer !== 0) module._free(outputPointer);
    throw new Error("LittleCMS pixel allocation failed.");
  }
  try {
    module.HEAPU8.set(input, inputPointer);
    module._cmsDoTransform(transform.handle, inputPointer, outputPointer, pixelCount);
    return new Uint8Array(module.HEAPU8.buffer, outputPointer, outputLength).slice();
  } finally {
    module._free(inputPointer);
    module._free(outputPointer);
  }
}

export async function deleteLittleCmsTransform(
  transform: LittleCmsTransform,
): Promise<void> {
  const module = await getModule();
  module._cmsDeleteTransform(transform.handle);
}

export async function closeLittleCmsProfile(profile: LittleCmsProfile): Promise<void> {
  const module = await getModule();
  module._cmsCloseProfile(profile.handle);
  if (profile.sourcePointer !== undefined) module._free(profile.sourcePointer);
}

async function getModule(): Promise<LittleCmsModule> {
  modulePromise ??= loadModule();
  return modulePromise;
}

async function loadModule(): Promise<LittleCmsModule> {
  const require = createRequire(import.meta.url);
  const dependencyEntryDirectory = dirname(require.resolve("@kittl/little-cms"));
  const wasmPath = resolve(dependencyEntryDirectory, "lcms.wasm");
  const module = await createLittleCmsModule({ locateFile: () => wasmPath });
  assertModule(module);
  return module;
}

function assertModule(module: unknown): asserts module is LittleCmsModule {
  if (typeof module !== "object" || module === null) {
    throw new Error("The pinned LittleCMS WASM module did not initialize.");
  }
  const record = module as Record<string, unknown>;
  const functionNames = [
    "_malloc",
    "_free",
    "_cmsCreate_sRGBProfile",
    "_cmsOpenProfileFromMem",
    "_cmsGetColorSpace",
    "_cmsCloseProfile",
    "_cmsCreateTransform",
    "_cmsDoTransform",
    "_cmsDeleteTransform",
  ];
  if (
    !(record["HEAPU8"] instanceof Uint8Array) ||
    functionNames.some((name) => typeof record[name] !== "function")
  ) {
    throw new Error("The pinned LittleCMS WASM module has an invalid interface.");
  }
}
