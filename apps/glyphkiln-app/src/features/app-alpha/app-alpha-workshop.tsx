"use client";

import type { ChangeEvent, SyntheticEvent } from "react";

import type { PreviewCatalog } from "@/features/project-preview/types";

import type {
  BrandSnapshotProjection,
  CurrentSession,
  DesignRevision,
  WorkspaceDashboard,
} from "./api-client";

export type ActiveBrand = Omit<BrandSnapshotProjection, "kind">;

export function AppIdentityHeader({ catalog }: { catalog: PreviewCatalog }) {
  return (
    <header className="app-identity-header">
      <BrandLockup />
      <div>
        <span>APP ALPHA / MANUAL TRACK</span>
        <strong>Authenticated deterministic design workshop</strong>
      </div>
      <RuntimeRegister catalog={catalog} />
    </header>
  );
}

export function AppHeader({
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
      <RuntimeRegister catalog={catalog} className="session-runtime" />
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

export function StartingScreen({ catalog }: { catalog: PreviewCatalog }) {
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

export function WorkspaceCreation({
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

export function WorkspaceRegister({
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

export function DesignIndex({
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

export function DesignLifecycle({
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

export function WorkshopLoading() {
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

export function NoBrandState({ canEdit }: { canEdit: boolean }) {
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

function RuntimeRegister({
  catalog,
  className,
}: {
  catalog: PreviewCatalog;
  className?: string;
}) {
  return (
    <dl className={className}>
      <div>
        <dt>Core</dt>
        <dd>{catalog.coreVersion}</dd>
      </div>
      <div>
        <dt>Renderer</dt>
        <dd>{catalog.renderer.version}</dd>
      </div>
    </dl>
  );
}
