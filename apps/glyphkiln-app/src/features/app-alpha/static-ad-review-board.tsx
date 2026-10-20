"use client";

import { useEffect, useRef, useState } from "react";
import { isStaticAdFormat, reviewStaticAdPlacement } from "@glyphkiln/core/browser";
import type { PreviewSuccess } from "@/features/project-preview/types";
import type {
  ApiResult,
  AppAlphaApi,
  CampaignBoard,
  CampaignCanvas,
  RenderJob,
  RevisionReview,
} from "./api-client";
import { downloadBytes } from "./campaign-studio-model";
import { zipCampaignHandoff } from "./static-ad-zip";

type Card = {
  canvas: CampaignCanvas;
  proof?: PreviewSuccess;
  jobs?: RenderJob[];
  review?: RevisionReview;
  error?: string;
};

export function StaticAdReviewBoard({
  api,
  workspaceId,
  campaignId,
  canEdit,
  canApprove,
  onOpenDesign,
}: {
  api: AppAlphaApi;
  workspaceId: string;
  campaignId: string;
  canEdit: boolean;
  canApprove: boolean;
  onOpenDesign: (designId: string, revisionId?: string) => Promise<void>;
}) {
  const [board, setBoard] = useState<CampaignBoard>();
  const [boardRefresh, setBoardRefresh] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let active = true;
    void api.campaignBoard(workspaceId, campaignId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error.detail);
        return;
      }
      setBoard(result.value);
      setCards(
        result.value.directions.flatMap((direction) =>
          direction.canvases.map((canvas) => ({ canvas })),
        ),
      );
    });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [api, workspaceId, campaignId, boardRefresh]);

  function patch(id: string, changes: Partial<Card>): void {
    if (alive.current)
      setCards((current) =>
        current.map((card) => (card.canvas.id === id ? { ...card, ...changes } : card)),
      );
  }
  async function run(action: "proof" | "queue" | "approve"): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError("");
    let completed = 0;
    let failures = 0;
    for (const card of cards.filter((entry) => selected.includes(entry.canvas.id))) {
      if (!alive.current) break;
      const { canvas } = card;
      const scope = {
        workspaceId,
        designId: canvas.designId,
        revisionId: canvas.revisionId,
      };
      setMessage(
        `${action === "proof" ? "Checking" : action === "queue" ? "Queueing" : "Approving"} ${canvas.canvasKey}…`,
      );
      try {
        if (action === "proof") {
          const proof = requireValue(await api.renderRevision(scope));
          if (
            proof.document.id !== canvas.designId ||
            proof.document.seed !== canvas.canvasSeed ||
            proof.document.format !== canvas.format ||
            proof.document.template.id !== canvas.template.id ||
            proof.document.template.version !== canvas.template.version
          )
            throw new Error("The returned proof does not match this saved canvas.");
          const jobs = requireValue(
            await api.completedRenderJobs(workspaceId, canvas.revisionId),
          );
          const reviewResult = await api.revisionReview(scope);
          if (!reviewResult.ok && reviewResult.status !== 404)
            throw new Error(reviewResult.error.detail);
          patch(canvas.id, {
            proof,
            jobs,
            ...(reviewResult.ok ? { review: reviewResult.value } : {}),
            error: "",
          });
        } else if (action === "queue") {
          requireValue(
            await api.requestRevisionExport({
              ...scope,
              idempotencyKey: `static-ad:${canvas.revisionId}`,
            }),
          );
          patch(canvas.id, { error: "" });
        } else {
          if (card.proof === undefined)
            throw new Error("Check this proof before approval.");
          const jobs = requireValue(
            await api.completedRenderJobs(workspaceId, canvas.revisionId),
          );
          const job = jobs.find(
            (candidate) =>
              candidate.workspaceId === workspaceId &&
              candidate.designId === canvas.designId &&
              candidate.revisionId === canvas.revisionId &&
              candidate.state === "completed",
          );
          if (job === undefined)
            throw new Error(
              "The queued export must finish before approval. Refresh proofs after the worker completes.",
            );
          if (
            card.proof.outputs.length !== 2 ||
            !card.proof.outputs.every((output) =>
              job.outputs.some(
                (artifact) =>
                  artifact.format === output.format &&
                  artifact.fingerprint === output.fingerprint &&
                  artifact.artifactSha256 === output.manifest.output.sha256 &&
                  artifact.artifactByteSize === output.byteSize,
              ),
            )
          )
            throw new Error(
              "The completed export differs from the viewed proof. Refresh and review it before approval.",
            );
          if (card.review === undefined)
            requireValue(await api.submitRevisionReview(scope));
          patch(canvas.id, {
            review: requireValue(
              await api.approveRevision({ ...scope, renderJobId: job.jobId }),
            ),
            jobs,
            error: "",
          });
        }
        completed += 1;
      } catch (failure) {
        failures += 1;
        patch(canvas.id, {
          error:
            failure instanceof Error
              ? failure.message
              : "This ad could not be processed.",
        });
      }
    }
    if (alive.current) {
      setMessage(
        `${completed.toString()} ads processed${failures ? `; ${failures.toString()} need attention` : ""}.${action === "queue" ? " Refresh proofs when the worker finishes." : ""}`,
      );
      setBusy(false);
    }
  }
  async function download(): Promise<void> {
    if (board === undefined || busy) return;
    setBusy(true);
    setError("");
    try {
      for (const direction of board.directions) {
        if (!alive.current) break;
        const archive = requireValue(
          await api.campaignHandoff({
            workspaceId,
            campaignId,
            directionId: direction.id,
            approvedOnly: true,
          }),
        );
        downloadBytes(
          zipCampaignHandoff(archive.bytes),
          "application/zip",
          archive.filename.replace(/\.gk-handoff\.json$/, "-approved.zip"),
        );
      }
      if (alive.current)
        setMessage("Downloaded approved artifacts and their placement review reports.");
    } catch (failure) {
      if (alive.current)
        setError(failure instanceof Error ? failure.message : "Download failed.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const selectedCount = selected.length;
  return (
    <div className="static-ad-review">
      <p>
        Check each proof at phone size. Orange outlines mark conservative safe zones;
        warnings need visual review before publishing. These checks do not certify
        platform acceptance.
      </p>
      <div className="static-ad-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setSelected([]);
            setBoardRefresh((value) => value + 1);
          }}
        >
          Reload campaign
        </button>
        <button
          type="button"
          disabled={busy || cards.length === 0}
          onClick={() => {
            setSelected(
              selected.length === cards.length
                ? []
                : cards.map((card) => card.canvas.id),
            );
          }}
        >
          {selected.length === cards.length && cards.length > 0
            ? "Clear selection"
            : "Select all"}
        </button>
        {canEdit && (
          <>
            <button
              type="button"
              disabled={busy || selectedCount === 0}
              onClick={() => {
                void run("proof");
              }}
            >
              Check / refresh selected proofs
            </button>
            <button
              type="button"
              disabled={busy || selectedCount === 0}
              onClick={() => {
                void run("queue");
              }}
            >
              Queue selected exports
            </button>
          </>
        )}
        {canApprove && (
          <button
            type="button"
            disabled={busy || selectedCount === 0}
            onClick={() => {
              void run("approve");
            }}
          >
            Approve selected proofs
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            disabled={busy || cards.length === 0}
            onClick={() => {
              void download();
            }}
          >
            Download all approved ads
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="static-ad-grid">
        {cards.map((card) => {
          const { canvas, proof } = card;
          const png = proof?.outputs.find((output) => output.format === "png");
          const review =
            proof && isStaticAdFormat(canvas.format)
              ? reviewStaticAdPlacement(
                  canvas.format,
                  proof.evidence,
                  proof.qualityIssues,
                )
              : undefined;
          return (
            <article key={canvas.id} className="static-ad-card">
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(canvas.id)}
                  disabled={busy}
                  onChange={(event) => {
                    setSelected(
                      event.target.checked
                        ? [...selected, canvas.id]
                        : selected.filter((id) => id !== canvas.id),
                    );
                  }}
                />
                {canvas.template.id} · {canvas.format}
              </label>
              {png && (
                <div className="static-ad-proof">
                  {/* eslint-disable-next-line @next/next/no-img-element -- verified bounded Core proof */}
                  <img
                    src={`data:${png.mimeType};base64,${png.base64}`}
                    alt={`${canvas.template.id} ad in ${canvas.format}`}
                  />
                  {review && (
                    <span
                      aria-hidden="true"
                      className="static-ad-safe-zone"
                      style={{
                        left: `${((100 * review.safeArea.x) / review.dimensions.width).toString()}%`,
                        top: `${((100 * review.safeArea.y) / review.dimensions.height).toString()}%`,
                        width: `${((100 * review.safeArea.width) / review.dimensions.width).toString()}%`,
                        height: `${((100 * review.safeArea.height) / review.dimensions.height).toString()}%`,
                      }}
                    />
                  )}
                </div>
              )}
              <p>
                {card.review?.state ?? "Not submitted"} ·{" "}
                {card.jobs?.length
                  ? "Export proof available"
                  : "No completed export loaded"}
              </p>
              {review && (
                <details>
                  <summary>{review.issues.length} placement warnings</summary>
                  {review.issues.length ? (
                    <ul>
                      {review.issues.map((issue, index) => (
                        <li key={index}>
                          {issue.layerId ? `${issue.layerId}: ` : ""}
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No automatic warnings. Review the creative and placement in
                      context.
                    </p>
                  )}
                </details>
              )}
              {card.error && <p role="alert">{card.error}</p>}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void onOpenDesign(canvas.designId, canvas.revisionId);
                }}
              >
                Open in editor
              </button>
              <small>
                Campaign cards retain this revision. Use Campaign coordination to plan a
                new canvas seed, save edits, and attach the revised ad. Then reload this
                board.
              </small>
            </article>
          );
        })}
      </div>
    </div>
  );
}
function requireValue<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.error.detail);
  return result.value;
}
