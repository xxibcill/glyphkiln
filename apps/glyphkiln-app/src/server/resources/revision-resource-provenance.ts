import { canonicalJson, type AssetOrigin, type DesignDocument } from "@glyphkiln/core";

import type { ResourceLicense } from "./types";

export type RevisionResourcePin = {
  resourceId: string;
  resourceKind: "raster-asset" | "font";
  ordinal: number;
};

type RevisionResourceProvenance = {
  contentHash: string;
  origin: AssetOrigin;
  license: ResourceLicense;
};

export type RevisionResourceReference =
  | (RevisionResourcePin &
      RevisionResourceProvenance & {
        resourceKind: "raster-asset";
      })
  | (RevisionResourcePin &
      RevisionResourceProvenance & {
        resourceKind: "font";
        family: string;
        weight: number;
        style: "normal" | "italic";
      });

export type RevisionResourceReferenceRow = {
  resource_id: string;
  resource_kind: "raster-asset" | "font";
  ordinal: number | string;
  content_hash: string;
  font_family: string | null;
  font_weight: number | string | null;
  font_style: "normal" | "italic" | null;
  origin_kind: AssetOrigin["kind"];
  origin_source_name: string | null;
  origin_source_reference: string | null;
  generative_image_model: string | null;
  license_status: ResourceLicense["status"];
  license_identifier: string | null;
  license_name: string | null;
  license_reference: string | null;
  license_notes: string | null;
};

export const REVISION_RESOURCE_REFERENCE_COLUMNS = `
  reference.resource_id,
  reference.resource_kind,
  reference.ordinal,
  resource.content_hash,
  resource.font_family,
  resource.font_weight,
  resource.font_style,
  resource.origin_kind,
  resource.origin_source_name,
  resource.origin_source_reference,
  resource.generative_image_model,
  resource.license_status,
  resource.license_identifier,
  resource.license_name,
  resource.license_reference,
  resource.license_notes
`;

export function mapRevisionResourceReference(
  row: RevisionResourceReferenceRow,
): RevisionResourceReference | undefined {
  const common = {
    resourceId: row.resource_id,
    ordinal: Number(row.ordinal),
    contentHash: row.content_hash,
    origin: compactObject({
      kind: row.origin_kind,
      sourceName: row.origin_source_name,
      sourceReference: row.origin_source_reference,
      generativeImageModel: row.generative_image_model,
    }) as AssetOrigin,
    license: compactObject({
      status: row.license_status,
      identifier: row.license_identifier,
      name: row.license_name,
      reference: row.license_reference,
      notes: row.license_notes,
    }) as ResourceLicense,
  };
  if (row.resource_kind === "raster-asset") {
    return { ...common, resourceKind: row.resource_kind };
  }
  if (row.font_family === null || row.font_weight === null || row.font_style === null) {
    return undefined;
  }
  return {
    ...common,
    resourceKind: row.resource_kind,
    family: row.font_family,
    weight: Number(row.font_weight),
    style: row.font_style,
  };
}

export function resourceReferencesMatchDocument(
  document: DesignDocument,
  references: readonly RevisionResourceReference[],
): boolean {
  const assetReferences = references
    .filter(
      (
        reference,
      ): reference is Extract<
        RevisionResourceReference,
        { resourceKind: "raster-asset" }
      > => reference.resourceKind === "raster-asset",
    )
    .sort((left, right) => left.ordinal - right.ordinal);
  const fontReferences = references
    .filter(
      (
        reference,
      ): reference is Extract<RevisionResourceReference, { resourceKind: "font" }> =>
        reference.resourceKind === "font",
    )
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
  if (
    assetVersions.length !== assetReferences.length ||
    fontVersions.length !== fontReferences.length ||
    document.assets.length !== assetReferences.length
  ) {
    return false;
  }

  const assetsMatch = assetReferences.every(
    (reference, index) =>
      document.assets[index]?.id === reference.resourceId &&
      canonicalJson(assetVersions[index]) ===
        canonicalJson(resourceVersionFromReference(reference)),
  );
  if (!assetsMatch) return false;

  return fontReferences.every((reference, index) =>
    fontVersionMatchesReference(fontVersions[index], reference),
  );
}

function resourceVersionFromReference(
  reference: RevisionResourceReference,
): Record<string, unknown> {
  const common = {
    id: reference.resourceId,
    sha256: reference.contentHash,
    origin: reference.origin,
    license: reference.license,
  };
  return reference.resourceKind === "raster-asset"
    ? common
    : {
        ...common,
        family: reference.family,
        weight: reference.weight,
        style: reference.style,
      };
}

function fontVersionMatchesReference(
  version: unknown,
  reference: Extract<RevisionResourceReference, { resourceKind: "font" }>,
): boolean {
  if (!isRecord(version)) return false;
  if (version.id !== undefined) {
    return (
      canonicalJson(version) === canonicalJson(resourceVersionFromReference(reference))
    );
  }
  if (
    version.family !== reference.family ||
    version.weight !== reference.weight ||
    version.style !== reference.style ||
    version.sha256 !== reference.contentHash
  ) {
    return false;
  }
  if (
    version.origin !== undefined &&
    canonicalJson(version.origin) !== canonicalJson(reference.origin)
  ) {
    return false;
  }
  return (
    version.license === undefined ||
    canonicalJson(version.license) === canonicalJson(reference.license)
  );
}

function contiguousOrdinals(references: readonly RevisionResourcePin[]): boolean {
  return references.every((reference, index) => reference.ordinal === index);
}

function compactObject(
  values: Readonly<Record<string, string | null>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
