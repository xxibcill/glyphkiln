import {
  DEVELOPMENT_FONT_SHA256,
  RENDER_RESOURCE_LIMITS,
  createDevelopmentFont,
  sha256,
  type DesignDocument,
  type ResolvedAsset,
  type ResolvedFont,
} from "@glyphkiln/core";

import type { ResourceStore } from "../resources";
import type { ResourceVersion } from "../resources";

export type ResolvedRenderResources = {
  readonly assets: readonly ResolvedAsset[];
  readonly fonts: readonly ResolvedFont[];
};

export type RenderResourceResolver = {
  resolve(input: {
    readonly workspaceId: string;
    readonly document: DesignDocument;
  }): Promise<ResolvedRenderResources>;
};

/**
 * Alpha's manual document factory currently admits only Core's pinned
 * development font and no raster assets. This resolver fails closed if a
 * revision contains anything else; the admitted-resource resolver can replace
 * it without changing queue payloads or worker orchestration.
 */
export class BuiltInRenderResourceResolver implements RenderResourceResolver {
  resolve(input: {
    readonly workspaceId: string;
    readonly document: DesignDocument;
  }): Promise<ResolvedRenderResources> {
    if (input.document.assets.length > 0) {
      return Promise.reject(
        new RenderResourceResolutionError(
          "RESOURCE_RESOLVER_REQUIRED",
          "This worker is not configured to resolve admitted raster assets.",
        ),
      );
    }
    const unsupported = input.document.fonts.some(
      (font) =>
        font.family !== "Inter" ||
        font.style !== "normal" ||
        font.sha256 !== DEVELOPMENT_FONT_SHA256,
    );
    if (unsupported) {
      return Promise.reject(
        new RenderResourceResolutionError(
          "RESOURCE_RESOLVER_REQUIRED",
          "This worker is not configured to resolve the revision's immutable fonts.",
        ),
      );
    }
    return Promise.resolve({
      assets: [],
      fonts: [createDevelopmentFont()],
    });
  }
}

/**
 * Resolves only immutable, scanner-admitted rows from a workspace-qualified
 * ResourceStore. Document declarations are rechecked against both metadata and
 * bytes before anything crosses Core's explicit resource boundary.
 */
export class AdmittedRenderResourceResolver implements RenderResourceResolver {
  readonly #store: ResourceStore;

  constructor(store: ResourceStore) {
    this.#store = store;
  }

  async resolve(input: {
    readonly workspaceId: string;
    readonly document: DesignDocument;
  }): Promise<ResolvedRenderResources> {
    assertDeclarationCounts(input.document);
    const assetMetadata = await preflightAssets(
      this.#store,
      input.workspaceId,
      input.document.assets,
    );
    const fontMetadata = await preflightFonts(
      this.#store,
      input.workspaceId,
      input.document.fonts,
    );

    const assets: ResolvedAsset[] = [];
    for (const { declaration, metadata } of assetMetadata) {
      const stored = await this.#store.readById(input.workspaceId, declaration.id);
      if (stored === null) throw notAdmitted();
      if (
        !assetMetadataMatches(stored.resource, input.workspaceId, declaration) ||
        stored.resource.byteSize !== metadata.byteSize ||
        stored.bytes.byteLength !== metadata.byteSize ||
        sha256(stored.bytes) !== declaration.sha256
      ) {
        throw declarationMismatch();
      }
      assets.push({
        id: declaration.id,
        mimeType: declaration.mimeType,
        sha256: declaration.sha256,
        width: declaration.width,
        height: declaration.height,
        origin: { ...declaration.origin },
        bytes: new Uint8Array(stored.bytes),
      });
    }

    const fonts: ResolvedFont[] = [];
    if (fontMetadata.developmentFont !== undefined) {
      fonts.push(fontMetadata.developmentFont);
    }
    for (const { declaration, metadata } of fontMetadata.uploadedFonts) {
      const stored = await this.#store.readFontVersion(input.workspaceId, {
        family: declaration.family,
        weight: declaration.weight,
        style: declaration.style,
        contentHash: declaration.sha256,
      });
      if (stored === null) throw notAdmitted();
      if (
        !fontMetadataMatches(stored.resource, input.workspaceId, declaration) ||
        stored.resource.id !== metadata.id ||
        stored.resource.byteSize !== metadata.byteSize ||
        stored.bytes.byteLength !== metadata.byteSize ||
        sha256(stored.bytes) !== declaration.sha256
      ) {
        throw declarationMismatch();
      }
      fonts.push({
        family: declaration.family,
        weight: declaration.weight,
        style: declaration.style,
        sha256: declaration.sha256,
        bytes: new Uint8Array(stored.bytes),
      });
    }
    return { assets, fonts };
  }
}

export class RenderResourceResolutionError extends Error {
  constructor(
    public readonly code:
      | "RESOURCE_DECLARATION_MISMATCH"
      | "RESOURCE_LIMIT_EXCEEDED"
      | "RESOURCE_NOT_ADMITTED"
      | "RESOURCE_RESOLVER_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "RenderResourceResolutionError";
  }
}

type AssetDeclaration = DesignDocument["assets"][number];
type FontDeclaration = DesignDocument["fonts"][number];
type RasterResourceVersion = Extract<ResourceVersion, { kind: "raster-asset" }>;
type FontResourceVersion = Extract<ResourceVersion, { kind: "font" }>;

type PreflightedAsset = {
  readonly declaration: AssetDeclaration;
  readonly metadata: RasterResourceVersion;
};

type PreflightedFonts = {
  readonly developmentFont: ResolvedFont | undefined;
  readonly uploadedFonts: readonly {
    readonly declaration: FontDeclaration & { readonly sha256: string };
    readonly metadata: FontResourceVersion;
  }[];
};

function assertDeclarationCounts(document: DesignDocument): void {
  if (
    document.assets.length > RENDER_RESOURCE_LIMITS.maxAssets ||
    document.fonts.length > RENDER_RESOURCE_LIMITS.maxFonts
  ) {
    throw resourceLimitExceeded();
  }
}

async function preflightAssets(
  store: ResourceStore,
  workspaceId: string,
  declarations: DesignDocument["assets"],
): Promise<readonly PreflightedAsset[]> {
  const preflighted: PreflightedAsset[] = [];
  let totalBytes = 0;
  let totalPixels = 0;

  for (const declaration of declarations) {
    const metadata = await store.findById(workspaceId, declaration.id);
    if (metadata === null) throw notAdmitted();
    if (!assetMetadataMatches(metadata, workspaceId, declaration)) {
      throw declarationMismatch();
    }

    totalBytes = addResourceBytes(
      totalBytes,
      metadata.byteSize,
      RENDER_RESOURCE_LIMITS.maxAssetBytes,
      RENDER_RESOURCE_LIMITS.maxTotalAssetBytes,
    );
    totalPixels = addAssetPixels(totalPixels, metadata);
    preflighted.push({ declaration, metadata });
  }
  return preflighted;
}

async function preflightFonts(
  store: ResourceStore,
  workspaceId: string,
  declarations: DesignDocument["fonts"],
): Promise<PreflightedFonts> {
  let developmentFont: ResolvedFont | undefined;
  let totalBytes = 0;
  const uploadedFonts: {
    declaration: FontDeclaration & { sha256: string };
    metadata: FontResourceVersion;
  }[] = [];
  const resolvedFontKeys = new Set<string>();

  for (const declaration of declarations) {
    if (isDevelopmentFont(declaration)) {
      if (developmentFont === undefined) {
        developmentFont = createDevelopmentFont();
        totalBytes = addResourceBytes(
          totalBytes,
          developmentFont.bytes.byteLength,
          RENDER_RESOURCE_LIMITS.maxFontBytes,
          RENDER_RESOURCE_LIMITS.maxTotalFontBytes,
        );
      }
      continue;
    }
    if (declaration.sha256 === undefined) throw declarationMismatch();

    const immutableDeclaration = {
      ...declaration,
      sha256: declaration.sha256,
    };
    const key = fontKey(immutableDeclaration);
    if (resolvedFontKeys.has(key)) continue;
    resolvedFontKeys.add(key);

    const metadata = await store.findFontVersion(workspaceId, {
      family: immutableDeclaration.family,
      weight: immutableDeclaration.weight,
      style: immutableDeclaration.style,
      contentHash: immutableDeclaration.sha256,
    });
    if (metadata === null) throw notAdmitted();
    if (!fontMetadataMatches(metadata, workspaceId, immutableDeclaration)) {
      throw declarationMismatch();
    }
    totalBytes = addResourceBytes(
      totalBytes,
      metadata.byteSize,
      RENDER_RESOURCE_LIMITS.maxFontBytes,
      RENDER_RESOURCE_LIMITS.maxTotalFontBytes,
    );
    uploadedFonts.push({ declaration: immutableDeclaration, metadata });
  }

  return { developmentFont, uploadedFonts };
}

function assetMetadataMatches(
  resource: ResourceVersion,
  workspaceId: string,
  declaration: AssetDeclaration,
): resource is RasterResourceVersion {
  return (
    resource.kind === "raster-asset" &&
    resource.id === declaration.id &&
    resource.workspaceId === workspaceId &&
    resource.mediaType === declaration.mimeType &&
    resource.contentHash === declaration.sha256 &&
    resource.width === declaration.width &&
    resource.height === declaration.height &&
    sameOrigin(resource, declaration.origin)
  );
}

function fontMetadataMatches(
  resource: ResourceVersion,
  workspaceId: string,
  declaration: FontDeclaration & { readonly sha256: string },
): resource is FontResourceVersion {
  return (
    resource.kind === "font" &&
    resource.workspaceId === workspaceId &&
    resource.family === declaration.family &&
    resource.weight === declaration.weight &&
    resource.style === declaration.style &&
    resource.contentHash === declaration.sha256
  );
}

function addResourceBytes(
  total: number,
  byteSize: number,
  maximumResourceBytes: number,
  maximumTotalBytes: number,
): number {
  if (
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > maximumResourceBytes
  ) {
    throw resourceLimitExceeded();
  }
  const next = total + byteSize;
  if (!Number.isSafeInteger(next) || next > maximumTotalBytes) {
    throw resourceLimitExceeded();
  }
  return next;
}

function addAssetPixels(total: number, resource: RasterResourceVersion): number {
  if (
    !Number.isSafeInteger(resource.width) ||
    !Number.isSafeInteger(resource.height) ||
    resource.width < 1 ||
    resource.height < 1 ||
    resource.width > RENDER_RESOURCE_LIMITS.maxAssetDimension ||
    resource.height > RENDER_RESOURCE_LIMITS.maxAssetDimension
  ) {
    throw resourceLimitExceeded();
  }
  const pixels = resource.width * resource.height;
  if (!Number.isSafeInteger(pixels) || pixels > RENDER_RESOURCE_LIMITS.maxAssetPixels) {
    throw resourceLimitExceeded();
  }
  const next = total + pixels;
  if (
    !Number.isSafeInteger(next) ||
    next > RENDER_RESOURCE_LIMITS.maxTotalAssetPixels
  ) {
    throw resourceLimitExceeded();
  }
  return next;
}

function fontKey(declaration: FontDeclaration & { readonly sha256: string }): string {
  return [
    declaration.family,
    String(declaration.weight),
    declaration.style,
    declaration.sha256,
  ].join("\u0000");
}

function isDevelopmentFont(declaration: DesignDocument["fonts"][number]): boolean {
  return (
    declaration.family === "Inter" &&
    declaration.style === "normal" &&
    declaration.sha256 === DEVELOPMENT_FONT_SHA256
  );
}

function sameOrigin(
  resource: Extract<ResourceVersion, { kind: "raster-asset" }>,
  declaration: DesignDocument["assets"][number]["origin"],
): boolean {
  return (
    resource.origin.kind === declaration.kind &&
    resource.origin.sourceName === declaration.sourceName &&
    resource.origin.sourceReference === declaration.sourceReference &&
    resource.origin.generativeImageModel === declaration.generativeImageModel
  );
}

function notAdmitted(): RenderResourceResolutionError {
  return new RenderResourceResolutionError(
    "RESOURCE_NOT_ADMITTED",
    "A declared render resource is not admitted in this workspace.",
  );
}

function declarationMismatch(): RenderResourceResolutionError {
  return new RenderResourceResolutionError(
    "RESOURCE_DECLARATION_MISMATCH",
    "A declared render resource does not match its immutable admitted metadata.",
  );
}

function resourceLimitExceeded(): RenderResourceResolutionError {
  return new RenderResourceResolutionError(
    "RESOURCE_LIMIT_EXCEEDED",
    "Declared render resources exceed the bounded renderer resource profile.",
  );
}
