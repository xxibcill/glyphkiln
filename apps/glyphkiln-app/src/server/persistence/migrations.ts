import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { SqlDatabase, SqlTransaction } from "./database";

const STATEMENT_BREAK = "-- glyphkiln:statement-break";

const MIGRATION_FILES = [
  {
    down: new URL(
      "./migrations/202607310001_app_alpha_foundation.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202607310001_app_alpha_foundation.up.sql",
      import.meta.url,
    ),
    version: "202607310001_app_alpha_foundation",
  },
  {
    down: new URL("./migrations/202607310002_safe_resources.down.sql", import.meta.url),
    up: new URL("./migrations/202607310002_safe_resources.up.sql", import.meta.url),
    version: "202607310002_safe_resources",
  },
  {
    down: new URL(
      "./migrations/202607310003_async_render_jobs.down.sql",
      import.meta.url,
    ),
    up: new URL("./migrations/202607310003_async_render_jobs.up.sql", import.meta.url),
    version: "202607310003_async_render_jobs",
  },
  {
    down: new URL(
      "./migrations/202607310004_membership_lifecycle.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202607310004_membership_lifecycle.up.sql",
      import.meta.url,
    ),
    version: "202607310004_membership_lifecycle",
  },
  {
    down: new URL(
      "./migrations/202607310005_resource_admission_identity.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202607310005_resource_admission_identity.up.sql",
      import.meta.url,
    ),
    version: "202607310005_resource_admission_identity",
  },
  {
    down: new URL(
      "./migrations/202607310006_render_queue_capacity_fairness.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202607310006_render_queue_capacity_fairness.up.sql",
      import.meta.url,
    ),
    version: "202607310006_render_queue_capacity_fairness",
  },
  {
    down: new URL(
      "./migrations/202607310007_revision_resource_provenance.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202607310007_revision_resource_provenance.up.sql",
      import.meta.url,
    ),
    version: "202607310007_revision_resource_provenance",
  },
  {
    down: new URL(
      "./migrations/202608120008_campaign_workflow.down.sql",
      import.meta.url,
    ),
    up: new URL("./migrations/202608120008_campaign_workflow.up.sql", import.meta.url),
    version: "202608120008_campaign_workflow",
  },
  {
    down: new URL(
      "./migrations/202608120009_revision_review_approval.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202608120009_revision_review_approval.up.sql",
      import.meta.url,
    ),
    version: "202608120009_revision_review_approval",
  },
  {
    down: new URL(
      "./migrations/202608120010_resource_color_normalization_provenance.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202608120010_resource_color_normalization_provenance.up.sql",
      import.meta.url,
    ),
    version: "202608120010_resource_color_normalization_provenance",
  },
  {
    down: new URL(
      "./migrations/202608120011_campaign_proposals.down.sql",
      import.meta.url,
    ),
    up: new URL("./migrations/202608120011_campaign_proposals.up.sql", import.meta.url),
    version: "202608120011_campaign_proposals",
  },
  {
    down: new URL(
      "./migrations/202608130012_campaign_carousel_variant.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202608130012_campaign_carousel_variant.up.sql",
      import.meta.url,
    ),
    version: "202608130012_campaign_carousel_variant",
  },
  {
    down: new URL(
      "./migrations/202608180013_campaign_narrative_role.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202608180013_campaign_narrative_role.up.sql",
      import.meta.url,
    ),
    version: "202608180013_campaign_narrative_role",
  },
  {
    down: new URL(
      "./migrations/202608190014_campaign_delivery_profile.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202608190014_campaign_delivery_profile.up.sql",
      import.meta.url,
    ),
    version: "202608190014_campaign_delivery_profile",
  },
  {
    down: new URL(
      "./migrations/202608190015_campaign_carousel_sequence.down.sql",
      import.meta.url,
    ),
    up: new URL(
      "./migrations/202608190015_campaign_carousel_sequence.up.sql",
      import.meta.url,
    ),
    version: "202608190015_campaign_carousel_sequence",
  },
] as const;

const CREATE_MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL
      CONSTRAINT schema_migrations_checksum_check
      CHECK (checksum ~ '^[0-9a-f]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const LOCK_MIGRATION_TABLE_SQL = "LOCK TABLE schema_migrations IN EXCLUSIVE MODE";

export const ALPHA_ROLLBACK_WARNING =
  "Rolling back App Alpha deletes all users, sessions, workspaces, invitations, audit events, brand snapshots, designs, revisions, admitted resource metadata, and render-job history.";

export type Migration = {
  readonly checksum: string;
  readonly downStatements: readonly string[];
  readonly upStatements: readonly string[];
  readonly version: string;
};

export type MigrationRunResult = {
  readonly alreadyApplied: readonly string[];
  readonly applied: readonly string[];
};

export type MigrationReadiness = {
  readonly applied: readonly string[];
};

export type MigrationRollbackOptions = {
  readonly allowDataLoss: boolean;
  readonly warn?: (message: string) => void;
};

export type MigrationRollbackResult = {
  readonly rolledBack: readonly string[];
};

type AppliedMigrationRow = {
  checksum: string;
  version: string;
};

function splitStatements(sql: string, migrationName: string): string[] {
  const statements = sql
    .split(STATEMENT_BREAK)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  if (statements.length === 0) {
    throw new Error(`Migration ${migrationName} contains no SQL statements.`);
  }

  return statements;
}

function migrationChecksum(version: string, up: string, down: string): string {
  return createHash("sha256")
    .update(version)
    .update("\0")
    .update(up)
    .update("\0")
    .update(down)
    .digest("hex");
}

export async function loadMigrations(): Promise<Migration[]> {
  const migrations = await Promise.all(
    MIGRATION_FILES.map(async (migrationFile) => {
      const [up, down] = await Promise.all([
        readFile(migrationFile.up, "utf8"),
        readFile(migrationFile.down, "utf8"),
      ]);

      return {
        checksum: migrationChecksum(migrationFile.version, up, down),
        downStatements: splitStatements(down, `${migrationFile.version} rollback`),
        upStatements: splitStatements(up, migrationFile.version),
        version: migrationFile.version,
      };
    }),
  );

  return migrations.sort((left, right) => left.version.localeCompare(right.version));
}

async function ensureMigrationTable(database: SqlDatabase): Promise<void> {
  await database.query(CREATE_MIGRATION_TABLE_SQL);
}

async function readAppliedMigrations(
  transaction: SqlTransaction,
): Promise<AppliedMigrationRow[]> {
  return transaction.query<AppliedMigrationRow>(
    "SELECT version, checksum FROM schema_migrations ORDER BY version",
  );
}

function validateAppliedMigrations(
  appliedRows: readonly AppliedMigrationRow[],
  migrations: readonly Migration[],
): Map<string, AppliedMigrationRow> {
  const knownMigrations = new Map(
    migrations.map((migration) => [migration.version, migration]),
  );
  const appliedByVersion = new Map<string, AppliedMigrationRow>();

  for (const appliedRow of appliedRows) {
    const migration = knownMigrations.get(appliedRow.version);

    if (migration === undefined) {
      throw new Error(
        `Database contains unknown migration ${appliedRow.version}; refusing to alter migration state.`,
      );
    }

    if (migration.checksum !== appliedRow.checksum) {
      throw new Error(
        `Migration ${appliedRow.version} differs from the checked-in SQL.`,
      );
    }

    appliedByVersion.set(appliedRow.version, appliedRow);
  }

  return appliedByVersion;
}

async function runStatements(
  transaction: SqlTransaction,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await transaction.query(statement);
  }
}

export async function migrateDatabase(
  database: SqlDatabase,
): Promise<MigrationRunResult> {
  const migrations = await loadMigrations();
  await ensureMigrationTable(database);

  return database.transaction(async (transaction) => {
    await transaction.query(LOCK_MIGRATION_TABLE_SQL);

    const appliedByVersion = validateAppliedMigrations(
      await readAppliedMigrations(transaction),
      migrations,
    );
    const applied: string[] = [];
    const alreadyApplied: string[] = [];

    for (const migration of migrations) {
      if (appliedByVersion.has(migration.version)) {
        alreadyApplied.push(migration.version);
        continue;
      }

      await runStatements(transaction, migration.upStatements);
      await transaction.query(
        "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
        [migration.version, migration.checksum],
      );
      applied.push(migration.version);
    }

    return { alreadyApplied, applied };
  });
}

export async function assertDatabaseMigrationsCurrent(
  database: SqlDatabase,
): Promise<MigrationReadiness> {
  const migrations = await loadMigrations();
  const appliedRows = await readAppliedMigrations(database);
  const appliedByVersion = validateAppliedMigrations(appliedRows, migrations);
  const missing = migrations
    .filter((migration) => !appliedByVersion.has(migration.version))
    .map((migration) => migration.version);
  if (missing.length > 0) {
    throw new Error(
      `Database migrations are not current; missing ${missing.join(", ")}.`,
    );
  }
  return { applied: migrations.map((migration) => migration.version) };
}

export async function rollbackMigrations(
  database: SqlDatabase,
  options: MigrationRollbackOptions,
): Promise<MigrationRollbackResult> {
  if (!options.allowDataLoss) {
    throw new Error(`${ALPHA_ROLLBACK_WARNING} Pass allowDataLoss: true to continue.`);
  }

  const warn =
    options.warn ??
    ((message: string) => {
      process.emitWarning(message);
    });
  warn(ALPHA_ROLLBACK_WARNING);

  const migrations = await loadMigrations();
  await ensureMigrationTable(database);

  return database.transaction(async (transaction) => {
    await transaction.query(LOCK_MIGRATION_TABLE_SQL);

    const appliedByVersion = validateAppliedMigrations(
      await readAppliedMigrations(transaction),
      migrations,
    );
    const rolledBack: string[] = [];

    for (const migration of [...migrations].reverse()) {
      if (!appliedByVersion.has(migration.version)) {
        continue;
      }

      await runStatements(transaction, migration.downStatements);
      await transaction.query("DELETE FROM schema_migrations WHERE version = $1", [
        migration.version,
      ]);
      rolledBack.push(migration.version);
    }

    return { rolledBack };
  });
}
