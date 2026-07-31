export type FailFastAdmissionOptions = {
  readonly maximumGlobalOperations: number;
  readonly maximumWorkspaceOperations: number;
};

export type FailFastAdmissionResult<Result> =
  { readonly accepted: true; readonly value: Result } | { readonly accepted: false };

export class FailFastKeyedAdmission {
  readonly #maximumGlobalOperations: number;
  readonly #maximumWorkspaceOperations: number;
  readonly #workspaceOperations = new Map<string, number>();
  #globalOperations = 0;

  constructor(
    options: FailFastAdmissionOptions,
    maximumSupportedGlobalOperations: number,
    invalidOptions: () => Error,
  ) {
    if (
      !Number.isInteger(options.maximumGlobalOperations) ||
      options.maximumGlobalOperations < 1 ||
      options.maximumGlobalOperations > maximumSupportedGlobalOperations ||
      !Number.isInteger(options.maximumWorkspaceOperations) ||
      options.maximumWorkspaceOperations < 1 ||
      options.maximumWorkspaceOperations > options.maximumGlobalOperations
    ) {
      throw invalidOptions();
    }
    this.#maximumGlobalOperations = options.maximumGlobalOperations;
    this.#maximumWorkspaceOperations = options.maximumWorkspaceOperations;
  }

  async tryRun<Result>(
    workspaceId: string,
    operation: () => Promise<Result>,
  ): Promise<FailFastAdmissionResult<Result>> {
    const workspaceOperations = this.#workspaceOperations.get(workspaceId) ?? 0;
    if (
      this.#globalOperations >= this.#maximumGlobalOperations ||
      workspaceOperations >= this.#maximumWorkspaceOperations
    ) {
      return { accepted: false };
    }

    this.#globalOperations += 1;
    this.#workspaceOperations.set(workspaceId, workspaceOperations + 1);
    try {
      return { accepted: true, value: await operation() };
    } finally {
      this.#release(workspaceId);
    }
  }

  #release(workspaceId: string): void {
    this.#globalOperations -= 1;
    const remaining = (this.#workspaceOperations.get(workspaceId) ?? 1) - 1;
    if (remaining === 0) {
      this.#workspaceOperations.delete(workspaceId);
    } else {
      this.#workspaceOperations.set(workspaceId, remaining);
    }
  }
}
