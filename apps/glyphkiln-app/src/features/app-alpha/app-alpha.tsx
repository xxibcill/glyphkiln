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
  CreatedInvitation,
  CurrentSession,
  DesignRevision,
  PublishedBrand,
  WorkspaceDashboard,
} from "./api-client";
import { AuthScreen } from "./auth-screen";
import { BrandPublisher } from "./brand-publisher";
import type { BrandPublishInput } from "./brand-publisher";
import {
  buildManualDraft,
  documentMatchesManualInput,
  formFromStoredDocument,
  manualDraftKey,
  withBrandSnapshot,
} from "./manual-state";
import { InvitationStation } from "./invitation-station";

const DEFAULT_API = createAppAlphaApi();

type ActiveBrand = Omit<BrandSnapshotProjection, "kind">;
type BusyAction =
  "auth" | "workspace" | "brand" | "preview" | "save" | "reopen" | "render" | "logout";

export type AppAlphaProps = {
  catalog: PreviewCatalog;
  api?: AppAlphaApi;
};

export function AppAlpha({ catalog, api = DEFAULT_API }: AppAlphaProps) {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [authFailure, setAuthFailure] = useState<ApiFailure>();
  const [appFailure, setAppFailure] = useState<ApiFailure>();
  const [busyAction, setBusyAction] = useState<BusyAction>();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [dashboard, setDashboard] = useState<WorkspaceDashboard>();
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [activeBrand, setActiveBrand] = useState<ActiveBrand>();
  const [showBrandPublisher, setShowBrandPublisher] = useState(false);
  const [showInvitationStation, setShowInvitationStation] = useState(false);
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation>();
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

  const draft = useMemo(
    () => buildManualDraft(formState, catalog),
    [catalog, formState],
  );
  const currentDraftKey = useMemo(() => manualDraftKey(draft), [draft]);
  const preflightDocument = useMemo(
    () => buildPreviewDocument(formState, catalog),
    [catalog, formState],
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
  const previewCanBeSaved =
    proofKind === "draft-preview" &&
    proof !== null &&
    !hasUnrenderedEdits &&
    proofDraftKey === currentDraftKey;

  useEffect(() => {
    let isCurrent = true;
    void api.currentSession().then((result) => {
      if (!isCurrent) return;
      if (result.ok) {
        setSession(result.value);
        setSelectedWorkspaceId(result.value.workspaces[0]?.id);
        setActivityMessage(
          result.value.workspaces.length === 0
            ? "Create a workspace to begin."
            : "Session restored.",
        );
      } else if (result.error.code !== "AUTH_REQUIRED") {
        setAuthFailure(result);
      }
      setIsStarting(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [api]);

  useEffect(() => {
    if (session === null || selectedWorkspaceId === undefined) {
      setDashboard(undefined);
      return;
    }
    const loadSequence = ++workspaceLoadSequence.current;
    setIsDashboardLoading(true);
    setDashboard(undefined);
    setAppFailure(undefined);
    setOpenRevision(undefined);
    setProof(null);
    setResponse(null);
    setActiveBrand(undefined);
    setShowBrandPublisher(false);
    setShowInvitationStation(false);
    setCreatedInvitation(undefined);

    void (async () => {
      const dashboardResult = await api.dashboard(selectedWorkspaceId);
      if (loadSequence !== workspaceLoadSequence.current) return;
      if (!dashboardResult.ok) {
        handleReadFailure(dashboardResult);
        setIsDashboardLoading(false);
        return;
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

  function handleReadFailure(failure: ApiFailure): void {
    if (
      failure.error.code === "AUTH_REQUIRED" ||
      failure.error.code === "SESSION_EXPIRED"
    ) {
      setSession(null);
      setAuthFailure(failure);
      return;
    }
    setAppFailure(failure);
  }

  async function authenticate(
    operation: () => ReturnType<AppAlphaApi["currentSession"]>,
  ): Promise<void> {
    if (busyAction !== undefined) return;
    setBusyAction("auth");
    setAuthFailure(undefined);
    const result = await operation();
    if (result.ok) {
      setSession(result.value);
      setSelectedWorkspaceId(result.value.workspaces[0]?.id);
      setActivityMessage("Secure session opened.");
    } else {
      setAuthFailure(result);
    }
    setBusyAction(undefined);
  }

  async function logout(): Promise<void> {
    if (busyAction !== undefined) return;
    setBusyAction("logout");
    const result = await api.logout();
    if (result.ok) {
      setSession(null);
      setDashboard(undefined);
      setSelectedWorkspaceId(undefined);
      setActiveBrand(undefined);
      setProof(null);
      setResponse(null);
      setAuthFailure(undefined);
      setCreatedInvitation(undefined);
    } else {
      setAppFailure(result);
    }
    setBusyAction(undefined);
  }

  async function createWorkspace(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (busyAction !== undefined) return;
    const form = new FormData(event.currentTarget);
    const name = form.get("workspaceName");
    if (typeof name !== "string" || name.trim() === "") return;
    setBusyAction("workspace");
    setAppFailure(undefined);
    const result = await api.createWorkspace(name.trim());
    if (result.ok && session !== null) {
      setSession({
        ...session,
        workspaces: [...session.workspaces, result.value],
      });
      setSelectedWorkspaceId(result.value.id);
      setActivityMessage(`Workspace “${result.value.name}” created.`);
    } else if (!result.ok) {
      handleReadFailure(result);
    }
    setBusyAction(undefined);
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

  async function createInvitation(input: {
    email: string;
    role: "admin" | "editor" | "viewer";
  }): Promise<void> {
    if (selectedWorkspaceId === undefined || busyAction !== undefined) return;
    setBusyAction("workspace");
    setAppFailure(undefined);
    setCreatedInvitation(undefined);
    const result = await api.createInvitation({
      workspaceId: selectedWorkspaceId,
      ...input,
    });
    if (result.ok) {
      setCreatedInvitation(result.value);
      setActivityMessage(
        `One-time ${result.value.role} invitation issued to ${result.value.email}.`,
      );
    } else {
      handleReadFailure(result);
    }
    setBusyAction(undefined);
  }

  async function acceptInvitation(token: string): Promise<void> {
    if (session === null || busyAction !== undefined) return;
    setBusyAction("workspace");
    setAppFailure(undefined);
    const result = await api.acceptInvitation(token);
    if (result.ok) {
      const alreadyListed = session.workspaces.some(
        (workspace) => workspace.id === result.value.id,
      );
      setSession({
        ...session,
        workspaces: alreadyListed
          ? session.workspaces
          : [...session.workspaces, result.value],
      });
      setSelectedWorkspaceId(result.value.id);
      setShowInvitationStation(false);
      setCreatedInvitation(undefined);
      setActivityMessage(`Joined workspace “${result.value.name}”.`);
    } else {
      handleReadFailure(result);
    }
    setBusyAction(undefined);
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
    setBusyAction("brand");
    setAppFailure(undefined);
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
    setBusyAction(undefined);
  }

  async function chooseBrand(event: ChangeEvent<HTMLSelectElement>): Promise<void> {
    if (selectedWorkspaceId === undefined || busyAction !== undefined) return;
    const summary = dashboard?.brandKits.find(
      (brand) => brand.id === event.currentTarget.value,
    );
    if (summary === undefined) return;
    setBusyAction("brand");
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
    setBusyAction(undefined);
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

    setBusyAction("preview");
    setAppFailure(undefined);
    const submittedDraft = draft;
    const submittedKey = currentDraftKey;
    const result = await api.previewDesign({
      workspaceId: selectedWorkspaceId,
      brandSnapshotId: activeBrand.snapshotId,
      draft: submittedDraft,
    });
    if (!result.ok) {
      setResponse(toPreviewFailure(result));
      setInspectedDraftKey(submittedKey);
      setBusyAction(undefined);
      return;
    }
    if (
      !documentMatchesManualInput(
        result.value.document,
        activeBrand.snapshot,
        submittedDraft,
      )
    ) {
      setResponse(integrityFailure("The preview does not match the submitted draft."));
      setInspectedDraftKey(submittedKey);
      setBusyAction(undefined);
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
      setBusyAction(undefined);
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
    setBusyAction(undefined);
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
    setBusyAction("save");
    setAppFailure(undefined);
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
      setBusyAction(undefined);
      return;
    }

    const reopened = await api.revision({
      workspaceId: selectedWorkspaceId,
      designId: result.value.designId,
      revision: { revisionId: result.value.revisionId },
    });
    if (!reopened.ok) {
      handleReadFailure(reopened);
      setBusyAction(undefined);
      return;
    }
    if (
      canonicalJson(reopened.value.document) !== canonicalJson(result.value.document) ||
      reopened.value.documentHash !== result.value.documentHash ||
      reopened.value.brandSnapshotId !== activeBrand.snapshotId
    ) {
      setAppFailure(
        localFailure(
          "SAVED_REVISION_MISMATCH",
          "Saved revision could not be verified",
          "The reopened revision did not match the document receipt. No export was accepted.",
        ),
      );
      setBusyAction(undefined);
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
    setBusyAction(undefined);
  }

  async function reopenDesign(designId: string): Promise<void> {
    if (selectedWorkspaceId === undefined || busyAction !== undefined) return;
    setBusyAction("reopen");
    setAppFailure(undefined);
    const revisionResult = await api.revision({
      workspaceId: selectedWorkspaceId,
      designId,
      revision: "head",
    });
    if (!revisionResult.ok) {
      handleReadFailure(revisionResult);
      setBusyAction(undefined);
      return;
    }
    const brandResult = await api.brandSnapshot(
      selectedWorkspaceId,
      revisionResult.value.brandSnapshotId,
    );
    if (!brandResult.ok) {
      handleReadFailure(brandResult);
      setBusyAction(undefined);
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
    setBusyAction(undefined);
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
    setBusyAction("render");
    setAppFailure(undefined);
    const expectedDocument = openRevision.document;
    const result = await api.renderRevision({
      workspaceId: selectedWorkspaceId,
      designId: openRevision.designId,
      revisionId: openRevision.revisionId,
    });
    if (!result.ok) {
      setResponse(toPreviewFailure(result));
      setInspectedDraftKey(currentDraftKey);
      setBusyAction(undefined);
      return;
    }
    if (canonicalJson(result.value.document) !== canonicalJson(expectedDocument)) {
      setResponse(
        integrityFailure(
          "The rendered document does not match the reopened saved revision.",
        ),
      );
      setInspectedDraftKey(currentDraftKey);
      setBusyAction(undefined);
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
      setBusyAction(undefined);
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
    setBusyAction(undefined);
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
                canInviteAdmin={currentWorkspace?.role === "owner"}
                isBusy={busyAction === "workspace"}
                createdInvitation={createdInvitation}
                onClose={() => {
                  setShowInvitationStation(false);
                  setCreatedInvitation(undefined);
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
        <span>No LLM · no remote fetch · no active SVG upload</span>
      </footer>
    </div>
  );
}

function AppIdentityHeader({ catalog }: { catalog: PreviewCatalog }) {
  return (
    <header className="app-identity-header">
      <BrandLockup />
      <div>
        <span>APP ALPHA / MANUAL TRACK</span>
        <strong>Authenticated deterministic design workshop</strong>
      </div>
      <dl>
        <div>
          <dt>Core</dt>
          <dd>{catalog.coreVersion}</dd>
        </div>
        <div>
          <dt>Renderer</dt>
          <dd>{catalog.renderer.version}</dd>
        </div>
      </dl>
    </header>
  );
}

function AppHeader({
  catalog,
  session,
  selectedWorkspaceId,
  isBusy,
  onWorkspaceChange,
  onLogout,
}: {
  catalog: PreviewCatalog;
  session: CurrentSession;
  selectedWorkspaceId?: string;
  isBusy: boolean;
  onWorkspaceChange: (workspaceId: string) => void;
  onLogout: () => void;
}) {
  return (
    <header className="app-session-header">
      <BrandLockup />
      <div className="session-workspace">
        <label htmlFor="workspace-selector">Workspace</label>
        <select
          id="workspace-selector"
          value={selectedWorkspaceId ?? ""}
          disabled={isBusy || session.workspaces.length === 0}
          onChange={(event) => {
            onWorkspaceChange(event.currentTarget.value);
          }}
        >
          {session.workspaces.length === 0 ? (
            <option value="">No workspace yet</option>
          ) : null}
          {session.workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name} · {workspace.role}
            </option>
          ))}
        </select>
      </div>
      <dl className="session-runtime">
        <div>
          <dt>Core</dt>
          <dd>{catalog.coreVersion}</dd>
        </div>
        <div>
          <dt>Renderer</dt>
          <dd>{catalog.renderer.version}</dd>
        </div>
      </dl>
      <div className="session-person">
        <span>{session.user.displayName}</span>
        <small>{session.user.email}</small>
      </div>
      <button
        className="quiet-action"
        type="button"
        disabled={isBusy}
        onClick={onLogout}
      >
        Sign out
      </button>
    </header>
  );
}

function BrandLockup() {
  return (
    <div className="brand-lockup">
      <span className="kiln-stamp" aria-hidden="true">
        <i>G</i>
        <i>K</i>
      </span>
      <div>
        <p>Glyphkiln</p>
        <span>Manual workshop</span>
      </div>
    </div>
  );
}

function StartingScreen({ catalog }: { catalog: PreviewCatalog }) {
  return (
    <div className="app-alpha-shell">
      <AppIdentityHeader catalog={catalog} />
      <main className="starting-bench" id="main-content" aria-busy="true">
        <span className="kiln-loader" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <p className="section-kicker">Session inspection</p>
        <h1>Opening the manual design workshop</h1>
        <p>Checking the local session before any workspace data is requested.</p>
      </main>
    </div>
  );
}

function WorkspaceCreation({
  isBusy,
  onSubmit,
}: {
  isBusy: boolean;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="workspace-first-run" id="main-content">
      <p className="section-kicker">Workspace required</p>
      <h1>Set a boundary for the work.</h1>
      <p>
        Designs, brand snapshots, and revisions are always qualified by a workspace.
      </p>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="new-workspace-name">Workspace name</label>
          <input
            id="new-workspace-name"
            name="workspaceName"
            required
            maxLength={120}
          />
        </div>
        <button className="primary-action" type="submit" disabled={isBusy}>
          {isBusy ? "Creating workspace…" : "Create workspace"}
        </button>
      </form>
    </main>
  );
}

function WorkspaceRegister({
  dashboard,
  activeBrand,
  isLoading,
  canEdit,
  onChooseBrand,
  onPublishBrand,
  onStartNew,
  onManageInvitations,
}: {
  dashboard?: WorkspaceDashboard;
  activeBrand?: ActiveBrand;
  isLoading: boolean;
  canEdit: boolean;
  onChooseBrand: (event: ChangeEvent<HTMLSelectElement>) => void;
  onPublishBrand: () => void;
  onStartNew: () => void;
  onManageInvitations: () => void;
}) {
  return (
    <section className="workspace-register" aria-label="Workspace register">
      <div>
        <span>WORKSPACE</span>
        <strong>{dashboard?.workspace.name ?? "Loading boundary…"}</strong>
        <small>
          {dashboard === undefined
            ? "Role pending"
            : `${dashboard.workspace.role.toUpperCase()} ACCESS`}
        </small>
      </div>
      <div className="workspace-brand-selector">
        <label htmlFor="brand-selector">Active brand snapshot</label>
        <select
          id="brand-selector"
          disabled={isLoading || dashboard?.brandKits.length === 0}
          value={activeBrand?.brandKitId ?? ""}
          onChange={onChooseBrand}
        >
          {dashboard?.brandKits.length === 0 ? (
            <option value="">No snapshot published</option>
          ) : null}
          {dashboard?.brandKits.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name} · {brand.latestVersion}
            </option>
          ))}
        </select>
      </div>
      <div className="workspace-register-actions">
        <button className="quiet-action" type="button" onClick={onManageInvitations}>
          Invitations
        </button>
        <button
          className="quiet-action"
          type="button"
          disabled={!canEdit}
          onClick={onStartNew}
        >
          New design
        </button>
        {canEdit ? (
          <button className="secondary-action" type="button" onClick={onPublishBrand}>
            {activeBrand === undefined ? "Publish brand" : "Publish next brand version"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DesignIndex({
  dashboard,
  openRevision,
  isBusy,
  onReopen,
}: {
  dashboard?: WorkspaceDashboard;
  openRevision?: DesignRevision;
  isBusy: boolean;
  onReopen: (designId: string) => void;
}) {
  return (
    <nav className="design-index" aria-label="Saved designs">
      <div>
        <p className="section-kicker">Revision shelf</p>
        <strong>Saved designs</strong>
      </div>
      {dashboard?.designs.length === 0 ? (
        <p>No saved designs yet. Preview a draft, then save revision 1.</p>
      ) : (
        <ul>
          {dashboard?.designs.map((design) => (
            <li key={design.id}>
              <button
                type="button"
                aria-current={openRevision?.designId === design.id ? "page" : undefined}
                disabled={isBusy}
                onClick={() => {
                  onReopen(design.id);
                }}
              >
                <strong>{design.name}</strong>
                <span>REV {design.revisionNumber.toString().padStart(2, "0")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function DesignLifecycle({
  openRevision,
  designName,
  changeNote,
  proofKind,
  previewCanBeSaved,
  hasUnrenderedEdits,
  isBusy,
  canEdit,
  onDesignNameChange,
  onChangeNoteChange,
  onSave,
  onRenderSaved,
}: {
  openRevision?: DesignRevision;
  designName: string;
  changeNote: string;
  proofKind?: "draft-preview" | "saved-revision";
  previewCanBeSaved: boolean;
  hasUnrenderedEdits: boolean;
  isBusy: boolean;
  canEdit: boolean;
  onDesignNameChange: (value: string) => void;
  onChangeNoteChange: (value: string) => void;
  onSave: () => void;
  onRenderSaved: () => void;
}) {
  return (
    <section className="design-lifecycle" aria-labelledby="lifecycle-title">
      <div className="lifecycle-identity">
        <span>
          {openRevision === undefined
            ? "DRAFT / UNSAVED"
            : `REVISION / ${openRevision.revisionNumber.toString().padStart(3, "0")}`}
        </span>
        <h2 id="lifecycle-title">
          {openRevision === undefined
            ? "Make the first revision deliberately"
            : openRevision.designName}
        </h2>
        <p>
          {openRevision === undefined
            ? "A current preview is required before this design can be saved."
            : `Reopened ${openRevision.createdAt}. Edits create a child revision from this exact head.`}
        </p>
      </div>
      <div className="lifecycle-fields">
        <div className="field">
          <label htmlFor="design-name">Design name</label>
          <input
            id="design-name"
            value={designName}
            readOnly={openRevision !== undefined}
            required
            maxLength={160}
            onChange={(event) => {
              onDesignNameChange(event.currentTarget.value);
            }}
          />
        </div>
        {openRevision === undefined ? null : (
          <div className="field">
            <label htmlFor="change-note">Revision note</label>
            <input
              id="change-note"
              value={changeNote}
              maxLength={500}
              placeholder="What changed?"
              onChange={(event) => {
                onChangeNoteChange(event.currentTarget.value);
              }}
            />
          </div>
        )}
      </div>
      <div className="lifecycle-actions">
        {openRevision === undefined ? null : (
          <button
            className="secondary-action"
            type="button"
            disabled={isBusy || !canEdit}
            onClick={onRenderSaved}
          >
            Render saved revision
          </button>
        )}
        <button
          className="primary-action"
          type="button"
          disabled={
            isBusy || !canEdit || !previewCanBeSaved || designName.trim() === ""
          }
          onClick={onSave}
        >
          {openRevision === undefined ? "Save revision 1" : "Save child revision"}
        </button>
        <small>
          {proofKind === "draft-preview" && !hasUnrenderedEdits
            ? "Current preview is eligible to save."
            : "Preview the current controls before saving."}
        </small>
      </div>
    </section>
  );
}

function WorkshopLoading() {
  return (
    <div className="workshop-loading" role="status">
      <span className="kiln-loader" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <strong>Opening workspace boundary</strong>
      <p>Loading only the brand and design summaries authorized for this role.</p>
    </div>
  );
}

function NoBrandState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="no-brand-state">
      <span>BRAND / MISSING</span>
      <h2>No immutable snapshot is available.</h2>
      <p>
        {canEdit
          ? "Publish the first snapshot to unlock the bounded design controls."
          : "An editor, admin, or owner must publish a snapshot before designs can be opened here."}
      </p>
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
