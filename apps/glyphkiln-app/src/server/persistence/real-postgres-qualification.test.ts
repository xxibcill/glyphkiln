import { Buffer } from "node:buffer";

import { sha256 } from "@glyphkiln/core";
import { describe, expect, it } from "vitest";

import { seedRenderJobFixture } from "../../test/render-job-fixture";
import type { ImmutableBlobWriteResult, ResourceBlobStorage } from "../resources";
import { DatabaseResourceStore, ResourceIngestionService } from "../resources";
import { TestOnlyCleanMalwareScanner } from "../resources/test-support";
import { PostgresRenderQueue } from "../render-queue";
import { loadMigrations, migrateDatabase, rollbackMigrations } from "./migrations";
import { createPostgresDatabase } from "./postgres-database";

const DATABASE_URL = process.env.GLYPHKILN_REAL_POSTGRES_DATABASE_URL?.trim();
const QUALIFICATION_ENABLED = process.env.GLYPHKILN_REAL_POSTGRES_QUALIFICATION === "1";
const PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$Z2x5cGhraWxu$YXBwLWFscGhh";
const CREATED_AT = new Date("2026-07-31T02:00:00.000Z");
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    "base64",
  ),
);

const describeQualification = describe.skipIf(!QUALIFICATION_ENABLED);

describeQualification("real PostgreSQL App Alpha qualification", () => {
  const databaseUrl = requireQualificationDatabaseUrl(DATABASE_URL);

  it("runs forward, rollback, forward, and idempotent migration application", async () => {
    const database = createPostgresDatabase(databaseUrl, {
      applicationName: "glyphkiln-postgres-qualification-migrations",
      maxConnections: 2,
    });
    try {
      const migrations = await loadMigrations();
      const initialRollback = await rollbackMigrations(database, {
        allowDataLoss: true,
        warn: () => undefined,
      });
      expect(
        initialRollback.rolledBack.length === 0 ? [] : initialRollback.rolledBack,
      ).toEqual(
        initialRollback.rolledBack.length === 0
          ? []
          : migrations.map((migration) => migration.version).reverse(),
      );

      const firstForward = await migrateDatabase(database);
      expect(firstForward.applied).toHaveLength(migrations.length);
      expect(firstForward.alreadyApplied).toEqual([]);

      const rollback = await rollbackMigrations(database, {
        allowDataLoss: true,
        warn: () => undefined,
      });
      expect(rollback.rolledBack).toEqual(
        migrations.map((migration) => migration.version).reverse(),
      );

      const secondForward = await migrateDatabase(database);
      expect(secondForward.applied).toEqual(
        migrations.map((migration) => migration.version),
      );
      const idempotentForward = await migrateDatabase(database);
      expect(idempotentForward).toEqual({
        alreadyApplied: migrations.map((migration) => migration.version),
        applied: [],
      });
    } finally {
      await database.close();
    }
  });

  it("keeps queue identities and relationships workspace-qualified", async () => {
    const database = createPostgresDatabase(databaseUrl, {
      applicationName: "glyphkiln-postgres-qualification-isolation",
      maxConnections: 4,
    });
    try {
      await resetDatabase(database);
      const first = await seedRenderJobFixture(database, "real-isolation-a");
      const second = await seedRenderJobFixture(database, "real-isolation-b");
      const queue = new PostgresRenderQueue(database);
      await queue.enqueue(enqueueInput(first, "job-real-isolation", "request-real-a"));

      await expect(
        queue.inspect(second.workspaceId, "job-real-isolation"),
      ).resolves.toBeUndefined();
      await expect(
        queue.enqueue({
          ...enqueueInput(
            first,
            "job-real-cross-workspace",
            "request-real-cross-workspace",
          ),
          designId: second.designId,
          revisionId: second.revisionId,
        }),
      ).rejects.toHaveProperty("code", "23503");
    } finally {
      await database.close();
    }
  });

  it("serializes concurrent queue quotas and spreads concurrent claims", async () => {
    const database = createPostgresDatabase(databaseUrl, {
      applicationName: "glyphkiln-postgres-qualification-queue",
      maxConnections: 8,
    });
    try {
      await resetDatabase(database);
      const first = await seedRenderJobFixture(database, "real-queue-a");
      const second = await seedRenderJobFixture(database, "real-queue-b");
      const queue = new PostgresRenderQueue(database, {
        maximumOutstandingJobsPerInstallation: 2,
        maximumOutstandingJobsPerWorkspace: 1,
      });

      const sameWorkspace = await Promise.allSettled([
        queue.enqueue(enqueueInput(first, "job-real-a-1", "request-real-a-1")),
        queue.enqueue(enqueueInput(first, "job-real-a-2", "request-real-a-2")),
      ]);
      expect(
        sameWorkspace.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        sameWorkspace.find((result) => result.status === "rejected"),
      ).toMatchObject({
        status: "rejected",
        reason: { code: "WORKSPACE_JOB_CAPACITY_REACHED" },
      });

      await queue.enqueue(enqueueInput(second, "job-real-b-1", "request-real-b-1"));
      const claims = await Promise.all([
        queue.claim({ workerId: "real-worker-a", now: CREATED_AT }),
        queue.claim({ workerId: "real-worker-b", now: CREATED_AT }),
      ]);
      expect(claims).not.toContain(undefined);
      expect(
        claims
          .map((claim) => claim?.workspaceId)
          .sort((left, right) => (left ?? "").localeCompare(right ?? "")),
      ).toEqual([first.workspaceId, second.workspaceId].sort());
    } finally {
      await database.close();
    }
  });

  it("serializes concurrent installation-wide resource admission", async () => {
    const database = createPostgresDatabase(databaseUrl, {
      applicationName: "glyphkiln-postgres-qualification-resources",
      maxConnections: 8,
    });
    try {
      await resetDatabase(database);
      await seedResourceWorkspaces(database);
      const blobs = new MemoryBlobStorage();
      const store = new DatabaseResourceStore(database, blobs, {
        maximumInstallationAdmissions: 1,
        maximumInstallationStoredBytes: PNG.byteLength * 10,
        maximumWorkspaceAdmissions: 10,
        maximumWorkspaceStoredBytes: PNG.byteLength * 10,
      });
      const firstIds = ["resource-real-a", "ingestion-real-a"];
      const secondIds = ["resource-real-b", "ingestion-real-b"];
      const firstService = new ResourceIngestionService({
        store,
        scanner: new TestOnlyCleanMalwareScanner(),
        createId: () => firstIds.shift() ?? "unexpected-real-a-id",
      });
      const secondService = new ResourceIngestionService({
        store,
        scanner: new TestOnlyCleanMalwareScanner(),
        createId: () => secondIds.shift() ?? "unexpected-real-b-id",
      });

      const results = await Promise.allSettled([
        firstService.ingestRaster(resourceInput("workspace-real-a", "user-real-a")),
        secondService.ingestRaster(resourceInput("workspace-real-b", "user-real-b")),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toMatchObject({
        status: "rejected",
        reason: { code: "RESOURCE_QUOTA_EXCEEDED" },
      });
      await expect(
        database.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM resource_versions",
        ),
      ).resolves.toEqual([{ count: 1 }]);
      expect(blobs.blobs).toHaveLength(1);
    } finally {
      await database.close();
    }
  });
});

function requireQualificationDatabaseUrl(value: string | undefined): string {
  if (!QUALIFICATION_ENABLED) return "postgresql://disabled/qualification";
  if (value === undefined || value.length === 0) {
    throw new Error(
      "GLYPHKILN_REAL_POSTGRES_DATABASE_URL is required for real PostgreSQL qualification.",
    );
  }
  const parsed = new URL(value);
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") ||
    parsed.pathname !== "/glyphkiln_qualification"
  ) {
    throw new Error(
      "Real PostgreSQL qualification requires a loopback glyphkiln_qualification database.",
    );
  }
  return value;
}

async function resetDatabase(
  database: ReturnType<typeof createPostgresDatabase>,
): Promise<void> {
  await rollbackMigrations(database, {
    allowDataLoss: true,
    warn: () => undefined,
  });
  await migrateDatabase(database);
}

function enqueueInput(
  fixture: Awaited<ReturnType<typeof seedRenderJobFixture>>,
  jobId: string,
  idempotencyKey: string,
) {
  return {
    jobId,
    workspaceId: fixture.workspaceId,
    designId: fixture.designId,
    revisionId: fixture.revisionId,
    requestedBy: fixture.userId,
    idempotencyKey,
    createdAt: CREATED_AT,
    manifestCreationTimestamp: CREATED_AT,
  };
}

class MemoryBlobStorage implements ResourceBlobStorage {
  readonly blobs = new Map<string, Uint8Array>();

  public putImmutable(
    key: string,
    contentHash: string,
    bytes: Uint8Array,
  ): Promise<ImmutableBlobWriteResult> {
    const existing = this.blobs.get(key);
    if (existing !== undefined) {
      if (sha256(existing) !== contentHash) throw new Error("immutable collision");
      return Promise.resolve("already-present");
    }
    this.blobs.set(key, new Uint8Array(bytes));
    return Promise.resolve("stored");
  }

  public readBounded(key: string, maximumBytes: number): Promise<Uint8Array | null> {
    const bytes = this.blobs.get(key);
    if (bytes === undefined) return Promise.resolve(null);
    if (bytes.byteLength > maximumBytes) throw new Error("oversized test blob");
    return Promise.resolve(new Uint8Array(bytes));
  }
}

async function seedResourceWorkspaces(
  database: ReturnType<typeof createPostgresDatabase>,
): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, display_name, password_hash)
     VALUES
       ('user-real-a', 'real-a@example.test', 'Real A', $1),
       ('user-real-b', 'real-b@example.test', 'Real B', $1)`,
    [PASSWORD_HASH],
  );
  await database.query(
    `INSERT INTO workspaces (id, name, slug, created_by)
     VALUES
       ('workspace-real-a', 'Real A', 'real-a', 'user-real-a'),
       ('workspace-real-b', 'Real B', 'real-b', 'user-real-b')`,
  );
  await database.query(
    `INSERT INTO workspace_memberships (workspace_id, user_id, role)
     VALUES
       ('workspace-real-a', 'user-real-a', 'owner'),
       ('workspace-real-b', 'user-real-b', 'owner')`,
  );
}

function resourceInput(workspaceId: string, actorUserId: string) {
  return {
    workspaceId,
    actorUserId,
    declaredMediaType: "image/png" as const,
    bytes: PNG,
    originalFilename: "qualification.png",
    origin: { kind: "user-upload" as const },
    license: { status: "owned" as const },
  };
}
