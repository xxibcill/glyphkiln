"use client";

import { canonicalJson } from "@glyphkiln/core/browser";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";

import { EditorControls } from "@/features/project-preview/editor-controls";
import {
  buildPreviewDocument,
  createInitialPreviewForm,
} from "@/features/project-preview/document-builder";
import { PreviewStage } from "@/features/project-preview/preview-stage";
import { ProofLedger } from "@/features/project-preview/proof-ledger";
import {
  previewIntegrityPrerequisiteFailure,
  verifyPreviewIntegrity,
} from "@/features/project-preview/response-parser";
import type {
  PreviewCatalog,
  PreviewFormState,
  PreviewResponse,
  PreviewSuccess,
} from "@/features/project-preview/types";

import { createAppAlphaApi, toPreviewFailure } from "./api-client";
import type {
  ApiFailure,
  AppAlphaApi,
  BrandSnapshotProjection,
  DesignRevision,
  PublishedBrand,
  SelectableResource,
  WorkspaceDashboard,
} from "./api-client";
import { AuthScreen } from "./auth-screen";
import {
  AppHeader,
  AppIdentityHeader,
  DesignIndex,
  DesignLifecycle,
  NoBrandState,
  StartingScreen,
  WorkspaceCreation,
  WorkspaceRegister,
  WorkshopLoading,
  type ActiveBrand,
} from "./app-alpha-workshop";
import { BrandPublisher } from "./brand-publisher";
import type { BrandPublishInput } from "./brand-publisher";
import { CampaignStudio } from "./campaign-studio";
import { DurableExportStation } from "./durable-export-station";
import {
  buildManualDraft,
  documentMatchesManualInput,
  formFromStoredDocument,
  manualDraftKey,
  withBrandSnapshot,
} from "./manual-state";
import { InvitationStation } from "./invitation-station";
import { RevisionReviewStation } from "./revision-review-station";
import { useAppAlphaAccess } from "./use-app-alpha-access";

export type AppAlphaProps = {
  catalog: PreviewCatalog;
  api?: AppAlphaApi;
};

export function AppAlpha({ catalog, api: apiOverride }: AppAlphaProps) {
  const api = useMemo(
    () => apiOverride ?? createAppAlphaApi(undefined, catalog),
    [apiOverride, catalog],
  );
  const [dashboard, setDashboard] = useState<WorkspaceDashboard>();
  const [workspaceResources, setWorkspaceResources] = useState<SelectableResource[]>(
    [],
  );
  const [resourceCatalogTruncated, setResourceCatalogTruncated] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [activeBrand, setActiveBrand] = useState<ActiveBrand>();
  const [showBrandPublisher, setShowBrandPublisher] = useState(false);
  const [showInvitationStation, setShowInvitationStation] = useState(false);
  const [formState, setFormState] = useState<PreviewFormState>(() =>
    createInitialPreviewForm(catalog),
  );
  const [response, setResponse] = useState<PreviewResponse | null>(null);
  const [proof, setProof] = useState<PreviewSuccess | null>(null);
  const [proofDraftKey, setProofDraftKey] = useState<string>();
  const [inspectedDraftKey, setInspectedDraftKey] = useState<string>();
  const [proofKind, setProofKind] = useState<"draft-preview" | "saved-revision">();
  const [openRevision, setOpenRevision] = useState<DesignRevision>();
  const [designName, setDesignName] = useState("Untitled workshop graphic");
  const [changeNote, setChangeNote] = useState("");
  const [activityMessage, setActivityMessage] = useState(
    "Choose a workspace to begin.",
  );
  const workspaceLoadSequence = useRef(0);
  const {
    session,
    isStarting,
    authFailure,
    appFailure,
    busyAction,
    selectedWorkspaceId,
    createdInvitation,
    beginAction,
    finishAction,
    handleFailure: handleReadFailure,
    authenticate,
    logout,
    createWorkspace: createWorkspaceAccess,
    createInvitation,
    acceptInvitation: acceptInvitationAccess,
    selectWorkspace: setSelectedWorkspaceId,
    clearAppFailure,
    reportAppFailure,
    clearCreatedInvitation,
  } = useAppAlphaAccess({
    api,
    onActivity: setActivityMessage,
    onSessionClosed: resetWorkspaceState,
  });

  const draft = useMemo(
    () => buildManualDraft(formState, catalog),
    [catalog, formState],
  );
  const currentDraftKey = useMemo(() => manualDraftKey(draft), [draft]);
  const preflightDocument = useMemo(
    () => buildPreviewDocument(formState, catalog, workspaceResources),
    [catalog, formState, workspaceResources],
  );
  const hasUnrenderedEdits =
    proof !== null && proofDraftKey !== undefined && proofDraftKey !== currentDraftKey;
  const validationIsStale =
    response !== null &&
    inspectedDraftKey !== undefined &&
    inspectedDraftKey !== currentDraftKey;
  const currentWorkspace = session?.workspaces.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  );
  const canEdit = currentWorkspace !== undefined && currentWorkspace.role !== "viewer";
  const canApprove =
    currentWorkspace?.role === "owner" || currentWorkspace?.role === "admin";
  const previewCanBeSaved =
    proofKind === "draft-preview" &&
    proof !== null &&
    !hasUnrenderedEdits &&
    proofDraftKey === currentDraftKey;

  useEffect(() => {
    if (session === null || selectedWorkspaceId === undefined) {
      setDashboard(undefined);
      return;
    }
    const loadSequence = ++workspaceLoadSequence.current;
    setIsDashboardLoading(true);
    setDashboard(undefined);
    clearAppFailure();
    setOpenRevision(undefined);
    setProof(null);
    setResponse(null);
    setActiveBrand(undefined);
    setShowBrandPublisher(false);
    setShowInvitationStation(false);
    clearCreatedInvitation();

    void (async () => {
      const [dashboardResult, resourcesResult] = await Promise.all([
        api.dashboard(selectedWorkspaceId),
        api.resources(selectedWorkspaceId),
      ]);
      if (loadSequence !== workspaceLoadSequence.current) return;
      if (!dashboardResult.ok) {
        handleReadFailure(dashboardResult);
        setIsDashboardLoading(false);
        return;
      }
      if (resourcesResult.ok) {
        setWorkspaceResources(resourcesResult.value.resources);
        setResourceCatalogTruncated(resourcesResult.value.truncated);
      } else {
        setWorkspaceResources([]);
        setResourceCatalogTruncated(false);
        handleReadFailure(resourcesResult);
      }
      setDashboard(dashboardResult.value);
      const latestBrand = dashboardResult.value.brandKits.at(0);
      if (latestBrand === undefined) {
        setShowBrandPublisher(canEdit);
        setActivityMessage(
          canEdit
            ? "Publish the workspace’s first brand snapshot."
            : "This workspace has no published brand snapshot.",
        );
        setIsDashboardLoading(false);
        return;
      }
      const brandResult = await api.brandSnapshot(
        selectedWorkspaceId,
        latestBrand.latestSnapshotId,
      );
      if (loadSequence !== workspaceLoadSequence.current) return;
      if (!brandResult.ok) {
        handleReadFailure(brandResult);
      } else {
        activateBrand(brandResult.value);
        setActivityMessage(`Brand snapshot ${brandResult.value.version} loaded.`);
      }
      setIsDashboardLoading(false);
    })();

    return () => {
      workspaceLoadSequence.current += 1;
    };
  }, [api, selectedWorkspaceId, session]);

  async function createWorkspace(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = form.get("workspaceName");
    if (typeof name !== "string" || name.trim() === "") return;
    await createWorkspaceAccess(name.trim());
  }

  async function refreshDashboard(): Promise<void> {
    if (selectedWorkspaceId === undefined) return;
    const result = await api.dashboard(selectedWorkspaceId);
    if (result.ok) {
      setDashboard(result.value);
    } else {
      handleReadFailure(result);
    }
  }

  async function acceptInvitation(token: string): Promise<void> {
    if (await acceptInvitationAccess(token)) {
      setShowInvitationStation(false);
    }
  }

  function activateBrand(brand: BrandSnapshotProjection | PublishedBrand): void {
    setActiveBrand({
      brandKitId: brand.brandKitId,
      snapshotId: brand.snapshotId,
      version: brand.version,
      canonicalHash: brand.canonicalHash,
      snapshot: brand.snapshot,
    });
    setFormState((current) => withBrandSnapshot(current, brand.snapshot));
    setShowBrandPublisher(false);
    clearProof();
  }

  async function publishBrand(input: BrandPublishInput): Promise<void> {
    if (selectedWorkspaceId === undefined || busyAction !== undefined || !canEdit) {
      return;
    }
    if (!beginAction("brand")) return;
    clearAppFailure();
    const result = await api.publishBrand({
      workspaceId: selectedWorkspaceId,
      ...(activeBrand === undefined ? {} : { brandKitId: activeBrand.brandKitId }),
      ...input,
    });
    if (result.ok) {
      activateBrand(result.value);
      setActivityMessage(
        `Brand snapshot ${result.value.version} published and sealed.`,
      );
      await refreshDashboard();
    } else {
      handleReadFailure(result);
    }
    finishAction();
  }

  async function chooseBrand(event: ChangeEvent<HTMLSelectElement>): Promise<void> {
    if (selectedWorkspaceId === undefined || busyAction !== undefined) return;
    const summary = dashboard?.brandKits.find(
      (brand) => brand.id === event.currentTarget.value,
    );
    if (summary === undefined) return;
    if (!beginAction("brand")) return;
    const result = await api.brandSnapshot(
      selectedWorkspaceId,
      summary.latestSnapshotId,
    );
    if (result.ok) {
      activateBrand(result.value);
      setActivityMessage(`Brand snapshot ${result.value.version} loaded.`);
    } else {
      handleReadFailure(result);
    }
    finishAction();
  }

  async function previewDesign(): Promise<void> {
    if (
      activeBrand === undefined ||
      selectedWorkspaceId === undefined ||
      busyAction !== undefined ||
      !canEdit
    ) {
      return;
    }
    const prerequisiteFailure = previewIntegrityPrerequisiteFailure();
    if (prerequisiteFailure !== null) {
      setResponse(prerequisiteFailure);
      setInspectedDraftKey(currentDraftKey);
      return;
    }

    if (!beginAction("preview")) return;
    clearAppFailure();
    const submittedDraft = draft;
    const submittedKey = currentDraftKey;
    const result = await api.previewDesign({
      workspaceId: selectedWorkspaceId,
      brandSnapshotId: activeBrand.snapshotId,
      draft: submittedDraft,
      ...(openRevision === undefined
        ? {}
        : {
            baseRevision: {
              designId: openRevision.designId,
              revisionId: openRevision.revisionId,
            },
          }),
    });
    if (!result.ok) {
      setResponse(toPreviewFailure(result));
      setInspectedDraftKey(submittedKey);
      finishAction();
      return;
    }
    if (
      !documentMatchesManualInput(
        result.value.document,
        activeBrand.snapshot,
        submittedDraft,
        catalog.developmentFontSha256,
      )
    ) {
      setResponse(integrityFailure("The preview does not match the submitted draft."));
      setInspectedDraftKey(submittedKey);
      finishAction();
      return;
    }
    const integrity = await verifyPreviewIntegrity(
      result.value,
      catalog,
      result.value.document,
    );
    if (integrity !== null) {
      setResponse(integrity);
      setInspectedDraftKey(submittedKey);
      finishAction();
      return;
    }
    setProof(result.value);
    setProofKind("draft-preview");
    setProofDraftKey(submittedKey);
    setResponse(result.value);
    setInspectedDraftKey(submittedKey);
    setActivityMessage(
      "Draft preview verified. It is still unsaved until you save a revision.",
    );
    finishAction();
  }

  async function saveDesign(): Promise<void> {
    if (
      activeBrand === undefined ||
      selectedWorkspaceId === undefined ||
      busyAction !== undefined ||
      !canEdit ||
      !previewCanBeSaved
    ) {
      return;
    }
    if (!beginAction("save")) return;
    clearAppFailure();
    const result =
      openRevision === undefined
        ? await api.createDesign({
            workspaceId: selectedWorkspaceId,
            name: designName.trim(),
            brandSnapshotId: activeBrand.snapshotId,
            draft,
          })
        : await api.reviseDesign({
            workspaceId: selectedWorkspaceId,
            designId: openRevision.designId,
            baseRevisionId: openRevision.revisionId,
            brandSnapshotId: activeBrand.snapshotId,
            draft,
            ...(changeNote.trim() === "" ? {} : { changeNote: changeNote.trim() }),
          });
    if (!result.ok) {
      handleReadFailure(result);
      finishAction();
      return;
    }

    const reopened = await api.revision({
      workspaceId: selectedWorkspaceId,
      designId: result.value.designId,
      revision: { revisionId: result.value.revisionId },
    });
    if (!reopened.ok) {
      handleReadFailure(reopened);
      finishAction();
      return;
    }
    if (
      canonicalJson(reopened.value.document) !== canonicalJson(result.value.document) ||
      reopened.value.documentHash !== result.value.documentHash ||
      reopened.value.brandSnapshotId !== activeBrand.snapshotId
    ) {
      reportAppFailure(
        localFailure(
          "SAVED_REVISION_MISMATCH",
          "Saved revision could not be verified",
          "The reopened revision did not match the document receipt. No export was accepted.",
        ),
      );
      finishAction();
      return;
    }

    setOpenRevision(reopened.value);
    setDesignName(reopened.value.designName);
    setFormState((current) =>
      formFromStoredDocument(reopened.value.document, catalog, current),
    );
    setChangeNote("");
    clearProof();
    setActivityMessage(
      `Revision ${reopened.value.revisionNumber.toString()} saved and reopened from persistent storage.`,
    );
    await refreshDashboard();
    finishAction();
  }

  async function reopenDesign(designId: string, revisionId?: string): Promise<void> {
    if (selectedWorkspaceId === undefined || busyAction !== undefined) return;
    if (!beginAction("reopen")) return;
    clearAppFailure();
    const revisionResult = await api.revision({
      workspaceId: selectedWorkspaceId,
      designId,
      revision: revisionId === undefined ? "head" : { revisionId },
    });
    if (!revisionResult.ok) {
      handleReadFailure(revisionResult);
      finishAction();
      return;
    }
    const brandResult = await api.brandSnapshot(
      selectedWorkspaceId,
      revisionResult.value.brandSnapshotId,
    );
    if (!brandResult.ok) {
      handleReadFailure(brandResult);
      finishAction();
      return;
    }
    setActiveBrand({
      brandKitId: brandResult.value.brandKitId,
      snapshotId: brandResult.value.snapshotId,
      version: brandResult.value.version,
      canonicalHash: brandResult.value.canonicalHash,
      snapshot: brandResult.value.snapshot,
    });
    setOpenRevision(revisionResult.value);
    setDesignName(revisionResult.value.designName);
    setFormState((current) =>
      formFromStoredDocument(revisionResult.value.document, catalog, current),
    );
    setChangeNote("");
    clearProof();
    setActivityMessage(
      `Revision ${revisionResult.value.revisionNumber.toString()} reopened with brand ${brandResult.value.version}.`,
    );
    finishAction();
  }

  async function renderSavedRevision(): Promise<void> {
    if (
      selectedWorkspaceId === undefined ||
      openRevision === undefined ||
      busyAction !== undefined ||
      !canEdit
    ) {
      return;
    }
    const prerequisiteFailure = previewIntegrityPrerequisiteFailure();
    if (prerequisiteFailure !== null) {
      setResponse(prerequisiteFailure);
      setInspectedDraftKey(currentDraftKey);
      return;
    }
    if (!beginAction("render")) return;
    clearAppFailure();
    const expectedDocument = openRevision.document;
    const result = await api.renderRevision({
      workspaceId: selectedWorkspaceId,
      designId: openRevision.designId,
      revisionId: openRevision.revisionId,
    });
    if (!result.ok) {
      setResponse(toPreviewFailure(result));
      setInspectedDraftKey(currentDraftKey);
      finishAction();
      return;
    }
    if (canonicalJson(result.value.document) !== canonicalJson(expectedDocument)) {
      setResponse(
        integrityFailure(
          "The rendered document does not match the reopened saved revision.",
        ),
      );
      setInspectedDraftKey(currentDraftKey);
      finishAction();
      return;
    }
    const integrity = await verifyPreviewIntegrity(
      result.value,
      catalog,
      expectedDocument,
    );
    if (integrity !== null) {
      setResponse(integrity);
      setInspectedDraftKey(currentDraftKey);
      finishAction();
      return;
    }
    setProof(result.value);
    setProofKind("saved-revision");
    setProofDraftKey(currentDraftKey);
    setResponse(result.value);
    setInspectedDraftKey(currentDraftKey);
    setActivityMessage(
      `Exact revision ${openRevision.revisionNumber.toString()} rendered. Downloads are manifest-backed.`,
    );
    finishAction();
  }

  function startNewDesign(): void {
    const initial = createInitialPreviewForm(catalog);
    setFormState(
      activeBrand === undefined
        ? initial
        : withBrandSnapshot(initial, activeBrand.snapshot),
    );
    setOpenRevision(undefined);
    setDesignName("Untitled workshop graphic");
    setChangeNote("");
    clearProof();
    setActivityMessage("New unsaved design started.");
  }

  function resetWorkspaceState(): void {
    workspaceLoadSequence.current += 1;
    setDashboard(undefined);
    setWorkspaceResources([]);
    setResourceCatalogTruncated(false);
    setIsDashboardLoading(false);
    setActiveBrand(undefined);
    setShowBrandPublisher(false);
    setShowInvitationStation(false);
    setOpenRevision(undefined);
    clearProof();
  }

  function applyCampaignCanvasSeed(seed: string): void {
    setFormState((current) => ({
      ...current,
      composition: {
        ...current.composition,
        seed,
      },
    }));
    setActivityMessage(
      "Campaign canvas seed applied to the draft. It remains unsaved and unrendered.",
    );
  }

  function clearProof(): void {
    setProof(null);
    setProofKind(undefined);
    setProofDraftKey(undefined);
    setInspectedDraftKey(undefined);
    setResponse(null);
  }

  if (isStarting) {
    return <StartingScreen catalog={catalog} />;
  }

  if (session === null) {
    return (
      <div className="app-alpha-shell">
        <AppIdentityHeader catalog={catalog} />
        <AuthScreen
          initialFailure={authFailure}
          isBusy={busyAction === "auth"}
          onBootstrap={(input) => authenticate(() => api.bootstrap(input))}
          onLogin={(input) => authenticate(() => api.login(input))}
          onInvitationRegister={(input) =>
            authenticate(() => api.registerWithInvitation(input))
          }
        />
      </div>
    );
  }

  return (
    <div className="app-alpha-shell">
      <a className="skip-link" href="#main-content">
        Skip to design workspace
      </a>
      <AppHeader
        catalog={catalog}
        session={session}
        selectedWorkspaceId={selectedWorkspaceId}
        isBusy={busyAction !== undefined}
        onWorkspaceChange={(workspaceId) => {
          setSelectedWorkspaceId(workspaceId);
          setActivityMessage("Loading workspace…");
        }}
        onLogout={() => {
          void logout();
        }}
      />

      {session.workspaces.length === 0 ? (
        <WorkspaceCreation
          isBusy={busyAction === "workspace"}
          onSubmit={(event) => {
            void createWorkspace(event);
          }}
        />
      ) : (
        <main id="main-content">
          <WorkspaceRegister
            dashboard={dashboard}
            activeBrand={activeBrand}
            isLoading={isDashboardLoading}
            canEdit={canEdit}
            onChooseBrand={(event) => {
              void chooseBrand(event);
            }}
            onPublishBrand={() => {
              setShowBrandPublisher(true);
            }}
            onStartNew={startNewDesign}
            onManageInvitations={() => {
              setShowInvitationStation(true);
            }}
          />

          {appFailure === undefined ? null : (
            <div className="workspace-alert-wrap">
              <div className="app-alert" role="alert">
                <strong>{appFailure.error.title}</strong>
                <p>{appFailure.error.detail}</p>
              </div>
            </div>
          )}

          {showInvitationStation ? (
            <div className="workspace-access-wrap">
              <InvitationStation
                canCreate={
                  currentWorkspace?.role === "owner" ||
                  currentWorkspace?.role === "admin"
                }
                canInviteAdmin={
                  currentWorkspace?.role === "owner" ||
                  currentWorkspace?.role === "admin"
                }
                isBusy={busyAction === "workspace"}
                createdInvitation={createdInvitation}
                onClose={() => {
                  setShowInvitationStation(false);
                  clearCreatedInvitation();
                }}
                onCreate={createInvitation}
                onAccept={acceptInvitation}
              />
            </div>
          ) : isDashboardLoading ? (
            <WorkshopLoading />
          ) : showBrandPublisher ? (
            <div className="brand-station-wrap">
              <BrandPublisher
                key={`${activeBrand?.snapshotId ?? "first"}-${activeBrand?.version ?? "new"}`}
                initialState={formState}
                fixedName={activeBrand?.snapshot.name}
                isPublishing={busyAction === "brand"}
                resources={workspaceResources}
                onCancel={
                  activeBrand === undefined
                    ? undefined
                    : () => {
                        setShowBrandPublisher(false);
                      }
                }
                onPublish={publishBrand}
              />
            </div>
          ) : activeBrand === undefined ? (
            <NoBrandState canEdit={canEdit} />
          ) : (
            <>
              <DesignIndex
                dashboard={dashboard}
                openRevision={openRevision}
                isBusy={busyAction === "reopen"}
                onReopen={(designId) => {
                  void reopenDesign(designId);
                }}
              />
              {selectedWorkspaceId === undefined ||
              dashboard?.features.campaignWorkflow !== true ? null : (
                <CampaignStudio
                  api={api}
                  workspaceId={selectedWorkspaceId}
                  campaigns={dashboard.campaigns}
                  draftCanvas={{
                    templateId: formState.composition.templateId,
                    format: formState.composition.formatId,
                    seed: formState.composition.seed,
                  }}
                  openRevision={openRevision}
                  canCoordinate={canEdit}
                  onApplyCanvasSeed={applyCampaignCanvasSeed}
                  onCampaignChanged={refreshDashboard}
                  onOpenDesign={reopenDesign}
                />
              )}
              <DesignLifecycle
                openRevision={openRevision}
                designName={designName}
                changeNote={changeNote}
                proofKind={proofKind}
                previewCanBeSaved={previewCanBeSaved}
                hasUnrenderedEdits={hasUnrenderedEdits}
                isBusy={busyAction !== undefined}
                canEdit={canEdit}
                onDesignNameChange={setDesignName}
                onChangeNoteChange={setChangeNote}
                onSave={() => {
                  void saveDesign();
                }}
                onRenderSaved={() => {
                  void renderSavedRevision();
                }}
              />

              <div className="activity-register" role="status" aria-live="polite">
                <span aria-hidden="true">●</span>
                {activityMessage}
              </div>

              <div
                className="artifact-state-banner"
                data-state={
                  proofKind ?? (openRevision === undefined ? "draft" : "saved")
                }
              >
                <span>
                  {proofKind === "saved-revision"
                    ? "SAVED REVISION"
                    : proofKind === "draft-preview"
                      ? "DRAFT PREVIEW"
                      : openRevision === undefined
                        ? "UNSAVED DRAFT"
                        : "SAVED · NOT RENDERED"}
                </span>
                <p>
                  {proofKind === "saved-revision"
                    ? "Downloads below were rendered from the exact reopened revision."
                    : proofKind === "draft-preview"
                      ? "This proof is validated but has not been saved."
                      : openRevision === undefined
                        ? "Preview this bounded draft before saving it."
                        : "Render the stored revision for exact export artifacts."}
                </p>
              </div>

              {openRevision === undefined ||
              selectedWorkspaceId === undefined ? null : (
                <DurableExportStation
                  api={api}
                  workspaceId={selectedWorkspaceId}
                  revision={openRevision}
                  canRequest={canEdit}
                />
              )}

              {openRevision === undefined ||
              selectedWorkspaceId === undefined ? null : (
                <RevisionReviewStation
                  key={openRevision.revisionId}
                  api={api}
                  workspaceId={selectedWorkspaceId}
                  revision={openRevision}
                  canManage={canEdit}
                  canApprove={canApprove}
                />
              )}

              <div className="workshop-grid app-workshop-grid">
                <EditorControls
                  catalog={catalog}
                  state={formState}
                  response={response}
                  isRendering={busyAction === "preview" || busyAction === "render"}
                  hasUnrenderedEdits={hasUnrenderedEdits}
                  validationIsStale={validationIsStale}
                  brandControls="sealed"
                  submitLabel="Preview draft · does not save"
                  isReadOnly={!canEdit}
                  resources={workspaceResources}
                  resourceCatalogTruncated={resourceCatalogTruncated}
                  onStateChange={setFormState}
                  onRender={() => {
                    void previewDesign();
                  }}
                />
                <PreviewStage
                  catalog={catalog}
                  document={preflightDocument}
                  proof={proof}
                  isRendering={busyAction === "preview" || busyAction === "render"}
                  hasUnrenderedEdits={hasUnrenderedEdits}
                />
                <ProofLedger
                  catalog={catalog}
                  document={preflightDocument}
                  response={response}
                  proof={proof}
                  hasUnrenderedEdits={hasUnrenderedEdits}
                  validationIsStale={validationIsStale}
                />
              </div>
            </>
          )}
        </main>
      )}

      <footer className="workshop-footer">
        <span>Structured draft → exact brand snapshot → Core render → provenance</span>
        <span>Manual-first · optional proposals stay untrusted · no render fetch</span>
      </footer>
    </div>
  );
}

function integrityFailure(detail: string): PreviewResponse {
  return {
    ok: false,
    status: 502,
    title: "Preview integrity check failed",
    code: "PREVIEW_INTEGRITY_FAILED",
    detail,
  };
}

function localFailure(code: string, title: string, detail: string): ApiFailure {
  return { ok: false, status: 502, error: { code, title, detail } };
}
