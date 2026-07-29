import { sha256 } from "../cache/canonical.js";
import { hashCanonical } from "../cache/canonical.js";
import { GlyphkilnError, type ResolvedAsset } from "../domain/types.js";
import type { AssetDeclaration, DesignDocument } from "../schema/design-document.js";

export class AssetRegistry {
  readonly #assets = new Map<string, ResolvedAsset>();

  public constructor(
    declarations: readonly AssetDeclaration[],
    assets: readonly ResolvedAsset[],
  ) {
    for (const asset of assets) {
      this.#assets.set(asset.id, verifyAssetBytes(asset));
    }
    for (const declaration of declarations) {
      this.#verifyDeclaration(declaration);
    }
  }

  public get(id: string): ResolvedAsset {
    const asset = this.#assets.get(id);
    if (asset === undefined) {
      throw new GlyphkilnError(
        `Asset "${id}" was declared but its bytes were not supplied.`,
        "UNRESOLVED_ASSET",
        { assetId: id },
      );
    }
    return asset;
  }

  public list(): ResolvedAsset[] {
    return [...this.#assets.values()];
  }

  #verifyDeclaration(declaration: AssetDeclaration): void {
    const asset = this.get(declaration.id);
    const mismatches: string[] = [];
    if (asset.sha256 !== declaration.sha256) mismatches.push("sha256");
    if (asset.mimeType !== declaration.mimeType) mismatches.push("mimeType");
    if (asset.width !== declaration.width) mismatches.push("width");
    if (asset.height !== declaration.height) mismatches.push("height");
    if (hashCanonical(asset.origin) !== hashCanonical(declaration.origin)) {
      mismatches.push("origin");
    }
    if (mismatches.length > 0) {
      throw new GlyphkilnError(
        `Resolved asset "${declaration.id}" does not match its declaration.`,
        "ASSET_DECLARATION_MISMATCH",
        { assetId: declaration.id, fields: mismatches },
      );
    }
  }
}

export function validateAssetReferences(
  document: DesignDocument,
  registry: AssetRegistry,
): void {
  const declared = new Set(document.assets.map((asset) => asset.id));
  for (const layer of document.layers) {
    if (
      layer.type === "logo" ||
      layer.type === "image" ||
      layer.type === "product-screenshot"
    ) {
      if (!declared.has(layer.assetId)) {
        throw new GlyphkilnError(
          `Layer "${layer.id}" references undeclared asset "${layer.assetId}".`,
          "UNDECLARED_ASSET_REFERENCE",
          { layerId: layer.id, assetId: layer.assetId },
        );
      }
      registry.get(layer.assetId);
    }
  }
}

export function assetDataUri(asset: ResolvedAsset): string {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.bytes).toString("base64")}`;
}

function verifyAssetBytes(asset: ResolvedAsset): ResolvedAsset {
  const actualHash = sha256(asset.bytes);
  if (actualHash !== asset.sha256) {
    throw new GlyphkilnError(
      `Asset "${asset.id}" bytes do not match its declared SHA-256.`,
      "ASSET_HASH_MISMATCH",
      { assetId: asset.id, expected: asset.sha256, actual: actualHash },
    );
  }
  const detectedMimeType = detectImageMimeType(asset.bytes);
  if (detectedMimeType !== asset.mimeType) {
    throw new GlyphkilnError(
      `Asset "${asset.id}" content is ${detectedMimeType ?? "unsupported"}, not ${asset.mimeType}.`,
      "ASSET_MIME_MISMATCH",
      { assetId: asset.id, expected: asset.mimeType, actual: detectedMimeType },
    );
  }
  return { ...asset, bytes: new Uint8Array(asset.bytes) };
}

function detectImageMimeType(bytes: Uint8Array): ResolvedAsset["mimeType"] | undefined {
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
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  return undefined;
}
