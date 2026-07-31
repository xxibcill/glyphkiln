import type { DesignDocument } from "@glyphkiln/core";

export type RevisionResourceReference = {
  resourceId: string;
  resourceKind: "raster-asset" | "font";
  ordinal: number;
};

export function resourceReferencesMatchDocument(
  document: DesignDocument,
  references: readonly RevisionResourceReference[],
): boolean {
  const assetReferences = references
    .filter((reference) => reference.resourceKind === "raster-asset")
    .sort((left, right) => left.ordinal - right.ordinal);
  const fontReferences = references
    .filter((reference) => reference.resourceKind === "font")
    .sort((left, right) => left.ordinal - right.ordinal);
  if (!contiguousOrdinals(assetReferences) || !contiguousOrdinals(fontReferences)) {
    return false;
  }

  const metadata = document.metadata?.resourceVersions;
  if (metadata === undefined) {
    return (
      document.assets.length === 0 &&
      assetReferences.length === 0 &&
      fontReferences.length === 0
    );
  }
  if (!isRecord(metadata)) return false;
  const assetVersions = metadata.assets;
  const fontVersions = metadata.fonts;
  if (!Array.isArray(assetVersions) || !Array.isArray(fontVersions)) {
    return false;
  }

  const assetIds = resourceVersionIds(assetVersions);
  if (
    assetIds === undefined ||
    !sameStrings(
      assetIds,
      document.assets.map((asset) => asset.id),
    ) ||
    !sameStrings(
      assetIds,
      assetReferences.map((reference) => reference.resourceId),
    )
  ) {
    return false;
  }

  const explicitFontIds = resourceVersionIds(fontVersions, true);
  return explicitFontIds === undefined
    ? fontVersions.length === fontReferences.length
    : sameStrings(
        explicitFontIds,
        fontReferences.map((reference) => reference.resourceId),
      );
}

function contiguousOrdinals(references: readonly RevisionResourceReference[]): boolean {
  return references.every((reference, index) => reference.ordinal === index);
}

function resourceVersionIds(
  versions: readonly unknown[],
  allowLegacyMissingIds = false,
): string[] | undefined {
  const ids: string[] = [];
  for (const version of versions) {
    if (!isRecord(version)) return undefined;
    const id = version.id;
    if (id === undefined && allowLegacyMissingIds) return undefined;
    if (typeof id !== "string") return undefined;
    ids.push(id);
  }
  return ids;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
