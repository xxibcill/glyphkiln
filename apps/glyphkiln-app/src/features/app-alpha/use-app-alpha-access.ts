"use client";

import { useEffect, useState } from "react";

import type {
  ApiFailure,
  AppAlphaApi,
  CreatedInvitation,
  CurrentSession,
} from "./api-client";

export type BusyAction =
  "auth" | "workspace" | "brand" | "preview" | "save" | "reopen" | "render" | "logout";

type AppAlphaAccessOptions = {
  api: AppAlphaApi;
  onActivity: (message: string) => void;
  onSessionClosed: () => void;
};

export function useAppAlphaAccess({
  api,
  onActivity,
  onSessionClosed,
}: AppAlphaAccessOptions) {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [authFailure, setAuthFailure] = useState<ApiFailure>();
  const [appFailure, setAppFailure] = useState<ApiFailure>();
  const [busyAction, setBusyAction] = useState<BusyAction>();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation>();

  useEffect(() => {
    let isCurrent = true;
    void api.currentSession().then((result) => {
      if (!isCurrent) return;
      if (result.ok) {
        openSession(result.value);
        onActivity(
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

  function beginAction(action: BusyAction): boolean {
    if (busyAction !== undefined) return false;
    setBusyAction(action);
    return true;
  }

  function finishAction(): void {
    setBusyAction(undefined);
  }

  function handleFailure(failure: ApiFailure): void {
    if (
      failure.error.code === "AUTH_REQUIRED" ||
      failure.error.code === "SESSION_EXPIRED"
    ) {
      setSession(null);
      setSelectedWorkspaceId(undefined);
      setAuthFailure(failure);
      setCreatedInvitation(undefined);
      onSessionClosed();
      return;
    }
    setAppFailure(failure);
  }

  async function authenticate(
    operation: () => ReturnType<AppAlphaApi["currentSession"]>,
  ): Promise<void> {
    if (!beginAction("auth")) return;
    setAuthFailure(undefined);
    const result = await operation();
    if (result.ok) {
      openSession(result.value);
      onActivity("Secure session opened.");
    } else {
      setAuthFailure(result);
    }
    finishAction();
  }

  async function logout(): Promise<void> {
    if (!beginAction("logout")) return;
    const result = await api.logout();
    if (result.ok) {
      setSession(null);
      setSelectedWorkspaceId(undefined);
      setAuthFailure(undefined);
      setCreatedInvitation(undefined);
      onSessionClosed();
    } else {
      setAppFailure(result);
    }
    finishAction();
  }

  async function createWorkspace(name: string): Promise<void> {
    if (!beginAction("workspace")) return;
    setAppFailure(undefined);
    const result = await api.createWorkspace(name);
    if (result.ok) {
      setSession((current) =>
        current === null
          ? current
          : { ...current, workspaces: [...current.workspaces, result.value] },
      );
      setSelectedWorkspaceId(result.value.id);
      onActivity(`Workspace “${result.value.name}” created.`);
    } else {
      handleFailure(result);
    }
    finishAction();
  }

  async function createInvitation(input: {
    email: string;
    role: "admin" | "editor" | "viewer";
  }): Promise<void> {
    if (selectedWorkspaceId === undefined || !beginAction("workspace")) return;
    setAppFailure(undefined);
    setCreatedInvitation(undefined);
    const result = await api.createInvitation({
      workspaceId: selectedWorkspaceId,
      ...input,
    });
    if (result.ok) {
      setCreatedInvitation(result.value);
      onActivity(
        `One-time ${result.value.role} invitation issued to ${result.value.email}.`,
      );
    } else {
      handleFailure(result);
    }
    finishAction();
  }

  async function acceptInvitation(token: string): Promise<boolean> {
    if (session === null || !beginAction("workspace")) return false;
    setAppFailure(undefined);
    const result = await api.acceptInvitation(token);
    if (!result.ok) {
      handleFailure(result);
      finishAction();
      return false;
    }
    setSession((current) => {
      if (current === null) return current;
      const alreadyListed = current.workspaces.some(
        (workspace) => workspace.id === result.value.id,
      );
      return {
        ...current,
        workspaces: alreadyListed
          ? current.workspaces
          : [...current.workspaces, result.value],
      };
    });
    setSelectedWorkspaceId(result.value.id);
    setCreatedInvitation(undefined);
    onActivity(`Joined workspace “${result.value.name}”.`);
    finishAction();
    return true;
  }

  function openSession(nextSession: CurrentSession): void {
    setSession(nextSession);
    setSelectedWorkspaceId(nextSession.workspaces[0]?.id);
  }

  return {
    session,
    isStarting,
    authFailure,
    appFailure,
    busyAction,
    selectedWorkspaceId,
    createdInvitation,
    beginAction,
    finishAction,
    handleFailure,
    authenticate,
    logout,
    createWorkspace,
    createInvitation,
    acceptInvitation,
    selectWorkspace: setSelectedWorkspaceId,
    clearAppFailure: () => {
      setAppFailure(undefined);
    },
    reportAppFailure: setAppFailure,
    clearCreatedInvitation: () => {
      setCreatedInvitation(undefined);
    },
  };
}
