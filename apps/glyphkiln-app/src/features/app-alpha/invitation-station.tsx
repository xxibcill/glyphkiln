"use client";

import { useState } from "react";
import type { SyntheticEvent } from "react";

import type { CreatedInvitation } from "./api-client";

type InvitationStationProps = {
  canCreate: boolean;
  canInviteAdmin: boolean;
  isBusy: boolean;
  createdInvitation?: CreatedInvitation;
  onClose: () => void;
  onCreate: (input: {
    email: string;
    role: "admin" | "editor" | "viewer";
  }) => Promise<void>;
  onAccept: (token: string) => Promise<void>;
};

export function InvitationStation({
  canCreate,
  canInviteAdmin,
  isBusy,
  createdInvitation,
  onClose,
  onCreate,
  onAccept,
}: InvitationStationProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  function submitCreate(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get("inviteEmail");
    const role = form.get("inviteRole");
    if (
      typeof email !== "string" ||
      (role !== "admin" && role !== "editor" && role !== "viewer")
    ) {
      return;
    }
    void onCreate({ email, role });
  }

  function submitAccept(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = form.get("acceptToken");
    if (typeof token !== "string") return;
    void onAccept(token);
  }

  async function copyInvitationToken(): Promise<void> {
    const clipboardCandidate = Reflect.get(navigator, "clipboard") as unknown;
    if (createdInvitation === undefined || !isClipboardWriter(clipboardCandidate)) {
      setCopyState("failed");
      return;
    }
    try {
      await clipboardCandidate.writeText(createdInvitation.invitationToken);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section className="invitation-station" aria-labelledby="invitation-title">
      <header>
        <div>
          <p className="section-kicker">Access bench</p>
          <h2 id="invitation-title">Workspace invitations</h2>
        </div>
        <button className="quiet-action" type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="invitation-station-grid">
        {canCreate ? (
          <form onSubmit={submitCreate}>
            <div className="invitation-form-heading">
              <span>ISSUE / ONE TIME</span>
              <h3>Invite a collaborator</h3>
              <p>
                The raw token is shown once in this browser and is never stored by the
                client.
              </p>
            </div>
            <div className="field">
              <label htmlFor="invite-email">Email</label>
              <input
                id="invite-email"
                name="inviteEmail"
                type="email"
                autoComplete="off"
                required
                maxLength={320}
              />
            </div>
            <div className="field">
              <label htmlFor="invite-role">Workspace role</label>
              <select id="invite-role" name="inviteRole" defaultValue="editor">
                {canInviteAdmin ? <option value="admin">Admin</option> : null}
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button className="secondary-action" type="submit" disabled={isBusy}>
              {isBusy ? "Issuing token…" : "Create invitation"}
            </button>
          </form>
        ) : (
          <div className="invitation-permission-note">
            <span>ISSUE / FORBIDDEN</span>
            <h3>Your role cannot create invitations.</h3>
            <p>Owners and admins can issue collaborator tokens.</p>
          </div>
        )}

        <form onSubmit={submitAccept}>
          <div className="invitation-form-heading">
            <span>ACCEPT / EXISTING ACCOUNT</span>
            <h3>Join another workspace</h3>
            <p>Signed-in users can consume a token issued to their account email.</p>
          </div>
          <div className="field">
            <label htmlFor="accept-token">One-time token</label>
            <input
              id="accept-token"
              name="acceptToken"
              autoComplete="off"
              required
              minLength={32}
              maxLength={256}
            />
          </div>
          <button className="secondary-action" type="submit" disabled={isBusy}>
            {isBusy ? "Accepting token…" : "Accept invitation"}
          </button>
        </form>
      </div>

      {createdInvitation === undefined ? null : (
        <div className="invitation-token-receipt" aria-live="polite">
          <div>
            <span>ONE-TIME TOKEN / {createdInvitation.role.toUpperCase()}</span>
            <strong>{createdInvitation.email}</strong>
            <small>Expires {createdInvitation.expiresAt}</small>
          </div>
          <code>{createdInvitation.invitationToken}</code>
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              void copyInvitationToken();
            }}
          >
            {copyState === "copied"
              ? "Token copied"
              : copyState === "failed"
                ? "Select and copy token"
                : "Copy one-time token"}
          </button>
        </div>
      )}
    </section>
  );
}

type ClipboardWriter = {
  writeText: (text: string) => Promise<void>;
};

function isClipboardWriter(value: unknown): value is ClipboardWriter {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "writeText") === "function"
  );
}
