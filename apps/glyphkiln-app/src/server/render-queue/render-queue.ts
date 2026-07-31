export const RENDER_JOB_DEFAULTS = {
  leaseMilliseconds: 60_000,
  maxAttempts: 3,
  maximumLeaseMilliseconds: 15 * 60_000,
  maximumRetryDelayMilliseconds: 24 * 60 * 60_000,
} as const;

export type RenderJobState =
  "claimed" | "completed" | "exhausted" | "failed" | "queued" | "retry_wait";

export type EnqueueRenderJobInput = {
  readonly jobId: string;
  readonly workspaceId: string;
  readonly designId: string;
  readonly revisionId: string;
  readonly requestedBy: string;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly manifestCreationTimestamp: Date;
  readonly maxAttempts?: number;
};

export type EnqueuedRenderJob = {
  readonly jobId: string;
  readonly workspaceId: string;
  readonly state: RenderJobState;
  readonly created: boolean;
};

export type ClaimRenderJobInput = {
  readonly workerId: string;
  readonly now: Date;
  readonly leaseMilliseconds?: number;
};

export type ClaimedRenderJob = {
  readonly jobId: string;
  readonly workspaceId: string;
  readonly designId: string;
  readonly revisionId: string;
  readonly requestedBy: string;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly startedAt: Date;
  readonly leaseExpiresAt: Date;
  readonly manifestCreationTimestamp: Date;
  readonly workerId: string;
};

export type RenderOutputMetadata = {
  readonly format: "png" | "svg";
  readonly mimeType: "image/png" | "image/svg+xml";
  readonly artifactKey: string;
  readonly artifactSha256: string;
  readonly artifactByteSize: number;
  readonly manifestKey: string;
  readonly manifestSha256: string;
  readonly manifestByteSize: number;
  readonly fingerprint: string;
};

export type RenderJobFailure = {
  readonly code: string;
  readonly detail: string;
};

export type RenderRetryDisposition = "exhausted" | "retry_scheduled";

export type RenderJobView = {
  readonly jobId: string;
  readonly workspaceId: string;
  readonly designId: string;
  readonly revisionId: string;
  readonly requestedBy: string;
  readonly state: RenderJobState;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly availableAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly finishedAt?: Date;
  readonly lastError?: RenderJobFailure;
  readonly outputs: readonly RenderOutputMetadata[];
};

export type RenderQueue = {
  enqueue(input: EnqueueRenderJobInput): Promise<EnqueuedRenderJob>;
  claim(input: ClaimRenderJobInput): Promise<ClaimedRenderJob | undefined>;
  retry(
    claim: ClaimedRenderJob,
    failure: RenderJobFailure,
    retryAt: Date,
    finishedAt: Date,
  ): Promise<RenderRetryDisposition>;
  fail(
    claim: ClaimedRenderJob,
    failure: RenderJobFailure,
    finishedAt: Date,
  ): Promise<void>;
  complete(
    claim: ClaimedRenderJob,
    outputs: readonly RenderOutputMetadata[],
    finishedAt: Date,
  ): Promise<void>;
  inspect(workspaceId: string, jobId: string): Promise<RenderJobView | undefined>;
  listCompleted(
    workspaceId: string,
    revisionId: string,
  ): Promise<readonly RenderJobView[]>;
  ready(): Promise<void>;
};

export type RenderQueueErrorCode =
  | "IDEMPOTENCY_CONFLICT"
  | "INSTALLATION_JOB_CAPACITY_REACHED"
  | "INVALID_QUEUE_INPUT"
  | "JOB_CLAIM_LOST"
  | "QUEUE_UNAVAILABLE"
  | "WORKSPACE_JOB_CAPACITY_REACHED";

export class RenderQueueError extends Error {
  constructor(
    public readonly code: RenderQueueErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RenderQueueError";
  }
}

export class RenderQueueCapacityError extends RenderQueueError {
  constructor(public readonly maximumOutstandingJobsPerWorkspace: number) {
    super(
      "WORKSPACE_JOB_CAPACITY_REACHED",
      "The workspace has reached its outstanding render-job capacity.",
    );
    this.name = "RenderQueueCapacityError";
  }
}

export class InstallationRenderQueueCapacityError extends RenderQueueError {
  constructor(public readonly maximumOutstandingJobsPerInstallation: number) {
    super(
      "INSTALLATION_JOB_CAPACITY_REACHED",
      "The installation has reached its outstanding render-job capacity.",
    );
    this.name = "InstallationRenderQueueCapacityError";
  }
}

export function validateEnqueueInput(input: EnqueueRenderJobInput): void {
  assertIdentifier(input.jobId, "jobId", 128);
  assertIdentifier(input.workspaceId, "workspaceId", 128);
  assertIdentifier(input.designId, "designId", 128);
  assertIdentifier(input.revisionId, "revisionId", 128);
  assertIdentifier(input.requestedBy, "requestedBy", 128);
  assertIdentifier(input.idempotencyKey, "idempotencyKey", 160);
  assertValidDate(input.createdAt, "createdAt");
  assertValidDate(input.manifestCreationTimestamp, "manifestCreationTimestamp");
  if (input.manifestCreationTimestamp < input.createdAt) {
    throw invalidInput("manifestCreationTimestamp must not precede job creation.");
  }
  const maxAttempts = input.maxAttempts ?? RENDER_JOB_DEFAULTS.maxAttempts;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw invalidInput("maxAttempts must be an integer from 1 through 10.");
  }
}

export function validateClaimInput(input: ClaimRenderJobInput): number {
  assertIdentifier(input.workerId, "workerId", 160);
  assertValidDate(input.now, "now");
  const leaseMilliseconds =
    input.leaseMilliseconds ?? RENDER_JOB_DEFAULTS.leaseMilliseconds;
  if (
    !Number.isInteger(leaseMilliseconds) ||
    leaseMilliseconds < 1_000 ||
    leaseMilliseconds > RENDER_JOB_DEFAULTS.maximumLeaseMilliseconds
  ) {
    throw invalidInput(
      "leaseMilliseconds must be an integer from 1000 through 900000.",
    );
  }
  return leaseMilliseconds;
}

export function validateFailure(failure: RenderJobFailure): void {
  assertIdentifier(failure.code, "failure.code", 120);
  assertIdentifier(failure.detail, "failure.detail", 500);
}

export function validateOutputs(outputs: readonly RenderOutputMetadata[]): void {
  if (
    outputs.length !== 2 ||
    outputs[0]?.format === outputs[1]?.format ||
    !outputs.some((output) => output.format === "svg") ||
    !outputs.some((output) => output.format === "png")
  ) {
    throw invalidInput("A completed render must contain one SVG and one PNG.");
  }
  for (const output of outputs) {
    const expectedMime = output.format === "svg" ? "image/svg+xml" : "image/png";
    if (output.mimeType !== expectedMime) {
      throw invalidInput("Render output format and media type do not match.");
    }
    assertIdentifier(output.artifactKey, "artifactKey", 512);
    assertIdentifier(output.manifestKey, "manifestKey", 512);
    assertHash(output.artifactSha256, "artifactSha256");
    assertHash(output.manifestSha256, "manifestSha256");
    assertIdentifier(output.fingerprint, "fingerprint", 160);
    if (
      !Number.isSafeInteger(output.artifactByteSize) ||
      output.artifactByteSize < 1 ||
      !Number.isSafeInteger(output.manifestByteSize) ||
      output.manifestByteSize < 1
    ) {
      throw invalidInput("Render output byte sizes must be positive integers.");
    }
  }
}

export function validateTransitionTimes(
  claim: ClaimedRenderJob,
  finishedAt: Date,
  retryAt?: Date,
): void {
  assertValidDate(finishedAt, "finishedAt");
  if (finishedAt < claim.startedAt) {
    throw invalidInput("finishedAt must not precede the claimed attempt.");
  }
  if (retryAt === undefined) return;
  assertValidDate(retryAt, "retryAt");
  const delay = retryAt.getTime() - finishedAt.getTime();
  if (delay < 0 || delay > RENDER_JOB_DEFAULTS.maximumRetryDelayMilliseconds) {
    throw invalidInput("retryAt must be within 24 hours after finishedAt.");
  }
}

function assertIdentifier(input: string, field: string, maximum: number): void {
  if (
    input.trim().length < 1 ||
    input.length > maximum ||
    (typeof input.isWellFormed === "function" && !input.isWellFormed())
  ) {
    throw invalidInput(
      `${field} must contain from 1 through ${String(maximum)} valid characters.`,
    );
  }
}

function assertHash(input: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(input)) {
    throw invalidInput(`${field} must be a lowercase SHA-256 digest.`);
  }
}

function assertValidDate(input: Date, field: string): void {
  if (!(input instanceof Date) || !Number.isFinite(input.getTime())) {
    throw invalidInput(`${field} must be a valid date.`);
  }
}

function invalidInput(message: string): RenderQueueError {
  return new RenderQueueError("INVALID_QUEUE_INPUT", message);
}
