import type { SyntheticEvent } from "react";
import {
  CAROUSEL_NARRATIVE_ROLE_IDS,
  CAROUSEL_SEQUENCE_LIMITS,
  isBlockingDeliveryEvidence,
} from "@glyphkiln/core/browser";
import type { DeliveryProfile, DeliveryProfileId } from "@glyphkiln/core/browser";

import type { CampaignSummary } from "@/server/app-workflow";

import type {
  CampaignBoard,
  CampaignCanvas,
  CampaignCarouselReview,
  CampaignProposalRun,
  DesignRevision,
  RevisionComparison,
} from "./api-client";
import {
  CAMPAIGN_LOCKS,
  type CampaignCanvasSeedPlan,
  type CampaignDraftCanvas,
} from "./campaign-studio-model";
import { RevisionProofFigure } from "./revision-proof-figure";

const MAXIMUM_SOURCE_NOTES_TEXT_CHARACTERS =
  CAROUSEL_SEQUENCE_LIMITS.sourceNotesPerSlide *
  (CAROUSEL_SEQUENCE_LIMITS.sourceNoteLabelCharacters +
    CAROUSEL_SEQUENCE_LIMITS.sourceNoteUrlCharacters +
    4);

type CampaignCanvasEntry = {
  direction: CampaignBoard["directions"][number];
  canvas: CampaignCanvas;
};

export function CampaignCommandRail({
  campaigns,
  selectedCampaignId,
  board,
  handoffDirectionId,
  canCoordinate,
  isBusy,
  onCreateCampaign,
  onSelectCampaign,
  onHandoffDirectionChange,
  onDownloadHandoff,
}: {
  campaigns: CampaignSummary[];
  selectedCampaignId?: string;
  board?: CampaignBoard;
  handoffDirectionId: string;
  canCoordinate: boolean;
  isBusy: boolean;
  onCreateCampaign: (event: SyntheticEvent<HTMLFormElement>) => void;
  onSelectCampaign: (campaignId: string) => void;
  onHandoffDirectionChange: (directionId: string) => void;
  onDownloadHandoff: () => void;
}) {
  return (
    <div className="campaign-command-rail">
      <form onSubmit={onCreateCampaign}>
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
        <button className="secondary-action" disabled={!canCoordinate || isBusy}>
          Create campaign
        </button>
      </form>

      <div className="campaign-selector-panel">
        <span>02 / BOARD</span>
        <label htmlFor="campaign-selector">Active campaign</label>
        <select
          id="campaign-selector"
          value={selectedCampaignId ?? ""}
          disabled={campaigns.length === 0 || isBusy}
          onChange={(event) => {
            onSelectCampaign(event.currentTarget.value);
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
            <label htmlFor="campaign-handoff-direction">Production direction</label>
            <select
              id="campaign-handoff-direction"
              value={handoffDirectionId}
              disabled={board.directions.length === 0 || isBusy}
              onChange={(event) => {
                onHandoffDirectionChange(event.currentTarget.value);
              }}
            >
              {board.directions.length === 0 ? (
                <option value="">No direction yet</option>
              ) : null}
              {board.directions.map((direction) => (
                <option key={direction.id} value={direction.id}>
                  {direction.name}
                </option>
              ))}
            </select>
            <button
              className="quiet-action"
              type="button"
              disabled={isBusy || handoffDirectionId === ""}
              onClick={onDownloadHandoff}
            >
              Build verified handoff
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function CampaignDirectionComposer({
  canCoordinate,
  isBusy,
  onCreateDirection,
}: {
  canCoordinate: boolean;
  isBusy: boolean;
  onCreateDirection: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="direction-composer" onSubmit={onCreateDirection}>
      <div>
        <span>03 / DIRECTION</span>
        <label>
          Direction key
          <input name="directionKey" pattern="[a-zA-Z0-9][a-zA-Z0-9._:-]*" required />
        </label>
        <label>
          Direction name
          <input name="directionName" maxLength={160} required />
        </label>
      </div>
      <fieldset>
        <legend>Human locks</legend>
        {CAMPAIGN_LOCKS.map((lock) => (
          <label key={lock}>
            <input type="checkbox" name={`lock-${lock}`} />
            {lock}
          </label>
        ))}
      </fieldset>
      <button className="secondary-action" disabled={!canCoordinate || isBusy}>
        Add direction
      </button>
    </form>
  );
}

export function CampaignOptionBoard({
  board,
  canCoordinate,
  isBusy,
  onBranchDirection,
  onOpenDesign,
  onRequestProposals,
  onOpenProposalRun,
  onReviewCarousel,
}: {
  board: CampaignBoard;
  canCoordinate: boolean;
  isBusy: boolean;
  onBranchDirection: (directionId: string) => void;
  onOpenDesign: (designId: string, revisionId?: string) => void;
  onRequestProposals: (base: CampaignCanvas, directionId: string) => void;
  onOpenProposalRun: (runId: string) => void;
  onReviewCarousel: (directionId: string, sequenceKey: string) => void;
}) {
  return (
    <div className="option-board" aria-label="Campaign option board">
      {board.directions.length === 0 ? (
        <p className="campaign-empty-state">
          Add a direction, choose what must not move, then attach exact saved revisions
          as canvases.
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
                disabled={!canCoordinate || isBusy}
                onClick={() => {
                  onBranchDirection(direction.id);
                }}
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
                  <em>{canvas.narrativeRole}</em>
                  <small>
                    {canvas.format}
                    {canvas.deliveryProfileId === undefined
                      ? ""
                      : ` · ${canvas.deliveryProfileId}`}{" "}
                    {canvas.carouselSequenceKey === undefined
                      ? ""
                      : `· sequence ${canvas.carouselSequenceKey} `}
                    {canvas.altText === undefined ? "" : "· publisher alt ready "}
                    {canvas.sourceNotes === undefined
                      ? ""
                      : `· ${canvas.sourceNotes.length.toString()} source note${canvas.sourceNotes.length === 1 ? "" : "s"} `}
                    · {canvas.revisionId.slice(0, 8)}
                  </small>
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => {
                      onOpenDesign(canvas.designId, canvas.revisionId);
                    }}
                  >
                    Open revision
                  </button>
                </li>
              ))}
            </ol>
            {campaignCarouselSequenceKeys(direction).length === 0 ? null : (
              <div className="carousel-sequence-actions">
                <strong>Carousel sequences</strong>
                {campaignCarouselSequenceKeys(direction).map((sequenceKey) => (
                  <button
                    key={sequenceKey}
                    type="button"
                    className="text-action"
                    disabled={isBusy}
                    onClick={() => {
                      onReviewCarousel(direction.id, sequenceKey);
                    }}
                  >
                    Review sequence {sequenceKey}
                  </button>
                ))}
              </div>
            )}
            {direction.canvases.at(0) === undefined ? null : (
              <button
                type="button"
                className="text-action"
                disabled={!canCoordinate || isBusy}
                onClick={() => {
                  const baseCanvas = direction.canvases.at(0);
                  if (baseCanvas !== undefined) {
                    onRequestProposals(baseCanvas, direction.id);
                  }
                }}
              >
                Request 3 optional proposals
              </button>
            )}
            {direction.proposalRuns.length === 0 ? null : (
              <div className="proposal-history">
                <strong>Proposal history</strong>
                <ul>
                  {direction.proposalRuns.map((run, runIndex) => (
                    <li key={run.id}>
                      <button
                        type="button"
                        className="text-action"
                        disabled={isBusy}
                        onClick={() => {
                          onOpenProposalRun(run.id);
                        }}
                      >
                        Open run {(runIndex + 1).toString().padStart(2, "0")}
                      </button>
                      <small>
                        {run.providerId} · {run.modelId} · {run.decidedCount}/
                        {run.candidateCount} decided
                      </small>
                      <time dateTime={run.createdAt}>{run.createdAt}</time>
                    </li>
                  ))}
                </ul>
                {direction.proposalRunsTruncated ? (
                  <small>Showing the 20 most recent proposal runs.</small>
                ) : null}
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}

function campaignCarouselSequenceKeys(
  direction: CampaignBoard["directions"][number],
): string[] {
  return [
    ...new Set(
      direction.canvases.flatMap((canvas) =>
        canvas.carouselSequenceKey === undefined ? [] : [canvas.carouselSequenceKey],
      ),
    ),
  ].sort();
}

export function CampaignCarouselReviewPanel({
  carouselReview,
}: {
  carouselReview?: CampaignCarouselReview;
}) {
  if (carouselReview === undefined) return null;
  return (
    <section
      className="campaign-carousel-review"
      aria-labelledby="carousel-review-title"
    >
      <header>
        <div>
          <span>SEQUENCE REVIEW</span>
          <h3 id="carousel-review-title">{carouselReview.sequenceKey}</h3>
        </div>
        <strong data-status={carouselReview.review.success ? "pass" : "blocked"}>
          {carouselReview.review.success ? "READY FOR HANDOFF" : "BLOCKED"}
        </strong>
      </header>
      <p>
        {carouselReview.directionKey} · {carouselReview.review.deliveryProfileId} ·{" "}
        {carouselReview.slides.length.toString()} slides
      </p>
      {carouselReview.review.issues.length === 0 ? (
        <p>No sequence issues found.</p>
      ) : (
        <ul className="carousel-review-issues">
          {carouselReview.review.issues.map((issue, index) => (
            <li
              key={`${issue.code}-${issue.slideId ?? "sequence"}-${index.toString()}`}
            >
              <strong>{issue.severity.toUpperCase()}</strong>
              <code>{issue.code}</code>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
      <ol className="carousel-review-slides">
        {carouselReview.slides.map(({ canvas, proof }) => {
          const preview = proof.outputs.find((output) => output.format === "png");
          return (
            <li key={canvas.id}>
              <header>
                <span>{canvas.ordinal.toString().padStart(2, "0")}</span>
                <div>
                  <strong>{canvas.canvasKey}</strong>
                  <small>
                    {canvas.narrativeRole} · {canvas.format}
                  </small>
                </div>
              </header>
              {preview === undefined ? null : (
                // The proof is trusted in-memory output; there is no optimizable URL.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:${preview.mimeType};base64,${preview.base64}`}
                  alt={`Exact rendered proof for ${canvas.canvasKey}.`}
                />
              )}
              <div className="carousel-review-copy">
                <strong>Publisher alt text</strong>
                <p>{canvas.altText}</p>
              </div>
              <div className="carousel-review-sources">
                <strong>Source notes</strong>
                {canvas.sourceNotes === undefined ? (
                  <p>None recorded.</p>
                ) : (
                  <ul>
                    {canvas.sourceNotes.map((note, index) => (
                      <li key={`${note.label}-${index.toString()}`}>
                        {note.url === undefined ? (
                          note.label
                        ) : (
                          <a href={note.url} target="_blank" rel="noreferrer">
                            {note.label}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <details>
                <summary>Exact render evidence</summary>
                <p>
                  Safe area {proof.evidence.safeArea.width.toString()} ×{" "}
                  {proof.evidence.safeArea.height.toString()}
                </p>
                <ul>
                  {proof.evidence.text.map((entry) => (
                    <li key={entry.layerId}>
                      {entry.layerId} · {entry.fontSize.toString()}px
                    </li>
                  ))}
                </ul>
                <ul>
                  {proof.outputs.map((output) => (
                    <li key={output.format}>
                      <strong>{output.format.toUpperCase()}</strong> ·{" "}
                      {output.byteSize.toString()} bytes · {output.fingerprint} · sha256{" "}
                      {output.manifest.output.sha256}
                    </li>
                  ))}
                </ul>
              </details>
              {proof.qualityIssues.length === 0 ? null : (
                <ul className="carousel-proof-issues">
                  {proof.qualityIssues.map((issue, index) => (
                    <li key={`${issue.code}-${index.toString()}`}>
                      {issue.severity} · {issue.code} · {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function CampaignCanvasAttachment({
  board,
  openRevision,
  draftCanvas,
  canvasDirectionId,
  canvasKey,
  seedPlan,
  hasValidScope,
  draftMatchesSeed,
  revisionMatchesSeed,
  canCoordinate,
  canAttachCanvas,
  isBusy,
  deliveryProfiles,
  selectedDeliveryProfileId,
  onDeliveryProfileChange,
  onDirectionChange,
  onCanvasKeyChange,
  onPlanSeed,
  onApplySeed,
  onAttachCanvas,
}: {
  board: CampaignBoard;
  openRevision?: DesignRevision;
  draftCanvas: CampaignDraftCanvas;
  canvasDirectionId: string;
  canvasKey: string;
  seedPlan?: CampaignCanvasSeedPlan;
  hasValidScope: boolean;
  draftMatchesSeed: boolean;
  revisionMatchesSeed: boolean;
  canCoordinate: boolean;
  canAttachCanvas: boolean;
  isBusy: boolean;
  deliveryProfiles: readonly DeliveryProfile[];
  selectedDeliveryProfileId?: DeliveryProfileId;
  onDeliveryProfileChange?: (profileId: DeliveryProfileId) => void;
  onDirectionChange: (directionId: string) => void;
  onCanvasKeyChange: (canvasKey: string) => void;
  onPlanSeed: () => void;
  onApplySeed: () => void;
  onAttachCanvas: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  const selectedDeliveryProfile = deliveryProfiles.find(
    ({ id }) => id === selectedDeliveryProfileId,
  );
  const profileAltTextMaximum =
    selectedDeliveryProfile?.accessibility.value.maximumAltTextCharacters;
  const profileAltTextMaximumIsBlocking =
    selectedDeliveryProfile !== undefined &&
    isBlockingDeliveryEvidence(selectedDeliveryProfile.accessibility.evidence);
  const publisherAltTextLimit =
    profileAltTextMaximumIsBlocking && profileAltTextMaximum !== undefined
      ? profileAltTextMaximum
      : CAROUSEL_SEQUENCE_LIMITS.altTextCharacters;
  return (
    <form className="canvas-attachment" onSubmit={onAttachCanvas}>
      <span>04 / ATTACH EXACT REVISION</span>
      <label>
        Direction
        <select
          name="canvasDirection"
          required
          value={canvasDirectionId}
          disabled={isBusy}
          onChange={(event) => {
            onDirectionChange(event.currentTarget.value);
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
          disabled={isBusy}
          onChange={(event) => {
            onCanvasKeyChange(event.currentTarget.value);
          }}
        />
      </label>
      <label>
        Narrative role
        <select name="narrativeRole" defaultValue="context" required>
          {CAROUSEL_NARRATIVE_ROLE_IDS.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </label>
      {selectedDeliveryProfileId === undefined ? null : (
        <>
          <label>
            Delivery path
            <select
              name="deliveryProfileId"
              value={selectedDeliveryProfileId}
              disabled={isBusy}
              onChange={(event) => {
                const profile = deliveryProfiles.find(
                  ({ id }) => id === event.currentTarget.value,
                );
                if (profile !== undefined) onDeliveryProfileChange?.(profile.id);
              }}
            >
              {deliveryProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Carousel sequence key
            <input
              name="carouselSequenceKey"
              pattern="[a-zA-Z0-9][a-zA-Z0-9._:-]*"
              maxLength={120}
              disabled={isBusy}
              aria-describedby="carousel-sequence-hint"
            />
          </label>
          <small id="carousel-sequence-hint">
            Use one key for every slide in a reviewed sequence; leave blank for a
            standalone canvas.
          </small>
          <label>
            Publisher alt text
            <textarea
              name="altText"
              rows={3}
              maxLength={publisherAltTextLimit}
              disabled={isBusy}
              aria-describedby="carousel-alt-text-hint"
            />
          </label>
          <small id="carousel-alt-text-hint">
            Describe the complete slide for the publishing destination. Required with a
            sequence key; up to {publisherAltTextLimit.toString()} characters
            {profileAltTextMaximum === undefined || profileAltTextMaximumIsBlocking
              ? " for this path."
              : ` in Glyphkiln; this path recommends ${profileAltTextMaximum.toString()}.`}
          </small>
          <label>
            Slide source notes
            <textarea
              name="sourceNotes"
              rows={3}
              maxLength={MAXIMUM_SOURCE_NOTES_TEXT_CHARACTERS}
              disabled={isBusy}
              aria-describedby="carousel-source-notes-hint"
            />
          </label>
          <small id="carousel-source-notes-hint">
            One note per line: label, or label | absolute URL. Up to{" "}
            {CAROUSEL_SEQUENCE_LIMITS.sourceNotesPerSlide.toString()} notes.
          </small>
        </>
      )}
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
        Draft scope: {draftCanvas.templateId} · {draftCanvas.format}. The planned seed
        is advisory and will be recomputed when the exact revision is attached.
      </p>
      <button
        className="quiet-action"
        type="button"
        disabled={!canCoordinate || !hasValidScope || isBusy}
        onClick={onPlanSeed}
      >
        Plan canvas seed
      </button>
      {seedPlan === undefined ? null : (
        <div>
          <small>
            {seedPlan.result.seedDerivationVersion} · template{" "}
            {seedPlan.result.template.id}@{seedPlan.result.template.version}
          </small>
          <code>{seedPlan.result.canvasSeed}</code>
          <button
            className="quiet-action"
            type="button"
            disabled={!canCoordinate || draftMatchesSeed || isBusy}
            onClick={onApplySeed}
          >
            Apply seed to draft
          </button>
        </div>
      )}
      <p>
        {seedPlan === undefined
          ? "Plan a seed for the current scope before attachment."
          : !draftMatchesSeed
            ? "Apply the planned seed to the current draft."
            : !revisionMatchesSeed
              ? "Preview, save, and reopen a revision with this exact seed, template version, and format."
              : "The reopened immutable revision matches this canvas seed plan."}
      </p>
      <button className="secondary-action" disabled={!canAttachCanvas}>
        Attach revision
      </button>
    </form>
  );
}

export function CampaignProofComparison({
  canvases,
  leftCanvasId,
  rightCanvasId,
  comparison,
  isBusy,
  onLeftCanvasChange,
  onRightCanvasChange,
  onCompare,
}: {
  canvases: CampaignCanvasEntry[];
  leftCanvasId: string;
  rightCanvasId: string;
  comparison?: RevisionComparison;
  isBusy: boolean;
  onLeftCanvasChange: (canvasId: string) => void;
  onRightCanvasChange: (canvasId: string) => void;
  onCompare: () => void;
}) {
  if (canvases.length < 2) return null;
  return (
    <section className="proof-comparison" aria-labelledby="proof-comparison-title">
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
              onLeftCanvasChange(event.currentTarget.value);
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
              onRightCanvasChange(event.currentTarget.value);
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
            onClick={onCompare}
            disabled={isBusy || leftCanvasId === rightCanvasId}
          >
            Render side by side
          </button>
        </div>
      </header>
      {comparison === undefined ? null : (
        <div className="comparison-spread">
          <RevisionProofFigure
            side={comparison.left}
            caption={
              <>
                <span>A</span>
                <strong>{comparison.left.revision.designName}</strong>
                <small>
                  REV{" "}
                  {comparison.left.revision.revisionNumber.toString().padStart(3, "0")}
                </small>
              </>
            }
            alt={`${comparison.left.revision.designName} exact rendered revision`}
          />
          <RevisionProofFigure
            side={comparison.right}
            caption={
              <>
                <span>B</span>
                <strong>{comparison.right.revision.designName}</strong>
                <small>
                  REV{" "}
                  {comparison.right.revision.revisionNumber.toString().padStart(3, "0")}
                </small>
              </>
            }
            alt={`${comparison.right.revision.designName} exact rendered revision`}
          />
        </div>
      )}
    </section>
  );
}

export function CampaignProposalBoard({
  proposalRun,
  isBusy,
  onDecideProposal,
}: {
  proposalRun?: CampaignProposalRun;
  isBusy: boolean;
  onDecideProposal: (candidateId: string, decision: "accept" | "reject") => void;
}) {
  if (proposalRun === undefined) return null;
  return (
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
              <span>OPTION {(candidate.index + 1).toString().padStart(2, "0")}</span>
              {png?.base64 === undefined ? (
                <div className="proposal-proof-missing">No accepted Core proof</div>
              ) : (
                // The parser bounds this inert base64 field before it reaches the UI.
                // eslint-disable-next-line @next/next/no-img-element -- bounded in-memory Core proof, not a network image.
                <img
                  src={`data:${png.mimeType};base64,${png.base64}`}
                  alt={`Core proof for proposal ${(candidate.index + 1).toString()}`}
                />
              )}
              <p>{candidate.rationale?.text ?? "Provider candidate rejected."}</p>
              {candidate.issues.length === 0 ? null : (
                <ul>
                  {candidate.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
                  ))}
                </ul>
              )}
              {candidate.decision === undefined && candidate.status === "proved" ? (
                <div>
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={isBusy}
                    onClick={() => {
                      onDecideProposal(candidate.id, "accept");
                    }}
                  >
                    Accept into new design
                  </button>
                  <button
                    type="button"
                    className="text-action"
                    disabled={isBusy}
                    onClick={() => {
                      onDecideProposal(candidate.id, "reject");
                    }}
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <strong>
                  {candidate.decision?.decision.toUpperCase() ?? "REJECTED BY BOUNDARY"}
                </strong>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
