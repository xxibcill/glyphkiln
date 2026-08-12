import {
  createAppWorkflow,
  DEFAULT_WORKSPACE_CREATION_LIMITS,
} from "@/server/app-workflow";
import type { AppWorkflow } from "@/server/app-workflow";
import {
  createBriefInterpreterFromEnvironment,
  type BriefInterpreter,
} from "@/server/ai-authoring";
import {
  createPostgresDatabase,
  type PostgresDatabase,
} from "@/server/persistence/postgres-database";
import { assertDatabaseMigrationsCurrent } from "@/server/persistence/migrations";
import { PostgresRenderQueue, type RenderQueue } from "@/server/render-queue";
import {
  createResourceServicesFromEnvironment,
  type ResourceIngestionService,
  type ResourceStore,
} from "@/server/resources";
import type { RenderBlobStorage } from "@/server/storage";
import { createRenderBlobStorageFromEnvironment } from "@/server/storage/configured-storage";
import { hashSecret } from "@/server/security";

export type AppRuntime = {
  briefInterpreter?: BriefInterpreter;
  database: PostgresDatabase;
  renderQueue: RenderQueue;
  renderStorage?: RenderBlobStorage;
  resourceIngestion?: ResourceIngestionService;
  resourceStore?: ResourceStore;
  workflow: AppWorkflow;
};

let runtimePromise: Promise<AppRuntime> | undefined;

export function getAppRuntime(): Promise<AppRuntime> {
  runtimePromise ??= createAppRuntime(process.env);
  return runtimePromise;
}

export async function createAppRuntime(
  environment: NodeJS.ProcessEnv,
): Promise<AppRuntime> {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (databaseUrl === undefined || databaseUrl === "") {
    throw new Error("DATABASE_URL is required for Glyphkiln App Alpha.");
  }

  const database = createPostgresDatabase(databaseUrl, {
    applicationName: "glyphkiln-app",
    maxConnections: readConnectionLimit(environment),
    ssl: readDatabaseSslMode(environment),
  });
  try {
    await assertDatabaseMigrationsCurrent(database);
    const bootstrapTokenHash = readBootstrapTokenHash(environment);
    const briefInterpreter = createBriefInterpreterFromEnvironment(environment);
    const resourceServices = createResourceServicesFromEnvironment(
      database,
      environment,
    );
    const renderQueue = new PostgresRenderQueue(database, {
      maximumOutstandingJobsPerInstallation:
        readMaximumOutstandingJobsPerInstallation(environment),
      maximumOutstandingJobsPerWorkspace:
        readMaximumOutstandingJobsPerWorkspace(environment),
    });
    const renderStorage =
      environment.GLYPHKILN_STORAGE_ROOT?.trim() === undefined ||
      environment.GLYPHKILN_STORAGE_ROOT.trim() === ""
        ? undefined
        : createRenderBlobStorageFromEnvironment(environment);
    return {
      ...(briefInterpreter === undefined ? {} : { briefInterpreter }),
      database,
      renderQueue,
      ...(renderStorage === undefined ? {} : { renderStorage }),
      ...(resourceServices === undefined
        ? {}
        : {
            resourceIngestion: resourceServices.ingestion,
            resourceStore: resourceServices.store,
          }),
      workflow: createAppWorkflow({
        database,
        ...(bootstrapTokenHash === undefined ? {} : { bootstrapTokenHash }),
        renderQueue,
        workspaceCreationLimits: {
          maximumWorkspacesPerInstallation: readBoundedEnvironmentInteger(
            environment,
            "GLYPHKILN_WORKSPACE_MAX_PER_INSTALLATION",
            DEFAULT_WORKSPACE_CREATION_LIMITS.maximumWorkspacesPerInstallation,
            1,
            100_000,
          ),
          maximumWorkspacesPerUser: readBoundedEnvironmentInteger(
            environment,
            "GLYPHKILN_WORKSPACE_MAX_PER_USER",
            DEFAULT_WORKSPACE_CREATION_LIMITS.maximumWorkspacesPerUser,
            1,
            1_000,
          ),
        },
        ...(resourceServices === undefined
          ? {}
          : { resourceStore: resourceServices.store }),
      }),
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}

export async function getAppWorkflow(): Promise<AppWorkflow> {
  return (await getAppRuntime()).workflow;
}

export async function getAppResourceIngestion(): Promise<ResourceIngestionService> {
  const resourceIngestion = (await getAppRuntime()).resourceIngestion;
  if (resourceIngestion === undefined) {
    throw new Error("GLYPHKILN_STORAGE_ROOT is required for resource ingestion.");
  }
  return resourceIngestion;
}

export async function getAppRenderQueue(): Promise<RenderQueue> {
  return (await getAppRuntime()).renderQueue;
}

export async function getAppRenderStorage(): Promise<RenderBlobStorage> {
  const renderStorage = (await getAppRuntime()).renderStorage;
  if (renderStorage === undefined) {
    throw new Error("GLYPHKILN_STORAGE_ROOT is required for immutable render storage.");
  }
  return renderStorage;
}

function readBootstrapTokenHash(environment: NodeJS.ProcessEnv): string | undefined {
  const token = environment.GLYPHKILN_BOOTSTRAP_TOKEN;
  if (token === undefined || token === "") return undefined;
  if (token.length < 32 || token.length > 256 || !token.isWellFormed()) {
    throw new Error(
      "GLYPHKILN_BOOTSTRAP_TOKEN must contain between 32 and 256 valid characters.",
    );
  }
  return hashSecret(token);
}

function readConnectionLimit(environment: NodeJS.ProcessEnv): number {
  const input = environment.GLYPHKILN_DATABASE_MAX_CONNECTIONS?.trim();
  if (input === undefined || input === "") return 10;
  const value = Number(input);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(
      "GLYPHKILN_DATABASE_MAX_CONNECTIONS must be an integer from 1 through 100.",
    );
  }
  return value;
}

function readMaximumOutstandingJobsPerWorkspace(
  environment: NodeJS.ProcessEnv,
): number {
  return readBoundedEnvironmentInteger(
    environment,
    "GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_WORKSPACE",
    100,
    1,
    10_000,
  );
}

function readMaximumOutstandingJobsPerInstallation(
  environment: NodeJS.ProcessEnv,
): number {
  return readBoundedEnvironmentInteger(
    environment,
    "GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_INSTALLATION",
    1_000,
    1,
    100_000,
  );
}

function readBoundedEnvironmentInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const input = environment[name]?.trim();
  if (input === undefined || input === "") return fallback;
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${String(minimum)} through ${String(maximum)}.`,
    );
  }
  return value;
}

function readDatabaseSslMode(
  environment: NodeJS.ProcessEnv,
): "prefer" | "require" | "verify-full" {
  const configured = environment.GLYPHKILN_DATABASE_SSL?.trim();
  const input = configured === undefined || configured === "" ? "prefer" : configured;
  if (input === "prefer" || input === "require" || input === "verify-full") {
    return input;
  }
  throw new Error("GLYPHKILN_DATABASE_SSL must be prefer, require, or verify-full.");
}
