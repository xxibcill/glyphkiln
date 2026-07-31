import { FailFastKeyedAdmission } from "@/server/admission/fail-fast-keyed-admission";

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
  readonly #admission: FailFastKeyedAdmission;

  public constructor(
    options: InProcessResourceIngestionAdmissionOptions = DEFAULT_RESOURCE_INGESTION_ADMISSION_OPTIONS,
  ) {
    this.#admission = new FailFastKeyedAdmission(options, 64, () => {
      return new Error(
        "Resource-ingestion concurrency limits are outside the supported range.",
      );
    });
  }

  public async run<Result>(
    workspaceId: string,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const result = await this.#admission.tryRun(workspaceId, operation);
    if (!result.accepted) {
      throw new ResourceIngestionError(
        "Resource-ingestion capacity is temporarily unavailable.",
        "RESOURCE_CAPACITY_REACHED",
      );
    }
    return result.value;
  }
}
