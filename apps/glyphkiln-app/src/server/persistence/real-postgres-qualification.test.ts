import { Buffer } from "node:buffer";

import { sha256 } from "@glyphkiln/core";
import { describe, expect, it } from "vitest";

import { seedRenderJobFixture } from "../../test/render-job-fixture";
import { AppState } from "../app-workflow/state";
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

  it("serializes concurrent campaign baseline attachment on the direction row", async () => {
    const setupDatabase = createPostgresDatabase(databaseUrl, {
      applicationName: "glyphkiln-postgres-qualification-campaign-setup",
      maxConnections: 1,
    });
    const firstDatabase = createPostgresDatabase(databaseUrl, {
      applicationName: "glyphkiln-postgres-qualification-campaign-first",
      maxConnections: 1,
    });
    const secondDatabase = createPostgresDatabase(databaseUrl, {
      applicationName: "glyphkiln-postgres-qualification-campaign-second",
      maxConnections: 1,
    });
    const observerDatabase = createPostgresDatabase(databaseUrl, {
      applicationName: "glyphkiln-postgres-qualification-campaign-observer",
      maxConnections: 1,
    });
    const firstLocked = deferred<undefined>();
    const releaseFirst = deferred<undefined>();
    const secondStarted = deferred<number>();
    let firstAttachment: Promise<void> | undefined;
    let secondAttachment: Promise<string[]> | undefined;

    try {
      await resetDatabase(setupDatabase);
      const fixture = await seedRenderJobFixture(
        setupDatabase,
        "real-campaign-serialization",
      );
      await seedCampaignDirection(setupDatabase, fixture);

      firstAttachment = firstDatabase.transaction(async (transaction) => {
        const state = new AppState(transaction);
        await expect(
          state.lockCampaignDirection({
            workspaceId: fixture.workspaceId,
            campaignId: "campaign-real-serialization",
            directionId: "direction-real-serialization",
          }),
        ).resolves.toBeDefined();
        firstLocked.resolve();
        await releaseFirst.promise;
        await state.insertCampaignCanvas(
          campaignCanvasInput(fixture, "canvas-real-first", "first", 0),
        );
      });
      await firstLocked.promise;

      secondAttachment = secondDatabase.transaction(async (transaction) => {
        const backendRows = await transaction.query<{ pid: number }>(
          "SELECT pg_backend_pid()::integer AS pid",
        );
        const backend = backendRows.at(0);
        if (backend === undefined) throw new Error("PostgreSQL backend PID missing.");
        secondStarted.resolve(backend.pid);

        const state = new AppState(transaction);
        const direction = await state.lockCampaignDirection({
          workspaceId: fixture.workspaceId,
          campaignId: "campaign-real-serialization",
          directionId: "direction-real-serialization",
        });
        if (direction === undefined) {
          throw new Error("Campaign direction disappeared during qualification.");
        }
        const board = await state.readCampaignBoard(
          fixture.workspaceId,
          "campaign-real-serialization",
        );
        const visibleCanvasIds =
          board?.directions
            .find((candidate) => candidate.id === direction.id)
            ?.canvases.map((canvas) => canvas.id) ?? [];
        await state.insertCampaignCanvas(
          campaignCanvasInput(fixture, "canvas-real-second", "second", 1),
        );
        return visibleCanvasIds;
      });

      const secondBackendPid = await secondStarted.promise;
      const waiting = await waitForPostgresLockWait(observerDatabase, secondBackendPid);
      expect(waiting).toMatchObject({
        application_name: "glyphkiln-postgres-qualification-campaign-second",
        state: "active",
        wait_event_type: "Lock",
        has_ungranted_lock: true,
      });

      releaseFirst.resolve();
      await firstAttachment;
      await expect(secondAttachment).resolves.toEqual(["canvas-real-first"]);

      const board = await new AppState(setupDatabase).readCampaignBoard(
        fixture.workspaceId,
        "campaign-real-serialization",
      );
      expect(board?.directions.at(0)?.canvases.map((canvas) => canvas.id)).toEqual([
        "canvas-real-first",
        "canvas-real-second",
      ]);
    } finally {
      releaseFirst.resolve();
      await Promise.allSettled(
        [firstAttachment, secondAttachment].filter(
          (operation): operation is Promise<void> | Promise<string[]> =>
            operation !== undefined,
        ),
      );
      await Promise.all([
        setupDatabase.close(),
        firstDatabase.close(),
        secondDatabase.close(),
        observerDatabase.close(),
      ]);
    }
  }, 20_000);

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

function deferred<Value>(): {
  promise: Promise<Value>;
  resolve(value?: Value): void;
} {
  let resolvePromise: (value: Value | PromiseLike<Value>) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      resolvePromise(value as Value);
    },
  };
}

type PostgresLockWaitObservation = {
  application_name: string;
  state: string;
  wait_event_type: string | null;
  wait_event: string | null;
  has_ungranted_lock: boolean;
};

async function waitForPostgresLockWait(
  database: ReturnType<typeof createPostgresDatabase>,
  backendPid: number,
): Promise<PostgresLockWaitObservation> {
  const deadline = Date.now() + 5_000;
  let lastObserved: PostgresLockWaitObservation | undefined;
  while (Date.now() < deadline) {
    const rows = await database.query<PostgresLockWaitObservation>(
      `SELECT activity.application_name,
              activity.state,
              activity.wait_event_type,
              activity.wait_event,
              EXISTS (
                SELECT 1
                  FROM pg_locks waiting_lock
                 WHERE waiting_lock.pid = activity.pid
                   AND waiting_lock.granted = FALSE
              ) AS has_ungranted_lock
         FROM pg_stat_activity activity
        WHERE activity.datname = current_database()
          AND activity.pid = $1`,
      [backendPid],
    );
    lastObserved = rows.at(0);
    if (lastObserved?.wait_event_type === "Lock" && lastObserved.has_ungranted_lock) {
      return lastObserved;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `Second campaign transaction did not wait on a PostgreSQL lock: ${JSON.stringify(lastObserved)}`,
  );
}

async function seedCampaignDirection(
  database: ReturnType<typeof createPostgresDatabase>,
  fixture: Awaited<ReturnType<typeof seedRenderJobFixture>>,
): Promise<void> {
  await database.query(
    `INSERT INTO campaigns (
       id, workspace_id, name, brief, campaign_seed, family_id,
       created_by, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'image-led-campaign', $6, $7, $7)`,
    [
      "campaign-real-serialization",
      fixture.workspaceId,
      "Real serialization campaign",
      "Qualify the production direction lock around the first canvas baseline.",
      "real-serialization-seed",
      fixture.userId,
      CREATED_AT,
    ],
  );
  await database.query(
    `INSERT INTO campaign_directions (
       id, workspace_id, campaign_id, direction_key, name, created_by, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      "direction-real-serialization",
      fixture.workspaceId,
      "campaign-real-serialization",
      "real-serialization",
      "Real serialization direction",
      fixture.userId,
      CREATED_AT,
    ],
  );
  await database.query(
    `INSERT INTO campaign_direction_locks (
       workspace_id, campaign_id, direction_id, lock_id, ordinal, created_at
     ) VALUES ($1, $2, $3, 'copy', 0, $4)`,
    [
      fixture.workspaceId,
      "campaign-real-serialization",
      "direction-real-serialization",
      CREATED_AT,
    ],
  );
}

function campaignCanvasInput(
  fixture: Awaited<ReturnType<typeof seedRenderJobFixture>>,
  id: string,
  canvasKey: string,
  ordinal: number,
) {
  return {
    id,
    workspaceId: fixture.workspaceId,
    campaignId: "campaign-real-serialization",
    directionId: "direction-real-serialization",
    canvasKey,
    designId: fixture.designId,
    revisionId: fixture.revisionId,
    templateId: fixture.document.template.id,
    templateVersion: fixture.document.template.version,
    format: fixture.document.format,
    compositionVariantId: "focal-editorial" as const,
    narrativeRole: "context" as const,
    seedDerivationVersion: "sha256/canonical-scope-v1",
    directionSeed: "a".repeat(64),
    canvasSeed: id === "canvas-real-first" ? "b".repeat(64) : "c".repeat(64),
    ordinal,
    createdBy: fixture.userId,
    createdAt: CREATED_AT,
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
