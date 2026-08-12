import { randomUUID } from "node:crypto";

import {
  GlyphkilnError,
  normalizeRasterColor,
  sha256,
  type NormalizedRasterColor,
} from "@glyphkiln/core";

import { ResourceIngestionError } from "./errors";
import { inspectFontEnvelope, validateFontBytes } from "./font-validation";
import {
  InProcessResourceIngestionAdmissionController,
  type ResourceIngestionAdmissionController,
} from "./ingestion-admission";
import {
  copyLicense,
  parseFontIngestionInput,
  parseRasterIngestionInput,
  parseResourceIngestionWorkspaceId,
} from "./input-validation";
import { containsControlCharacter } from "./inert-text";
import {
  rejectByDefaultMalwareScanner,
  type MalwareScanner,
  type MalwareScanResult,
} from "./malware-scanner";
import { inspectRasterEnvelope, validateRasterBytes } from "./raster-validation";
import type { ResourceStore } from "./resource-store";
import type {
  CleanScanReceipt,
  FontIngestionInput,
  RasterIngestionInput,
  ResourceAdmission,
  ResourceKind,
  ResourceMediaType,
  RasterColorNormalizationProvenance,
  RasterMediaType,
} from "./types";

export type ResourceIngestionServiceOptions = {
  store: ResourceStore;
  scanner?: MalwareScanner | undefined;
  createId?: (() => string) | undefined;
  admissionController?: ResourceIngestionAdmissionController | undefined;
};

export type AdmittedResourceIngestion = {
  ingestRaster(input: unknown): Promise<ResourceAdmission>;
  ingestFont(input: unknown): Promise<ResourceAdmission>;
};

type PreparedRasterAdmission = {
  bytes: Uint8Array;
  colorNormalization?: RasterColorNormalizationProvenance | undefined;
  contentHash: string;
  height: number;
  mediaType: RasterMediaType;
  width: number;
};

function scannerField(value: string, maximum: number): boolean {
  return (
    value.length >= 1 &&
    value.length <= maximum &&
    value === value.trim() &&
    value.isWellFormed() &&
    !containsControlCharacter(value)
  );
}

function cleanScanReceipt(result: MalwareScanResult): CleanScanReceipt {
  if (result.status === "unavailable") {
    throw new ResourceIngestionError(
      "Resource ingestion is unavailable until a malware scanner is configured.",
      "SCANNER_UNAVAILABLE",
    );
  }
  if (result.status === "rejected") {
    throw new ResourceIngestionError(
      "The resource was rejected by the configured malware scanner.",
      "SCANNER_REJECTED",
    );
  }
  if (
    !scannerField(result.scannerName, 120) ||
    !scannerField(result.scannerVersion, 120) ||
    (result.reference !== undefined && !scannerField(result.reference, 500)) ||
    !(result.scannedAt instanceof Date) ||
    !Number.isFinite(result.scannedAt.getTime())
  ) {
    throw new ResourceIngestionError(
      "The configured malware scanner returned an invalid receipt.",
      "SCANNER_UNAVAILABLE",
    );
  }
  return {
    ...result,
    scannedAt: new Date(result.scannedAt),
  };
}

function assertGeneratedId(id: string): string {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,127})$/u.test(id)) {
    throw new ResourceIngestionError(
      "The resource identity provider returned an invalid identifier.",
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
  return id;
}

export class ResourceIngestionService {
  readonly #store: ResourceStore;
  readonly #scanner: MalwareScanner;
  readonly #createId: () => string;
  readonly #admissionController: ResourceIngestionAdmissionController;

  public constructor(options: ResourceIngestionServiceOptions) {
    this.#store = options.store;
    this.#scanner = options.scanner ?? rejectByDefaultMalwareScanner;
    this.#createId = options.createId ?? randomUUID;
    this.#admissionController =
      options.admissionController ??
      new InProcessResourceIngestionAdmissionController();
  }

  public async ingestRaster(input: unknown): Promise<ResourceAdmission> {
    const parsed = parseRasterIngestionInput(input);
    return this.#admissionController.run(parsed.workspaceId, () =>
      this.#ingestRaster(parsed),
    );
  }

  public async ingestFont(input: unknown): Promise<ResourceAdmission> {
    const parsed = parseFontIngestionInput(input);
    return this.#admissionController.run(parsed.workspaceId, () =>
      this.#ingestFont(parsed),
    );
  }

  public runAdmitted<Result>(
    workspaceId: string,
    operation: (ingestion: AdmittedResourceIngestion) => Promise<Result>,
  ): Promise<Result> {
    const admittedWorkspaceId = parseResourceIngestionWorkspaceId(workspaceId);
    return this.#admissionController.run(admittedWorkspaceId, async () => {
      let active = true;
      const assertActive = (): void => {
        if (!active) {
          throw new Error("The resource-ingestion admission lease has expired.");
        }
      };
      const ingestion: AdmittedResourceIngestion = {
        ingestRaster: async (input) => {
          assertActive();
          const parsed = parseRasterIngestionInput(input);
          assertAdmittedWorkspace(admittedWorkspaceId, parsed.workspaceId);
          return this.#ingestRaster(parsed);
        },
        ingestFont: async (input) => {
          assertActive();
          const parsed = parseFontIngestionInput(input);
          assertAdmittedWorkspace(admittedWorkspaceId, parsed.workspaceId);
          return this.#ingestFont(parsed);
        },
      };
      try {
        return await operation(ingestion);
      } finally {
        active = false;
      }
    });
  }

  async #ingestRaster(parsed: RasterIngestionInput): Promise<ResourceAdmission> {
    const sourceBytes = new Uint8Array(parsed.bytes);
    const sourceDimensions = inspectRasterEnvelope(
      sourceBytes,
      parsed.declaredMediaType,
    );
    const sourceContentHash = sha256(sourceBytes);
    const scan = await this.#scan(
      "raster-asset",
      parsed.declaredMediaType,
      sourceContentHash,
      sourceBytes,
    );
    validateRasterBytes({
      bytes: sourceBytes,
      contentHash: sourceContentHash,
      mediaType: parsed.declaredMediaType,
      origin: parsed.origin,
      ...sourceDimensions,
    });
    const admitted: PreparedRasterAdmission =
      parsed.normalizeColor === true
        ? await this.#normalizeRaster(parsed, sourceBytes, sourceContentHash)
        : {
            bytes: sourceBytes,
            contentHash: sourceContentHash,
            mediaType: parsed.declaredMediaType,
            ...sourceDimensions,
          };

    return this.#store.admit({
      ...this.#resourceIdentity(parsed),
      kind: "raster-asset",
      contentHash: admitted.contentHash,
      mediaType: admitted.mediaType,
      bytes: new Uint8Array(admitted.bytes),
      origin: { ...parsed.origin },
      license: copyLicense(parsed.license),
      scan,
      width: admitted.width,
      height: admitted.height,
      ...(admitted.colorNormalization === undefined
        ? {}
        : { colorNormalization: { ...admitted.colorNormalization } }),
    });
  }

  async #normalizeRaster(
    parsed: RasterIngestionInput,
    sourceBytes: Uint8Array,
    sourceContentHash: string,
  ): Promise<
    PreparedRasterAdmission & {
      colorNormalization: RasterColorNormalizationProvenance;
      mediaType: "image/png";
    }
  > {
    let normalized: NormalizedRasterColor;
    try {
      normalized = await normalizeRasterColor({
        bytes: sourceBytes,
        mimeType: parsed.declaredMediaType,
      });
    } catch (cause) {
      throw normalizationFailure(cause);
    }
    const bytes = new Uint8Array(normalized.bytes);
    const contentHash = sha256(bytes);
    const dimensions = inspectRasterEnvelope(bytes, "image/png");
    validateRasterBytes({
      bytes,
      contentHash,
      mediaType: "image/png",
      origin: parsed.origin,
      ...dimensions,
    });
    assertNormalizationEvidence(
      normalized,
      parsed.declaredMediaType,
      sourceBytes,
      sourceContentHash,
      contentHash,
      dimensions,
    );
    return {
      bytes,
      contentHash,
      mediaType: "image/png",
      ...dimensions,
      colorNormalization: {
        policyVersion: normalized.report.policyVersion,
        sourceContentHash,
        sourceMediaType: parsed.declaredMediaType,
        outputContentHash: contentHash,
      },
    };
  }

  async #ingestFont(parsed: FontIngestionInput): Promise<ResourceAdmission> {
    const bytes = new Uint8Array(parsed.bytes);
    inspectFontEnvelope(bytes, parsed.declaredMediaType);
    const contentHash = sha256(bytes);
    const scan = await this.#scan("font", parsed.declaredMediaType, contentHash, bytes);
    validateFontBytes({
      bytes,
      contentHash,
      family: parsed.family,
      weight: parsed.weight,
      style: parsed.style,
    });

    return this.#store.admit({
      ...this.#resourceIdentity(parsed),
      kind: "font",
      contentHash,
      mediaType: parsed.declaredMediaType,
      bytes: new Uint8Array(bytes),
      origin: { ...parsed.origin },
      license: copyLicense(parsed.license),
      scan,
      family: parsed.family,
      weight: parsed.weight,
      style: parsed.style,
    });
  }

  async #scan(
    kind: ResourceKind,
    mediaType: ResourceMediaType,
    contentHash: string,
    bytes: Uint8Array,
  ): Promise<CleanScanReceipt> {
    let result: MalwareScanResult;
    try {
      result = await this.#scanner.scan({
        kind,
        mediaType,
        contentHash,
        bytes: new Uint8Array(bytes),
      });
    } catch (cause) {
      throw new ResourceIngestionError(
        "The configured malware scanner is unavailable.",
        "SCANNER_UNAVAILABLE",
        undefined,
        { cause },
      );
    }
    return cleanScanReceipt(result);
  }

  #resourceIdentity(input: RasterIngestionInput | FontIngestionInput): {
    id: string;
    ingestionId: string;
    workspaceId: string;
    actorUserId: string;
    originalFilename?: string | undefined;
  } {
    return {
      id: assertGeneratedId(this.#createId()),
      ingestionId: assertGeneratedId(this.#createId()),
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      originalFilename: input.originalFilename,
    };
  }
}

function normalizationFailure(cause: unknown): ResourceIngestionError {
  if (cause instanceof GlyphkilnError) {
    const unavailable = new Set([
      "COLOR_NORMALIZATION_TIMEOUT",
      "COLOR_NORMALIZATION_PROCESS_FAILED",
      "COLOR_NORMALIZATION_PROCESS_EXITED",
      "COLOR_NORMALIZATION_PROCESS_IPC_FAILED",
      "COLOR_NORMALIZATION_PROCESS_NOT_BUILT",
      "INVALID_COLOR_NORMALIZATION_PROCESS_RESPONSE",
    ]).has(cause.code);
    return new ResourceIngestionError(
      unavailable
        ? "The configured color normalizer is unavailable."
        : "The raster could not be normalized safely.",
      unavailable ? "RESOURCE_STORAGE_INTEGRITY_ERROR" : "RESOURCE_BYTES_INVALID",
      { validationCode: cause.code },
      { cause },
    );
  }
  return new ResourceIngestionError(
    "The configured color normalizer is unavailable.",
    "RESOURCE_STORAGE_INTEGRITY_ERROR",
    undefined,
    { cause },
  );
}

function assertNormalizationEvidence(
  normalized: NormalizedRasterColor,
  sourceMediaType: RasterMediaType,
  sourceBytes: Uint8Array,
  sourceContentHash: string,
  outputContentHash: string,
  outputDimensions: { width: number; height: number },
): void {
  if (
    normalized.report.source.mimeType !== sourceMediaType ||
    normalized.report.source.byteLength !== sourceBytes.byteLength ||
    normalized.report.source.sha256 !== sourceContentHash ||
    normalized.report.output.byteLength !== normalized.bytes.byteLength ||
    normalized.report.output.sha256 !== outputContentHash ||
    normalized.report.output.width !== outputDimensions.width ||
    normalized.report.output.height !== outputDimensions.height
  ) {
    throw new ResourceIngestionError(
      "The color normalizer returned inconsistent immutable evidence.",
      "RESOURCE_STORAGE_INTEGRITY_ERROR",
    );
  }
}

function assertAdmittedWorkspace(expected: string, actual: string): void {
  if (actual !== expected) {
    throw new ResourceIngestionError(
      "The admitted workspace does not match the resource upload metadata.",
      "INVALID_RESOURCE_INPUT",
    );
  }
}
