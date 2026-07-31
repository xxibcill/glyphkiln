import { randomUUID } from "node:crypto";

import { sha256 } from "@glyphkiln/core";

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
    const bytes = new Uint8Array(parsed.bytes);
    const dimensions = inspectRasterEnvelope(bytes, parsed.declaredMediaType);
    const contentHash = sha256(bytes);
    const scan = await this.#scan(
      "raster-asset",
      parsed.declaredMediaType,
      contentHash,
      bytes,
    );
    validateRasterBytes({
      bytes,
      contentHash,
      mediaType: parsed.declaredMediaType,
      origin: parsed.origin,
      ...dimensions,
    });

    return this.#store.admit({
      ...this.#resourceIdentity(parsed),
      kind: "raster-asset",
      contentHash,
      mediaType: parsed.declaredMediaType,
      bytes: new Uint8Array(bytes),
      origin: { ...parsed.origin },
      license: copyLicense(parsed.license),
      scan,
      ...dimensions,
    });
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

function assertAdmittedWorkspace(expected: string, actual: string): void {
  if (actual !== expected) {
    throw new ResourceIngestionError(
      "The admitted workspace does not match the resource upload metadata.",
      "INVALID_RESOURCE_INPUT",
    );
  }
}
