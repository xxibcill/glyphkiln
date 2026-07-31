#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TYPE_STRIP_REENTRY = "GLYPHKILN_MIGRATE_TYPE_STRIP_REENTRY";

function errorCode(error) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

function restartWithTypeStripping() {
  if (process.env[TYPE_STRIP_REENTRY] === "1") {
    throw new Error(
      "This Node.js runtime could not load the TypeScript migration runner.",
    );
  }

  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    {
      env: {
        ...process.env,
        [TYPE_STRIP_REENTRY]: "1",
      },
      stdio: "inherit",
    },
  );

  if (result.error !== undefined) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

async function loadPersistenceModules() {
  try {
    return await Promise.all([
      import("../src/server/persistence/postgres-database.ts"),
      import("../src/server/persistence/migrations.ts"),
    ]);
  } catch (error) {
    if (
      errorCode(error) === "ERR_UNKNOWN_FILE_EXTENSION" ||
      errorCode(error) === "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX"
    ) {
      restartWithTypeStripping();
    }

    throw error;
  }
}

function parseCommand() {
  const [command = "up", ...flags] = process.argv.slice(2);

  if (command !== "up" && command !== "down") {
    throw new Error("Usage: migrate.mjs [up|down] [--allow-data-loss]");
  }

  const unknownFlag = flags.find((flag) => flag !== "--allow-data-loss");
  if (unknownFlag !== undefined) {
    throw new Error(`Unknown migration option: ${unknownFlag}`);
  }

  return {
    allowDataLoss: flags.includes("--allow-data-loss"),
    command,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required.");
  }

  const command = parseCommand();
  const [postgresModule, migrationModule] = await loadPersistenceModules();
  const database = postgresModule.createPostgresDatabase(databaseUrl, {
    applicationName: "glyphkiln-migrations",
    maxConnections: 1,
  });

  try {
    if (command.command === "up") {
      const result = await migrationModule.migrateDatabase(database);
      process.stdout.write(
        `Applied ${result.applied.length} migration(s); ${result.alreadyApplied.length} already applied.\n`,
      );
      return;
    }

    const result = await migrationModule.rollbackMigrations(database, {
      allowDataLoss: command.allowDataLoss,
      warn(message) {
        process.stderr.write(`WARNING: ${message}\n`);
      },
    });
    process.stdout.write(`Rolled back ${result.rolledBack.length} migration(s).\n`);
  } finally {
    await database.close();
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Migration failed: ${message}\n`);
  process.exitCode = 1;
}
