import { describe, expect, it, vi } from "vitest";

import type { SqlDatabase } from "../persistence/database";
import { DatabaseResourceStore } from "./database-resource-store";
import { ResourceIngestionService } from "./ingestion-service";
import {
  createResourceIngestionFromEnvironment,
  createResourceServicesFromEnvironment,
} from "./configured-resource-ingestion";

const database = {
  close: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
} as unknown as SqlDatabase;

const storageRoot = "/srv/glyphkiln/storage";

function configuredServices(values: Record<string, string | undefined>) {
  return createResourceServicesFromEnvironment(database, {
    NODE_ENV: "test",
    ...values,
  });
}

function configuredIngestion(values: Record<string, string | undefined>) {
  return createResourceIngestionFromEnvironment(database, {
    NODE_ENV: "test",
    ...values,
  });
}

describe("configured resource ingestion", () => {
  it.each([{}, { GLYPHKILN_STORAGE_ROOT: "   " }])(
    "stays disabled when immutable storage is not configured",
    (environment) => {
      expect(configuredServices(environment)).toBe(undefined);
      expect(configuredIngestion(environment)).toBe(undefined);
    },
  );

  it.each(["relative/storage", "/"])(
    "rejects unsafe storage root %s",
    (configuredRoot) => {
      expect(() =>
        configuredServices({
          GLYPHKILN_STORAGE_ROOT: configuredRoot,
        }),
      ).toThrow("GLYPHKILN_STORAGE_ROOT must be a non-root absolute directory.");
    },
  );

  it("constructs fail-closed services with default limits and no scanner", () => {
    const services = configuredServices({
      GLYPHKILN_STORAGE_ROOT: `  ${storageRoot}  `,
    });

    expect(services?.store).toBeInstanceOf(DatabaseResourceStore);
    expect(services?.ingestion).toBeInstanceOf(ResourceIngestionService);
    expect(
      configuredIngestion({
        GLYPHKILN_STORAGE_ROOT: storageRoot,
      }),
    ).toBeInstanceOf(ResourceIngestionService);
  });

  it("accepts bounded quotas, concurrency, and a TCP scanner", () => {
    const services = configuredServices({
      GLYPHKILN_STORAGE_ROOT: storageRoot,
      GLYPHKILN_RESOURCE_MAX_INSTALLATION_ADMISSIONS: "100",
      GLYPHKILN_RESOURCE_MAX_INSTALLATION_STORED_BYTES: "200",
      GLYPHKILN_RESOURCE_MAX_ADMISSIONS: "10",
      GLYPHKILN_RESOURCE_MAX_STORED_BYTES: "20",
      GLYPHKILN_RESOURCE_SCAN_GLOBAL_CONCURRENCY: "4",
      GLYPHKILN_RESOURCE_SCAN_WORKSPACE_CONCURRENCY: "2",
      GLYPHKILN_CLAMAV_HOST: "clamav.internal",
      GLYPHKILN_CLAMAV_PORT: "3311",
      GLYPHKILN_CLAMAV_VERSION: "ClamAV 1.4.2",
      GLYPHKILN_CLAMAV_MAX_SIGNATURE_AGE_HOURS: "24",
    });

    expect(services?.store).toBeInstanceOf(DatabaseResourceStore);
    expect(services?.ingestion).toBeInstanceOf(ResourceIngestionService);
  });

  it("accepts an absolute Unix scanner socket with scanner defaults", () => {
    expect(
      configuredServices({
        GLYPHKILN_STORAGE_ROOT: storageRoot,
        GLYPHKILN_CLAMAV_SOCKET: "/run/clamav/clamd.sock",
        GLYPHKILN_CLAMAV_VERSION: "ClamAV 1.4.2",
      })?.ingestion,
    ).toBeInstanceOf(ResourceIngestionService);
  });

  it("rejects ambiguous and incomplete scanner configuration", () => {
    expect(() =>
      configuredServices({
        GLYPHKILN_STORAGE_ROOT: storageRoot,
        GLYPHKILN_CLAMAV_HOST: "clamav.internal",
        GLYPHKILN_CLAMAV_SOCKET: "/run/clamav/clamd.sock",
        GLYPHKILN_CLAMAV_VERSION: "ClamAV 1.4.2",
      }),
    ).toThrow(
      "Configure either GLYPHKILN_CLAMAV_SOCKET or GLYPHKILN_CLAMAV_HOST, not both.",
    );

    expect(() =>
      configuredServices({
        GLYPHKILN_STORAGE_ROOT: storageRoot,
        GLYPHKILN_CLAMAV_HOST: "clamav.internal",
      }),
    ).toThrow("GLYPHKILN_CLAMAV_VERSION is required when ClamAV is configured.");

    expect(() =>
      configuredServices({
        GLYPHKILN_STORAGE_ROOT: storageRoot,
        GLYPHKILN_CLAMAV_SOCKET: "run/clamav/clamd.sock",
        GLYPHKILN_CLAMAV_VERSION: "ClamAV 1.4.2",
      }),
    ).toThrow("GLYPHKILN_CLAMAV_SOCKET must be an absolute path.");
  });

  it.each([
    [
      "GLYPHKILN_RESOURCE_MAX_INSTALLATION_ADMISSIONS",
      "0",
      "GLYPHKILN_RESOURCE_MAX_INSTALLATION_ADMISSIONS must be an integer from 1 through 10000000.",
    ],
    [
      "GLYPHKILN_RESOURCE_MAX_INSTALLATION_STORED_BYTES",
      "not-a-number",
      "GLYPHKILN_RESOURCE_MAX_INSTALLATION_STORED_BYTES must be an integer from 1 through 17592186044416.",
    ],
    [
      "GLYPHKILN_RESOURCE_MAX_ADMISSIONS",
      "1.5",
      "GLYPHKILN_RESOURCE_MAX_ADMISSIONS must be an integer from 1 through 1000000.",
    ],
    [
      "GLYPHKILN_RESOURCE_MAX_STORED_BYTES",
      "1099511627777",
      "GLYPHKILN_RESOURCE_MAX_STORED_BYTES must be an integer from 1 through 1099511627776.",
    ],
    [
      "GLYPHKILN_RESOURCE_SCAN_GLOBAL_CONCURRENCY",
      "65",
      "GLYPHKILN_RESOURCE_SCAN_GLOBAL_CONCURRENCY must be an integer from 1 through 64.",
    ],
  ])("rejects invalid bounded setting %s", (name, value, message) => {
    expect(() =>
      configuredServices({
        GLYPHKILN_STORAGE_ROOT: storageRoot,
        [name]: value,
      }),
    ).toThrow(message);
  });

  it("bounds workspace scanner concurrency by global concurrency", () => {
    expect(() =>
      configuredServices({
        GLYPHKILN_STORAGE_ROOT: storageRoot,
        GLYPHKILN_RESOURCE_SCAN_GLOBAL_CONCURRENCY: "2",
        GLYPHKILN_RESOURCE_SCAN_WORKSPACE_CONCURRENCY: "3",
      }),
    ).toThrow(
      "GLYPHKILN_RESOURCE_SCAN_WORKSPACE_CONCURRENCY must be an integer from 1 through 2.",
    );
  });

  it.each([
    [
      { GLYPHKILN_CLAMAV_PORT: "0" },
      "GLYPHKILN_CLAMAV_PORT must be an integer from 1 through 65535.",
    ],
    [
      { GLYPHKILN_CLAMAV_PORT: "65536" },
      "GLYPHKILN_CLAMAV_PORT must be an integer from 1 through 65535.",
    ],
    [
      { GLYPHKILN_CLAMAV_MAX_SIGNATURE_AGE_HOURS: "0" },
      "GLYPHKILN_CLAMAV_MAX_SIGNATURE_AGE_HOURS must be an integer from 1 through 168.",
    ],
    [
      { GLYPHKILN_CLAMAV_MAX_SIGNATURE_AGE_HOURS: "169" },
      "GLYPHKILN_CLAMAV_MAX_SIGNATURE_AGE_HOURS must be an integer from 1 through 168.",
    ],
  ])("rejects invalid scanner numeric settings", (settings, message) => {
    expect(() =>
      configuredServices({
        GLYPHKILN_STORAGE_ROOT: storageRoot,
        GLYPHKILN_CLAMAV_HOST: "clamav.internal",
        GLYPHKILN_CLAMAV_VERSION: "ClamAV 1.4.2",
        ...settings,
      }),
    ).toThrow(message);
  });
});
