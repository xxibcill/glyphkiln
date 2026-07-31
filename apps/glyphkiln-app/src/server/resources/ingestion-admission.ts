import { ResourceIngestionError } from "./errors";

export type ResourceIngestionAdmissionController = {
  run<Result>(workspaceId: string, operation: () => Promise<Result>): Promise<Result>;
};

export type InProcessResourceIngestionAdmissionOptions = {
  readonly maximumGlobalOperations: number;
  readonly maximumWorkspaceOperations: number;
};

export const DEFAULT_RESOURCE_INGESTION_ADMISSION_OPTIONS: InProcessResourceIngestionAdmissionOptions =
  {
    maximumGlobalOperations: 1,
    maximumWorkspaceOperations: 1,
  };

/**
 * Bounds expensive scanning, decoding, and immutable publication without
 * retaining an attacker-controlled wait queue. Database quotas remain the
 * cross-process authority for durable workspace usage.
 */
export class InProcessResourceIngestionAdmissionController implements ResourceIngestionAdmissionController {
  readonly #maximumGlobalOperations: number;
  readonly #maximumWorkspaceOperations: number;
  readonly #workspaceOperations = new Map<string, number>();
  #globalOperations = 0;

  public constructor(
    options: InProcessResourceIngestionAdmissionOptions = DEFAULT_RESOURCE_INGESTION_ADMISSION_OPTIONS,
  ) {
    if (
      !Number.isInteger(options.maximumGlobalOperations) ||
      options.maximumGlobalOperations < 1 ||
      options.maximumGlobalOperations > 64 ||
      !Number.isInteger(options.maximumWorkspaceOperations) ||
      options.maximumWorkspaceOperations < 1 ||
      options.maximumWorkspaceOperations > options.maximumGlobalOperations
    ) {
      throw new Error(
        "Resource-ingestion concurrency limits are outside the supported range.",
      );
    }
    this.#maximumGlobalOperations = options.maximumGlobalOperations;
    this.#maximumWorkspaceOperations = options.maximumWorkspaceOperations;
  }

  public async run<Result>(
    workspaceId: string,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const workspaceOperations = this.#workspaceOperations.get(workspaceId) ?? 0;
    if (
      this.#globalOperations >= this.#maximumGlobalOperations ||
      workspaceOperations >= this.#maximumWorkspaceOperations
    ) {
      throw new ResourceIngestionError(
        "Resource-ingestion capacity is temporarily unavailable.",
        "RESOURCE_CAPACITY_REACHED",
      );
    }

    this.#globalOperations += 1;
    this.#workspaceOperations.set(workspaceId, workspaceOperations + 1);
    try {
      return await operation();
    } finally {
      this.#globalOperations -= 1;
      const remaining = (this.#workspaceOperations.get(workspaceId) ?? 1) - 1;
      if (remaining === 0) {
        this.#workspaceOperations.delete(workspaceId);
      } else {
        this.#workspaceOperations.set(workspaceId, remaining);
      }
    }
  }
}
