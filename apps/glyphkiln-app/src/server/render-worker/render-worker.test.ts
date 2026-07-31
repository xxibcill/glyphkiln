import {
  GlyphkilnError,
  canonicalJson,
  renderGraphic,
  type RenderGraphicOptions,
} from "@glyphkiln/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SqlDatabase } from "../persistence/database";
import { migrateDatabase } from "../persistence/migrations";
import { createPGliteDatabase } from "../persistence/pglite-database";
import {
  PostgresRenderQueue,
  RenderQueueError,
  type RenderQueue,
} from "../render-queue";
import { InMemoryRenderBlobStorage } from "../storage";
import { seedRenderJobFixture } from "../../test/render-job-fixture";
import { RenderWorker, type RenderWorkerClock } from "./render-worker";

const CREATED_AT = new Date("2026-07-31T03:00:00.000Z");

describe("RenderWorker", () => {
  let database: SqlDatabase;
  let queue: PostgresRenderQueue;
  let storage: InMemoryRenderBlobStorage;

  beforeEach(async () => {
    database = await createPGliteDatabase();
    await migrateDatabase(database);
    queue = new PostgresRenderQueue(database);
    storage = new InMemoryRenderBlobStorage();
  });

  afterEach(async () => {
    await database.close();
  });

  it("reloads an exact authorized revision, renders it, and persists both proofs", async () => {
    const fixture = await seedRenderJobFixture(database, "worker-complete");
    await enqueue(queue, fixture, "job-worker-complete");
    const inputs: unknown[] = [];
    const creationTimestamps: (string | undefined)[] = [];
    const render = vi.fn(async (input: unknown, options: RenderGraphicOptions = {}) => {
      inputs.push(input);
      creationTimestamps.push(options.creationTimestamp);
      return renderGraphic(input, options);
    });
    const worker = new RenderWorker({
      database,
      queue,
      storage,
      workerId: "worker-complete",
      render,
      clock: new ManualClock(CREATED_AT),
    });

    await expect(worker.processNext()).resolves.toEqual({
      kind: "completed",
      jobId: "job-worker-complete",
      workspaceId: fixture.workspaceId,
    });
    expect(canonicalJson(inputs[0])).toBe(canonicalJson(fixture.document));
    expect(creationTimestamps).toEqual([CREATED_AT.toISOString()]);

    const completed = await queue.inspect(fixture.workspaceId, "job-worker-complete");
    expect(completed).toMatchObject({
      state: "completed",
      attemptCount: 1,
    });
    expect(completed?.outputs.map((output) => output.format)).toEqual(["png", "svg"]);
    for (const output of completed?.outputs ?? []) {
      const artifact = await storage.read({
        workspaceId: fixture.workspaceId,
        purpose: "render-output",
        sha256: output.artifactSha256,
      });
      expect(artifact.byteLength).toBe(output.artifactByteSize);
      const manifest = await storage.read({
        workspaceId: fixture.workspaceId,
        purpose: "render-manifest",
        sha256: output.manifestSha256,
      });
      expect(JSON.parse(new TextDecoder().decode(manifest))).toMatchObject({
        designDocumentId: fixture.designId,
        output: {
          format: output.format,
          sha256: output.artifactSha256,
        },
      });
    }
  });

  it("retries a transient isolated-render failure with deterministic backoff", async () => {
    const fixture = await seedRenderJobFixture(database, "worker-retry");
    await enqueue(queue, fixture, "job-worker-retry");
    let attempts = 0;
    const render = vi.fn(async (input: unknown, options: RenderGraphicOptions = {}) => {
      attempts += 1;
      if (attempts === 1) {
        throw new GlyphkilnError("temporary process failure", "RENDER_PROCESS_FAILED");
      }
      return renderGraphic(input, options);
    });
    const clock = new ManualClock(CREATED_AT);
    const worker = new RenderWorker({
      database,
      queue,
      storage,
      workerId: "worker-retry",
      render,
      clock,
    });
    await expect(worker.processNext()).resolves.toMatchObject({
      kind: "retry_scheduled",
      code: "RENDER_PROCESS_FAILED",
    });
    await expect(
      queue.inspect(fixture.workspaceId, "job-worker-retry"),
    ).resolves.toMatchObject({
      state: "retry_wait",
      attemptCount: 1,
      availableAt: new Date("2026-07-31T03:00:01.000Z"),
    });
    clock.set(new Date("2026-07-31T03:00:01.000Z"));
    await expect(worker.processNext()).resolves.toMatchObject({
      kind: "completed",
    });
    await expect(
      queue.inspect(fixture.workspaceId, "job-worker-retry"),
    ).resolves.toMatchObject({
      state: "completed",
      attemptCount: 2,
    });
  });

  it("rechecks the requester's current workspace capability before rendering", async () => {
    const fixture = await seedRenderJobFixture(database, "worker-viewer", "viewer");
    await enqueue(queue, fixture, "job-worker-viewer");
    const render = vi.fn((input: unknown, options: RenderGraphicOptions = {}) =>
      renderGraphic(input, options),
    );
    const worker = new RenderWorker({
      database,
      queue,
      storage,
      workerId: "worker-viewer",
      render,
      clock: new ManualClock(CREATED_AT),
    });
    await expect(worker.processNext()).resolves.toMatchObject({
      kind: "failed",
      code: "RENDER_AUTHORIZATION_REVOKED",
    });
    expect(render).not.toHaveBeenCalled();
  });

  it("does not render a queued revision after its requester membership is revoked", async () => {
    const fixture = await seedRenderJobFixture(database, "worker-revoked");
    await enqueue(queue, fixture, "job-worker-revoked");
    const revokerId = "owner-worker-revoked";
    await database.query(
      `INSERT INTO users (
         id, email, display_name, password_hash, created_at
       )
       SELECT $1, $2, $3, password_hash, created_at
         FROM users
        WHERE id = $4`,
      [
        revokerId,
        "owner-worker-revoked@example.test",
        "Revoking owner",
        fixture.userId,
      ],
    );
    await database.query(
      `INSERT INTO workspace_memberships (
         workspace_id, user_id, role, created_at
       )
       SELECT workspace_id, $2, 'owner', created_at
         FROM workspace_memberships
        WHERE workspace_id = $1
          AND user_id = $3`,
      [fixture.workspaceId, revokerId, fixture.userId],
    );
    await database.query(
      `UPDATE workspace_memberships
          SET revoked_at = $3,
              revoked_by = $2
        WHERE workspace_id = $1
          AND user_id = $4`,
      [fixture.workspaceId, revokerId, CREATED_AT, fixture.userId],
    );
    const render = vi.fn((input: unknown, options: RenderGraphicOptions = {}) =>
      renderGraphic(input, options),
    );
    const worker = new RenderWorker({
      database,
      queue,
      storage,
      workerId: "worker-revoked",
      render,
      clock: new ManualClock(CREATED_AT),
    });

    await expect(worker.processNext()).resolves.toMatchObject({
      kind: "failed",
      code: "RENDER_REVISION_NOT_FOUND",
    });
    expect(render).not.toHaveBeenCalled();
  });

  it("does not render after the requesting user is disabled", async () => {
    const fixture = await seedRenderJobFixture(database, "worker-disabled");
    await enqueue(queue, fixture, "job-worker-disabled");
    await database.query(
      `UPDATE users
          SET disabled_at = $2
        WHERE id = $1`,
      [fixture.userId, CREATED_AT],
    );
    const render = vi.fn((input: unknown, options: RenderGraphicOptions = {}) =>
      renderGraphic(input, options),
    );
    const worker = new RenderWorker({
      database,
      queue,
      storage,
      workerId: "worker-disabled",
      render,
      clock: new ManualClock(CREATED_AT),
    });
    await expect(worker.processNext()).resolves.toMatchObject({
      kind: "failed",
      code: "RENDER_REVISION_NOT_FOUND",
    });
    expect(render).not.toHaveBeenCalled();
  });

  it("does not render after the requester's membership is revoked", async () => {
    const fixture = await seedRenderJobFixture(database, "worker-revoked");
    await enqueue(queue, fixture, "job-worker-revoked");
    await database.query(
      `UPDATE workspace_memberships
          SET revoked_at = $3,
              revoked_by = $2
        WHERE workspace_id = $1
          AND user_id = $2`,
      [fixture.workspaceId, fixture.userId, CREATED_AT],
    );
    const render = vi.fn((input: unknown, options: RenderGraphicOptions = {}) =>
      renderGraphic(input, options),
    );
    const worker = new RenderWorker({
      database,
      queue,
      storage,
      workerId: "worker-revoked",
      render,
      clock: new ManualClock(CREATED_AT),
    });
    await expect(worker.processNext()).resolves.toMatchObject({
      kind: "failed",
      code: "RENDER_REVISION_NOT_FOUND",
    });
    expect(render).not.toHaveBeenCalled();
  });

  it("does not render after the workspace is archived", async () => {
    const fixture = await seedRenderJobFixture(database, "worker-archived");
    await enqueue(queue, fixture, "job-worker-archived");
    await database.query(
      `UPDATE workspaces
          SET archived_at = $2
        WHERE id = $1`,
      [fixture.workspaceId, CREATED_AT],
    );
    const render = vi.fn((input: unknown, options: RenderGraphicOptions = {}) =>
      renderGraphic(input, options),
    );
    const worker = new RenderWorker({
      database,
      queue,
      storage,
      workerId: "worker-archived",
      render,
      clock: new ManualClock(CREATED_AT),
    });
    await expect(worker.processNext()).resolves.toMatchObject({
      kind: "failed",
      code: "RENDER_REVISION_NOT_FOUND",
    });
    expect(render).not.toHaveBeenCalled();
  });

  it("treats a completion-time lease race as a lost claim without a second transition", async () => {
    const fixture = await seedRenderJobFixture(database, "worker-lost");
    await enqueue(queue, fixture, "job-worker-lost");
    const retry = vi.fn(queue.retry.bind(queue));
    const fail = vi.fn(queue.fail.bind(queue));
    const lostQueue: RenderQueue = {
      enqueue: queue.enqueue.bind(queue),
      claim: queue.claim.bind(queue),
      retry,
      fail,
      complete: () =>
        Promise.reject(
          new RenderQueueError(
            "JOB_CLAIM_LOST",
            "Another worker reclaimed this attempt.",
          ),
        ),
      inspect: queue.inspect.bind(queue),
      listCompleted: queue.listCompleted.bind(queue),
      ready: queue.ready.bind(queue),
    };
    const worker = new RenderWorker({
      database,
      queue: lostQueue,
      storage,
      workerId: "worker-lost",
      render: (input, options) => renderGraphic(input, options),
      clock: new ManualClock(CREATED_AT),
    });
    await expect(worker.processNext()).resolves.toMatchObject({
      kind: "claim_lost",
      code: "JOB_CLAIM_LOST",
    });
    expect(retry).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });
});

class ManualClock implements RenderWorkerClock {
  #current: Date;

  constructor(now: Date) {
    this.#current = new Date(now);
  }

  now(): Date {
    return new Date(this.#current);
  }

  set(now: Date): void {
    this.#current = new Date(now);
  }
}

async function enqueue(
  queue: PostgresRenderQueue,
  fixture: Awaited<ReturnType<typeof seedRenderJobFixture>>,
  jobId: string,
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
  });
}
