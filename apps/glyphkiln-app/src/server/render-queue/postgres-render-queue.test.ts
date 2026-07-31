import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SqlDatabase } from "../persistence/database";
import { migrateDatabase } from "../persistence/migrations";
import { createPGliteDatabase } from "../persistence/pglite-database";
import { seedRenderJobFixture } from "../../test/render-job-fixture";
import {
  InstallationRenderQueueCapacityError,
  PostgresRenderQueue,
  RenderQueueCapacityError,
  RenderQueueError,
  type ClaimedRenderJob,
  type RenderOutputMetadata,
} from "./index";

const CREATED_AT = new Date("2026-07-31T02:00:00.000Z");

describe("PostgresRenderQueue", () => {
  let database: SqlDatabase;
  let queue: PostgresRenderQueue;

  beforeEach(async () => {
    database = await createPGliteDatabase();
    await migrateDatabase(database);
    queue = new PostgresRenderQueue(database);
  });

  afterEach(async () => {
    await database.close();
  });

  it("keeps job lookups and foreign keys workspace-qualified", async () => {
    const first = await seedRenderJobFixture(database, "queue-a");
    const second = await seedRenderJobFixture(database, "queue-b");
    await expect(
      queue.enqueue({
        jobId: "job-a",
        workspaceId: first.workspaceId,
        designId: first.designId,
        revisionId: first.revisionId,
        requestedBy: first.userId,
        idempotencyKey: "request-a",
        createdAt: CREATED_AT,
        manifestCreationTimestamp: CREATED_AT,
      }),
    ).resolves.toMatchObject({ created: true, jobId: "job-a" });

    await expect(queue.inspect(second.workspaceId, "job-a")).resolves.toBeUndefined();
    await expect(queue.inspect(first.workspaceId, "job-a")).resolves.toMatchObject({
      workspaceId: first.workspaceId,
      revisionId: first.revisionId,
      state: "queued",
    });

    await expect(
      queue.enqueue({
        jobId: "job-cross-workspace",
        workspaceId: first.workspaceId,
        designId: second.designId,
        revisionId: second.revisionId,
        requestedBy: first.userId,
        idempotencyKey: "request-cross-workspace",
        createdAt: CREATED_AT,
        manifestCreationTimestamp: CREATED_AT,
      }),
    ).rejects.toThrow();
  });

  it("deduplicates an identical request and rejects an idempotency conflict", async () => {
    const fixture = await seedRenderJobFixture(database, "idempotency");
    const input = {
      jobId: "job-idempotent-a",
      workspaceId: fixture.workspaceId,
      designId: fixture.designId,
      revisionId: fixture.revisionId,
      requestedBy: fixture.userId,
      idempotencyKey: "client-request-1",
      createdAt: CREATED_AT,
      manifestCreationTimestamp: CREATED_AT,
    } as const;
    await expect(queue.enqueue(input)).resolves.toMatchObject({
      created: true,
      jobId: "job-idempotent-a",
    });
    await expect(
      queue.enqueue({ ...input, jobId: "job-idempotent-b" }),
    ).resolves.toMatchObject({
      created: false,
      jobId: "job-idempotent-a",
    });
    await expect(queue.enqueue({ ...input, maxAttempts: 4 })).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("atomically caps outstanding jobs per workspace without consuming another workspace's quota", async () => {
    const first = await seedRenderJobFixture(database, "capacity-a");
    const second = await seedRenderJobFixture(database, "capacity-b");
    const cappedQueue = new PostgresRenderQueue(database, {
      maximumOutstandingJobsPerWorkspace: 1,
    });
    const results = await Promise.allSettled([
      cappedQueue.enqueue(
        enqueueInput(first, "job-capacity-a-1", "request-capacity-a-1"),
      ),
      cappedQueue.enqueue(
        enqueueInput(first, "job-capacity-a-2", "request-capacity-a-2"),
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status !== "rejected") {
      throw new Error("Expected one enqueue to exceed workspace capacity.");
    }
    expect(rejected.reason as unknown).toMatchObject({
      code: "WORKSPACE_JOB_CAPACITY_REACHED",
      maximumOutstandingJobsPerWorkspace: 1,
    });
    await expect(
      cappedQueue.enqueue(
        enqueueInput(second, "job-capacity-b-1", "request-capacity-b-1"),
      ),
    ).resolves.toMatchObject({
      created: true,
      workspaceId: second.workspaceId,
    });

    const outstanding = await database.query<{
      count: number;
      workspace_id: string;
    }>(
      `SELECT workspace_id, count(*)::integer AS count
         FROM render_jobs
        WHERE state IN ('queued', 'retry_wait', 'claimed')
        GROUP BY workspace_id
        ORDER BY workspace_id`,
    );
    expect(outstanding).toEqual([
      { workspace_id: first.workspaceId, count: 1 },
      { workspace_id: second.workspaceId, count: 1 },
    ]);
  });

  it("returns an idempotent replay before enforcing a full workspace quota", async () => {
    const fixture = await seedRenderJobFixture(database, "capacity-replay");
    const cappedQueue = new PostgresRenderQueue(database, {
      maximumOutstandingJobsPerWorkspace: 1,
    });
    const input = enqueueInput(
      fixture,
      "job-capacity-replay-original",
      "request-capacity-replay",
    );
    await expect(cappedQueue.enqueue(input)).resolves.toMatchObject({
      created: true,
      jobId: input.jobId,
    });
    await expect(
      cappedQueue.enqueue({
        ...input,
        jobId: "job-capacity-replay-ignored",
      }),
    ).resolves.toMatchObject({
      created: false,
      jobId: input.jobId,
    });
    await expect(
      cappedQueue.enqueue({
        ...input,
        jobId: "job-capacity-replay-conflict",
        maxAttempts: 4,
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    await expect(
      cappedQueue.enqueue(
        enqueueInput(fixture, "job-capacity-new-request", "request-capacity-new"),
      ),
    ).rejects.toBeInstanceOf(RenderQueueCapacityError);
  });

  it("atomically caps outstanding jobs across workspaces without blocking idempotent replays", async () => {
    const first = await seedRenderJobFixture(database, "installation-capacity-a");
    const second = await seedRenderJobFixture(database, "installation-capacity-b");
    const cappedQueue = new PostgresRenderQueue(database, {
      maximumOutstandingJobsPerInstallation: 1,
      maximumOutstandingJobsPerWorkspace: 10,
    });
    const firstInput = enqueueInput(
      first,
      "job-installation-capacity-a",
      "request-installation-capacity-a",
    );
    const secondInput = enqueueInput(
      second,
      "job-installation-capacity-b",
      "request-installation-capacity-b",
    );
    const results = await Promise.allSettled([
      cappedQueue.enqueue(firstInput),
      cappedQueue.enqueue(secondInput),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status !== "rejected") {
      throw new Error("Expected one enqueue to exceed installation capacity.");
    }
    expect(rejected.reason).toBeInstanceOf(InstallationRenderQueueCapacityError);
    const acceptedInput = results[0].status === "fulfilled" ? firstInput : secondInput;
    await expect(
      cappedQueue.enqueue({
        ...acceptedInput,
        jobId: "ignored-idempotent-replay-id",
      }),
    ).resolves.toMatchObject({ created: false, jobId: acceptedInput.jobId });
  });

  it("keeps retries within quota and releases capacity only at a terminal state", async () => {
    const fixture = await seedRenderJobFixture(database, "capacity-retry");
    const cappedQueue = new PostgresRenderQueue(database, {
      maximumOutstandingJobsPerWorkspace: 1,
    });
    await cappedQueue.enqueue(
      enqueueInput(fixture, "job-capacity-retry", "request-capacity-retry", 2),
    );
    const first = requireClaim(
      await cappedQueue.claim({
        workerId: "worker-capacity-retry-a",
        now: CREATED_AT,
      }),
    );
    await expect(
      cappedQueue.retry(
        first,
        { code: "RENDER_TIMEOUT", detail: "Isolated renderer timed out." },
        new Date("2026-07-31T02:00:01.000Z"),
        new Date("2026-07-31T02:00:00.100Z"),
      ),
    ).resolves.toBe("retry_scheduled");
    await expect(
      cappedQueue.enqueue(
        enqueueInput(
          fixture,
          "job-capacity-during-retry",
          "request-capacity-during-retry",
        ),
      ),
    ).rejects.toMatchObject({
      code: "WORKSPACE_JOB_CAPACITY_REACHED",
    });

    const second = requireClaim(
      await cappedQueue.claim({
        workerId: "worker-capacity-retry-b",
        now: new Date("2026-07-31T02:00:01.000Z"),
      }),
    );
    await cappedQueue.fail(
      second,
      { code: "RENDER_INVALID", detail: "The render cannot be completed." },
      new Date("2026-07-31T02:00:01.100Z"),
    );
    await expect(
      cappedQueue.enqueue(
        enqueueInput(
          fixture,
          "job-capacity-after-terminal",
          "request-capacity-after-terminal",
        ),
      ),
    ).resolves.toMatchObject({ created: true });
  });

  it("claims least-recently-served workspaces deterministically, including retries", async () => {
    const first = await seedRenderJobFixture(database, "fair-a");
    const second = await seedRenderJobFixture(database, "fair-b");
    await queue.enqueue(enqueueInput(first, "job-fair-a-1", "request-fair-a-1", 2));
    await queue.enqueue(enqueueInput(first, "job-fair-a-2", "request-fair-a-2"));
    await queue.enqueue(enqueueInput(second, "job-fair-b-1", "request-fair-b-1"));

    const firstClaim = requireClaim(
      await queue.claim({ workerId: "worker-fair-a", now: CREATED_AT }),
    );
    expect(firstClaim.workspaceId).toBe(first.workspaceId);
    await queue.retry(
      firstClaim,
      { code: "RENDER_TIMEOUT", detail: "Isolated renderer timed out." },
      CREATED_AT,
      CREATED_AT,
    );

    const secondClaim = requireClaim(
      await queue.claim({ workerId: "worker-fair-b", now: CREATED_AT }),
    );
    expect(secondClaim.workspaceId).toBe(second.workspaceId);
    await queue.fail(
      secondClaim,
      { code: "RENDER_INVALID", detail: "The render cannot be completed." },
      CREATED_AT,
    );

    const thirdClaim = requireClaim(
      await queue.claim({ workerId: "worker-fair-a-retry", now: CREATED_AT }),
    );
    expect(thirdClaim).toMatchObject({
      attemptNumber: 2,
      jobId: firstClaim.jobId,
      workspaceId: first.workspaceId,
    });
  });

  it("places a newly active workspace behind already waiting work", async () => {
    const established = await seedRenderJobFixture(database, "fair-established");
    await queue.enqueue(
      enqueueInput(
        established,
        "job-fair-established-first",
        "request-fair-established-first",
      ),
    );
    const served = requireClaim(
      await queue.claim({ workerId: "worker-fair-established", now: CREATED_AT }),
    );
    await queue.fail(
      served,
      { code: "RENDER_INVALID", detail: "Complete the first scheduling turn." },
      CREATED_AT,
    );
    await queue.enqueue(
      enqueueInput(
        established,
        "job-fair-established-waiting",
        "request-fair-established-waiting",
      ),
    );

    const newcomer = await seedRenderJobFixture(database, "fair-newcomer");
    await queue.enqueue(
      enqueueInput(newcomer, "job-fair-newcomer", "request-fair-newcomer"),
    );

    await expect(
      queue.claim({ workerId: "worker-fair-next", now: CREATED_AT }),
    ).resolves.toMatchObject({
      jobId: "job-fair-established-waiting",
      workspaceId: established.workspaceId,
    });
  });

  it("spreads concurrent claims across ready workspaces before taking another workspace backlog job", async () => {
    const first = await seedRenderJobFixture(database, "concurrent-fair-a");
    const second = await seedRenderJobFixture(database, "concurrent-fair-b");
    await queue.enqueue(
      enqueueInput(first, "job-concurrent-fair-a-1", "request-concurrent-fair-a-1"),
    );
    await queue.enqueue(
      enqueueInput(first, "job-concurrent-fair-a-2", "request-concurrent-fair-a-2"),
    );
    await queue.enqueue(
      enqueueInput(second, "job-concurrent-fair-b-1", "request-concurrent-fair-b-1"),
    );

    const claims = await Promise.all([
      queue.claim({ workerId: "worker-concurrent-fair-a", now: CREATED_AT }),
      queue.claim({ workerId: "worker-concurrent-fair-b", now: CREATED_AT }),
    ]);
    expect(
      claims
        .map((claim) => requireClaim(claim).workspaceId)
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual([first.workspaceId, second.workspaceId]);
  });

  it("schedules bounded retries, recovers an expired lease, and exhausts", async () => {
    const fixture = await seedRenderJobFixture(database, "retry");
    await enqueue(queue, fixture, "job-retry", 3);
    const first = requireClaim(
      await queue.claim({
        workerId: "worker-a",
        now: CREATED_AT,
        leaseMilliseconds: 1_000,
      }),
    );
    await expect(
      queue.retry(
        first,
        { code: "RENDER_TIMEOUT", detail: "Isolated renderer timed out." },
        new Date("2026-07-31T02:00:01.000Z"),
        new Date("2026-07-31T02:00:00.100Z"),
      ),
    ).resolves.toBe("retry_scheduled");
    await expect(
      queue.claim({
        workerId: "worker-a",
        now: new Date("2026-07-31T02:00:00.999Z"),
      }),
    ).resolves.toBeUndefined();

    const second = requireClaim(
      await queue.claim({
        workerId: "worker-b",
        now: new Date("2026-07-31T02:00:01.001Z"),
        leaseMilliseconds: 1_000,
      }),
    );
    expect(second.attemptNumber).toBe(2);
    const third = requireClaim(
      await queue.claim({
        workerId: "worker-c",
        now: new Date("2026-07-31T02:00:03.000Z"),
        leaseMilliseconds: 1_000,
      }),
    );
    expect(third.attemptNumber).toBe(3);
    await expect(
      queue.retry(
        third,
        { code: "RENDER_TIMEOUT", detail: "Isolated renderer timed out." },
        new Date("2026-07-31T02:00:04.000Z"),
        new Date("2026-07-31T02:00:03.100Z"),
      ),
    ).resolves.toBe("exhausted");

    await expect(
      queue.inspect(fixture.workspaceId, "job-retry"),
    ).resolves.toMatchObject({
      state: "exhausted",
      attemptCount: 3,
      lastError: { code: "RENDER_TIMEOUT" },
    });
    const attempts = await database.query<{
      attempt_number: number;
      outcome: string;
    }>(
      `SELECT attempt_number, outcome
         FROM render_attempts
        WHERE workspace_id = $1
          AND job_id = $2
        ORDER BY attempt_number`,
      [fixture.workspaceId, "job-retry"],
    );
    expect(attempts).toEqual([
      { attempt_number: 1, outcome: "retry_scheduled" },
      { attempt_number: 2, outcome: "abandoned" },
      { attempt_number: 3, outcome: "exhausted" },
    ]);
  });

  it("claims once under concurrency and atomically records immutable outputs", async () => {
    const fixture = await seedRenderJobFixture(database, "complete");
    await enqueue(queue, fixture, "job-complete", 3);
    const claims = await Promise.all([
      queue.claim({ workerId: "worker-a", now: CREATED_AT }),
      queue.claim({ workerId: "worker-b", now: CREATED_AT }),
    ]);
    expect(claims.filter((claim) => claim !== undefined)).toHaveLength(1);
    const claim = requireClaim(claims.find((candidate) => candidate !== undefined));
    await queue.complete(claim, outputMetadata(), new Date("2026-07-31T02:00:00.500Z"));
    await expect(
      queue.inspect(fixture.workspaceId, "job-complete"),
    ).resolves.toMatchObject({
      state: "completed",
      outputs: [
        { format: "png", artifactSha256: "b".repeat(64) },
        { format: "svg", artifactSha256: "a".repeat(64) },
      ],
    });
    await expect(
      queue.complete(claim, outputMetadata(), new Date("2026-07-31T02:00:00.600Z")),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RenderQueueError>>({
        code: "JOB_CLAIM_LOST",
      }),
    );
    await expect(
      database.query(
        `UPDATE render_outputs
            SET fingerprint = 'changed'
          WHERE workspace_id = $1
            AND job_id = $2`,
        [fixture.workspaceId, "job-complete"],
      ),
    ).rejects.toThrow(/append-only/);
  });
});

async function enqueue(
  queue: PostgresRenderQueue,
  fixture: Awaited<ReturnType<typeof seedRenderJobFixture>>,
  jobId: string,
  maxAttempts: number,
): Promise<void> {
  await queue.enqueue({
    jobId,
    workspaceId: fixture.workspaceId,
    designId: fixture.designId,
    revisionId: fixture.revisionId,
    requestedBy: fixture.userId,
    idempotencyKey: `request-${jobId}`,
    createdAt: CREATED_AT,
    manifestCreationTimestamp: CREATED_AT,
    maxAttempts,
  });
}

function enqueueInput(
  fixture: Awaited<ReturnType<typeof seedRenderJobFixture>>,
  jobId: string,
  idempotencyKey: string,
  maxAttempts = 3,
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
    maxAttempts,
  } as const;
}

function requireClaim(claim: ClaimedRenderJob | undefined): ClaimedRenderJob {
  if (claim === undefined) throw new Error("Expected a claimed render job.");
  return claim;
}

function outputMetadata(): RenderOutputMetadata[] {
  return [
    {
      format: "svg",
      mimeType: "image/svg+xml",
      artifactKey: "workspaces/a/render-output/sha256/aa/a",
      artifactSha256: "a".repeat(64),
      artifactByteSize: 100,
      manifestKey: "workspaces/a/render-manifest/sha256/cc/c",
      manifestSha256: "c".repeat(64),
      manifestByteSize: 200,
      fingerprint: "fingerprint-svg",
    },
    {
      format: "png",
      mimeType: "image/png",
      artifactKey: "workspaces/a/render-output/sha256/bb/b",
      artifactSha256: "b".repeat(64),
      artifactByteSize: 300,
      manifestKey: "workspaces/a/render-manifest/sha256/dd/d",
      manifestSha256: "d".repeat(64),
      manifestByteSize: 200,
      fingerprint: "fingerprint-png",
    },
  ];
}
