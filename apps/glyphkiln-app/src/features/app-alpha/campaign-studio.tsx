"use client";

import { canonicalJson } from "@glyphkiln/core/browser";
import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";

import type { CampaignSummary } from "@/server/app-workflow";

import type {
  ApiFailure,
  AppAlphaApi,
  CampaignBoard,
  CampaignCanvas,
  CampaignCanvasSeed,
  CampaignCanvasSeedInput,
  CampaignProposalRun,
  DesignRevision,
  RevisionComparison,
} from "./api-client";

const LOCKS = [
  "copy",
  "image",
  "crop",
  "typography",
  "palette",
  "composition",
] as const;

const CAMPAIGN_COMPOSITION_VARIANT = "focal-editorial" as const;
const CANVAS_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

type CampaignDraftCanvas = {
  templateId: CampaignCanvasSeedInput["templateId"];
  format: CampaignCanvasSeedInput["format"];
  seed: string;
};

type CampaignCanvasSeedPlan = {
  scope: CampaignCanvasSeedInput;
  result: CampaignCanvasSeed;
};

export function CampaignStudio({
  api,
  workspaceId,
  campaigns,
  draftCanvas,
  openRevision,
  canCoordinate,
  onApplyCanvasSeed,
  onCampaignChanged,
  onOpenDesign,
}: {
  api: AppAlphaApi;
  workspaceId: string;
  campaigns: CampaignSummary[];
  draftCanvas: CampaignDraftCanvas;
  openRevision?: DesignRevision;
  canCoordinate: boolean;
  onApplyCanvasSeed: (seed: string) => void;
  onCampaignChanged: () => Promise<void>;
  onOpenDesign: (designId: string, revisionId?: string) => Promise<void>;
}) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>();
  const [board, setBoard] = useState<CampaignBoard>();
  const [proposalRun, setProposalRun] = useState<CampaignProposalRun>();
  const [comparison, setComparison] = useState<RevisionComparison>();
  const [leftCanvasId, setLeftCanvasId] = useState("");
  const [rightCanvasId, setRightCanvasId] = useState("");
  const [canvasDirectionId, setCanvasDirectionId] = useState("");
  const [canvasKey, setCanvasKey] = useState("");
  const [canvasSeedPlan, setCanvasSeedPlan] = useState<CampaignCanvasSeedPlan>();
  const [busy, setBusy] = useState<string>();
  const [failure, setFailure] = useState<ApiFailure>();
  const [message, setMessage] = useState(
    "Create a campaign or open an existing option board.",
  );

  const canvases = useMemo(
    () =>
      board?.directions.flatMap((direction) =>
        direction.canvases.map((canvas) => ({ direction, canvas })),
      ) ?? [],
    [board],
  );
  const currentCanvasScope = useMemo<CampaignCanvasSeedInput | undefined>(() => {
    if (
      board === undefined ||
      canvasDirectionId === "" ||
      !CANVAS_KEY_PATTERN.test(canvasKey)
    ) {
      return undefined;
    }
    return {
      workspaceId,
      campaignId: board.campaign.id,
      directionId: canvasDirectionId,
      canvasKey,
      templateId: draftCanvas.templateId,
      format: draftCanvas.format,
      compositionVariantId: CAMPAIGN_COMPOSITION_VARIANT,
    };
  }, [board, canvasDirectionId, canvasKey, draftCanvas, workspaceId]);
  const currentCanvasSeedPlan =
    canvasSeedPlan !== undefined &&
    currentCanvasScope !== undefined &&
    sameCanvasSeedScope(canvasSeedPlan.scope, currentCanvasScope)
      ? canvasSeedPlan
      : undefined;
  const draftMatchesCanvasSeed = draftMatchesSeedPlan(
    draftCanvas,
    currentCanvasSeedPlan,
  );
  const revisionMatchesCanvasSeed = revisionMatchesSeedPlan(
    openRevision,
    currentCanvasSeedPlan,
  );
  const canAttachCanvas =
    canCoordinate &&
    currentCanvasSeedPlan !== undefined &&
    draftMatchesCanvasSeed &&
    revisionMatchesCanvasSeed &&
    board !== undefined &&
    board.directions.some((direction) => direction.id === canvasDirectionId) &&
    busy === undefined;

  useEffect(() => {
    const next =
      selectedCampaignId !== undefined &&
      campaigns.some((campaign) => campaign.id === selectedCampaignId)
        ? selectedCampaignId
        : campaigns.at(0)?.id;
    setSelectedCampaignId(next);
    if (next === undefined) {
      setBoard(undefined);
      setCanvasSeedPlan(undefined);
      return;
    }
    void loadBoard(next);
  }, [campaigns, workspaceId]);

  useEffect(() => {
    setCanvasSeedPlan(undefined);
  }, [draftCanvas.templateId, draftCanvas.format]);

  async function loadBoard(campaignId: string): Promise<void> {
    setBusy("board");
    setFailure(undefined);
    const result = await api.campaignBoard(workspaceId, campaignId);
    if (result.ok) {
      setBoard(result.value);
      setCanvasSeedPlan(undefined);
      const directionIds = result.value.directions.map((direction) => direction.id);
      setCanvasDirectionId((current) =>
        directionIds.includes(current) ? current : (directionIds.at(0) ?? ""),
      );
      const available = result.value.directions.flatMap((direction) =>
        direction.canvases.map((canvas) => canvas.id),
      );
      setLeftCanvasId((current) =>
        available.includes(current) ? current : (available.at(0) ?? ""),
      );
      setRightCanvasId((current) =>
        available.includes(current) ? current : (available.at(1) ?? ""),
      );
      setMessage(`Option board loaded · ${available.length.toString()} canvases.`);
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  async function createCampaign(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCoordinate || busy !== undefined) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("campaign");
    setFailure(undefined);
    const result = await api.createCampaign({
      workspaceId,
      name: requiredFormText(form, "campaignName"),
      brief: requiredFormText(form, "campaignBrief"),
      campaignSeed: requiredFormText(form, "campaignSeed"),
    });
    if (result.ok) {
      setSelectedCampaignId(result.value.id);
      await onCampaignChanged();
      await loadBoard(result.value.id);
      formElement.reset();
      setMessage("Campaign sealed. Add the first option direction.");
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  async function createDirection(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCoordinate || board === undefined || busy !== undefined) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("direction");
    setFailure(undefined);
    const result = await api.createCampaignDirection({
      workspaceId,
      campaignId: board.campaign.id,
      directionKey: requiredFormText(form, "directionKey"),
      name: requiredFormText(form, "directionName"),
      locks: LOCKS.filter((lock) => form.get(`lock-${lock}`) === "on"),
    });
    if (result.ok) {
      await loadBoard(board.campaign.id);
      formElement.reset();
      setMessage("Direction added with immutable server-owned locks.");
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  async function branchDirection(sourceDirectionId: string) {
    if (!canCoordinate || board === undefined || busy !== undefined) return;
    const source = board.directions.find(
      (direction) => direction.id === sourceDirectionId,
    );
    if (source === undefined) return;
    const branchNumber = board.directions.length + 1;
    setBusy("branch");
    setFailure(undefined);
    const result = await api.branchCampaignDirection({
      workspaceId,
      campaignId: board.campaign.id,
      sourceDirectionId,
      directionKey: `${source.directionKey}-branch-${branchNumber.toString()}`,
      name: `${source.name} · branch ${branchNumber.toString()}`,
    });
    if (result.ok) {
      await loadBoard(board.campaign.id);
      setMessage("Direction branched. Locks were copied; canvases remain deliberate.");
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  async function attachCanvas(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (openRevision === undefined || !canAttachCanvas) return;
    const form = new FormData(event.currentTarget);
    setBusy("canvas");
    setFailure(undefined);
    const result = await api.attachCampaignCanvas({
      workspaceId,
      campaignId: board.campaign.id,
      directionId: currentCanvasSeedPlan.scope.directionId,
      canvasKey: currentCanvasSeedPlan.scope.canvasKey,
      designId: openRevision.designId,
      revisionId: openRevision.revisionId,
      ordinal: Number(requiredFormText(form, "canvasOrdinal")),
    });
    if (result.ok) {
      await loadBoard(board.campaign.id);
      setMessage("Exact revision attached to the coordinated campaign board.");
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  async function planCanvasSeed(): Promise<void> {
    if (!canCoordinate || currentCanvasScope === undefined || busy !== undefined)
      return;
    const requestedScope = currentCanvasScope;
    setBusy("canvas-seed");
    setFailure(undefined);
    const result = await api.campaignCanvasSeed(requestedScope);
    if (result.ok) {
      setCanvasSeedPlan({ scope: requestedScope, result: result.value });
      setMessage(
        "Canvas seed planned for this exact direction, key, template, and format.",
      );
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  async function compareCanvases() {
    const left = findCanvas(canvases, leftCanvasId);
    const right = findCanvas(canvases, rightCanvasId);
    if (left === undefined || right === undefined || busy !== undefined) return;
    setBusy("comparison");
    setFailure(undefined);
    const result = await api.compareRevisions({
      workspaceId,
      leftDesignId: left.designId,
      leftRevisionId: left.revisionId,
      rightDesignId: right.designId,
      rightRevisionId: right.revisionId,
    });
    if (result.ok) {
      setComparison(result.value);
      setMessage("Both sides were rendered from their exact stored revisions.");
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  async function requestProposals(base: CampaignCanvas, directionId: string) {
    if (!canCoordinate || board === undefined || busy !== undefined) return;
    setBusy("proposals");
    setFailure(undefined);
    const result = await api.requestCampaignProposals({
      workspaceId,
      campaignId: board.campaign.id,
      directionId,
      baseCanvasId: base.id,
      candidateCount: 3,
    });
    if (result.ok) {
      setProposalRun(result.value);
      setMessage("Proposal-only directions returned. Nothing is saved until accepted.");
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  async function decideProposal(candidateId: string, decision: "accept" | "reject") {
    if (!canCoordinate || board === undefined || proposalRun === undefined) return;
    setBusy("decision");
    setFailure(undefined);
    const result =
      decision === "accept"
        ? await api.acceptCampaignProposal({
            workspaceId,
            campaignId: board.campaign.id,
            runId: proposalRun.id,
            candidateId,
            designName: `${board.campaign.name} · accepted direction`,
          })
        : await api.rejectCampaignProposal({
            workspaceId,
            campaignId: board.campaign.id,
            runId: proposalRun.id,
            candidateId,
          });
    if (result.ok) {
      const refreshed = await api.campaignProposalRun({
        workspaceId,
        campaignId: board.campaign.id,
        runId: proposalRun.id,
      });
      if (refreshed.ok) {
        setProposalRun((current) =>
          current === undefined
            ? refreshed.value
            : mergeProposalProofBytes(current, refreshed.value),
        );
      }
      const acceptedDesignId =
        "designId" in result.value ? result.value.designId : undefined;
      if (decision === "accept" && acceptedDesignId !== undefined) {
        await onCampaignChanged();
        await onOpenDesign(acceptedDesignId);
      }
      setMessage(
        decision === "accept"
          ? "Human acceptance saved a new immutable design revision."
          : "Proposal rejection recorded in the campaign audit trail.",
      );
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  async function downloadHandoff() {
    if (board === undefined || busy !== undefined) return;
    setBusy("handoff");
    setFailure(undefined);
    const result = await api.campaignHandoff(workspaceId, board.campaign.id);
    if (result.ok) {
      downloadBytes(result.value.bytes, result.value.mediaType, result.value.filename);
      setMessage(
        `${result.value.fileCount.toString()} verified files bundled · ${result.value.approvedCanvasCount.toString()} approved · ${result.value.unapprovedCanvasCount.toString()} unapproved.`,
      );
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  return (
    <section className="campaign-studio" aria-labelledby="campaign-studio-title">
      <header className="campaign-studio-header">
        <div>
          <p className="section-kicker">Campaign coordination</p>
          <h2 id="campaign-studio-title">Option board → verified handoff</h2>
        </div>
        <p>One immutable revision per canvas. Branches copy locks, not hidden state.</p>
      </header>

      {failure === undefined ? null : (
        <div className="app-alert campaign-alert" role="alert">
          <strong>{failure.error.title}</strong>
          <p>{failure.error.detail}</p>
        </div>
      )}

      <div className="campaign-command-rail">
        <form onSubmit={(event) => void createCampaign(event)}>
          <span>01 / BRIEF</span>
          <label>
            Campaign name
            <input name="campaignName" maxLength={160} required />
          </label>
          <label>
            Brief
            <textarea name="campaignBrief" maxLength={4000} required rows={3} />
          </label>
          <label>
            Campaign seed
            <input name="campaignSeed" maxLength={256} required />
          </label>
          <button
            className="secondary-action"
            disabled={!canCoordinate || busy !== undefined}
          >
            Create campaign
          </button>
        </form>

        <div className="campaign-selector-panel">
          <span>02 / BOARD</span>
          <label htmlFor="campaign-selector">Active campaign</label>
          <select
            id="campaign-selector"
            value={selectedCampaignId ?? ""}
            disabled={campaigns.length === 0 || busy !== undefined}
            onChange={(event) => {
              const campaignId = event.currentTarget.value;
              setSelectedCampaignId(campaignId);
              setCanvasSeedPlan(undefined);
              void loadBoard(campaignId);
            }}
          >
            {campaigns.length === 0 ? <option value="">No campaign yet</option> : null}
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
          {board === undefined ? (
            <p>Seal a brief to open a direction board.</p>
          ) : (
            <>
              <blockquote>{board.campaign.brief}</blockquote>
              <button
                className="quiet-action"
                type="button"
                disabled={busy !== undefined}
                onClick={() => void downloadHandoff()}
              >
                Build verified handoff
              </button>
            </>
          )}
        </div>
      </div>

      {board === undefined ? null : (
        <>
          <form
            className="direction-composer"
            onSubmit={(event) => void createDirection(event)}
          >
            <div>
              <span>03 / DIRECTION</span>
              <label>
                Direction key
                <input
                  name="directionKey"
                  pattern="[a-zA-Z0-9][a-zA-Z0-9._:-]*"
                  required
                />
              </label>
              <label>
                Direction name
                <input name="directionName" maxLength={160} required />
              </label>
            </div>
            <fieldset>
              <legend>Human locks</legend>
              {LOCKS.map((lock) => (
                <label key={lock}>
                  <input type="checkbox" name={`lock-${lock}`} />
                  {lock}
                </label>
              ))}
            </fieldset>
            <button
              className="secondary-action"
              disabled={!canCoordinate || busy !== undefined}
            >
              Add direction
            </button>
          </form>

          <div className="option-board" aria-label="Campaign option board">
            {board.directions.length === 0 ? (
              <p className="campaign-empty-state">
                Add a direction, choose what must not move, then attach exact saved
                revisions as canvases.
              </p>
            ) : (
              board.directions.map((direction, directionIndex) => (
                <article className="direction-column" key={direction.id}>
                  <header>
                    <span>{(directionIndex + 1).toString().padStart(2, "0")}</span>
                    <div>
                      <h3>{direction.name}</h3>
                      <small>{direction.directionKey}</small>
                    </div>
                    <button
                      type="button"
                      className="quiet-action"
                      disabled={!canCoordinate || busy !== undefined}
                      onClick={() => void branchDirection(direction.id)}
                    >
                      Branch
                    </button>
                  </header>
                  <p className="direction-locks">
                    {direction.locks.length === 0
                      ? "No locks"
                      : `LOCKED · ${direction.locks.join(" · ")}`}
                  </p>
                  <ol>
                    {direction.canvases.map((canvas) => (
                      <li key={canvas.id}>
                        <span>{canvas.ordinal.toString().padStart(3, "0")}</span>
                        <strong>{canvas.canvasKey}</strong>
                        <small>
                          {canvas.format} · {canvas.revisionId.slice(0, 8)}
                        </small>
                        <button
                          type="button"
                          className="text-action"
                          onClick={() =>
                            void onOpenDesign(canvas.designId, canvas.revisionId)
                          }
                        >
                          Open revision
                        </button>
                      </li>
                    ))}
                  </ol>
                  {direction.canvases.at(0) === undefined ? null : (
                    <button
                      type="button"
                      className="text-action"
                      disabled={!canCoordinate || busy !== undefined}
                      onClick={() => {
                        const baseCanvas = direction.canvases.at(0);
                        if (baseCanvas !== undefined) {
                          void requestProposals(baseCanvas, direction.id);
                        }
                      }}
                    >
                      Request 3 optional proposals
                    </button>
                  )}
                </article>
              ))
            )}
          </div>

          <form
            className="canvas-attachment"
            onSubmit={(event) => void attachCanvas(event)}
          >
            <span>04 / ATTACH EXACT REVISION</span>
            <label>
              Direction
              <select
                name="canvasDirection"
                required
                value={canvasDirectionId}
                disabled={busy !== undefined}
                onChange={(event) => {
                  setCanvasDirectionId(event.currentTarget.value);
                  setCanvasSeedPlan(undefined);
                }}
              >
                {board.directions.map((direction) => (
                  <option key={direction.id} value={direction.id}>
                    {direction.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Canvas key
              <input
                name="canvasKey"
                pattern="[a-zA-Z0-9][a-zA-Z0-9._:-]*"
                maxLength={160}
                required
                value={canvasKey}
                disabled={busy !== undefined}
                onChange={(event) => {
                  setCanvasKey(event.currentTarget.value);
                  setCanvasSeedPlan(undefined);
                }}
              />
            </label>
            <label>
              Order
              <input
                name="canvasOrdinal"
                type="number"
                min={0}
                max={999}
                defaultValue={0}
                required
              />
            </label>
            <p>
              {openRevision === undefined
                ? "Open a saved revision first."
                : `Open: ${openRevision.designName} · revision ${openRevision.revisionNumber.toString()}`}
            </p>
            <p>
              Draft scope: {draftCanvas.templateId} · {draftCanvas.format}. The planned
              seed is advisory and will be recomputed when the exact revision is
              attached.
            </p>
            <button
              className="quiet-action"
              type="button"
              disabled={
                !canCoordinate || currentCanvasScope === undefined || busy !== undefined
              }
              onClick={() => void planCanvasSeed()}
            >
              Plan canvas seed
            </button>
            {currentCanvasSeedPlan === undefined ? null : (
              <div>
                <small>
                  {currentCanvasSeedPlan.result.seedDerivationVersion} · template{" "}
                  {currentCanvasSeedPlan.result.template.id}@
                  {currentCanvasSeedPlan.result.template.version}
                </small>
                <code>{currentCanvasSeedPlan.result.canvasSeed}</code>
                <button
                  className="quiet-action"
                  type="button"
                  disabled={
                    !canCoordinate || draftMatchesCanvasSeed || busy !== undefined
                  }
                  onClick={() => {
                    onApplyCanvasSeed(currentCanvasSeedPlan.result.canvasSeed);
                    setMessage(
                      "Canvas seed applied to the draft only. Preview, save, and reopen it before attachment.",
                    );
                  }}
                >
                  Apply seed to draft
                </button>
              </div>
            )}
            <p>
              {currentCanvasSeedPlan === undefined
                ? "Plan a seed for the current scope before attachment."
                : !draftMatchesCanvasSeed
                  ? "Apply the planned seed to the current draft."
                  : !revisionMatchesCanvasSeed
                    ? "Preview, save, and reopen a revision with this exact seed, template version, and format."
                    : "The reopened immutable revision matches this canvas seed plan."}
            </p>
            <button className="secondary-action" disabled={!canAttachCanvas}>
              Attach revision
            </button>
          </form>

          {canvases.length < 2 ? null : (
            <section
              className="proof-comparison"
              aria-labelledby="proof-comparison-title"
            >
              <header>
                <div>
                  <span>05 / COMPARE</span>
                  <h3 id="proof-comparison-title">Exact revision proofs</h3>
                </div>
                <div>
                  <select
                    aria-label="Left campaign canvas"
                    value={leftCanvasId}
                    onChange={(event) => {
                      setLeftCanvasId(event.currentTarget.value);
                    }}
                  >
                    {canvases.map(({ direction, canvas }) => (
                      <option key={canvas.id} value={canvas.id}>
                        {direction.name} · {canvas.canvasKey}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Right campaign canvas"
                    value={rightCanvasId}
                    onChange={(event) => {
                      setRightCanvasId(event.currentTarget.value);
                    }}
                  >
                    {canvases.map(({ direction, canvas }) => (
                      <option key={canvas.id} value={canvas.id}>
                        {direction.name} · {canvas.canvasKey}
                      </option>
                    ))}
                  </select>
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => void compareCanvases()}
                    disabled={busy !== undefined || leftCanvasId === rightCanvasId}
                  >
                    Render side by side
                  </button>
                </div>
              </header>
              {comparison === undefined ? null : (
                <div className="comparison-spread">
                  <ProofFigure side={comparison.left} label="A" />
                  <ProofFigure side={comparison.right} label="B" />
                </div>
              )}
            </section>
          )}

          {proposalRun === undefined ? null : (
            <section className="proposal-board" aria-labelledby="proposal-board-title">
              <header>
                <div>
                  <span>OPTIONAL / PROPOSAL-ONLY</span>
                  <h3 id="proposal-board-title">Model suggestions under human locks</h3>
                </div>
                <p>{proposalRun.descriptor.retentionDisclosure}</p>
              </header>
              <div>
                {proposalRun.candidates.map((candidate) => {
                  const png = candidate.proof?.outputs.find(
                    (output) => output.format === "png",
                  );
                  return (
                    <article key={candidate.id} data-status={candidate.status}>
                      <span>
                        OPTION {(candidate.index + 1).toString().padStart(2, "0")}
                      </span>
                      {png?.base64 === undefined ? (
                        <div className="proposal-proof-missing">
                          No accepted Core proof
                        </div>
                      ) : (
                        // The parser bounds this inert base64 field before it reaches the UI.
                        // eslint-disable-next-line @next/next/no-img-element -- bounded in-memory Core proof, not a network image.
                        <img
                          src={`data:${png.mimeType};base64,${png.base64}`}
                          alt={`Core proof for proposal ${(candidate.index + 1).toString()}`}
                        />
                      )}
                      <p>
                        {candidate.rationale?.text ?? "Provider candidate rejected."}
                      </p>
                      {candidate.issues.length === 0 ? null : (
                        <ul>
                          {candidate.issues.map((issue) => (
                            <li key={`${issue.code}-${issue.message}`}>
                              {issue.message}
                            </li>
                          ))}
                        </ul>
                      )}
                      {candidate.decision === undefined &&
                      candidate.status === "proved" ? (
                        <div>
                          <button
                            type="button"
                            className="secondary-action"
                            disabled={busy !== undefined}
                            onClick={() => void decideProposal(candidate.id, "accept")}
                          >
                            Accept into new design
                          </button>
                          <button
                            type="button"
                            className="text-action"
                            disabled={busy !== undefined}
                            onClick={() => void decideProposal(candidate.id, "reject")}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <strong>
                          {candidate.decision?.decision.toUpperCase() ??
                            "REJECTED BY BOUNDARY"}
                        </strong>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      <p className="campaign-status" role="status" aria-live="polite">
        <span aria-hidden="true">◆</span>
        {busy === undefined
          ? message
          : "Working through the bounded campaign workflow…"}
      </p>
    </section>
  );
}

function ProofFigure({
  side,
  label,
}: {
  side: RevisionComparison["left"];
  label: string;
}) {
  const png = side.proof.outputs.find((output) => output.format === "png");
  return (
    <figure>
      <figcaption>
        <span>{label}</span>
        <strong>{side.revision.designName}</strong>
        <small>REV {side.revision.revisionNumber.toString().padStart(3, "0")}</small>
      </figcaption>
      {png === undefined ? null : (
        // eslint-disable-next-line @next/next/no-img-element -- bounded in-memory Core proof, not a network image.
        <img
          src={`data:${png.mimeType};base64,${png.base64}`}
          alt={`${side.revision.designName} exact rendered revision`}
        />
      )}
    </figure>
  );
}

function findCanvas(
  canvases: readonly { canvas: CampaignCanvas }[],
  canvasId: string,
): CampaignCanvas | undefined {
  return canvases.find((entry) => entry.canvas.id === canvasId)?.canvas;
}

function sameCanvasSeedScope(
  left: CampaignCanvasSeedInput,
  right: CampaignCanvasSeedInput,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function draftMatchesSeedPlan(
  draft: CampaignDraftCanvas,
  plan: CampaignCanvasSeedPlan | undefined,
): boolean {
  return draft.seed === plan?.result.canvasSeed;
}

function revisionMatchesSeedPlan(
  revision: DesignRevision | undefined,
  plan: CampaignCanvasSeedPlan | undefined,
): boolean {
  const document = revision?.document;
  const result = plan?.result;
  return (
    result !== undefined &&
    document?.seed === result.canvasSeed &&
    document.template.id === result.template.id &&
    document.template.version === result.template.version &&
    document.format === result.format
  );
}

function requiredFormText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function downloadBytes(bytes: Uint8Array, mediaType: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes).buffer], { type: mediaType }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function mergeProposalProofBytes(
  current: CampaignProposalRun,
  refreshed: CampaignProposalRun,
): CampaignProposalRun {
  if (current.id !== refreshed.id) return refreshed;
  return {
    ...refreshed,
    candidates: refreshed.candidates.map((candidate) => {
      const previous = current.candidates.find((entry) => entry.id === candidate.id);
      if (
        previous?.canonicalHash === undefined ||
        previous.canonicalHash !== candidate.canonicalHash ||
        previous.proof === undefined ||
        candidate.proof === undefined ||
        canonicalJson(proofMetadata(previous.proof)) !==
          canonicalJson(proofMetadata(candidate.proof))
      ) {
        return candidate;
      }
      return {
        ...candidate,
        proof: {
          ...candidate.proof,
          outputs: candidate.proof.outputs.map((output) => {
            const priorOutput = previous.proof?.outputs.find(
              (entry) => entry.format === output.format,
            );
            return priorOutput?.base64 === undefined
              ? output
              : { ...output, base64: priorOutput.base64 };
          }),
        },
      };
    }),
  };
}

function proofMetadata(
  proof: NonNullable<CampaignProposalRun["candidates"][number]["proof"]>,
) {
  return {
    qualityIssues: proof.qualityIssues,
    evidence: proof.evidence,
    outputs: proof.outputs.map((output) => {
      const metadata = { ...output };
      delete metadata.base64;
      return metadata;
    }),
  };
}
