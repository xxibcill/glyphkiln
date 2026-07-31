export type RenderAdmissionResult<Result> =
  { readonly accepted: true; readonly value: Result } | { readonly accepted: false };

export type RenderAdmissionController = {
  run<Result>(
    workspaceId: string,
    operation: () => Promise<Result>,
  ): Promise<RenderAdmissionResult<Result>>;
};

export type InProcessRenderAdmissionOptions = {
  readonly maximumGlobalOperations: number;
  readonly maximumWorkspaceOperations: number;
};

export const DEFAULT_RENDER_ADMISSION_OPTIONS: InProcessRenderAdmissionOptions =
  Object.freeze({
    maximumGlobalOperations: 1,
    maximumWorkspaceOperations: 1,
  });

/**
 * Bounds the full host-side resolve -> isolated-render lifetime. A request that
 * cannot acquire capacity fails immediately; untrusted callers cannot build an
 * in-memory wait queue containing otherwise legal aggregate resource bundles.
 */
export class InProcessRenderAdmissionController implements RenderAdmissionController {
  readonly #maximumGlobalOperations: number;
  readonly #maximumWorkspaceOperations: number;
  readonly #workspaceOperations = new Map<string, number>();
  #globalOperations = 0;

  constructor(
    options: InProcessRenderAdmissionOptions = DEFAULT_RENDER_ADMISSION_OPTIONS,
  ) {
    if (
      !Number.isInteger(options.maximumGlobalOperations) ||
      options.maximumGlobalOperations < 1 ||
      options.maximumGlobalOperations > 16 ||
      !Number.isInteger(options.maximumWorkspaceOperations) ||
      options.maximumWorkspaceOperations < 1 ||
      options.maximumWorkspaceOperations > options.maximumGlobalOperations
    ) {
      throw new RangeError(
        "Render concurrency limits are outside the supported range.",
      );
    }
    this.#maximumGlobalOperations = options.maximumGlobalOperations;
    this.#maximumWorkspaceOperations = options.maximumWorkspaceOperations;
  }

  async run<Result>(
    workspaceId: string,
    operation: () => Promise<Result>,
  ): Promise<RenderAdmissionResult<Result>> {
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
