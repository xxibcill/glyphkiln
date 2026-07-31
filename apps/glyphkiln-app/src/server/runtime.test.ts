import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => {
  const database = {
    close: vi.fn(() => Promise.resolve()),
    query: vi.fn(),
    transaction: vi.fn(),
  };
  return {
    assertDatabaseMigrationsCurrent: vi.fn(() => Promise.resolve()),
    createAppWorkflow: vi.fn(),
    createPostgresDatabase: vi.fn(() => database),
    createRenderBlobStorageFromEnvironment: vi.fn(),
    createResourceServicesFromEnvironment: vi.fn(),
    database,
    hashSecret: vi.fn(() => "hashed-bootstrap-token"),
    queueConstructor: vi.fn(),
    renderStorage: { kind: "render-storage" },
    resourceServices: {
      ingestion: { kind: "resource-ingestion" },
      store: { kind: "resource-store" },
    },
    workflow: { kind: "workflow" },
  };
});

vi.mock("@/server/app-workflow", () => ({
  createAppWorkflow: runtimeMocks.createAppWorkflow,
  DEFAULT_WORKSPACE_CREATION_LIMITS: {
    maximumWorkspacesPerInstallation: 100,
    maximumWorkspacesPerUser: 5,
  },
}));

vi.mock("@/server/persistence/postgres-database", () => ({
  createPostgresDatabase: runtimeMocks.createPostgresDatabase,
}));

vi.mock("@/server/persistence/migrations", () => ({
  assertDatabaseMigrationsCurrent: runtimeMocks.assertDatabaseMigrationsCurrent,
}));

vi.mock("@/server/render-queue", () => ({
  PostgresRenderQueue: function PostgresRenderQueue(
    database: unknown,
    options: unknown,
  ) {
    runtimeMocks.queueConstructor(database, options);
  },
}));

vi.mock("@/server/resources", () => ({
  createResourceServicesFromEnvironment:
    runtimeMocks.createResourceServicesFromEnvironment,
}));

vi.mock("@/server/storage/configured-storage", () => ({
  createRenderBlobStorageFromEnvironment:
    runtimeMocks.createRenderBlobStorageFromEnvironment,
}));

vi.mock("@/server/security", () => ({
  hashSecret: runtimeMocks.hashSecret,
}));

async function importRuntime() {
  return import("./runtime");
}

function testEnvironment(
  values: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

describe("application runtime composition", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    runtimeMocks.database.close.mockResolvedValue();
    runtimeMocks.createPostgresDatabase.mockReturnValue(runtimeMocks.database);
    runtimeMocks.assertDatabaseMigrationsCurrent.mockResolvedValue(undefined);
    runtimeMocks.createAppWorkflow.mockReturnValue(runtimeMocks.workflow);
    runtimeMocks.createResourceServicesFromEnvironment.mockReturnValue(undefined);
    runtimeMocks.createRenderBlobStorageFromEnvironment.mockReturnValue(
      runtimeMocks.renderStorage,
    );
    runtimeMocks.hashSecret.mockReturnValue("hashed-bootstrap-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a missing database URL before opening infrastructure", async () => {
    const { createAppRuntime } = await importRuntime();

    await expect(createAppRuntime(testEnvironment())).rejects.toThrow(
      "DATABASE_URL is required for Glyphkiln App Alpha.",
    );
    await expect(
      createAppRuntime(testEnvironment({ DATABASE_URL: "   " })),
    ).rejects.toThrow("DATABASE_URL is required for Glyphkiln App Alpha.");
    expect(runtimeMocks.createPostgresDatabase).not.toHaveBeenCalled();
  });

  it("composes the default fail-closed runtime", async () => {
    const { createAppRuntime } = await importRuntime();
    const environment = testEnvironment({
      DATABASE_URL: "  postgresql://runtime@database/glyphkiln  ",
    });

    const runtime = await createAppRuntime(environment);

    expect(runtimeMocks.createPostgresDatabase).toHaveBeenCalledWith(
      "postgresql://runtime@database/glyphkiln",
      {
        applicationName: "glyphkiln-app",
        maxConnections: 10,
        ssl: "prefer",
      },
    );
    expect(runtimeMocks.assertDatabaseMigrationsCurrent).toHaveBeenCalledWith(
      runtimeMocks.database,
    );
    expect(runtimeMocks.createResourceServicesFromEnvironment).toHaveBeenCalledWith(
      runtimeMocks.database,
      environment,
    );
    expect(runtimeMocks.queueConstructor).toHaveBeenCalledWith(runtimeMocks.database, {
      maximumOutstandingJobsPerInstallation: 1_000,
      maximumOutstandingJobsPerWorkspace: 100,
    });
    expect(runtimeMocks.hashSecret).not.toHaveBeenCalled();
    expect(runtimeMocks.createAppWorkflow).toHaveBeenCalledWith({
      database: runtimeMocks.database,
      renderQueue: runtime.renderQueue,
      workspaceCreationLimits: {
        maximumWorkspacesPerInstallation: 100,
        maximumWorkspacesPerUser: 5,
      },
    });
    expect(runtime).toEqual({
      database: runtimeMocks.database,
      renderQueue: runtime.renderQueue,
      workflow: runtimeMocks.workflow,
    });
  });

  it("wires explicit capacity, storage, resource, TLS, and bootstrap policy", async () => {
    const { createAppRuntime } = await importRuntime();
    runtimeMocks.createResourceServicesFromEnvironment.mockReturnValue(
      runtimeMocks.resourceServices,
    );
    const bootstrapToken = "b".repeat(32);
    const environment = testEnvironment({
      DATABASE_URL: "postgresql://runtime@database/glyphkiln",
      GLYPHKILN_BOOTSTRAP_TOKEN: bootstrapToken,
      GLYPHKILN_DATABASE_MAX_CONNECTIONS: "23",
      GLYPHKILN_DATABASE_SSL: "verify-full",
      GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_INSTALLATION: "900",
      GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_WORKSPACE: "90",
      GLYPHKILN_STORAGE_ROOT: "/srv/glyphkiln/storage",
      GLYPHKILN_WORKSPACE_MAX_PER_INSTALLATION: "300",
      GLYPHKILN_WORKSPACE_MAX_PER_USER: "12",
    });

    const runtime = await createAppRuntime(environment);

    expect(runtimeMocks.createPostgresDatabase).toHaveBeenCalledWith(
      environment.DATABASE_URL,
      {
        applicationName: "glyphkiln-app",
        maxConnections: 23,
        ssl: "verify-full",
      },
    );
    expect(runtimeMocks.hashSecret).toHaveBeenCalledWith(bootstrapToken);
    expect(runtimeMocks.createRenderBlobStorageFromEnvironment).toHaveBeenCalledWith(
      environment,
    );
    expect(runtimeMocks.queueConstructor).toHaveBeenCalledWith(runtimeMocks.database, {
      maximumOutstandingJobsPerInstallation: 900,
      maximumOutstandingJobsPerWorkspace: 90,
    });
    expect(runtimeMocks.createAppWorkflow).toHaveBeenCalledWith({
      bootstrapTokenHash: "hashed-bootstrap-token",
      database: runtimeMocks.database,
      renderQueue: runtime.renderQueue,
      resourceStore: runtimeMocks.resourceServices.store,
      workspaceCreationLimits: {
        maximumWorkspacesPerInstallation: 300,
        maximumWorkspacesPerUser: 12,
      },
    });
    expect(runtime).toMatchObject({
      database: runtimeMocks.database,
      renderStorage: runtimeMocks.renderStorage,
      resourceIngestion: runtimeMocks.resourceServices.ingestion,
      resourceStore: runtimeMocks.resourceServices.store,
      workflow: runtimeMocks.workflow,
    });
  });

  it("closes the database when migration readiness fails", async () => {
    const { createAppRuntime } = await importRuntime();
    runtimeMocks.assertDatabaseMigrationsCurrent.mockRejectedValue(
      new Error("migrations are stale"),
    );

    await expect(
      createAppRuntime(
        testEnvironment({
          DATABASE_URL: "postgresql://runtime@database/glyphkiln",
        }),
      ),
    ).rejects.toThrow("migrations are stale");
    expect(runtimeMocks.database.close).toHaveBeenCalledOnce();
  });

  it.each([
    [
      { GLYPHKILN_DATABASE_MAX_CONNECTIONS: "0" },
      "GLYPHKILN_DATABASE_MAX_CONNECTIONS must be an integer from 1 through 100.",
      false,
    ],
    [
      { GLYPHKILN_DATABASE_MAX_CONNECTIONS: "1.5" },
      "GLYPHKILN_DATABASE_MAX_CONNECTIONS must be an integer from 1 through 100.",
      false,
    ],
    [
      { GLYPHKILN_DATABASE_SSL: "disable" },
      "GLYPHKILN_DATABASE_SSL must be prefer, require, or verify-full.",
      false,
    ],
    [
      { GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_INSTALLATION: "100001" },
      "GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_INSTALLATION must be an integer from 1 through 100000.",
      true,
    ],
    [
      { GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_WORKSPACE: "0" },
      "GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_WORKSPACE must be an integer from 1 through 10000.",
      true,
    ],
    [
      { GLYPHKILN_WORKSPACE_MAX_PER_INSTALLATION: "100001" },
      "GLYPHKILN_WORKSPACE_MAX_PER_INSTALLATION must be an integer from 1 through 100000.",
      true,
    ],
    [
      { GLYPHKILN_WORKSPACE_MAX_PER_USER: "1001" },
      "GLYPHKILN_WORKSPACE_MAX_PER_USER must be an integer from 1 through 1000.",
      true,
    ],
  ])(
    "rejects invalid runtime policy without leaking an opened database",
    async (settings, message, databaseWasOpened) => {
      const { createAppRuntime } = await importRuntime();

      await expect(
        createAppRuntime(
          testEnvironment({
            DATABASE_URL: "postgresql://runtime@database/glyphkiln",
            ...settings,
          }),
        ),
      ).rejects.toThrow(message);
      expect(runtimeMocks.database.close).toHaveBeenCalledTimes(
        databaseWasOpened ? 1 : 0,
      );
    },
  );

  it.each(["short", "x".repeat(257), `${"x".repeat(31)}\ud800`])(
    "rejects an invalid bootstrap token and closes the database",
    async (token) => {
      const { createAppRuntime } = await importRuntime();

      await expect(
        createAppRuntime(
          testEnvironment({
            DATABASE_URL: "postgresql://runtime@database/glyphkiln",
            GLYPHKILN_BOOTSTRAP_TOKEN: token,
          }),
        ),
      ).rejects.toThrow(
        "GLYPHKILN_BOOTSTRAP_TOKEN must contain between 32 and 256 valid characters.",
      );
      expect(runtimeMocks.database.close).toHaveBeenCalledOnce();
    },
  );

  it("memoizes runtime composition and exposes required services", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://runtime@database/glyphkiln");
    vi.stubEnv("GLYPHKILN_STORAGE_ROOT", "");
    vi.stubEnv("GLYPHKILN_BOOTSTRAP_TOKEN", "");
    const runtimeModule = await importRuntime();

    const first = runtimeModule.getAppRuntime();
    const second = runtimeModule.getAppRuntime();

    expect(second).toBe(first);
    await expect(runtimeModule.getAppWorkflow()).resolves.toBe(runtimeMocks.workflow);
    await expect(runtimeModule.getAppRenderQueue()).resolves.toBe(
      (await first).renderQueue,
    );
    await expect(runtimeModule.getAppResourceIngestion()).rejects.toThrow(
      "GLYPHKILN_STORAGE_ROOT is required for resource ingestion.",
    );
    await expect(runtimeModule.getAppRenderStorage()).rejects.toThrow(
      "GLYPHKILN_STORAGE_ROOT is required for immutable render storage.",
    );
    expect(runtimeMocks.createPostgresDatabase).toHaveBeenCalledOnce();
  });

  it("exposes configured resource ingestion and render storage", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://runtime@database/glyphkiln");
    vi.stubEnv("GLYPHKILN_STORAGE_ROOT", "/srv/glyphkiln/storage");
    vi.stubEnv("GLYPHKILN_BOOTSTRAP_TOKEN", "");
    runtimeMocks.createResourceServicesFromEnvironment.mockReturnValue(
      runtimeMocks.resourceServices,
    );
    const runtimeModule = await importRuntime();

    await expect(runtimeModule.getAppResourceIngestion()).resolves.toBe(
      runtimeMocks.resourceServices.ingestion,
    );
    await expect(runtimeModule.getAppRenderStorage()).resolves.toBe(
      runtimeMocks.renderStorage,
    );
  });
});
