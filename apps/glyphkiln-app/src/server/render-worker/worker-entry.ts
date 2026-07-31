import { hostname } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertDatabaseMigrationsCurrent,
  migrateDatabase,
} from "../persistence/migrations";
import { createPostgresDatabase } from "../persistence/postgres-database";
import { PostgresRenderQueue } from "../render-queue";
import { DatabaseResourceStore, FileSystemResourceBlobStorage } from "../resources";
import {
  createRenderBlobStorageFromEnvironment,
  readStorageRootFromEnvironment,
} from "../storage/configured-storage";
import type { RenderBlobStorage } from "../storage";
import {
  RenderWorker,
  type RenderWorkerLogEvent,
  type RenderWorkerLogger,
} from "./render-worker";
import { AdmittedRenderResourceResolver } from "./resource-resolver";

const mode = readMode(process.argv.slice(2));
const configuration = readConfiguration(process.env);
const database = createPostgresDatabase(configuration.databaseUrl, {
  applicationName: "glyphkiln-render-worker",
  maxConnections: configuration.databaseConnections,
  ssl: configuration.databaseSsl,
});
const queue = new PostgresRenderQueue(database);

try {
  if (mode === "migrate") {
    await migrateDatabase(database);
    writeLog("info", { event: "database_migrations_applied" });
  } else {
    await assertDatabaseMigrationsCurrent(database);
    const storage = createRenderBlobStorageFromEnvironment(process.env);
    const resourceStore = new DatabaseResourceStore(
      database,
      new FileSystemResourceBlobStorage(
        join(readStorageRootFromEnvironment(process.env), "resources"),
      ),
    );
    await queue.ready();
    await storage.ready();
    if (mode === "healthcheck") {
      writeLog("info", { event: "render_worker_healthcheck_ready" });
    } else {
      await runWorker(
        mode === "once",
        storage,
        new AdmittedRenderResourceResolver(resourceStore),
      );
    }
  }
} finally {
  await database.close();
}

async function runWorker(
  once: boolean,
  storage: RenderBlobStorage,
  resourceResolver: AdmittedRenderResourceResolver,
): Promise<void> {
  const shutdown = new AbortController();
  const stop = (): void => {
    shutdown.abort();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const logger: RenderWorkerLogger = {
    info: (event) => {
      writeLog("info", event);
    },
    error: (event) => {
      writeLog("error", event);
    },
  };
  const worker = new RenderWorker({
    database,
    queue,
    storage,
    workerId: configuration.workerId,
    logger,
    leaseMilliseconds: configuration.leaseMilliseconds,
    resourceResolver,
  });
  writeLog("info", {
    event: "render_worker_started",
    state: once ? "once" : "polling",
  });
  try {
    while (!shutdown.signal.aborted) {
      try {
        const result = await worker.processNext();
        if (once) return;
        if (result.kind !== "idle") continue;
      } catch {
        writeLog("error", {
          event: "render_worker_tick_failed",
          code: "WORKER_TICK_FAILED",
        });
      }
      try {
        await delay(configuration.pollMilliseconds, undefined, {
          signal: shutdown.signal,
        });
      } catch (error) {
        if (!isAbortError(error)) throw error;
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    writeLog("info", { event: "render_worker_stopped" });
  }
}

type WorkerConfiguration = {
  readonly databaseUrl: string;
  readonly databaseConnections: number;
  readonly databaseSsl: "prefer" | "require" | "verify-full";
  readonly workerId: string;
  readonly pollMilliseconds: number;
  readonly leaseMilliseconds: number;
};

function readConfiguration(environment: NodeJS.ProcessEnv): WorkerConfiguration {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (databaseUrl === undefined || databaseUrl === "") {
    throw new Error("DATABASE_URL is required for the render worker.");
  }
  const configuredWorkerId = environment.GLYPHKILN_WORKER_ID?.trim();
  const workerId =
    configuredWorkerId === undefined || configuredWorkerId === ""
      ? `worker-${hostname()}-${String(process.pid)}`
      : configuredWorkerId;
  if (workerId.length > 160) {
    throw new Error("GLYPHKILN_WORKER_ID must not exceed 160 characters.");
  }
  return {
    databaseUrl,
    databaseConnections: readInteger(
      environment.GLYPHKILN_WORKER_DATABASE_CONNECTIONS,
      2,
      1,
      20,
      "GLYPHKILN_WORKER_DATABASE_CONNECTIONS",
    ),
    databaseSsl: readDatabaseSslMode(environment.GLYPHKILN_DATABASE_SSL),
    workerId,
    pollMilliseconds: readInteger(
      environment.GLYPHKILN_WORKER_POLL_MS,
      500,
      50,
      60_000,
      "GLYPHKILN_WORKER_POLL_MS",
    ),
    leaseMilliseconds: readInteger(
      environment.GLYPHKILN_WORKER_LEASE_MS,
      60_000,
      20_000,
      900_000,
      "GLYPHKILN_WORKER_LEASE_MS",
    ),
  };
}

function readDatabaseSslMode(
  input: string | undefined,
): WorkerConfiguration["databaseSsl"] {
  const configured = input?.trim();
  const normalized =
    configured === undefined || configured === "" ? "prefer" : configured;
  if (
    normalized === "prefer" ||
    normalized === "require" ||
    normalized === "verify-full"
  ) {
    return normalized;
  }
  throw new Error("GLYPHKILN_DATABASE_SSL must be prefer, require, or verify-full.");
}

function readInteger(
  input: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const value = input === undefined || input.trim() === "" ? fallback : Number(input);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${String(minimum)} through ${String(maximum)}.`,
    );
  }
  return value;
}

function readMode(
  arguments_: readonly string[],
): "healthcheck" | "migrate" | "once" | "run" {
  if (arguments_.length === 0) return "run";
  if (arguments_.length === 1 && arguments_[0] === "--once") return "once";
  if (arguments_.length === 1 && arguments_[0] === "--healthcheck") {
    return "healthcheck";
  }
  if (arguments_.length === 1 && arguments_[0] === "--migrate-only") {
    return "migrate";
  }
  throw new Error("The worker accepts only --once, --healthcheck, or --migrate-only.");
}

function writeLog(level: "error" | "info", event: RenderWorkerLogEvent): void {
  const line = `${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "glyphkiln-render-worker",
    ...event,
  })}\n`;
  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
