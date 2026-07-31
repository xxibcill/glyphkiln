import { isAbsolute, join, parse, resolve } from "node:path";

import type { SqlDatabase } from "../persistence/database";
import { ClamAvInstreamScanner, type ClamAvEndpoint } from "./clamav-instream-scanner";
import {
  DatabaseResourceStore,
  DEFAULT_DATABASE_RESOURCE_STORE_LIMITS,
} from "./database-resource-store";
import { FileSystemResourceBlobStorage } from "./filesystem-blob-storage";
import {
  DEFAULT_RESOURCE_INGESTION_ADMISSION_OPTIONS,
  InProcessResourceIngestionAdmissionController,
} from "./ingestion-admission";
import { ResourceIngestionService } from "./ingestion-service";
import type { MalwareScanner } from "./malware-scanner";
import type { ResourceStore } from "./resource-store";

export type ConfiguredResourceServices = {
  store: ResourceStore;
  ingestion: ResourceIngestionService;
};

export function createResourceServicesFromEnvironment(
  database: SqlDatabase,
  environment: NodeJS.ProcessEnv,
): ConfiguredResourceServices | undefined {
  const configuredRoot = environment.GLYPHKILN_STORAGE_ROOT?.trim();
  if (configuredRoot === undefined || configuredRoot === "") {
    return undefined;
  }
  const root = resolve(configuredRoot);
  if (!isAbsolute(configuredRoot) || root === parse(root).root) {
    throw new Error("GLYPHKILN_STORAGE_ROOT must be a non-root absolute directory.");
  }
  const store = new DatabaseResourceStore(
    database,
    new FileSystemResourceBlobStorage(join(root, "resources")),
    {
      maximumInstallationAdmissions: readBoundedInteger(
        "GLYPHKILN_RESOURCE_MAX_INSTALLATION_ADMISSIONS",
        environment.GLYPHKILN_RESOURCE_MAX_INSTALLATION_ADMISSIONS,
        DEFAULT_DATABASE_RESOURCE_STORE_LIMITS.maximumInstallationAdmissions,
        1,
        10_000_000,
      ),
      maximumInstallationStoredBytes: readBoundedInteger(
        "GLYPHKILN_RESOURCE_MAX_INSTALLATION_STORED_BYTES",
        environment.GLYPHKILN_RESOURCE_MAX_INSTALLATION_STORED_BYTES,
        DEFAULT_DATABASE_RESOURCE_STORE_LIMITS.maximumInstallationStoredBytes,
        1,
        17_592_186_044_416,
      ),
      maximumWorkspaceAdmissions: readBoundedInteger(
        "GLYPHKILN_RESOURCE_MAX_ADMISSIONS",
        environment.GLYPHKILN_RESOURCE_MAX_ADMISSIONS,
        DEFAULT_DATABASE_RESOURCE_STORE_LIMITS.maximumWorkspaceAdmissions,
        1,
        1_000_000,
      ),
      maximumWorkspaceStoredBytes: readBoundedInteger(
        "GLYPHKILN_RESOURCE_MAX_STORED_BYTES",
        environment.GLYPHKILN_RESOURCE_MAX_STORED_BYTES,
        DEFAULT_DATABASE_RESOURCE_STORE_LIMITS.maximumWorkspaceStoredBytes,
        1,
        1_099_511_627_776,
      ),
    },
  );
  const scanner = createScanner(environment);
  const maximumGlobalOperations = readBoundedInteger(
    "GLYPHKILN_RESOURCE_SCAN_GLOBAL_CONCURRENCY",
    environment.GLYPHKILN_RESOURCE_SCAN_GLOBAL_CONCURRENCY,
    DEFAULT_RESOURCE_INGESTION_ADMISSION_OPTIONS.maximumGlobalOperations,
    1,
    64,
  );
  const maximumWorkspaceOperations = readBoundedInteger(
    "GLYPHKILN_RESOURCE_SCAN_WORKSPACE_CONCURRENCY",
    environment.GLYPHKILN_RESOURCE_SCAN_WORKSPACE_CONCURRENCY,
    Math.min(
      DEFAULT_RESOURCE_INGESTION_ADMISSION_OPTIONS.maximumWorkspaceOperations,
      maximumGlobalOperations,
    ),
    1,
    maximumGlobalOperations,
  );
  return {
    store,
    ingestion: new ResourceIngestionService({
      store,
      admissionController: new InProcessResourceIngestionAdmissionController({
        maximumGlobalOperations,
        maximumWorkspaceOperations,
      }),
      ...(scanner === undefined ? {} : { scanner }),
    }),
  };
}

export function createResourceIngestionFromEnvironment(
  database: SqlDatabase,
  environment: NodeJS.ProcessEnv,
): ResourceIngestionService | undefined {
  return createResourceServicesFromEnvironment(database, environment)?.ingestion;
}

function createScanner(environment: NodeJS.ProcessEnv): MalwareScanner | undefined {
  const socketPath = environment.GLYPHKILN_CLAMAV_SOCKET?.trim();
  const host = environment.GLYPHKILN_CLAMAV_HOST?.trim();
  if (
    socketPath !== undefined &&
    socketPath !== "" &&
    host !== undefined &&
    host !== ""
  ) {
    throw new Error(
      "Configure either GLYPHKILN_CLAMAV_SOCKET or GLYPHKILN_CLAMAV_HOST, not both.",
    );
  }
  let endpoint: ClamAvEndpoint | undefined;
  if (socketPath !== undefined && socketPath !== "") {
    if (!isAbsolute(socketPath)) {
      throw new Error("GLYPHKILN_CLAMAV_SOCKET must be an absolute path.");
    }
    endpoint = { kind: "unix", socketPath };
  } else if (host !== undefined && host !== "") {
    endpoint = {
      kind: "tcp",
      host,
      port: readPort(environment.GLYPHKILN_CLAMAV_PORT),
    };
  }
  if (endpoint === undefined) {
    return undefined;
  }
  const scannerVersion = environment.GLYPHKILN_CLAMAV_VERSION?.trim();
  if (scannerVersion === undefined || scannerVersion === "") {
    throw new Error("GLYPHKILN_CLAMAV_VERSION is required when ClamAV is configured.");
  }
  return new ClamAvInstreamScanner({
    endpoint,
    scannerVersion,
    maximumSignatureAgeMilliseconds:
      readSignatureAgeHours(environment.GLYPHKILN_CLAMAV_MAX_SIGNATURE_AGE_HOURS) *
      60 *
      60 *
      1_000,
  });
}

function readPort(input: string | undefined): number {
  const value = input === undefined || input.trim() === "" ? 3310 : Number(input);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("GLYPHKILN_CLAMAV_PORT must be an integer from 1 through 65535.");
  }
  return value;
}

function readSignatureAgeHours(input: string | undefined): number {
  const value = input === undefined || input.trim() === "" ? 48 : Number(input);
  if (!Number.isInteger(value) || value < 1 || value > 168) {
    throw new Error(
      "GLYPHKILN_CLAMAV_MAX_SIGNATURE_AGE_HOURS must be an integer from 1 through 168.",
    );
  }
  return value;
}

function readBoundedInteger(
  name: string,
  input: string | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const value =
    input === undefined || input.trim() === "" ? defaultValue : Number(input);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${String(minimum)} through ${String(maximum)}.`,
    );
  }
  return value;
}
