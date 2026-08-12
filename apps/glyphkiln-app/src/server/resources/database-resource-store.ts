import { COLOR_NORMALIZATION_POLICY_VERSION, sha256 } from "@glyphkiln/core";

import type { SqlDatabase, SqlRow, SqlTransaction } from "../persistence/database";
import type { ResourceBlobStorage } from "./blob-storage";
import { ResourceIngestionError } from "./errors";
import type { FontResourceReference, ResourceStore } from "./resource-store";
import type {
  AdmittedResource,
  RasterColorNormalizationProvenance,
  ResourceAdmission,
  ResourceVersion,
  ResourceWithBytes,
} from "./types";

type ResourceRow = SqlRow & {
  id: string;
  workspaceId: string;
  kind: "raster-asset" | "font";
  contentHash: string;
  colorNormalizationPolicyVersion: string | null;
  colorNormalizationSourceHash: string | null;
  colorNormalizationSourceMediaType: string | null;
  storageKey: string;
  mediaType: "image/png" | "image/jpeg" | "font/ttf" | "font/otf";
  byteSize: number;
  width: number | null;
  height: number | null;
  fontFamily: string | null;
  fontWeight: number | null;
  fontStyle: "normal" | "italic" | null;
  originKind: "user-upload" | "licensed-library" | "generated" | "unknown";
  originSourceName: string | null;
  originSourceReference: string | null;
  generativeImageModel: string | null;
  licenseStatus: "owned" | "licensed" | "public-domain" | "unknown";
  licenseIdentifier: string | null;
  licenseName: string | null;
  licenseReference: string | null;
  licenseNotes: string | null;
  scannerName: string;
  scannerVersion: string;
  scannerReference: string | null;
  scannedAt: Date | string;
  createdBy: string;
  createdAt: Date | string;
};

type ResourceUsageRow = SqlRow & {
  admissionCount: string;
  blobExists: boolean;
  installationAdmissionCount: string;
  installationStoredBytes: string;
  storedBytes: string;
};

export type DatabaseResourceStoreLimits = {
  readonly maximumInstallationAdmissions: number;
  readonly maximumInstallationStoredBytes: number;
  readonly maximumWorkspaceAdmissions: number;
  readonly maximumWorkspaceStoredBytes: number;
};

export const DEFAULT_DATABASE_RESOURCE_STORE_LIMITS: DatabaseResourceStoreLimits = {
  maximumInstallationAdmissions: 100_000,
  maximumInstallationStoredBytes: 10_737_418_240,
  maximumWorkspaceAdmissions: 10_000,
  maximumWorkspaceStoredBytes: 1_073_741_824,
};

const RESOURCE_COLUMNS = `
  id,
  workspace_id AS "workspaceId",
  kind,
  content_hash AS "contentHash",
  color_normalization_policy_version AS "colorNormalizationPolicyVersion",
  color_normalization_source_hash AS "colorNormalizationSourceHash",
  color_normalization_source_media_type AS "colorNormalizationSourceMediaType",
  storage_key AS "storageKey",
  media_type AS "mediaType",
  byte_size AS "byteSize",
  width,
  height,
  font_family AS "fontFamily",
  font_weight AS "fontWeight",
  font_style AS "fontStyle",
  origin_kind AS "originKind",
  origin_source_name AS "originSourceName",
  origin_source_reference AS "originSourceReference",
  generative_image_model AS "generativeImageModel",
  license_status AS "licenseStatus",
  license_identifier AS "licenseIdentifier",
  license_name AS "licenseName",
  license_reference AS "licenseReference",
  license_notes AS "licenseNotes",
  scanner_name AS "scannerName",
  scanner_version AS "scannerVersion",
  scanner_reference AS "scannerReference",
  scanned_at AS "scannedAt",
  created_by AS "createdBy",
  created_at AS "createdAt"
`;

function optionalValue(value: string | null): string | undefined {
  return value ?? undefined;
}

function mapColorNormalization(
  row: ResourceRow,
): RasterColorNormalizationProvenance | undefined {
  const values = [
    row.colorNormalizationPolicyVersion,
    row.colorNormalizationSourceHash,
    row.colorNormalizationSourceMediaType,
  ];
  if (values.every((value) => value === null)) return undefined;
  if (
    values.some((value) => value === null) ||
    row.kind !== "raster-asset" ||
    row.mediaType !== "image/png" ||
    row.colorNormalizationPolicyVersion !== COLOR_NORMALIZATION_POLICY_VERSION ||
    row.colorNormalizationSourceHash === null ||
    !/^[0-9a-f]{64}$/u.test(row.colorNormalizationSourceHash) ||
    (row.colorNormalizationSourceMediaType !== "image/png" &&
      row.colorNormalizationSourceMediaType !== "image/jpeg")
  ) {
    throw new ResourceIngestionError(
      "Stored raster color-normalization provenance is invalid.",
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
  return {
    policyVersion: COLOR_NORMALIZATION_POLICY_VERSION,
    sourceContentHash: row.colorNormalizationSourceHash,
    sourceMediaType: row.colorNormalizationSourceMediaType,
    outputContentHash: row.contentHash,
  };
}

function mapResourceRow(row: ResourceRow): ResourceVersion {
  const common = {
    id: row.id,
    workspaceId: row.workspaceId,
    contentHash: row.contentHash,
    storageKey: row.storageKey,
    byteSize: row.byteSize,
    origin: {
      kind: row.originKind,
      sourceName: optionalValue(row.originSourceName),
      sourceReference: optionalValue(row.originSourceReference),
      generativeImageModel: optionalValue(row.generativeImageModel),
    },
    license: {
      status: row.licenseStatus,
      identifier: optionalValue(row.licenseIdentifier),
      name: optionalValue(row.licenseName),
      reference: optionalValue(row.licenseReference),
      notes: optionalValue(row.licenseNotes),
    },
    scan: {
      status: "clean" as const,
      scannerName: row.scannerName,
      scannerVersion: row.scannerVersion,
      scannedAt: new Date(row.scannedAt),
      reference: optionalValue(row.scannerReference),
    },
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt),
  };
  const colorNormalization = mapColorNormalization(row);

  if (
    row.kind === "raster-asset" &&
    (row.mediaType === "image/png" || row.mediaType === "image/jpeg") &&
    row.width !== null &&
    row.height !== null
  ) {
    return {
      ...common,
      kind: row.kind,
      mediaType: row.mediaType,
      width: row.width,
      height: row.height,
      ...(colorNormalization === undefined ? {} : { colorNormalization }),
    };
  }
  if (
    row.kind === "font" &&
    (row.mediaType === "font/ttf" || row.mediaType === "font/otf") &&
    row.fontFamily !== null &&
    row.fontWeight !== null &&
    row.fontStyle !== null
  ) {
    return {
      ...common,
      kind: row.kind,
      mediaType: row.mediaType,
      family: row.fontFamily,
      weight: row.fontWeight,
      style: row.fontStyle,
    };
  }
  throw new ResourceIngestionError(
    "Stored resource metadata violates its immutable kind contract.",
    "RESOURCE_STORAGE_INTEGRITY_ERROR",
  );
}

function storageKeyFor(resource: AdmittedResource): string {
  const workspacePartition = sha256(resource.workspaceId);
  return [
    "workspaces",
    workspacePartition,
    "resources",
    resource.kind,
    resource.contentHash.slice(0, 2),
    resource.contentHash,
  ].join("/");
}

async function lockWorkspaceForAdmission(
  transaction: SqlTransaction,
  workspaceId: string,
): Promise<void> {
  await transaction.query(
    `
      SELECT id
      FROM workspaces
      WHERE id = $1
      FOR UPDATE
    `,
    [workspaceId],
  );
}

async function lockInstallationForAdmission(
  transaction: SqlTransaction,
): Promise<void> {
  const rows = await transaction.query(
    `
      SELECT singleton
      FROM installation_state
      WHERE singleton = TRUE
      FOR UPDATE
    `,
  );
  if (rows.length !== 1) {
    throw new ResourceIngestionError(
      "Installation resource capacity could not be locked.",
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
}

async function findDuplicate(
  transaction: SqlTransaction,
  resource: AdmittedResource,
): Promise<ResourceRow | null> {
  const rows = await transaction.query<ResourceRow>(
    `
      SELECT ${RESOURCE_COLUMNS}
      FROM resource_versions
      WHERE
        workspace_id = $1
        AND kind = $2
        AND content_hash = $3
        AND COALESCE(font_family, '') = $4
        AND COALESCE(font_weight, 0) = $5
        AND COALESCE(font_style, '') = $6
      ORDER BY created_at, id
      LIMIT 1
    `,
    [
      resource.workspaceId,
      resource.kind,
      resource.contentHash,
      resource.kind === "font" ? resource.family : "",
      resource.kind === "font" ? resource.weight : 0,
      resource.kind === "font" ? resource.style : "",
    ],
  );
  return rows.at(0) ?? null;
}

function parseUsageCount(value: string, field: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new ResourceIngestionError(
      `Stored resource ${field} is invalid.`,
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ResourceIngestionError(
      `Stored resource ${field} exceeds the supported range.`,
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
  return parsed;
}

async function assertResourceQuota(
  transaction: SqlTransaction,
  resource: AdmittedResource,
  limits: DatabaseResourceStoreLimits,
): Promise<void> {
  const rows = await transaction.query<ResourceUsageRow>(
    `
      SELECT
        (
          SELECT COUNT(*)::text
          FROM resource_versions
          WHERE workspace_id = $1
        ) AS "admissionCount",
        (
          SELECT COALESCE(SUM(distinct_blob.byte_size), 0)::text
          FROM (
            SELECT MAX(byte_size) AS byte_size
            FROM resource_versions
            WHERE workspace_id = $1
            GROUP BY kind, content_hash
          ) AS distinct_blob
        ) AS "storedBytes",
        (
          SELECT COUNT(*)::text
          FROM resource_versions
        ) AS "installationAdmissionCount",
        (
          SELECT COALESCE(SUM(distinct_blob.byte_size), 0)::text
          FROM (
            SELECT MAX(byte_size) AS byte_size
            FROM resource_versions
            GROUP BY workspace_id, kind, content_hash
          ) AS distinct_blob
        ) AS "installationStoredBytes",
        EXISTS (
          SELECT 1
          FROM resource_versions
          WHERE
            workspace_id = $1
            AND kind = $2
            AND content_hash = $3
        ) AS "blobExists"
    `,
    [resource.workspaceId, resource.kind, resource.contentHash],
  );
  const usage = rows.at(0);
  if (usage === undefined) {
    throw new ResourceIngestionError(
      "Resource usage could not be read.",
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
  const admissionCount = parseUsageCount(usage.admissionCount, "admission count");
  const storedBytes = parseUsageCount(usage.storedBytes, "stored byte count");
  const installationAdmissionCount = parseUsageCount(
    usage.installationAdmissionCount,
    "installation admission count",
  );
  const installationStoredBytes = parseUsageCount(
    usage.installationStoredBytes,
    "installation stored byte count",
  );
  if (admissionCount >= limits.maximumWorkspaceAdmissions) {
    throw new ResourceIngestionError(
      "The workspace resource-admission quota has been reached.",
      "RESOURCE_QUOTA_EXCEEDED",
    );
  }
  if (installationAdmissionCount >= limits.maximumInstallationAdmissions) {
    throw new ResourceIngestionError(
      "The installation resource-admission quota has been reached.",
      "RESOURCE_QUOTA_EXCEEDED",
    );
  }
  if (
    !usage.blobExists &&
    storedBytes + resource.bytes.byteLength > limits.maximumWorkspaceStoredBytes
  ) {
    throw new ResourceIngestionError(
      "The workspace immutable-resource storage quota has been reached.",
      "RESOURCE_QUOTA_EXCEEDED",
    );
  }
  if (
    !usage.blobExists &&
    installationStoredBytes + resource.bytes.byteLength >
      limits.maximumInstallationStoredBytes
  ) {
    throw new ResourceIngestionError(
      "The installation immutable-resource storage quota has been reached.",
      "RESOURCE_QUOTA_EXCEEDED",
    );
  }
}

async function insertResource(
  transaction: SqlTransaction,
  resource: AdmittedResource,
  storageKey: string,
): Promise<ResourceRow> {
  const rows = await transaction.query<ResourceRow>(
    `
      INSERT INTO resource_versions (
        id,
        workspace_id,
        kind,
        content_hash,
        storage_key,
        media_type,
        byte_size,
        width,
        height,
        font_family,
        font_weight,
        font_style,
        origin_kind,
        origin_source_name,
        origin_source_reference,
        generative_image_model,
        license_status,
        license_identifier,
        license_name,
        license_reference,
        license_notes,
        scanner_verdict,
        scanner_name,
        scanner_version,
        scanner_reference,
        scanned_at,
        color_normalization_policy_version,
        color_normalization_source_hash,
        color_normalization_source_media_type,
        created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, 'clean', $22, $23,
        $24, $25, $26, $27, $28, $29
      )
      RETURNING ${RESOURCE_COLUMNS}
    `,
    [
      resource.id,
      resource.workspaceId,
      resource.kind,
      resource.contentHash,
      storageKey,
      resource.mediaType,
      resource.bytes.byteLength,
      resource.kind === "raster-asset" ? resource.width : null,
      resource.kind === "raster-asset" ? resource.height : null,
      resource.kind === "font" ? resource.family : null,
      resource.kind === "font" ? resource.weight : null,
      resource.kind === "font" ? resource.style : null,
      resource.origin.kind,
      resource.origin.sourceName ?? null,
      resource.origin.sourceReference ?? null,
      resource.origin.generativeImageModel ?? null,
      resource.license.status,
      resource.license.identifier ?? null,
      resource.license.name ?? null,
      resource.license.reference ?? null,
      resource.license.notes ?? null,
      resource.scan.scannerName,
      resource.scan.scannerVersion,
      resource.scan.reference ?? null,
      resource.scan.scannedAt,
      resource.kind === "raster-asset"
        ? (resource.colorNormalization?.policyVersion ?? null)
        : null,
      resource.kind === "raster-asset"
        ? (resource.colorNormalization?.sourceContentHash ?? null)
        : null,
      resource.kind === "raster-asset"
        ? (resource.colorNormalization?.sourceMediaType ?? null)
        : null,
      resource.actorUserId,
    ],
  );
  const row = rows.at(0);
  if (row === undefined) {
    throw new ResourceIngestionError(
      "The admitted resource could not be persisted.",
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
  return row;
}

async function recordIngestion(
  transaction: SqlTransaction,
  resource: AdmittedResource,
  storedResourceId: string,
  duplicateOfResourceId: string | null,
): Promise<void> {
  await transaction.query(
    `
      INSERT INTO resource_ingestions (
        id,
        workspace_id,
        resource_id,
        duplicate_of_resource_id,
        original_filename,
        declared_media_type,
        origin_kind,
        origin_source_name,
        origin_source_reference,
        generative_image_model,
        license_status,
        license_identifier,
        license_name,
        license_reference,
        license_notes,
        scanner_verdict,
        scanner_name,
        scanner_version,
        scanner_reference,
        scanned_at,
        created_by,
        admission_semantics_version
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, 'clean', $16, $17, $18, $19, $20, 2
      )
    `,
    [
      resource.ingestionId,
      resource.workspaceId,
      storedResourceId,
      duplicateOfResourceId,
      resource.originalFilename ?? null,
      resource.kind === "raster-asset"
        ? (resource.colorNormalization?.sourceMediaType ?? resource.mediaType)
        : resource.mediaType,
      resource.origin.kind,
      resource.origin.sourceName ?? null,
      resource.origin.sourceReference ?? null,
      resource.origin.generativeImageModel ?? null,
      resource.license.status,
      resource.license.identifier ?? null,
      resource.license.name ?? null,
      resource.license.reference ?? null,
      resource.license.notes ?? null,
      resource.scan.scannerName,
      resource.scan.scannerVersion,
      resource.scan.reference ?? null,
      resource.scan.scannedAt,
      resource.actorUserId,
    ],
  );
}

export class DatabaseResourceStore implements ResourceStore {
  readonly #database: SqlDatabase;
  readonly #blobs: ResourceBlobStorage;
  readonly #limits: DatabaseResourceStoreLimits;

  public constructor(
    database: SqlDatabase,
    blobs: ResourceBlobStorage,
    limits: DatabaseResourceStoreLimits = DEFAULT_DATABASE_RESOURCE_STORE_LIMITS,
  ) {
    if (
      !Number.isSafeInteger(limits.maximumInstallationAdmissions) ||
      limits.maximumInstallationAdmissions < 1 ||
      !Number.isSafeInteger(limits.maximumInstallationStoredBytes) ||
      limits.maximumInstallationStoredBytes < 1 ||
      !Number.isSafeInteger(limits.maximumWorkspaceAdmissions) ||
      limits.maximumWorkspaceAdmissions < 1 ||
      !Number.isSafeInteger(limits.maximumWorkspaceStoredBytes) ||
      limits.maximumWorkspaceStoredBytes < 1
    ) {
      throw new Error("Resource-store limits must be positive safe integers.");
    }
    this.#database = database;
    this.#blobs = blobs;
    this.#limits = limits;
  }

  public async admit(resource: AdmittedResource): Promise<ResourceAdmission> {
    assertAdmittedColorNormalization(resource);
    const storageKey = storageKeyFor(resource);

    return this.#database.transaction(async (transaction) => {
      // Serialize installation accounting, then workspace-local duplicate and
      // quota decisions, so independent processes cannot exceed either
      // durable boundary.
      await lockInstallationForAdmission(transaction);
      await lockWorkspaceForAdmission(transaction, resource.workspaceId);
      const duplicateOf = await findDuplicate(transaction, resource);
      await assertResourceQuota(transaction, resource, this.#limits);
      await this.#blobs.putImmutable(storageKey, resource.contentHash, resource.bytes);
      const row = await insertResource(transaction, resource, storageKey);
      await recordIngestion(transaction, resource, row.id, duplicateOf?.id ?? null);
      return {
        resource: mapResourceRow(row),
        duplicate: duplicateOf !== null,
        ingestionId: resource.ingestionId,
      };
    });
  }

  public async findById(
    workspaceId: string,
    resourceId: string,
  ): Promise<ResourceVersion | null> {
    const rows = await this.#database.query<ResourceRow>(
      `
        SELECT ${RESOURCE_COLUMNS}
        FROM resource_versions
        WHERE workspace_id = $1 AND id = $2
      `,
      [workspaceId, resourceId],
    );
    const row = rows.at(0);
    return row === undefined ? null : mapResourceRow(row);
  }

  public async listByWorkspace(
    workspaceId: string,
    maximum: number,
  ): Promise<ResourceVersion[]> {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1_001) {
      throw new Error("Resource catalog maximum must be between 1 and 1001.");
    }
    const rows = await this.#database.query<ResourceRow>(
      `
        SELECT ${RESOURCE_COLUMNS}
        FROM resource_versions
        WHERE workspace_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      [workspaceId, maximum],
    );
    return rows.map(mapResourceRow);
  }

  public async readById(
    workspaceId: string,
    resourceId: string,
  ): Promise<ResourceWithBytes | null> {
    const resource = await this.findById(workspaceId, resourceId);
    if (resource === null) {
      return null;
    }
    return this.#readResource(resource);
  }

  public async findFontVersion(
    workspaceId: string,
    reference: FontResourceReference,
  ): Promise<ResourceVersion | null> {
    const rows = await this.#database.query<ResourceRow>(
      `
        SELECT ${RESOURCE_COLUMNS}
        FROM resource_versions
        WHERE workspace_id = $1
          AND kind = 'font'
          AND font_family = $2
          AND font_weight = $3
          AND font_style = $4
          AND content_hash = $5
        ORDER BY created_at, id
        LIMIT 1
      `,
      [
        workspaceId,
        reference.family,
        reference.weight,
        reference.style,
        reference.contentHash,
      ],
    );
    const row = rows.at(0);
    return row === undefined ? null : mapResourceRow(row);
  }

  public async readFontVersion(
    workspaceId: string,
    reference: FontResourceReference,
  ): Promise<ResourceWithBytes | null> {
    const resource = await this.findFontVersion(workspaceId, reference);
    return resource === null ? null : this.#readResource(resource);
  }

  async #readResource(resource: ResourceVersion): Promise<ResourceWithBytes> {
    const bytes = await this.#blobs.readBounded(resource.storageKey, resource.byteSize);
    if (bytes === null) {
      throw new ResourceIngestionError(
        "An admitted resource blob is missing or no longer matches its hash.",
        "RESOURCE_STORAGE_INTEGRITY_ERROR",
      );
    }
    if (
      bytes.byteLength !== resource.byteSize ||
      sha256(bytes) !== resource.contentHash
    ) {
      throw new ResourceIngestionError(
        "An admitted resource blob is missing or no longer matches its hash.",
        "RESOURCE_STORAGE_INTEGRITY_ERROR",
      );
    }
    return { resource, bytes };
  }
}

function assertAdmittedColorNormalization(resource: AdmittedResource): void {
  if (resource.kind !== "raster-asset" || resource.colorNormalization === undefined) {
    return;
  }
  const provenance = resource.colorNormalization;
  if (
    resource.mediaType !== "image/png" ||
    provenance.outputContentHash !== resource.contentHash ||
    !/^[0-9a-f]{64}$/u.test(provenance.sourceContentHash)
  ) {
    throw new ResourceIngestionError(
      "Raster color-normalization provenance is inconsistent with admitted bytes.",
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
}

export { storageKeyFor };
