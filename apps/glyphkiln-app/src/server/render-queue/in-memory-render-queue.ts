import {
  RenderQueueError,
  type ClaimedRenderJob,
  type ClaimRenderJobInput,
  type EnqueuedRenderJob,
  type EnqueueRenderJobInput,
  type RenderJobFailure,
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

type MemoryJob = Omit<RenderJobView, "outputs"> & {
  readonly idempotencyKey: string;
  readonly outputs: RenderOutputMetadata[];
  readonly claimed?: ClaimedRenderJob;
};

export class InMemoryRenderQueue implements RenderQueue {
  readonly #jobs = new Map<string, MemoryJob>();
  readonly #idempotency = new Map<string, string>();

  enqueue(input: EnqueueRenderJobInput): Promise<EnqueuedRenderJob> {
    validateEnqueueInput(input);
    const idempotency = scoped(input.workspaceId, input.idempotencyKey);
    const existingJobId = this.#idempotency.get(idempotency);
    if (existingJobId !== undefined) {
      const existing = this.#jobs.get(existingJobId);
      if (
        existing?.designId !== input.designId ||
        existing.revisionId !== input.revisionId ||
        existing.requestedBy !== input.requestedBy ||
        existing.maxAttempts !== (input.maxAttempts ?? 3)
      ) {
        throw new RenderQueueError(
          "IDEMPOTENCY_CONFLICT",
          "The render idempotency key is already bound to another request.",
        );
      }
      return Promise.resolve({
        jobId: existing.jobId,
        workspaceId: existing.workspaceId,
        state: existing.state,
        created: false,
      });
    }
    if (this.#jobs.has(input.jobId)) {
      throw new RenderQueueError(
        "IDEMPOTENCY_CONFLICT",
        "The render-job identity is already in use.",
      );
    }
    const job: MemoryJob = {
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      designId: input.designId,
      revisionId: input.revisionId,
      requestedBy: input.requestedBy,
      idempotencyKey: input.idempotencyKey,
      manifestCreationTimestamp: copyDate(input.manifestCreationTimestamp),
      state: "queued",
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: copyDate(input.createdAt),
      createdAt: copyDate(input.createdAt),
      updatedAt: copyDate(input.createdAt),
      outputs: [],
    };
    this.#jobs.set(job.jobId, job);
    this.#idempotency.set(idempotency, job.jobId);
    return Promise.resolve({
      jobId: job.jobId,
      workspaceId: job.workspaceId,
      state: job.state,
      created: true,
    });
  }

  claim(input: ClaimRenderJobInput): Promise<ClaimedRenderJob | undefined> {
    const leaseMilliseconds = validateClaimInput(input);
    for (const [id, job] of this.#jobs) {
      if (
        job.state === "claimed" &&
        job.claimed !== undefined &&
        job.claimed.leaseExpiresAt <= input.now &&
        job.attemptCount >= job.maxAttempts
      ) {
        this.#jobs.set(id, {
          ...job,
          state: "exhausted",
          updatedAt: copyDate(input.now),
          finishedAt: copyDate(input.now),
          lastError: {
            code: "WORKER_LEASE_EXPIRED",
            detail: "The worker lease expired before the final attempt completed.",
          },
          claimed: undefined,
        });
      }
    }
    const candidate = [...this.#jobs.values()]
      .filter(
        (job) =>
          job.attemptCount < job.maxAttempts &&
          ((job.state === "queued" || job.state === "retry_wait") &&
          job.availableAt <= input.now
            ? true
            : job.state === "claimed" &&
              job.claimed !== undefined &&
              job.claimed.leaseExpiresAt <= input.now),
      )
      .sort(
        (left, right) =>
          left.availableAt.getTime() - right.availableAt.getTime() ||
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.jobId.localeCompare(right.jobId),
      )
      .at(0);
    if (candidate === undefined) return Promise.resolve(undefined);
    const claim: ClaimedRenderJob = {
      jobId: candidate.jobId,
      workspaceId: candidate.workspaceId,
      designId: candidate.designId,
      revisionId: candidate.revisionId,
      requestedBy: candidate.requestedBy,
      attemptNumber: candidate.attemptCount + 1,
      maxAttempts: candidate.maxAttempts,
      startedAt: copyDate(input.now),
      leaseExpiresAt: new Date(input.now.getTime() + leaseMilliseconds),
      manifestCreationTimestamp: copyDate(candidate.manifestCreationTimestamp),
      workerId: input.workerId,
    };
    this.#jobs.set(candidate.jobId, {
      ...candidate,
      state: "claimed",
      attemptCount: claim.attemptNumber,
      updatedAt: copyDate(input.now),
      finishedAt: undefined,
      claimed: claim,
    });
    return Promise.resolve(cloneClaim(claim));
  }

  retry(
    claim: ClaimedRenderJob,
    failure: RenderJobFailure,
    retryAt: Date,
    finishedAt: Date,
  ): Promise<RenderRetryDisposition> {
    validateFailure(failure);
    validateTransitionTimes(claim, finishedAt, retryAt);
    const job = this.#ownedClaim(claim);
    const exhausted = job.attemptCount >= job.maxAttempts;
    this.#jobs.set(job.jobId, {
      ...job,
      state: exhausted ? "exhausted" : "retry_wait",
      availableAt: copyDate(retryAt),
      updatedAt: copyDate(finishedAt),
      ...(exhausted ? { finishedAt: copyDate(finishedAt) } : {}),
      lastError: { ...failure },
      claimed: undefined,
    });
    return Promise.resolve(exhausted ? "exhausted" : "retry_scheduled");
  }

  fail(
    claim: ClaimedRenderJob,
    failure: RenderJobFailure,
    finishedAt: Date,
  ): Promise<void> {
    validateFailure(failure);
    validateTransitionTimes(claim, finishedAt);
    const job = this.#ownedClaim(claim);
    this.#jobs.set(job.jobId, {
      ...job,
      state: "failed",
      updatedAt: copyDate(finishedAt),
      finishedAt: copyDate(finishedAt),
      lastError: { ...failure },
      claimed: undefined,
    });
    return Promise.resolve();
  }

  complete(
    claim: ClaimedRenderJob,
    outputs: readonly RenderOutputMetadata[],
    finishedAt: Date,
  ): Promise<void> {
    validateOutputs(outputs);
    validateTransitionTimes(claim, finishedAt);
    const job = this.#ownedClaim(claim);
    this.#jobs.set(job.jobId, {
      ...job,
      state: "completed",
      updatedAt: copyDate(finishedAt),
      finishedAt: copyDate(finishedAt),
      lastError: undefined,
      outputs: outputs.map((output) => ({ ...output })),
      claimed: undefined,
    });
    return Promise.resolve();
  }

  inspect(workspaceId: string, jobId: string): Promise<RenderJobView | undefined> {
    const job = this.#jobs.get(jobId);
    if (job?.workspaceId !== workspaceId) return Promise.resolve(undefined);
    return Promise.resolve(cloneView(job));
  }

  listCompleted(
    workspaceId: string,
    revisionId: string,
  ): Promise<readonly RenderJobView[]> {
    const jobs = [...this.#jobs.values()]
      .filter(
        (job) =>
          job.workspaceId === workspaceId &&
          job.revisionId === revisionId &&
          job.state === "completed",
      )
      .sort(compareCompletedJobs)
      .slice(0, 20)
      .map(cloneView);
    return Promise.resolve(jobs);
  }

  async ready(): Promise<void> {
    return Promise.resolve();
  }

  #ownedClaim(claim: ClaimedRenderJob): MemoryJob {
    const job = this.#jobs.get(claim.jobId);
    if (
      job?.workspaceId !== claim.workspaceId ||
      job.state !== "claimed" ||
      job.claimed?.workerId !== claim.workerId ||
      job.claimed.attemptNumber !== claim.attemptNumber
    ) {
      throw new RenderQueueError(
        "JOB_CLAIM_LOST",
        "The render job is no longer owned by this worker attempt.",
      );
    }
    return job;
  }
}

function cloneClaim(claim: ClaimedRenderJob): ClaimedRenderJob {
  return {
    ...claim,
    startedAt: copyDate(claim.startedAt),
    leaseExpiresAt: copyDate(claim.leaseExpiresAt),
    manifestCreationTimestamp: copyDate(claim.manifestCreationTimestamp),
  };
}

function cloneView(job: MemoryJob): RenderJobView {
  return {
    jobId: job.jobId,
    workspaceId: job.workspaceId,
    designId: job.designId,
    revisionId: job.revisionId,
    requestedBy: job.requestedBy,
    state: job.state,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    availableAt: copyDate(job.availableAt),
    createdAt: copyDate(job.createdAt),
    manifestCreationTimestamp: copyDate(job.manifestCreationTimestamp),
    updatedAt: copyDate(job.updatedAt),
    ...(job.finishedAt === undefined ? {} : { finishedAt: copyDate(job.finishedAt) }),
    ...(job.lastError === undefined ? {} : { lastError: { ...job.lastError } }),
    outputs: job.outputs.map((output) => ({ ...output })),
  };
}

function compareCompletedJobs(left: MemoryJob, right: MemoryJob): number {
  const finishedDifference =
    (right.finishedAt?.getTime() ?? 0) - (left.finishedAt?.getTime() ?? 0);
  if (finishedDifference !== 0) return finishedDifference;
  const createdDifference = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdDifference !== 0) return createdDifference;
  if (left.jobId === right.jobId) return 0;
  return left.jobId < right.jobId ? 1 : -1;
}

function scoped(workspaceId: string, value: string): string {
  return `${workspaceId}\u0000${value}`;
}

function copyDate(input: Date): Date {
  return new Date(input.getTime());
}
