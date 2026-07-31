"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ApiFailure,
  AppAlphaApi,
  DesignRevision,
  RenderJob,
  RenderJobOutput,
} from "./api-client";

const POLL_INTERVAL_MILLISECONDS = 1_500;
const TERMINAL_JOB_STATES = new Set<RenderJob["state"]>([
  "completed",
  "exhausted",
  "failed",
]);

type DurableExportStationProps = {
  api: AppAlphaApi;
  workspaceId: string;
  revision: DesignRevision;
  canRequest: boolean;
};

export function DurableExportStation({
  api,
  workspaceId,
  revision,
  canRequest,
}: DurableExportStationProps) {
  const exportState = useDurableExport(api, workspaceId, revision);

  return (
    <section className="durable-export-station" aria-labelledby="durable-export-title">
      <div className="durable-export-introduction">
        <span>
          DURABLE QUEUE / REV {revision.revisionNumber.toString().padStart(3, "0")}
        </span>
        <h3 id="durable-export-title">Seal an export beyond this browser session.</h3>
        <p>
          The worker reloads this exact revision, verifies its immutable resources, and
          publishes manifest-backed SVG and PNG artifacts.
        </p>
      </div>

      <div className="durable-export-control">
        <ExportStatus job={exportState.job} isRequesting={exportState.isRequesting} />
        {canRequest ? (
          <button
            className="secondary-action"
            type="button"
            disabled={exportState.isRequesting || isActive(exportState.job)}
            onClick={() => {
              void exportState.request();
            }}
          >
            {exportState.job === undefined
              ? "Queue durable export"
              : TERMINAL_JOB_STATES.has(exportState.job.state)
                ? "Queue another export"
                : "Durable export queued"}
          </button>
        ) : (
          <small>
            Your workspace role can read completed exports but cannot request one.
          </small>
        )}
      </div>

      {exportState.failure === undefined ? null : (
        <div className="durable-export-failure" role="alert">
          <strong>{exportState.failure.error.title}</strong>
          <p>{exportState.failure.error.detail}</p>
        </div>
      )}

      {exportState.job?.state === "completed" ? (
        <ul className="durable-output-list">
          {exportState.job.outputs.map((output) => (
            <DurableOutput
              key={output.format}
              workspaceId={workspaceId}
              jobId={exportState.job?.jobId ?? ""}
              output={output}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function useDurableExport(
  api: AppAlphaApi,
  workspaceId: string,
  revision: DesignRevision,
): {
  failure?: ApiFailure;
  isRequesting: boolean;
  job?: RenderJob;
  request: () => Promise<void>;
} {
  const [jobId, setJobId] = useState<string>();
  const [job, setJob] = useState<RenderJob>();
  const [failure, setFailure] = useState<ApiFailure>();
  const [isRequesting, setIsRequesting] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    requestSequence.current += 1;
    setJobId(undefined);
    setJob(undefined);
    setFailure(undefined);
    setIsRequesting(false);
  }, [revision.revisionId, workspaceId]);

  const inspect = useCallback(
    async (candidateJobId: string, sequence: number): Promise<void> => {
      const result = await api.renderJob(workspaceId, candidateJobId);
      if (sequence !== requestSequence.current) return;
      if (result.ok) {
        if (
          result.value.revisionId !== revision.revisionId ||
          result.value.designId !== revision.designId
        ) {
          setFailure(integrityFailure());
          return;
        }
        setJob(result.value);
        setFailure(undefined);
      } else {
        setFailure(result);
      }
    },
    [api, revision.designId, revision.revisionId, workspaceId],
  );

  useEffect(() => {
    if (
      jobId === undefined ||
      (job !== undefined && TERMINAL_JOB_STATES.has(job.state))
    ) {
      return;
    }
    const sequence = requestSequence.current;
    const interval = window.setInterval(() => {
      void inspect(jobId, sequence);
    }, POLL_INTERVAL_MILLISECONDS);
    return () => {
      window.clearInterval(interval);
    };
  }, [inspect, job, jobId]);

  async function request(): Promise<void> {
    if (isRequesting || isActive(job)) return;
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setIsRequesting(true);
    setFailure(undefined);
    setJob(undefined);
    setJobId(undefined);
    const result = await api.requestRevisionExport({
      workspaceId,
      designId: revision.designId,
      revisionId: revision.revisionId,
      idempotencyKey: createExportRequestKey(revision.revisionId),
    });
    if (sequence !== requestSequence.current) return;
    setIsRequesting(false);
    if (!result.ok) {
      setFailure(result);
      return;
    }
    setJobId(result.value.jobId);
    await inspect(result.value.jobId, sequence);
  }

  return {
    ...(failure === undefined ? {} : { failure }),
    isRequesting,
    ...(job === undefined ? {} : { job }),
    request,
  };
}

function ExportStatus({
  job,
  isRequesting,
}: {
  job?: RenderJob;
  isRequesting: boolean;
}) {
  const state = isRequesting ? "requesting" : (job?.state ?? "not-requested");
  const label =
    state === "completed"
      ? "Durable export complete"
      : state === "failed" || state === "exhausted"
        ? "Durable export stopped"
        : state === "not-requested"
          ? "Not requested"
          : state === "requesting"
            ? "Submitting request"
            : state === "retry_wait"
              ? "Waiting to retry"
              : state === "claimed"
                ? "Worker rendering"
                : "Queued for worker";
  return (
    <div className="durable-export-status" data-state={state} role="status">
      <i aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {job === undefined ? null : (
          <small>
            Attempt {job.attemptCount.toString()} of {job.maxAttempts.toString()} ·{" "}
            {job.jobId}
          </small>
        )}
      </span>
    </div>
  );
}

function DurableOutput({
  workspaceId,
  jobId,
  output,
}: {
  workspaceId: string;
  jobId: string;
  output: RenderJobOutput;
}) {
  return (
    <li>
      <div>
        <span>{output.format.toUpperCase()}</span>
        <strong>{output.artifactByteSize.toLocaleString()} bytes</strong>
        <small>{output.fingerprint}</small>
      </div>
      <div>
        <a href={exportDownloadUrl(workspaceId, jobId, output.format, "artifact")}>
          Download {output.format.toUpperCase()}
        </a>
        <a href={exportDownloadUrl(workspaceId, jobId, output.format, "manifest")}>
          Download manifest
        </a>
      </div>
    </li>
  );
}

function createExportRequestKey(revisionId: string): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `export:${revisionId}:${suffix}`;
}

function exportDownloadUrl(
  workspaceId: string,
  jobId: string,
  format: RenderJobOutput["format"],
  part: "artifact" | "manifest",
): string {
  return [
    "/api/app/exports",
    encodeURIComponent(workspaceId),
    encodeURIComponent(jobId),
    format,
    part,
  ].join("/");
}

function isActive(job: RenderJob | undefined): boolean {
  return job !== undefined && !TERMINAL_JOB_STATES.has(job.state);
}

function integrityFailure(): ApiFailure {
  return {
    ok: false,
    status: 502,
    error: {
      code: "DURABLE_EXPORT_MISMATCH",
      title: "Durable export could not be verified",
      detail: "The render job did not match the exact saved revision requested here.",
    },
  };
}
