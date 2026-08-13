"use client";

import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";

import type {
  ApiFailure,
  AppAlphaApi,
  DesignRevision,
  RenderJob,
  RevisionComparison,
  RevisionReview,
} from "./api-client";
import { RevisionProofFigure } from "./revision-proof-figure";

export function RevisionReviewStation({
  api,
  workspaceId,
  revision,
  canManage,
  canApprove,
}: {
  api: AppAlphaApi;
  workspaceId: string;
  revision: DesignRevision;
  canManage: boolean;
  canApprove: boolean;
}) {
  const [review, setReview] = useState<RevisionReview>();
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [comparison, setComparison] = useState<RevisionComparison>();
  const [failure, setFailure] = useState<ApiFailure>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Review is tied to this exact revision.");

  useEffect(() => {
    setReview(undefined);
    setComparison(undefined);
    setFailure(undefined);
    void loadReviewAndJobs();
  }, [workspaceId, revision.revisionId]);

  async function loadReviewAndJobs(): Promise<void> {
    const [reviewResult, jobsResult] = await Promise.all([
      api.revisionReview({
        workspaceId,
        designId: revision.designId,
        revisionId: revision.revisionId,
      }),
      api.completedRenderJobs(workspaceId, revision.revisionId),
    ]);
    if (reviewResult.ok) setReview(reviewResult.value);
    else if (reviewResult.status !== 404) setFailure(reviewResult);
    if (jobsResult.ok) setJobs(jobsResult.value);
    else setFailure(jobsResult);
  }

  async function submitReview(): Promise<void> {
    await mutate(() =>
      api.submitRevisionReview({
        workspaceId,
        designId: revision.designId,
        revisionId: revision.revisionId,
      }),
    );
  }

  async function addComment(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (review === undefined) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = text(form, "reviewComment");
    setBusy(true);
    setFailure(undefined);
    const result = await api.commentRevisionReview({
      workspaceId,
      reviewId: review.id,
      body,
    });
    if (result.ok) {
      await loadReviewAndJobs();
      formElement.reset();
      setMessage("Comment pinned to this exact visual revision.");
    } else {
      setFailure(result);
    }
    setBusy(false);
  }

  async function requestChanges(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(() =>
      api.requestRevisionChanges({
        workspaceId,
        designId: revision.designId,
        revisionId: revision.revisionId,
        reason: text(form, "changeReason"),
      }),
    );
  }

  async function approve(renderJobId: string): Promise<void> {
    await mutate(() =>
      api.approveRevision({
        workspaceId,
        designId: revision.designId,
        revisionId: revision.revisionId,
        renderJobId,
      }),
    );
  }

  async function mutate(
    operation: () => ReturnType<AppAlphaApi["submitRevisionReview"]>,
  ): Promise<void> {
    if (busy) return;
    setBusy(true);
    setFailure(undefined);
    const result = await operation();
    if (result.ok) {
      setReview(result.value);
      setMessage(`Review state · ${result.value.state.toUpperCase()}`);
    } else {
      setFailure(result);
    }
    setBusy(false);
  }

  async function compareWithParent(): Promise<void> {
    if (revision.parentRevisionId === undefined || busy) return;
    setBusy(true);
    setFailure(undefined);
    const result = await api.compareRevisions({
      workspaceId,
      leftDesignId: revision.designId,
      leftRevisionId: revision.parentRevisionId,
      rightDesignId: revision.designId,
      rightRevisionId: revision.revisionId,
    });
    if (result.ok) {
      setComparison(result.value);
      setMessage("Parent and head proofs rendered from exact immutable revisions.");
    } else {
      setFailure(result);
    }
    setBusy(false);
  }

  const approvalJob = jobs.find((job) => job.state === "completed");

  return (
    <section className="review-station" aria-labelledby="review-station-title">
      <header>
        <div>
          <p className="section-kicker">Exact-revision review</p>
          <h2 id="review-station-title">Proof, comment, approve</h2>
        </div>
        <div
          className="review-state-register"
          data-state={review?.state ?? "not-started"}
        >
          <span>{review?.state.toUpperCase() ?? "NOT STARTED"}</span>
          <small>REV {revision.revisionNumber.toString().padStart(3, "0")}</small>
        </div>
      </header>

      {failure === undefined ? null : (
        <div className="app-alert" role="alert">
          <strong>{failure.error.title}</strong>
          <p>{failure.error.detail}</p>
        </div>
      )}

      <div className="review-action-strip">
        {review === undefined || review.state === "changes-requested" ? (
          <button
            type="button"
            className="secondary-action"
            disabled={!canManage || busy}
            onClick={() => void submitReview()}
          >
            {review === undefined ? "Submit exact revision" : "Resubmit exact revision"}
          </button>
        ) : null}
        {revision.parentRevisionId === undefined ? (
          <p>This is the first revision; there is no parent visual to compare.</p>
        ) : (
          <button
            type="button"
            className="quiet-action"
            disabled={busy}
            onClick={() => void compareWithParent()}
          >
            Compare parent ↔ head
          </button>
        )}
        {review?.state === "in-review" && canApprove && approvalJob !== undefined ? (
          <button
            type="button"
            className="primary-action"
            disabled={busy}
            onClick={() => void approve(approvalJob.jobId)}
          >
            Approve completed proof
          </button>
        ) : null}
      </div>

      {comparison === undefined ? null : (
        <div className="revision-comparison-strip">
          <RevisionProofFigure
            side={comparison.left}
            caption={
              <>
                <span>PARENT</span>
                <strong>
                  REV{" "}
                  {comparison.left.revision.revisionNumber.toString().padStart(3, "0")}
                </strong>
              </>
            }
            alt="parent revision proof"
          />
          <RevisionProofFigure
            side={comparison.right}
            caption={
              <>
                <span>HEAD</span>
                <strong>
                  REV{" "}
                  {comparison.right.revision.revisionNumber.toString().padStart(3, "0")}
                </strong>
              </>
            }
            alt="head revision proof"
          />
        </div>
      )}

      {review === undefined ? null : (
        <div className="review-ledger-grid">
          <div>
            <h3>Thread</h3>
            {review.comments.length === 0 ? (
              <p>No comments yet. Record only decisions that belong to this proof.</p>
            ) : (
              <ol className="review-comments">
                {review.comments.map((comment) => (
                  <li key={comment.id}>
                    <p>{comment.body}</p>
                    <small>
                      {comment.createdBy.displayName} · {comment.createdAt}
                    </small>
                  </li>
                ))}
              </ol>
            )}
            <form onSubmit={(event) => void addComment(event)}>
              <label>
                Revision comment
                <textarea name="reviewComment" maxLength={2000} rows={3} required />
              </label>
              <button className="quiet-action" disabled={busy}>
                Add comment
              </button>
            </form>
          </div>

          <div>
            <h3>State transitions</h3>
            <ol className="review-transitions">
              {review.transitions.map((transition) => (
                <li key={transition.id}>
                  <span>{transition.toState}</span>
                  <p>{transition.reason ?? "Exact revision advanced deliberately."}</p>
                  <small>{transition.createdBy.displayName}</small>
                </li>
              ))}
            </ol>
            {review.state === "in-review" && canManage ? (
              <form onSubmit={(event) => void requestChanges(event)}>
                <label>
                  Change request
                  <textarea name="changeReason" maxLength={1000} rows={3} required />
                </label>
                <button className="text-action" disabled={busy}>
                  Request changes
                </button>
              </form>
            ) : null}
          </div>

          <div className="approval-receipt">
            <h3>Approval receipt</h3>
            {review.approval === undefined ? (
              <p>
                Unapproved. A completed durable SVG/PNG proof is required before an
                owner or admin can seal this revision.
              </p>
            ) : (
              <dl>
                <div>
                  <dt>Approved by</dt>
                  <dd>{review.approval.approvedBy.displayName}</dd>
                </div>
                <div>
                  <dt>Revision hash</dt>
                  <dd>{review.approval.revisionCanonicalHash}</dd>
                </div>
                <div>
                  <dt>Resource pins</dt>
                  <dd>{review.approval.resourcePins.length.toString()}</dd>
                </div>
                <div>
                  <dt>Output proofs</dt>
                  <dd>{review.approval.outputEvidence.length.toString()}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>
      )}

      <p className="review-status" role="status" aria-live="polite">
        {busy ? "Checking exact state…" : message}
      </p>
    </section>
  );
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}
