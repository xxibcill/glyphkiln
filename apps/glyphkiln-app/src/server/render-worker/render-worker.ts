import {
  canonicalJson,
  GlyphkilnError,
  renderGraphicIsolated,
  verifyRenderReproduction,
  type DesignDocument,
  type RenderGraphicResult,
} from "@glyphkiln/core";

import type { SqlDatabase } from "../persistence/database";
import {
  RenderQueueError,
  type ClaimedRenderJob,
  type RenderJobFailure,
  type RenderOutputMetadata,
  type RenderQueue,
} from "../render-queue";
import { RenderBlobStorageError, type RenderBlobStorage } from "../storage";
import { loadAuthorizedRenderRevision, RenderRevisionError } from "./revision-loader";
import {
  BuiltInRenderResourceResolver,
  RenderResourceResolutionError,
  type RenderResourceResolver,
} from "./resource-resolver";

const TRANSIENT_CORE_CODES = new Set([
  "RENDER_PROCESS_EXITED",
  "RENDER_PROCESS_FAILED",
  "RENDER_PROCESS_IPC_FAILED",
  "RENDER_PROCESS_NOT_BUILT",
  "RENDER_TIMEOUT",
]);

const RETRY_BASE_MILLISECONDS = 1_000;
const RETRY_MAX_MILLISECONDS = 60_000;
const MANIFEST_MEDIA_TYPE = "application/vnd.glyphkiln.manifest+json" as const;

export type RenderWorkerClock = {
  now(): Date;
};

export type RenderWorkerLogger = {
  info(event: RenderWorkerLogEvent): void;
  error(event: RenderWorkerLogEvent): void;
};

export type RenderWorkerLogEvent = {
  readonly event: string;
  readonly jobId?: string;
  readonly workspaceId?: string;
  readonly attempt?: number;
  readonly state?: string;
  readonly code?: string;
};

export type RenderWorkerDependencies = {
  readonly database: SqlDatabase;
  readonly queue: RenderQueue;
  readonly storage: RenderBlobStorage;
  readonly workerId: string;
  readonly resourceResolver?: RenderResourceResolver;
  readonly render?: typeof renderGraphicIsolated;
  readonly clock?: RenderWorkerClock;
  readonly logger?: RenderWorkerLogger;
  readonly leaseMilliseconds?: number;
};

export type RenderWorkerTick =
  | { readonly kind: "idle" }
  | {
      readonly kind: "completed";
      readonly jobId: string;
      readonly workspaceId: string;
    }
  | {
      readonly kind: "failed";
      readonly jobId: string;
      readonly workspaceId: string;
      readonly code: string;
    }
  | {
      readonly kind: "claim_lost";
      readonly jobId: string;
      readonly workspaceId: string;
      readonly code: "JOB_CLAIM_LOST";
    }
  | {
      readonly kind: "retry_scheduled" | "exhausted";
      readonly jobId: string;
      readonly workspaceId: string;
      readonly code: string;
    };

export class RenderWorker {
  readonly #database: SqlDatabase;
  readonly #queue: RenderQueue;
  readonly #storage: RenderBlobStorage;
  readonly #workerId: string;
  readonly #resourceResolver: RenderResourceResolver;
  readonly #render: typeof renderGraphicIsolated;
  readonly #clock: RenderWorkerClock;
  readonly #logger: RenderWorkerLogger;
  readonly #leaseMilliseconds: number | undefined;

  constructor(dependencies: RenderWorkerDependencies) {
    this.#database = dependencies.database;
    this.#queue = dependencies.queue;
    this.#storage = dependencies.storage;
    this.#workerId = dependencies.workerId;
    this.#resourceResolver =
      dependencies.resourceResolver ?? new BuiltInRenderResourceResolver();
    this.#render = dependencies.render ?? renderGraphicIsolated;
    this.#clock = dependencies.clock ?? { now: () => new Date() };
    this.#logger = dependencies.logger ?? silentLogger;
    this.#leaseMilliseconds = dependencies.leaseMilliseconds;
  }

  async processNext(): Promise<RenderWorkerTick> {
    const claim = await this.#queue.claim({
      workerId: this.#workerId,
      now: this.#clock.now(),
      ...(this.#leaseMilliseconds === undefined
        ? {}
        : { leaseMilliseconds: this.#leaseMilliseconds }),
    });
    if (claim === undefined) return { kind: "idle" };
    this.#logger.info(logEvent("render_job_claimed", claim));
    try {
      const document = await loadAuthorizedRenderRevision(this.#database, claim);
      const resources = await this.#resourceResolver.resolve({
        workspaceId: claim.workspaceId,
        document,
      });
      const rendered = await this.#render(
        document,
        {
          formats: ["svg", "png"],
          assets: resources.assets,
          fonts: resources.fonts,
          creationTimestamp: claim.manifestCreationTimestamp.toISOString(),
        },
        {},
      );
      const outputs = await this.#storeVerifiedOutputs(claim, document, rendered);
      const finishedAt = this.#clock.now();
      await this.#queue.complete(claim, outputs, finishedAt);
      this.#logger.info({
        ...logEvent("render_job_completed", claim),
        state: "completed",
      });
      return {
        kind: "completed",
        jobId: claim.jobId,
        workspaceId: claim.workspaceId,
      };
    } catch (error) {
      return this.#handleFailure(claim, error);
    }
  }

  async #storeVerifiedOutputs(
    claim: ClaimedRenderJob,
    document: DesignDocument,
    rendered: RenderGraphicResult,
  ): Promise<RenderOutputMetadata[]> {
    if (
      canonicalJson(rendered.document) !== canonicalJson(document) ||
      rendered.outputs.length !== 2
    ) {
      throw new RenderOutputIntegrityError();
    }
    const formats = new Set(rendered.outputs.map((output) => output.format));
    if (!formats.has("svg") || !formats.has("png")) {
      throw new RenderOutputIntegrityError();
    }
    const stored: RenderOutputMetadata[] = [];
    for (const output of rendered.outputs) {
      const reproductionIssues = verifyRenderReproduction({
        document,
        bytes: output.bytes,
        manifest: output.manifest,
      });
      if (
        reproductionIssues.some((issue) => issue.severity === "error") ||
        output.fingerprint !== output.manifest.renderFingerprint ||
        output.format !== output.manifest.output.format
      ) {
        throw new RenderOutputIntegrityError();
      }
      const artifact = await this.#storage.put({
        workspaceId: claim.workspaceId,
        purpose: "render-output",
        mediaType: output.mimeType,
        bytes: output.bytes,
        expectedSha256: output.manifest.output.sha256,
      });
      const manifestBytes = new TextEncoder().encode(
        `${canonicalJson(output.manifest)}\n`,
      );
      const manifest = await this.#storage.put({
        workspaceId: claim.workspaceId,
        purpose: "render-manifest",
        mediaType: MANIFEST_MEDIA_TYPE,
        bytes: manifestBytes,
      });
      stored.push({
        format: output.format,
        mimeType: output.mimeType,
        artifactKey: artifact.key,
        artifactSha256: artifact.sha256,
        artifactByteSize: artifact.byteSize,
        manifestKey: manifest.key,
        manifestSha256: manifest.sha256,
        manifestByteSize: manifest.byteSize,
        fingerprint: output.fingerprint,
      });
    }
    return stored;
  }

  async #handleFailure(
    claim: ClaimedRenderJob,
    error: unknown,
  ): Promise<RenderWorkerTick> {
    if (isClaimLost(error)) return this.#claimLost(claim);
    const classified = classifyFailure(error);
    const finishedAt = this.#clock.now();
    if (!classified.retryable) {
      try {
        await this.#queue.fail(claim, classified.failure, finishedAt);
      } catch (transitionError) {
        if (isClaimLost(transitionError)) return this.#claimLost(claim);
        throw transitionError;
      }
      this.#logger.error({
        ...logEvent("render_job_failed", claim),
        state: "failed",
        code: classified.failure.code,
      });
      return {
        kind: "failed",
        jobId: claim.jobId,
        workspaceId: claim.workspaceId,
        code: classified.failure.code,
      };
    }
    const retryAt = new Date(finishedAt.getTime() + retryDelay(claim.attemptNumber));
    let disposition;
    try {
      disposition = await this.#queue.retry(
        claim,
        classified.failure,
        retryAt,
        finishedAt,
      );
    } catch (transitionError) {
      if (isClaimLost(transitionError)) return this.#claimLost(claim);
      throw transitionError;
    }
    this.#logger.error({
      ...logEvent("render_job_retry_transition", claim),
      state: disposition,
      code: classified.failure.code,
    });
    return {
      kind: disposition,
      jobId: claim.jobId,
      workspaceId: claim.workspaceId,
      code: classified.failure.code,
    };
  }

  #claimLost(claim: ClaimedRenderJob): RenderWorkerTick {
    this.#logger.info({
      ...logEvent("render_job_claim_lost", claim),
      state: "claim_lost",
      code: "JOB_CLAIM_LOST",
    });
    return {
      kind: "claim_lost",
      jobId: claim.jobId,
      workspaceId: claim.workspaceId,
      code: "JOB_CLAIM_LOST",
    };
  }
}

class RenderOutputIntegrityError extends Error {
  readonly code = "RENDER_OUTPUT_INTEGRITY_FAILED";

  constructor() {
    super("The trusted renderer returned inconsistent output metadata.");
    this.name = "RenderOutputIntegrityError";
  }
}

function classifyFailure(error: unknown): {
  readonly retryable: boolean;
  readonly failure: RenderJobFailure;
} {
  if (error instanceof RenderRevisionError) {
    return permanent(error.code, "The stored render revision could not be authorized.");
  }
  if (error instanceof RenderResourceResolutionError) {
    return permanent(
      error.code,
      "Required immutable render resources are unavailable.",
    );
  }
  if (error instanceof RenderOutputIntegrityError) {
    return permanent(error.code, "Renderer output failed an integrity check.");
  }
  if (error instanceof GlyphkilnError) {
    return {
      retryable: TRANSIENT_CORE_CODES.has(error.code),
      failure: {
        code: error.code.slice(0, 120),
        detail: TRANSIENT_CORE_CODES.has(error.code)
          ? "The isolated renderer was temporarily unavailable."
          : "Core rejected the immutable stored revision.",
      },
    };
  }
  if (error instanceof RenderBlobStorageError) {
    const retryable =
      error.code === "STORAGE_UNAVAILABLE" || error.code === "BLOB_NOT_FOUND";
    return {
      retryable,
      failure: {
        code: error.code,
        detail: retryable
          ? "Immutable output storage was temporarily unavailable."
          : "Immutable output storage failed an integrity check.",
      },
    };
  }
  return {
    retryable: true,
    failure: {
      code: "RENDER_WORKER_UNAVAILABLE",
      detail: "The render worker encountered a temporary internal failure.",
    },
  };
}

function permanent(
  code: string,
  detail: string,
): {
  readonly retryable: false;
  readonly failure: RenderJobFailure;
} {
  return { retryable: false, failure: { code, detail } };
}

function isClaimLost(error: unknown): boolean {
  return error instanceof RenderQueueError && error.code === "JOB_CLAIM_LOST";
}

function retryDelay(attemptNumber: number): number {
  return Math.min(
    RETRY_MAX_MILLISECONDS,
    RETRY_BASE_MILLISECONDS * 2 ** Math.max(0, attemptNumber - 1),
  );
}

function logEvent(event: string, claim: ClaimedRenderJob): RenderWorkerLogEvent {
  return {
    event,
    jobId: claim.jobId,
    workspaceId: claim.workspaceId,
    attempt: claim.attemptNumber,
  };
}

const silentLogger: RenderWorkerLogger = {
  info() {
    return undefined;
  },
  error() {
    return undefined;
  },
};
