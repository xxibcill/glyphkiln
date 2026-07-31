import {
  FailFastKeyedAdmission,
  type FailFastAdmissionResult,
} from "@/server/admission/fail-fast-keyed-admission";

export type RenderAdmissionResult<Result> = FailFastAdmissionResult<Result>;

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
  readonly #admission: FailFastKeyedAdmission;

  constructor(
    options: InProcessRenderAdmissionOptions = DEFAULT_RENDER_ADMISSION_OPTIONS,
  ) {
    this.#admission = new FailFastKeyedAdmission(
      options,
      16,
      () =>
        new RangeError("Render concurrency limits are outside the supported range."),
    );
  }

  async run<Result>(
    workspaceId: string,
    operation: () => Promise<Result>,
  ): Promise<RenderAdmissionResult<Result>> {
    return this.#admission.tryRun(workspaceId, operation);
  }
}
