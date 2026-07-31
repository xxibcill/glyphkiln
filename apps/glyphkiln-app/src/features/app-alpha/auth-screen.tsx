"use client";

import { useState } from "react";
import type { SyntheticEvent } from "react";

import type { ApiFailure } from "./api-client";

type AuthScreenProps = {
  initialFailure?: ApiFailure;
  isBusy: boolean;
  onBootstrap: (input: {
    bootstrapToken: string;
    displayName: string;
    email: string;
    password: string;
    workspaceName: string;
  }) => Promise<void>;
  onLogin: (input: { email: string; password: string }) => Promise<void>;
  onInvitationRegister: (input: {
    displayName: string;
    email: string;
    password: string;
    invitationToken: string;
  }) => Promise<void>;
};

export function AuthScreen({
  initialFailure,
  isBusy,
  onBootstrap,
  onLogin,
  onInvitationRegister,
}: AuthScreenProps) {
  const [mode, setMode] = useState<"bootstrap" | "login" | "invitation">("bootstrap");

  return (
    <main className="auth-foundry" id="main-content">
      <section className="auth-introduction" aria-labelledby="auth-title">
        <p className="section-kicker">Self-hosted design system</p>
        <h1 id="auth-title">A workshop with a lock on the door.</h1>
        <p>
          Publish immutable brand rules, shape bounded documents, and reproduce exact
          artifacts without giving the renderer code or network access.
        </p>
        <ol className="auth-contract">
          <li>
            <span>01</span>
            <strong>Brand snapshots never move</strong>
          </li>
          <li>
            <span>02</span>
            <strong>Preview never means saved</strong>
          </li>
          <li>
            <span>03</span>
            <strong>Exports carry their evidence</strong>
          </li>
        </ol>
      </section>

      <section className="auth-bench" aria-labelledby="access-title">
        <div className="auth-mode-switch" aria-label="Access mode">
          <button
            type="button"
            aria-pressed={mode === "bootstrap"}
            onClick={() => {
              setMode("bootstrap");
            }}
          >
            First-run setup
          </button>
          <button
            type="button"
            aria-pressed={mode === "login"}
            onClick={() => {
              setMode("login");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === "invitation"}
            onClick={() => {
              setMode("invitation");
            }}
          >
            Join by invite
          </button>
        </div>

        <div className="auth-bench-heading">
          <span>
            {mode === "bootstrap"
              ? "INSTALLATION / 001"
              : mode === "invitation"
                ? "INVITATION / CLAIM"
                : "SESSION / OPEN"}
          </span>
          <h2 id="access-title">
            {mode === "bootstrap"
              ? "Register the installation owner"
              : mode === "invitation"
                ? "Claim a workspace invitation"
                : "Return to the workshop"}
          </h2>
          <p>
            {mode === "bootstrap"
              ? "This succeeds once. Later collaborators join through an invitation."
              : mode === "invitation"
                ? "Use the exact invited email. The one-time token is consumed when registration succeeds."
                : "Use an account that belongs to at least one workspace."}
          </p>
        </div>

        {initialFailure === undefined ? null : (
          <div className="app-alert" role="alert">
            <strong>{initialFailure.error.title}</strong>
            <p>{initialFailure.error.detail}</p>
          </div>
        )}

        {mode === "bootstrap" ? (
          <BootstrapForm isBusy={isBusy} onSubmit={onBootstrap} />
        ) : mode === "invitation" ? (
          <InvitationRegistrationForm isBusy={isBusy} onSubmit={onInvitationRegister} />
        ) : (
          <LoginForm isBusy={isBusy} onSubmit={onLogin} />
        )}
      </section>
    </main>
  );
}

function InvitationRegistrationForm({
  isBusy,
  onSubmit,
}: {
  isBusy: boolean;
  onSubmit: AuthScreenProps["onInvitationRegister"];
}) {
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSubmit({
      displayName: readFormText(form, "displayName"),
      email: readFormText(form, "email"),
      password: readFormText(form, "password"),
      invitationToken: readFormText(form, "invitationToken"),
    });
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <AppTextField
        id="invite-display-name"
        name="displayName"
        label="Your name"
        autoComplete="name"
        maxLength={120}
      />
      <AppTextField
        id="invite-email"
        name="email"
        label="Invited email"
        type="email"
        autoComplete="email"
        maxLength={320}
      />
      <AppTextField
        id="invite-password"
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
      />
      <AppTextField
        id="invite-token"
        name="invitationToken"
        label="One-time invitation token"
        autoComplete="off"
        minLength={32}
        maxLength={256}
      />
      <button className="primary-action" type="submit" disabled={isBusy}>
        {isBusy ? "Claiming invitation…" : "Register and join workspace"}
      </button>
    </form>
  );
}

function BootstrapForm({
  isBusy,
  onSubmit,
}: {
  isBusy: boolean;
  onSubmit: AuthScreenProps["onBootstrap"];
}) {
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSubmit({
      bootstrapToken: readFormText(form, "bootstrapToken"),
      displayName: readFormText(form, "displayName"),
      email: readFormText(form, "email"),
      password: readFormText(form, "password"),
      workspaceName: readFormText(form, "workspaceName"),
    });
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <AppTextField
        id="bootstrap-token"
        name="bootstrapToken"
        label="Operator bootstrap token"
        type="password"
        autoComplete="off"
        minLength={32}
        maxLength={256}
        hint="Use the one-time token configured by the installation operator."
      />
      <AppTextField
        id="bootstrap-display-name"
        name="displayName"
        label="Your name"
        autoComplete="name"
        maxLength={120}
      />
      <AppTextField
        id="bootstrap-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        maxLength={320}
      />
      <AppTextField
        id="bootstrap-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        hint="Use at least 12 characters."
      />
      <AppTextField
        id="bootstrap-workspace"
        name="workspaceName"
        label="First workspace"
        autoComplete="organization"
        maxLength={120}
      />
      <button className="primary-action" type="submit" disabled={isBusy}>
        {isBusy ? "Securing the workshop…" : "Create owner and workspace"}
      </button>
    </form>
  );
}

function LoginForm({
  isBusy,
  onSubmit,
}: {
  isBusy: boolean;
  onSubmit: AuthScreenProps["onLogin"];
}) {
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSubmit({
      email: readFormText(form, "email"),
      password: readFormText(form, "password"),
    });
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <AppTextField
        id="login-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        maxLength={320}
      />
      <AppTextField
        id="login-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        minLength={12}
        maxLength={128}
      />
      <button className="primary-action" type="submit" disabled={isBusy}>
        {isBusy ? "Opening session…" : "Sign in"}
      </button>
    </form>
  );
}

function AppTextField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  minLength,
  maxLength,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete: string;
  minLength?: number;
  maxLength: number;
  hint?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        <span className="required-mark">Required</span>
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        maxLength={maxLength}
      />
      {hint === undefined ? null : <span className="field-hint">{hint}</span>}
    </div>
  );
}

function readFormText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
