import type { SqlDatabase, SqlRow, SqlTransaction } from "../persistence/database";
import {
  InstallationRenderQueueCapacityError,
  RENDER_JOB_DEFAULTS,
  RenderQueueCapacityError,
  RenderQueueError,
  type ClaimedRenderJob,
  type ClaimRenderJobInput,
  type EnqueuedRenderJob,
  type EnqueueRenderJobInput,
  type RenderJobFailure,
  type RenderJobState,
  type RenderJobView,
  type RenderOutputMetadata,
  type RenderQueue,
  type RenderRetryDisposition,
  validateClaimInput,
  validateEnqueueInput,
  validateFailure,
  validateOutputs,
  validateTransitionTimes,
} from "./render-queue";

type JobRow = {
  id: string;
  workspace_id: string;
  design_id: string;
  revision_id: string;
  requested_by: string;
  idempotency_key: string;
  state: RenderJobState;
  attempt_count: number | string;
  max_attempts: number | string;
  available_at: Date | string;
  manifest_creation_timestamp: Date | string;
  claimed_by: string | null;
  claimed_at: Date | string | null;
  lease_expires_at: Date | string | null;
  last_error_code: string | null;
  last_error_detail: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  finished_at: Date | string | null;
};

type OutputRow = {
  format: "png" | "svg";
  mime_type: "image/png" | "image/svg+xml";
  artifact_key: string;
  artifact_sha256: string;
  artifact_byte_size: number | string;
  manifest_key: string;
  manifest_sha256: string;
  manifest_byte_size: number | string;
  fingerprint: string;
};

type CountRow = {
  count: number | string;
};

export type PostgresRenderQueueOptions = {
  readonly maximumOutstandingJobsPerInstallation?: number;
  readonly maximumOutstandingJobsPerWorkspace?: number;
};

const DEFAULT_MAXIMUM_OUTSTANDING_JOBS_PER_INSTALLATION = 1_000;
const DEFAULT_MAXIMUM_OUTSTANDING_JOBS_PER_WORKSPACE = 100;
const MAXIMUM_CONFIGURABLE_OUTSTANDING_JOBS_PER_INSTALLATION = 100_000;
const MAXIMUM_CONFIGURABLE_OUTSTANDING_JOBS_PER_WORKSPACE = 10_000;

export class PostgresRenderQueue implements RenderQueue {
  readonly #database: SqlDatabase;
  readonly #maximumOutstandingJobsPerInstallation: number;
  readonly #maximumOutstandingJobsPerWorkspace: number;

  constructor(database: SqlDatabase, options: PostgresRenderQueueOptions = {}) {
    this.#database = database;
    this.#maximumOutstandingJobsPerInstallation =
      validateMaximumOutstandingJobsPerInstallation(
        options.maximumOutstandingJobsPerInstallation ??
          DEFAULT_MAXIMUM_OUTSTANDING_JOBS_PER_INSTALLATION,
      );
    this.#maximumOutstandingJobsPerWorkspace =
      validateMaximumOutstandingJobsPerWorkspace(
        options.maximumOutstandingJobsPerWorkspace ??
          DEFAULT_MAXIMUM_OUTSTANDING_JOBS_PER_WORKSPACE,
      );
  }

  async enqueue(input: EnqueueRenderJobInput): Promise<EnqueuedRenderJob> {
    validateEnqueueInput(input);
    const maxAttempts = input.maxAttempts ?? RENDER_JOB_DEFAULTS.maxAttempts;
    return this.#database.transaction(async (transaction) => {
      await lockInstallationQueueCapacity(transaction);
      await lockWorkspaceSchedule(transaction, input.workspaceId);
      const existing = await transaction.query<JobRow>(
        `SELECT *
           FROM render_jobs
          WHERE workspace_id = $1
            AND idempotency_key = $2
          FOR UPDATE`,
        [input.workspaceId, input.idempotencyKey],
      );
      const existingRow = existing.at(0);
      if (existingRow !== undefined) {
        assertIdempotentReplay(existingRow, input, maxAttempts);
        return enqueuedJob(existingRow, false);
      }

      const workspaceOutstanding = await transaction.query<CountRow>(
        `SELECT count(*)::integer AS count
           FROM render_jobs
          WHERE workspace_id = $1
            AND state IN ('queued', 'retry_wait', 'claimed')`,
        [input.workspaceId],
      );
      if (
        Number(workspaceOutstanding.at(0)?.count ?? 0) >=
        this.#maximumOutstandingJobsPerWorkspace
      ) {
        throw new RenderQueueCapacityError(this.#maximumOutstandingJobsPerWorkspace);
      }
      const installationOutstanding = await transaction.query<CountRow>(
        `SELECT count(*)::integer AS count
           FROM render_jobs
          WHERE state IN ('queued', 'retry_wait', 'claimed')`,
      );
      if (
        Number(installationOutstanding.at(0)?.count ?? 0) >=
        this.#maximumOutstandingJobsPerInstallation
      ) {
        throw new InstallationRenderQueueCapacityError(
          this.#maximumOutstandingJobsPerInstallation,
        );
      }

      const inserted = await transaction.query<JobRow>(
        `INSERT INTO render_jobs (
           id,
           workspace_id,
           design_id,
           revision_id,
           requested_by,
           idempotency_key,
           state,
           attempt_count,
           max_attempts,
           available_at,
           manifest_creation_timestamp,
           created_at,
           updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, 'queued', 0, $7, $8, $9, $8, $8
         )
         RETURNING *`,
        [
          input.jobId,
          input.workspaceId,
          input.designId,
          input.revisionId,
          input.requestedBy,
          input.idempotencyKey,
          maxAttempts,
          input.createdAt,
          input.manifestCreationTimestamp,
        ],
      );
      return enqueuedJob(requireRow(inserted), true);
    });
  }

  async claim(input: ClaimRenderJobInput): Promise<ClaimedRenderJob | undefined> {
    const leaseMilliseconds = validateClaimInput(input);
    const leaseExpiresAt = new Date(input.now.getTime() + leaseMilliseconds);
    return this.#database.transaction(async (transaction) => {
      await exhaustExpiredFinalAttempts(transaction, input.now);
      const candidates = await transaction.query<JobRow>(
        `WITH workspace_candidates AS (
           SELECT DISTINCT ON (workspace_id)
                  workspace_id,
                  id
             FROM render_jobs
            WHERE attempt_count < max_attempts
              AND (
                (
                  state IN ('queued', 'retry_wait')
                  AND available_at <= $1
                )
                OR (
                  state = 'claimed'
                  AND lease_expires_at <= $1
                )
              )
            ORDER BY workspace_id, created_at, id, available_at
         )
         SELECT jobs.*
           FROM workspace_candidates AS candidate
           JOIN render_jobs AS jobs
             ON jobs.workspace_id = candidate.workspace_id
            AND jobs.id = candidate.id
           JOIN render_workspace_queue_schedules AS schedule
             ON schedule.workspace_id = candidate.workspace_id
          ORDER BY
            schedule.last_claim_order,
            schedule.workspace_id,
            jobs.available_at,
            jobs.created_at,
            jobs.id
          FOR UPDATE OF jobs, schedule SKIP LOCKED
          LIMIT 1`,
        [input.now],
      );
      const candidate = candidates.at(0);
      if (candidate === undefined) return undefined;
      if (candidate.state === "claimed") {
        await insertAbandonedAttempt(transaction, candidate, input.now);
      }
      const nextAttempt = Number(candidate.attempt_count) + 1;
      const claimed = await transaction.query<JobRow>(
        `UPDATE render_jobs
            SET state = 'claimed',
                attempt_count = $3,
                claimed_by = $4,
                claimed_at = $5,
                lease_expires_at = $6,
                updated_at = $5,
                finished_at = NULL
          WHERE workspace_id = $1
            AND id = $2
        RETURNING *`,
        [
          candidate.workspace_id,
          candidate.id,
          nextAttempt,
          input.workerId,
          input.now,
          leaseExpiresAt,
        ],
      );
      await transaction.query(
        `UPDATE render_workspace_queue_schedules
            SET last_claim_order = nextval('render_claim_order_sequence')
          WHERE workspace_id = $1`,
        [candidate.workspace_id],
      );
      return claimedRenderJob(requireRow(claimed));
    });
  }

  async retry(
    claim: ClaimedRenderJob,
    failure: RenderJobFailure,
    retryAt: Date,
    finishedAt: Date,
  ): Promise<RenderRetryDisposition> {
    validateFailure(failure);
    validateTransitionTimes(claim, finishedAt, retryAt);
    return this.#database.transaction(async (transaction) => {
      const locked = await lockClaim(transaction, claim, finishedAt);
      const exhausted = Number(locked.attempt_count) >= Number(locked.max_attempts);
      const outcome = exhausted ? "exhausted" : "retry_scheduled";
      await insertAttempt(transaction, locked, outcome, finishedAt, failure);
      await transaction.query(
        `UPDATE render_jobs
            SET state = $4,
                available_at = $5,
                claimed_by = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                last_error_code = $6,
                last_error_detail = $7,
                updated_at = $8,
                finished_at = $9
          WHERE workspace_id = $1
            AND id = $2
            AND attempt_count = $3`,
        [
          claim.workspaceId,
          claim.jobId,
          claim.attemptNumber,
          exhausted ? "exhausted" : "retry_wait",
          retryAt,
          failure.code,
          failure.detail,
          finishedAt,
          exhausted ? finishedAt : null,
        ],
      );
      return outcome;
    });
  }

  async fail(
    claim: ClaimedRenderJob,
    failure: RenderJobFailure,
    finishedAt: Date,
  ): Promise<void> {
    validateFailure(failure);
    validateTransitionTimes(claim, finishedAt);
    await this.#database.transaction(async (transaction) => {
      const locked = await lockClaim(transaction, claim, finishedAt);
      await insertAttempt(transaction, locked, "failed", finishedAt, failure);
      await transaction.query(
        `UPDATE render_jobs
            SET state = 'failed',
                claimed_by = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                last_error_code = $4,
                last_error_detail = $5,
                updated_at = $6,
                finished_at = $6
          WHERE workspace_id = $1
            AND id = $2
            AND attempt_count = $3`,
        [
          claim.workspaceId,
          claim.jobId,
          claim.attemptNumber,
          failure.code,
          failure.detail,
          finishedAt,
        ],
      );
    });
  }

  async complete(
    claim: ClaimedRenderJob,
    outputs: readonly RenderOutputMetadata[],
    finishedAt: Date,
  ): Promise<void> {
    validateOutputs(outputs);
    validateTransitionTimes(claim, finishedAt);
    await this.#database.transaction(async (transaction) => {
      const locked = await lockClaim(transaction, claim, finishedAt);
      for (const output of outputs) {
        await transaction.query(
          `INSERT INTO render_outputs (
             workspace_id,
             job_id,
             format,
             mime_type,
             artifact_key,
             artifact_sha256,
             artifact_byte_size,
             manifest_key,
             manifest_sha256,
             manifest_byte_size,
             fingerprint,
             created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
           )`,
          [
            claim.workspaceId,
            claim.jobId,
            output.format,
            output.mimeType,
            output.artifactKey,
            output.artifactSha256,
            output.artifactByteSize,
            output.manifestKey,
            output.manifestSha256,
            output.manifestByteSize,
            output.fingerprint,
            finishedAt,
          ],
        );
      }
      await insertAttempt(transaction, locked, "completed", finishedAt);
      await transaction.query(
        `UPDATE render_jobs
            SET state = 'completed',
                claimed_by = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                last_error_code = NULL,
                last_error_detail = NULL,
                updated_at = $4,
                finished_at = $4
          WHERE workspace_id = $1
            AND id = $2
            AND attempt_count = $3`,
        [claim.workspaceId, claim.jobId, claim.attemptNumber, finishedAt],
      );
    });
  }

  async inspect(
    workspaceId: string,
    jobId: string,
  ): Promise<RenderJobView | undefined> {
    const jobs = await this.#database.query<JobRow>(
      `SELECT *
         FROM render_jobs
        WHERE workspace_id = $1
          AND id = $2`,
      [workspaceId, jobId],
    );
    const job = jobs.at(0);
    if (job === undefined) return undefined;
    const outputs = await this.#database.query<OutputRow>(
      `SELECT format,
              mime_type,
              artifact_key,
              artifact_sha256,
              artifact_byte_size,
              manifest_key,
              manifest_sha256,
              manifest_byte_size,
              fingerprint
         FROM render_outputs
        WHERE workspace_id = $1
          AND job_id = $2
        ORDER BY format`,
      [workspaceId, jobId],
    );
    return jobView(job, outputs);
  }

  async ready(): Promise<void> {
    try {
      await this.#database.query("SELECT 1 AS ready FROM render_jobs LIMIT 1");
      await this.#database.query(
        "SELECT 1 AS ready FROM render_workspace_queue_schedules LIMIT 1",
      );
      await this.#database.query(
        "SELECT last_value AS ready FROM render_claim_order_sequence",
      );
    } catch {
      throw new RenderQueueError(
        "QUEUE_UNAVAILABLE",
        "The durable render queue is unavailable or not migrated.",
      );
    }
  }
}

async function lockWorkspaceSchedule(
  transaction: SqlTransaction,
  workspaceId: string,
): Promise<void> {
  await transaction.query(
    `INSERT INTO render_workspace_queue_schedules (
       workspace_id,
       last_claim_order
     )
     VALUES ($1, nextval('render_claim_order_sequence'))
     ON CONFLICT (workspace_id) DO NOTHING`,
    [workspaceId],
  );
  const schedules = await transaction.query(
    `SELECT workspace_id
       FROM render_workspace_queue_schedules
      WHERE workspace_id = $1
      FOR UPDATE`,
    [workspaceId],
  );
  if (schedules.length !== 1) {
    throw new RenderQueueError(
      "QUEUE_UNAVAILABLE",
      "The durable queue could not lock the workspace schedule.",
    );
  }
}

async function lockInstallationQueueCapacity(
  transaction: SqlTransaction,
): Promise<void> {
  const installation = await transaction.query(
    `SELECT singleton
       FROM installation_state
      WHERE singleton = TRUE
      FOR UPDATE`,
  );
  if (installation.length !== 1) {
    throw new RenderQueueError(
      "QUEUE_UNAVAILABLE",
      "The durable queue could not lock installation capacity.",
    );
  }
}

function assertIdempotentReplay(
  row: JobRow,
  input: EnqueueRenderJobInput,
  maxAttempts: number,
): void {
  if (
    row.design_id !== input.designId ||
    row.revision_id !== input.revisionId ||
    row.requested_by !== input.requestedBy ||
    Number(row.max_attempts) !== maxAttempts
  ) {
    throw new RenderQueueError(
      "IDEMPOTENCY_CONFLICT",
      "The render idempotency key is already bound to another request.",
    );
  }
}

function enqueuedJob(row: JobRow, created: boolean): EnqueuedRenderJob {
  return {
    jobId: row.id,
    workspaceId: row.workspace_id,
    state: row.state,
    created,
  };
}

function validateMaximumOutstandingJobsPerWorkspace(input: number): number {
  if (
    !Number.isInteger(input) ||
    input < 1 ||
    input > MAXIMUM_CONFIGURABLE_OUTSTANDING_JOBS_PER_WORKSPACE
  ) {
    throw new RangeError(
      "maximumOutstandingJobsPerWorkspace must be an integer from 1 through 10000.",
    );
  }
  return input;
}

function validateMaximumOutstandingJobsPerInstallation(input: number): number {
  if (
    !Number.isInteger(input) ||
    input < 1 ||
    input > MAXIMUM_CONFIGURABLE_OUTSTANDING_JOBS_PER_INSTALLATION
  ) {
    throw new RangeError(
      "maximumOutstandingJobsPerInstallation must be an integer from 1 through 100000.",
    );
  }
  return input;
}

async function exhaustExpiredFinalAttempts(
  transaction: SqlTransaction,
  now: Date,
): Promise<void> {
  const rows = await transaction.query<JobRow>(
    `SELECT *
       FROM render_jobs
      WHERE state = 'claimed'
        AND lease_expires_at <= $1
        AND attempt_count >= max_attempts
      ORDER BY lease_expires_at, id
      FOR UPDATE SKIP LOCKED`,
    [now],
  );
  for (const row of rows) {
    const failure = {
      code: "WORKER_LEASE_EXPIRED",
      detail: "The worker lease expired before the final attempt completed.",
    };
    await insertAttempt(transaction, row, "abandoned", now, failure);
    await transaction.query(
      `UPDATE render_jobs
          SET state = 'exhausted',
              claimed_by = NULL,
              claimed_at = NULL,
              lease_expires_at = NULL,
              last_error_code = $3,
              last_error_detail = $4,
              updated_at = $5,
              finished_at = $5
        WHERE workspace_id = $1
          AND id = $2`,
      [row.workspace_id, row.id, failure.code, failure.detail, now],
    );
  }
}

async function insertAbandonedAttempt(
  transaction: SqlTransaction,
  row: JobRow,
  finishedAt: Date,
): Promise<void> {
  await insertAttempt(transaction, row, "abandoned", finishedAt, {
    code: "WORKER_LEASE_EXPIRED",
    detail: "The worker lease expired before the attempt completed.",
  });
}

async function lockClaim(
  transaction: SqlTransaction,
  claim: ClaimedRenderJob,
  finishedAt: Date,
): Promise<JobRow> {
  const rows = await transaction.query<JobRow>(
    `SELECT *
       FROM render_jobs
      WHERE workspace_id = $1
        AND id = $2
        AND state = 'claimed'
        AND attempt_count = $3
        AND claimed_by = $4
        AND lease_expires_at >= $5
      FOR UPDATE`,
    [claim.workspaceId, claim.jobId, claim.attemptNumber, claim.workerId, finishedAt],
  );
  const row = rows.at(0);
  if (row === undefined) {
    throw new RenderQueueError(
      "JOB_CLAIM_LOST",
      "The render job is no longer owned by this worker attempt.",
    );
  }
  return row;
}

async function insertAttempt(
  transaction: SqlTransaction,
  row: JobRow,
  outcome: "abandoned" | "completed" | "exhausted" | "failed" | "retry_scheduled",
  finishedAt: Date,
  failure?: RenderJobFailure,
): Promise<void> {
  await transaction.query(
    `INSERT INTO render_attempts (
       workspace_id,
       job_id,
       attempt_number,
       worker_id,
       outcome,
       error_code,
       error_detail,
       started_at,
       finished_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.workspace_id,
      row.id,
      Number(row.attempt_count),
      row.claimed_by ?? "unknown-worker",
      outcome,
      failure?.code ?? null,
      failure?.detail ?? null,
      row.claimed_at ?? finishedAt,
      finishedAt,
    ],
  );
}

function claimedRenderJob(row: JobRow): ClaimedRenderJob {
  if (
    row.claimed_by === null ||
    row.claimed_at === null ||
    row.lease_expires_at === null
  ) {
    throw new RenderQueueError(
      "QUEUE_UNAVAILABLE",
      "The durable queue returned an incomplete claim.",
    );
  }
  return {
    jobId: row.id,
    workspaceId: row.workspace_id,
    designId: row.design_id,
    revisionId: row.revision_id,
    requestedBy: row.requested_by,
    attemptNumber: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    startedAt: asDate(row.claimed_at),
    leaseExpiresAt: asDate(row.lease_expires_at),
    manifestCreationTimestamp: asDate(row.manifest_creation_timestamp),
    workerId: row.claimed_by,
  };
}

function jobView(row: JobRow, outputs: readonly OutputRow[]): RenderJobView {
  return {
    jobId: row.id,
    workspaceId: row.workspace_id,
    designId: row.design_id,
    revisionId: row.revision_id,
    requestedBy: row.requested_by,
    state: row.state,
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    availableAt: asDate(row.available_at),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
    ...(row.finished_at === null ? {} : { finishedAt: asDate(row.finished_at) }),
    ...(row.last_error_code === null || row.last_error_detail === null
      ? {}
      : {
          lastError: {
            code: row.last_error_code,
            detail: row.last_error_detail,
          },
        }),
    outputs: outputs.map((output) => ({
      format: output.format,
      mimeType: output.mime_type,
      artifactKey: output.artifact_key,
      artifactSha256: output.artifact_sha256,
      artifactByteSize: Number(output.artifact_byte_size),
      manifestKey: output.manifest_key,
      manifestSha256: output.manifest_sha256,
      manifestByteSize: Number(output.manifest_byte_size),
      fingerprint: output.fingerprint,
    })),
  };
}

function requireRow<Row extends SqlRow>(rows: Row[]): Row {
  const row = rows.at(0);
  if (row === undefined) {
    throw new RenderQueueError(
      "QUEUE_UNAVAILABLE",
      "The durable queue did not return the updated render job.",
    );
  }
  return row;
}

function asDate(input: Date | string): Date {
  return input instanceof Date ? input : new Date(input);
}
