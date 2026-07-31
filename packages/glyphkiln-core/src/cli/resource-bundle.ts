import { constants, type Stats } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

import { z } from "zod";

import { canonicalJson, sha256 } from "../cache/canonical.js";
import {
  GlyphkilnError,
  type ResolvedAsset,
  type ResolvedFont,
} from "../domain/types.js";
import { DEVELOPMENT_FONT_SHA256 } from "../fonts/index.js";
import { RENDER_RESOURCE_LIMITS } from "../resources/index.js";
import {
  AssetDeclarationSchema,
  FontDeclarationSchema,
  validateDesignDocument,
  type AssetDeclaration,
  type DesignDocument,
  type FontDeclaration,
  type ValidationProblem,
} from "../schema/index.js";

export const RESOURCE_BUNDLE_VERSION = "1.0.0" as const;
export const RESOURCE_BUNDLE_MANIFEST_FILENAME =
  "glyphkiln-resource-bundle.json" as const;

export const CLI_RESOURCE_BUNDLE_LIMITS = Object.freeze({
  maxManifestBytes: 262_144,
  maxManifestDepth: 8,
  maxManifestEntries: 2_048,
  maxPathBytes: 512,
  maxPathSegments: 16,
  maxPathSegmentBytes: 128,
});

export type LoadedResourceBundle = {
  assets: ResolvedAsset[];
  fonts: ResolvedFont[];
};

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const resourceFileSchema = z.string().min(1).refine(isPortableRelativeResourcePath, {
  message: "Resource files must be bounded portable relative paths without traversal.",
});

const bundleAssetSchema = AssetDeclarationSchema.extend({
  file: resourceFileSchema,
}).strict();
const bundleFontSchema = FontDeclarationSchema.extend({
  file: resourceFileSchema,
  sha256: sha256Schema,
}).strict();

const resourceBundleManifestSchema = z
  .object({
    bundleVersion: z.literal(RESOURCE_BUNDLE_VERSION),
    assets: z.array(bundleAssetSchema).max(RENDER_RESOURCE_LIMITS.maxAssets),
    fonts: z.array(bundleFontSchema).max(RENDER_RESOURCE_LIMITS.maxFonts),
  })
  .strict()
  .superRefine((manifest, context) => {
    addDuplicateProblems(
      manifest.assets,
      (asset) => asset.id,
      "asset ID",
      "assets",
      context,
    );
    addDuplicateProblems(
      manifest.fonts,
      (font) => fontIdentity(font),
      "font identity",
      "fonts",
      context,
    );
  });

type ResourceBundleManifest = z.infer<typeof resourceBundleManifestSchema>;
type BundleAsset = ResourceBundleManifest["assets"][number];
type BundleFont = ResourceBundleManifest["fonts"][number];

type BundleRoot = {
  absolutePath: string;
  realPath: string;
};

type InspectedFile = {
  absolutePath: string;
  relativePath: string;
  identity: Pick<Stats, "dev" | "ino" | "size">;
};

export async function loadResourceBundle(
  bundleRootPath: string,
  designInput: unknown,
): Promise<LoadedResourceBundle> {
  const document = requireValidDesignDocument(designInput);
  const root = await inspectBundleRoot(bundleRootPath);
  const manifest = await loadManifest(root);
  assertManifestMatchesDocument(manifest, document);

  const assetFiles = await inspectResourceFiles(
    root,
    manifest.assets,
    RENDER_RESOURCE_LIMITS.maxAssetBytes,
    RENDER_RESOURCE_LIMITS.maxTotalAssetBytes,
    "asset",
  );
  const fontFiles = await inspectResourceFiles(
    root,
    manifest.fonts,
    RENDER_RESOURCE_LIMITS.maxFontBytes,
    RENDER_RESOURCE_LIMITS.maxTotalFontBytes,
    "font",
  );

  return {
    assets: await loadAssetsInDocumentOrder(document, manifest, assetFiles, root),
    fonts: await loadFontsInDocumentOrder(document, manifest, fontFiles, root),
  };
}

function requireValidDesignDocument(input: unknown): DesignDocument {
  const validation = validateDesignDocument(input);
  if (validation.success) return validation.data;
  throw new GlyphkilnError(
    "Design document validation failed.",
    "INVALID_DESIGN_DOCUMENT",
    { problems: validation.problems },
  );
}

async function inspectBundleRoot(bundleRootPath: string): Promise<BundleRoot> {
  const absolutePath = resolve(bundleRootPath);
  try {
    const rootStats = await lstat(absolutePath);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
      throw invalidBundleRoot(absolutePath);
    }
    return {
      absolutePath,
      realPath: await realpath(absolutePath),
    };
  } catch (error) {
    if (error instanceof GlyphkilnError) throw error;
    throw invalidBundleRoot(absolutePath, error);
  }
}

async function loadManifest(root: BundleRoot): Promise<ResourceBundleManifest> {
  const inspected = await inspectRegularFile(root, RESOURCE_BUNDLE_MANIFEST_FILENAME);
  if (inspected.identity.size > CLI_RESOURCE_BUNDLE_LIMITS.maxManifestBytes) {
    throw new GlyphkilnError(
      `Resource-bundle manifest exceeds ${CLI_RESOURCE_BUNDLE_LIMITS.maxManifestBytes} bytes.`,
      "RESOURCE_BUNDLE_MANIFEST_BYTES_LIMIT_EXCEEDED",
      {
        maximum: CLI_RESOURCE_BUNDLE_LIMITS.maxManifestBytes,
        actual: inspected.identity.size,
        file: RESOURCE_BUNDLE_MANIFEST_FILENAME,
      },
    );
  }
  const bytes = await readInspectedFile(
    root,
    inspected,
    CLI_RESOURCE_BUNDLE_LIMITS.maxManifestBytes,
    "RESOURCE_BUNDLE_MANIFEST_BYTES_LIMIT_EXCEEDED",
  );
  return parseManifest(bytes);
}

function parseManifest(bytes: Uint8Array): ResourceBundleManifest {
  let input: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    input = JSON.parse(json) as unknown;
  } catch (error) {
    throw new GlyphkilnError(
      `Could not parse ${RESOURCE_BUNDLE_MANIFEST_FILENAME} as UTF-8 JSON.`,
      "INVALID_RESOURCE_BUNDLE_JSON",
      { cause: errorMessage(error) },
    );
  }
  assertManifestComplexity(input);
  const result = resourceBundleManifestSchema.safeParse(input);
  if (result.success) return result.data;
  const problems: ValidationProblem[] = result.error.issues.map((issue) => ({
    path: formatIssuePath(issue.path),
    code: issue.code,
    message: issue.message,
  }));
  throw new GlyphkilnError(
    "Resource-bundle manifest validation failed.",
    "INVALID_RESOURCE_BUNDLE",
    { problems },
  );
}

function assertManifestComplexity(input: unknown): void {
  const pending: { value: unknown; depth: number }[] = [{ value: input, depth: 0 }];
  let entries = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth > CLI_RESOURCE_BUNDLE_LIMITS.maxManifestDepth) {
      throw manifestStructureLimit("depth", current.depth);
    }
    if (typeof current.value !== "object" || current.value === null) continue;
    const values = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value);
    entries += values.length;
    if (entries > CLI_RESOURCE_BUNDLE_LIMITS.maxManifestEntries) {
      throw manifestStructureLimit("entries", entries);
    }
    for (const value of values) {
      pending.push({ value, depth: current.depth + 1 });
    }
  }
}

function assertManifestMatchesDocument(
  manifest: ResourceBundleManifest,
  document: DesignDocument,
): void {
  const declaredAssets = new Map(document.assets.map((asset) => [asset.id, asset]));
  for (const asset of manifest.assets) {
    const declaration = declaredAssets.get(asset.id);
    if (declaration === undefined) {
      throw new GlyphkilnError(
        `Bundle asset "${asset.id}" is not declared by the design document.`,
        "RESOURCE_BUNDLE_ASSET_UNDECLARED",
        { assetId: asset.id },
      );
    }
    const mismatches = assetDeclarationMismatches(asset, declaration);
    if (mismatches.length > 0) {
      throw new GlyphkilnError(
        `Bundle asset "${asset.id}" does not exactly match its design declaration.`,
        "RESOURCE_BUNDLE_ASSET_DECLARATION_MISMATCH",
        { assetId: asset.id, fields: mismatches },
      );
    }
  }
  const bundledAssetIds = new Set(manifest.assets.map((asset) => asset.id));
  for (const declaration of document.assets) {
    if (!bundledAssetIds.has(declaration.id)) {
      throw new GlyphkilnError(
        `Design asset "${declaration.id}" is missing from the resource bundle.`,
        "RESOURCE_BUNDLE_ASSET_MISSING",
        { assetId: declaration.id },
      );
    }
  }
  assertFontDeclarations(manifest.fonts, document.fonts);
}

function assertFontDeclarations(
  fonts: readonly BundleFont[],
  declarations: readonly FontDeclaration[],
): void {
  for (const font of fonts) {
    const registryMatchingDeclarations = declarations.filter(
      (declaration) => fontIdentity(declaration) === fontIdentity(font),
    );
    if (registryMatchingDeclarations.length === 0) {
      throw new GlyphkilnError(
        `Bundle font ${fontLabel(font)} is not declared by the design document.`,
        "RESOURCE_BUNDLE_FONT_UNDECLARED",
        fontDetails(font),
      );
    }
    const matchingDeclarations = registryMatchingDeclarations.filter(
      (declaration) =>
        fontDeclarationIdentity(declaration) === fontDeclarationIdentity(font),
    );
    if (matchingDeclarations.length === 0) {
      throw new GlyphkilnError(
        `Bundle font ${fontLabel(font)} does not exactly match its design declaration.`,
        "RESOURCE_BUNDLE_FONT_DECLARATION_MISMATCH",
        { ...fontDetails(font), fields: ["family"] },
      );
    }
    for (const declaration of matchingDeclarations) {
      if (declaration.sha256 === undefined) {
        throw fontHashRequired(declaration);
      }
      if (declaration.sha256 !== font.sha256) {
        throw new GlyphkilnError(
          `Bundle font ${fontLabel(font)} does not match its design declaration.`,
          "RESOURCE_BUNDLE_FONT_DECLARATION_MISMATCH",
          {
            ...fontDetails(font),
            expected: declaration.sha256,
            actual: font.sha256,
          },
        );
      }
    }
  }
  const bundledIdentities = new Set(fonts.map((font) => fontDeclarationIdentity(font)));
  for (const declaration of declarations) {
    if (
      bundledIdentities.has(fontDeclarationIdentity(declaration)) ||
      isDevelopmentFontDeclaration(declaration)
    ) {
      continue;
    }
    if (declaration.sha256 === undefined) throw fontHashRequired(declaration);
    throw new GlyphkilnError(
      `Design font ${fontLabel(declaration)} is missing from the resource bundle.`,
      "RESOURCE_BUNDLE_FONT_MISSING",
      fontDetails(declaration),
    );
  }
}

async function inspectResourceFiles<
  Entry extends { file: string; id?: string; family?: string },
>(
  root: BundleRoot,
  entries: readonly Entry[],
  maximumFileBytes: number,
  maximumTotalBytes: number,
  kind: "asset" | "font",
): Promise<Map<Entry, InspectedFile>> {
  const inspected = new Map<Entry, InspectedFile>();
  let totalBytes = 0;
  for (const entry of entries) {
    const file = await inspectRegularFile(root, entry.file);
    if (file.identity.size > maximumFileBytes) {
      throw new GlyphkilnError(
        `Bundle ${kind} file "${entry.file}" exceeds the per-file byte limit.`,
        "RESOURCE_BUNDLE_FILE_BYTES_LIMIT_EXCEEDED",
        {
          kind,
          file: entry.file,
          maximum: maximumFileBytes,
          actual: file.identity.size,
        },
      );
    }
    totalBytes += file.identity.size;
    if (totalBytes > maximumTotalBytes) {
      throw new GlyphkilnError(
        `Resource-bundle ${kind} files exceed the total byte limit.`,
        kind === "asset"
          ? "RESOURCE_BUNDLE_TOTAL_ASSET_BYTES_LIMIT_EXCEEDED"
          : "RESOURCE_BUNDLE_TOTAL_FONT_BYTES_LIMIT_EXCEEDED",
        { maximum: maximumTotalBytes, actual: totalBytes },
      );
    }
    inspected.set(entry, file);
  }
  return inspected;
}

async function loadAssetsInDocumentOrder(
  document: DesignDocument,
  manifest: ResourceBundleManifest,
  files: ReadonlyMap<BundleAsset, InspectedFile>,
  root: BundleRoot,
): Promise<ResolvedAsset[]> {
  const entries = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const assets: ResolvedAsset[] = [];
  let totalBytes = 0;
  for (const declaration of document.assets) {
    const entry = entries.get(declaration.id)!;
    const bytes = await readVerifiedResource(
      root,
      files.get(entry)!,
      entry.sha256,
      RENDER_RESOURCE_LIMITS.maxAssetBytes,
      "asset",
      diagnosticQuote(entry.id),
    );
    totalBytes = assertActualTotalBytes(
      totalBytes,
      bytes.byteLength,
      RENDER_RESOURCE_LIMITS.maxTotalAssetBytes,
      "asset",
    );
    assets.push({
      id: entry.id,
      mimeType: entry.mimeType,
      sha256: entry.sha256,
      width: entry.width,
      height: entry.height,
      origin: entry.origin,
      bytes,
    });
  }
  return assets;
}

async function loadFontsInDocumentOrder(
  document: DesignDocument,
  manifest: ResourceBundleManifest,
  files: ReadonlyMap<BundleFont, InspectedFile>,
  root: BundleRoot,
): Promise<ResolvedFont[]> {
  const entries = new Map(manifest.fonts.map((font) => [fontIdentity(font), font]));
  const fonts: ResolvedFont[] = [];
  const loaded = new Set<string>();
  let totalBytes = 0;
  for (const declaration of document.fonts) {
    const identity = fontIdentity(declaration);
    const entry = entries.get(identity);
    if (entry === undefined || loaded.has(identity)) continue;
    const bytes = await readVerifiedResource(
      root,
      files.get(entry)!,
      entry.sha256,
      RENDER_RESOURCE_LIMITS.maxFontBytes,
      "font",
      fontLabel(entry),
    );
    totalBytes = assertActualTotalBytes(
      totalBytes,
      bytes.byteLength,
      RENDER_RESOURCE_LIMITS.maxTotalFontBytes,
      "font",
    );
    fonts.push({
      family: entry.family,
      weight: entry.weight,
      style: entry.style,
      sha256: entry.sha256,
      bytes,
    });
    loaded.add(identity);
  }
  return fonts;
}

async function readVerifiedResource(
  root: BundleRoot,
  file: InspectedFile,
  expectedHash: string,
  maximumBytes: number,
  kind: "asset" | "font",
  resource: string,
): Promise<Uint8Array> {
  const bytes = await readInspectedFile(
    root,
    file,
    maximumBytes,
    "RESOURCE_BUNDLE_FILE_BYTES_LIMIT_EXCEEDED",
  );
  const actualHash = sha256(bytes);
  if (actualHash !== expectedHash) {
    throw new GlyphkilnError(
      `Bundle ${kind} ${resource} bytes do not match the declared SHA-256.`,
      "RESOURCE_BUNDLE_FILE_HASH_MISMATCH",
      {
        kind,
        resource,
        file: file.relativePath,
        expected: expectedHash,
        actual: actualHash,
      },
    );
  }
  return bytes;
}

async function inspectRegularFile(
  root: BundleRoot,
  relativePath: string,
): Promise<InspectedFile> {
  const segments = relativePath.split("/");
  let candidate = root.absolutePath;
  try {
    for (const [index, segment] of segments.entries()) {
      candidate = join(candidate, segment);
      const stats = await lstat(candidate);
      if (stats.isSymbolicLink()) throw symlinkRejected(relativePath);
      const isFinal = index === segments.length - 1;
      if ((!isFinal && !stats.isDirectory()) || (isFinal && !stats.isFile())) {
        throw new GlyphkilnError(
          `Resource-bundle path "${relativePath}" is not a regular file beneath the bundle root.`,
          "RESOURCE_BUNDLE_FILE_NOT_REGULAR",
          { file: relativePath },
        );
      }
      if (isFinal) {
        const resolvedPath = await realpath(candidate);
        assertRealPathContained(root, resolvedPath, relativePath);
        return {
          absolutePath: candidate,
          relativePath,
          identity: {
            dev: stats.dev,
            ino: stats.ino,
            size: stats.size,
          },
        };
      }
    }
  } catch (error) {
    if (error instanceof GlyphkilnError) throw error;
    throw new GlyphkilnError(
      `Could not inspect resource-bundle file "${relativePath}".`,
      "RESOURCE_BUNDLE_FILE_READ_FAILED",
      {
        file: relativePath,
        cause: errorMessage(error),
      },
    );
  }
  throw new GlyphkilnError(
    `Resource-bundle path "${relativePath}" is invalid.`,
    "RESOURCE_BUNDLE_PATH_INVALID",
    { file: relativePath },
  );
}

async function readInspectedFile(
  root: BundleRoot,
  file: InspectedFile,
  maximumBytes: number,
  limitCode: string,
): Promise<Uint8Array> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(file.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedStats = await handle.stat();
    await assertOpenFileIsUnchanged(root, file, openedStats);
    if (openedStats.size > maximumBytes) {
      throw fileBytesLimit(file, maximumBytes, openedStats.size, limitCode);
    }
    const bytes = await readBounded(handle, maximumBytes);
    if (bytes.byteLength > maximumBytes) {
      throw fileBytesLimit(file, maximumBytes, bytes.byteLength, limitCode);
    }
    return bytes;
  } catch (error) {
    if (error instanceof GlyphkilnError) throw error;
    if (isNodeError(error) && error.code === "ELOOP") {
      throw symlinkRejected(file.relativePath);
    }
    throw new GlyphkilnError(
      `Could not read resource-bundle file "${file.relativePath}".`,
      "RESOURCE_BUNDLE_FILE_READ_FAILED",
      {
        file: file.relativePath,
        cause: errorMessage(error),
      },
    );
  } finally {
    await handle?.close();
  }
}

async function assertOpenFileIsUnchanged(
  root: BundleRoot,
  file: InspectedFile,
  openedStats: Stats,
): Promise<void> {
  if (!openedStats.isFile()) {
    throw new GlyphkilnError(
      `Resource-bundle path "${file.relativePath}" is not a regular file.`,
      "RESOURCE_BUNDLE_FILE_NOT_REGULAR",
      { file: file.relativePath },
    );
  }
  const current = await lstat(file.absolutePath);
  if (current.isSymbolicLink()) throw symlinkRejected(file.relativePath);
  if (
    current.dev !== openedStats.dev ||
    current.ino !== openedStats.ino ||
    file.identity.dev !== openedStats.dev ||
    file.identity.ino !== openedStats.ino
  ) {
    throw new GlyphkilnError(
      `Resource-bundle file "${file.relativePath}" changed while it was being opened.`,
      "RESOURCE_BUNDLE_FILE_CHANGED",
      { file: file.relativePath },
    );
  }
  assertRealPathContained(root, await realpath(file.absolutePath), file.relativePath);
}

async function readBounded(
  handle: FileHandle,
  maximumBytes: number,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (totalBytes <= maximumBytes) {
    const remaining = maximumBytes + 1 - totalBytes;
    const buffer = Buffer.alloc(Math.min(65_536, remaining));
    const result = await handle.read(buffer, 0, buffer.byteLength, null);
    if (result.bytesRead === 0) break;
    chunks.push(buffer.subarray(0, result.bytesRead));
    totalBytes += result.bytesRead;
  }
  return Uint8Array.from(Buffer.concat(chunks, totalBytes));
}

function assertRealPathContained(
  root: BundleRoot,
  resolvedPath: string,
  displayPath: string,
): void {
  const pathFromRoot = relative(root.realPath, resolvedPath);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot) ||
    pathFromRoot.length === 0
  ) {
    throw new GlyphkilnError(
      `Resource-bundle path "${displayPath}" escapes the bundle root.`,
      "RESOURCE_BUNDLE_PATH_ESCAPE",
      { file: displayPath },
    );
  }
}

function isPortableRelativeResourcePath(path: string): boolean {
  if (
    Buffer.byteLength(path, "utf8") > CLI_RESOURCE_BUNDLE_LIMITS.maxPathBytes ||
    path.startsWith("/") ||
    path.includes("\\")
  ) {
    return false;
  }
  const segments = path.split("/");
  return (
    segments.length <= CLI_RESOURCE_BUNDLE_LIMITS.maxPathSegments &&
    segments.every(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        Buffer.byteLength(segment, "utf8") <=
          CLI_RESOURCE_BUNDLE_LIMITS.maxPathSegmentBytes &&
        /^[A-Za-z0-9@_+.,() -]+$/.test(segment) &&
        !segment.endsWith(" ") &&
        !segment.endsWith(".") &&
        !isWindowsReservedPathSegment(segment),
    )
  );
}

function isWindowsReservedPathSegment(segment: string): boolean {
  const stem = segment.split(".", 1)[0]!.toUpperCase();
  return (
    stem === "CON" ||
    stem === "PRN" ||
    stem === "AUX" ||
    stem === "NUL" ||
    /^COM[1-9]$/.test(stem) ||
    /^LPT[1-9]$/.test(stem)
  );
}

function assetDeclarationMismatches(
  asset: BundleAsset,
  declaration: AssetDeclaration,
): string[] {
  const mismatches: string[] = [];
  if (asset.mimeType !== declaration.mimeType) mismatches.push("mimeType");
  if (asset.sha256 !== declaration.sha256) mismatches.push("sha256");
  if (asset.width !== declaration.width) mismatches.push("width");
  if (asset.height !== declaration.height) mismatches.push("height");
  if (canonicalJson(asset.origin) !== canonicalJson(declaration.origin)) {
    mismatches.push("origin");
  }
  return mismatches;
}

function isDevelopmentFontDeclaration(declaration: FontDeclaration): boolean {
  return (
    declaration.family.toLocaleLowerCase("en-US") === "inter" &&
    declaration.style === "normal" &&
    declaration.weight >= 100 &&
    declaration.weight <= 900 &&
    (declaration.sha256 === undefined || declaration.sha256 === DEVELOPMENT_FONT_SHA256)
  );
}

function assertActualTotalBytes(
  current: number,
  added: number,
  maximum: number,
  kind: "asset" | "font",
): number {
  const total = current + added;
  if (total <= maximum) return total;
  throw new GlyphkilnError(
    `Resource-bundle ${kind} files exceed the total byte limit.`,
    kind === "asset"
      ? "RESOURCE_BUNDLE_TOTAL_ASSET_BYTES_LIMIT_EXCEEDED"
      : "RESOURCE_BUNDLE_TOTAL_FONT_BYTES_LIMIT_EXCEEDED",
    { maximum, actual: total },
  );
}

function addDuplicateProblems<Entry>(
  entries: readonly Entry[],
  key: (entry: Entry) => string,
  label: string,
  path: "assets" | "fonts",
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const value = key(entry);
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        path: [path, index],
        message: `Duplicate resource-bundle ${label}.`,
      });
    }
    seen.add(value);
  }
}

function fontIdentity(font: { family: string; weight: number; style: string }): string {
  return `${font.family.toLocaleLowerCase("en-US")}\u0000${font.weight}\u0000${font.style}`;
}

function fontDeclarationIdentity(font: {
  family: string;
  weight: number;
  style: string;
}): string {
  return `${font.family}\u0000${font.weight}\u0000${font.style}`;
}

function fontLabel(font: { family: string; weight: number; style: string }): string {
  return `${diagnosticQuote(font.family)} (${font.weight} ${font.style})`;
}

function fontDetails(font: {
  family: string;
  weight: number;
  style: string;
}): Record<string, unknown> {
  return {
    family: font.family,
    weight: font.weight,
    style: font.style,
  };
}

function fontHashRequired(font: FontDeclaration): GlyphkilnError {
  return new GlyphkilnError(
    `Caller-supplied font ${fontLabel(font)} requires an immutable SHA-256 in the design document.`,
    "RESOURCE_BUNDLE_FONT_HASH_REQUIRED",
    fontDetails(font),
  );
}

function manifestStructureLimit(
  resource: "depth" | "entries",
  actual: number,
): GlyphkilnError {
  const maximum =
    resource === "depth"
      ? CLI_RESOURCE_BUNDLE_LIMITS.maxManifestDepth
      : CLI_RESOURCE_BUNDLE_LIMITS.maxManifestEntries;
  return new GlyphkilnError(
    `Resource-bundle manifest exceeds the ${resource} limit.`,
    "RESOURCE_BUNDLE_MANIFEST_STRUCTURE_LIMIT_EXCEEDED",
    { resource, maximum, actual },
  );
}

function fileBytesLimit(
  file: InspectedFile,
  maximum: number,
  actual: number,
  code: string,
): GlyphkilnError {
  return new GlyphkilnError(
    `Resource-bundle file "${file.relativePath}" exceeds its byte limit.`,
    code,
    { file: file.relativePath, maximum, actual },
  );
}

function symlinkRejected(path: string): GlyphkilnError {
  return new GlyphkilnError(
    `Resource-bundle path "${path}" must not contain symbolic links.`,
    "RESOURCE_BUNDLE_SYMLINK_REJECTED",
    { file: path },
  );
}

function invalidBundleRoot(path: string, cause?: unknown): GlyphkilnError {
  const rootName = basename(path) || "root";
  return new GlyphkilnError(
    `Resource-bundle root ${diagnosticQuote(rootName)} must be a real directory.`,
    "RESOURCE_BUNDLE_ROOT_INVALID",
    {
      root: rootName,
      ...(cause === undefined ? {} : { cause: errorMessage(cause) }),
    },
  );
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "$";
  return path.reduce<string>((output, part) => {
    if (typeof part === "number") return `${output}[${part}]`;
    const segment = String(part);
    return output.length === 0 ? segment : `${output}.${segment}`;
  }, "");
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "Unknown filesystem error.";
}

function diagnosticQuote(value: string): string {
  return `"${Array.from(value, escapeDiagnosticCharacter).join("")}"`;
}

function escapeDiagnosticCharacter(character: string): string {
  if (character === '"') return '\\"';
  if (character === "\\") return "\\\\";
  const codePoint = character.codePointAt(0)!;
  if (codePoint >= 0x20 && codePoint <= 0x7e) return character;
  return `\\u{${codePoint.toString(16).toUpperCase()}}`;
}
