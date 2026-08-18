"use client";

import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { CAROUSEL_NARRATIVE_ROLE_IDS } from "@glyphkiln/core/browser";

import type { CampaignSummary } from "@/server/app-workflow";

import type {
  ApiFailure,
  AppAlphaApi,
  CampaignBoard,
  CampaignCanvas,
  CampaignCanvasSeedInput,
  CampaignProposalRun,
  DesignRevision,
  RevisionComparison,
} from "./api-client";
import {
  CAMPAIGN_CANVAS_KEY_PATTERN,
  CAMPAIGN_LOCKS,
  campaignCompositionVariant,
  downloadBytes,
  draftMatchesSeedPlan,
  findCampaignCanvas,
  mergeProposalProofBytes,
  requiredFormText,
  revisionMatchesSeedPlan,
  sameCanvasSeedScope,
  type CampaignCanvasSeedPlan,
  type CampaignDraftCanvas,
} from "./campaign-studio-model";
import {
  CampaignCanvasAttachment,
  CampaignCommandRail,
  CampaignDirectionComposer,
  CampaignOptionBoard,
  CampaignProofComparison,
  CampaignProposalBoard,
} from "./campaign-studio-sections";

type CampaignStudioProps = {
  api: AppAlphaApi;
  workspaceId: string;
  campaigns: CampaignSummary[];
  draftCanvas: CampaignDraftCanvas;
  openRevision?: DesignRevision;
  canCoordinate: boolean;
  onApplyCanvasSeed: (seed: string) => void;
  onCampaignChanged: () => Promise<void>;
  onOpenDesign: (designId: string, revisionId?: string) => Promise<void>;
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
}: CampaignStudioProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>();
  const [board, setBoard] = useState<CampaignBoard>();
  const [proposalRun, setProposalRun] = useState<CampaignProposalRun>();
  const [comparison, setComparison] = useState<RevisionComparison>();
  const [leftCanvasId, setLeftCanvasId] = useState("");
  const [rightCanvasId, setRightCanvasId] = useState("");
  const [handoffDirectionId, setHandoffDirectionId] = useState("");
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
      !CAMPAIGN_CANVAS_KEY_PATTERN.test(canvasKey)
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
      compositionVariantId: campaignCompositionVariant(draftCanvas.templateId),
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
      setProposalRun(undefined);
      setCanvasSeedPlan(undefined);
      synchronizeBoardSelections(result.value);
      setMessage(
        `Option board loaded · ${countCampaignCanvases(result.value).toString()} canvases.`,
      );
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  function synchronizeBoardSelections(nextBoard: CampaignBoard): void {
    const directionIds = nextBoard.directions.map((direction) => direction.id);
    setHandoffDirectionId((current) =>
      directionIds.includes(current) ? current : (directionIds.at(0) ?? ""),
    );
    setCanvasDirectionId((current) =>
      directionIds.includes(current) ? current : (directionIds.at(0) ?? ""),
    );
    const canvasIds = nextBoard.directions.flatMap((direction) =>
      direction.canvases.map((canvas) => canvas.id),
    );
    setLeftCanvasId((current) =>
      canvasIds.includes(current) ? current : (canvasIds.at(0) ?? ""),
    );
    setRightCanvasId((current) =>
      canvasIds.includes(current) ? current : (canvasIds.at(1) ?? ""),
    );
  }

  async function createCampaign(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
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

  async function createDirection(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
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
      locks: CAMPAIGN_LOCKS.filter((lock) => form.get(`lock-${lock}`) === "on"),
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

  async function branchDirection(sourceDirectionId: string): Promise<void> {
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

  async function attachCanvas(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (
      openRevision === undefined ||
      board === undefined ||
      currentCanvasSeedPlan === undefined ||
      !canAttachCanvas
    ) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const narrativeRole = CAROUSEL_NARRATIVE_ROLE_IDS.find(
      (role) => role === requiredFormText(form, "narrativeRole"),
    );
    if (narrativeRole === undefined) return;
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
      narrativeRole,
      compositionVariantId: currentCanvasSeedPlan.scope.compositionVariantId,
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
    if (!canCoordinate || currentCanvasScope === undefined || busy !== undefined) {
      return;
    }
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

  async function compareCanvases(): Promise<void> {
    const left = findCampaignCanvas(canvases, leftCanvasId);
    const right = findCampaignCanvas(canvases, rightCanvasId);
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

  async function requestProposals(
    base: CampaignCanvas,
    directionId: string,
  ): Promise<void> {
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

  async function openProposalRun(runId: string): Promise<void> {
    if (board === undefined || busy !== undefined) return;
    setBusy("proposal-history");
    setFailure(undefined);
    const result = await api.campaignProposalRun({
      workspaceId,
      campaignId: board.campaign.id,
      runId,
    });
    if (result.ok) {
      setProposalRun(result.value);
      setMessage("Stored proposal history loaded. Decisions remain immutable.");
    } else {
      setFailure(result);
    }
    setBusy(undefined);
  }

  async function decideProposal(
    candidateId: string,
    decision: "accept" | "reject",
  ): Promise<void> {
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
      await refreshProposalRun(proposalRun);
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

  async function refreshProposalRun(current: CampaignProposalRun): Promise<void> {
    if (board === undefined) return;
    const refreshed = await api.campaignProposalRun({
      workspaceId,
      campaignId: board.campaign.id,
      runId: current.id,
    });
    if (!refreshed.ok) return;
    setProposalRun((existing) =>
      existing === undefined
        ? refreshed.value
        : mergeProposalProofBytes(existing, refreshed.value),
    );
  }

  async function downloadHandoff(): Promise<void> {
    if (board === undefined || handoffDirectionId === "" || busy !== undefined) {
      return;
    }
    setBusy("handoff");
    setFailure(undefined);
    const result = await api.campaignHandoff({
      workspaceId,
      campaignId: board.campaign.id,
      directionId: handoffDirectionId,
    });
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

  const isBusy = busy !== undefined;
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

      <CampaignCommandRail
        campaigns={campaigns}
        selectedCampaignId={selectedCampaignId}
        board={board}
        handoffDirectionId={handoffDirectionId}
        canCoordinate={canCoordinate}
        isBusy={isBusy}
        onCreateCampaign={(event) => void createCampaign(event)}
        onSelectCampaign={(campaignId) => {
          setSelectedCampaignId(campaignId);
          setCanvasSeedPlan(undefined);
          void loadBoard(campaignId);
        }}
        onHandoffDirectionChange={setHandoffDirectionId}
        onDownloadHandoff={() => void downloadHandoff()}
      />

      {board === undefined ? null : (
        <>
          <CampaignDirectionComposer
            canCoordinate={canCoordinate}
            isBusy={isBusy}
            onCreateDirection={(event) => void createDirection(event)}
          />
          <CampaignOptionBoard
            board={board}
            canCoordinate={canCoordinate}
            isBusy={isBusy}
            onBranchDirection={(directionId) => void branchDirection(directionId)}
            onOpenDesign={(designId, revisionId) =>
              void onOpenDesign(designId, revisionId)
            }
            onRequestProposals={(base, directionId) =>
              void requestProposals(base, directionId)
            }
            onOpenProposalRun={(runId) => void openProposalRun(runId)}
          />
          <CampaignCanvasAttachment
            board={board}
            openRevision={openRevision}
            draftCanvas={draftCanvas}
            canvasDirectionId={canvasDirectionId}
            canvasKey={canvasKey}
            seedPlan={currentCanvasSeedPlan}
            hasValidScope={currentCanvasScope !== undefined}
            draftMatchesSeed={draftMatchesCanvasSeed}
            revisionMatchesSeed={revisionMatchesCanvasSeed}
            canCoordinate={canCoordinate}
            canAttachCanvas={canAttachCanvas}
            isBusy={isBusy}
            onDirectionChange={(directionId) => {
              setCanvasDirectionId(directionId);
              setCanvasSeedPlan(undefined);
            }}
            onCanvasKeyChange={(nextCanvasKey) => {
              setCanvasKey(nextCanvasKey);
              setCanvasSeedPlan(undefined);
            }}
            onPlanSeed={() => void planCanvasSeed()}
            onApplySeed={() => {
              if (currentCanvasSeedPlan === undefined) return;
              onApplyCanvasSeed(currentCanvasSeedPlan.result.canvasSeed);
              setMessage(
                "Canvas seed applied to the draft only. Preview, save, and reopen it before attachment.",
              );
            }}
            onAttachCanvas={(event) => void attachCanvas(event)}
          />
          <CampaignProofComparison
            canvases={canvases}
            leftCanvasId={leftCanvasId}
            rightCanvasId={rightCanvasId}
            comparison={comparison}
            isBusy={isBusy}
            onLeftCanvasChange={setLeftCanvasId}
            onRightCanvasChange={setRightCanvasId}
            onCompare={() => void compareCanvases()}
          />
          <CampaignProposalBoard
            proposalRun={proposalRun}
            isBusy={isBusy}
            onDecideProposal={(candidateId, decision) =>
              void decideProposal(candidateId, decision)
            }
          />
        </>
      )}

      <p className="campaign-status" role="status" aria-live="polite">
        <span aria-hidden="true">◆</span>
        {isBusy ? "Working through the bounded campaign workflow…" : message}
      </p>
    </section>
  );
}

function countCampaignCanvases(board: CampaignBoard): number {
  return board.directions.reduce(
    (count, direction) => count + direction.canvases.length,
    0,
  );
}
