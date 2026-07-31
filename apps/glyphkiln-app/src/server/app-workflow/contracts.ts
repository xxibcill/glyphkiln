import type {
  BrandSnapshot,
  DesignDocument,
  FormatId,
  QualityIssue,
  RenderManifest,
  TemplateId,
  ValidationProblem,
} from "@glyphkiln/core";

import type {
  WorkspaceAction,
  WorkspaceRole,
} from "@/server/security/workspace-policy";

export type RequestEvidence = {
  sessionToken?: string;
  csrfToken?: string;
  /** Server-derived proxy/source partition; never accepted from JSON input. */
  authenticationPartition?: string;
};

export type ManualDraft = {
  templateId: TemplateId;
  format: FormatId;
  seed: string;
  mode: "light" | "dark";
  layers: DesignDocument["layers"];
  resources?: {
    assetIds: string[];
    fontIds: string[];
  };
};

export type BrandSnapshotDraft = Omit<BrandSnapshot, "snapshotId" | "version" | "name">;

export type AppCommand =
  | {
      type: "bootstrap.register";
      bootstrapToken: string;
      displayName: string;
      email: string;
      password: string;
      workspaceName: string;
    }
  | {
      type: "invitation.register";
      displayName: string;
      email: string;
      password: string;
      invitationToken: string;
    }
  | {
      type: "session.login";
      email: string;
      password: string;
    }
  | { type: "session.logout" }
  | { type: "workspace.create"; name: string }
  | {
      type: "invitation.create";
      workspaceId: string;
      email: string;
      role: Exclude<WorkspaceRole, "owner">;
    }
  | { type: "invitation.accept"; invitationToken: string }
  | {
      type: "workspace.member.role.change";
      workspaceId: string;
      userId: string;
      role: Exclude<WorkspaceRole, "owner">;
    }
  | {
      type: "workspace.member.revoke";
      workspaceId: string;
      userId: string;
    }
  | {
      type: "brand.publish";
      workspaceId: string;
      brandKitId?: string;
      name: string;
      snapshot: BrandSnapshotDraft;
    }
  | {
      type: "design.preview";
      workspaceId: string;
      brandSnapshotId: string;
      draft: ManualDraft;
    }
  | {
      type: "design.create";
      workspaceId: string;
      name: string;
      brandSnapshotId: string;
      draft: ManualDraft;
    }
  | {
      type: "design.revise";
      workspaceId: string;
      designId: string;
      baseRevisionId: string;
      brandSnapshotId: string;
      draft: ManualDraft;
      changeNote?: string;
    }
  | {
      type: "revision.render";
      workspaceId: string;
      designId: string;
      revisionId: string;
    }
  | {
      type: "revision.export.request";
      workspaceId: string;
      designId: string;
      revisionId: string;
      idempotencyKey: string;
    };

export type AppQuery =
  | { type: "session.current" }
  | { type: "workspace.dashboard"; workspaceId: string }
  | { type: "workspace.members"; workspaceId: string }
  | {
      type: "brand.snapshot";
      workspaceId: string;
      brandSnapshotId: string;
    }
  | {
      type: "design.revision";
      workspaceId: string;
      designId: string;
      revision: "head" | { revisionId: string };
    }
  | {
      type: "render.job";
      workspaceId: string;
      jobId: string;
    }
  | {
      type: "render.jobs.completed";
      workspaceId: string;
      revisionId: string;
    };

export type CommandEnvelope = {
  evidence: RequestEvidence;
  command: AppCommand;
};

export type QueryEnvelope = {
  evidence: Pick<RequestEvidence, "sessionToken">;
  query: AppQuery;
};

export type WorkspaceAuthorizationRequest = {
  evidence: RequestEvidence;
  workspaceId: string;
  action: WorkspaceAction;
  requireMutationProof: boolean;
};

export type WorkspaceAuthorizationGrant = {
  kind: "workspace-authorized";
  user: UserSummary;
  workspace: WorkspaceMembershipSummary;
};

export type SessionGrant = {
  kind: "session-granted";
  sessionToken: string;
  csrfToken: string;
  expiresAt: string;
  user: UserSummary;
  workspaces: WorkspaceMembershipSummary[];
};

export type CommandReceipt =
  | SessionGrant
  | { kind: "session-revoked" }
  | { kind: "workspace-created"; workspace: WorkspaceMembershipSummary }
  | {
      kind: "invitation-created";
      invitationId: string;
      invitationToken: string;
      expiresAt: string;
      email: string;
      role: Exclude<WorkspaceRole, "owner">;
    }
  | { kind: "invitation-accepted"; workspace: WorkspaceMembershipSummary }
  | {
      kind: "workspace-member-role-changed";
      workspaceId: string;
      member: WorkspaceMemberSummary;
    }
  | {
      kind: "workspace-member-revoked";
      workspaceId: string;
      userId: string;
      currentSessionRevoked: boolean;
    }
  | {
      kind: "brand-snapshot-published";
      brandKitId: string;
      snapshotId: string;
      version: string;
      canonicalHash: string;
      snapshot: BrandSnapshot;
    }
  | {
      kind: "design-previewed";
      document: DesignDocument;
      qualityIssues: QualityIssue[];
      outputs: RenderedArtifact[];
    }
  | {
      kind: "design-saved";
      designId: string;
      revisionId: string;
      revisionNumber: number;
      documentHash: string;
      document: DesignDocument;
    }
  | {
      kind: "revision-rendered";
      designId: string;
      revisionId: string;
      document: DesignDocument;
      qualityIssues: QualityIssue[];
      outputs: RenderedArtifact[];
    }
  | {
      kind: "render-job-queued";
      jobId: string;
      workspaceId: string;
      state: RenderJobState;
      created: boolean;
    };

export type QueryProjection =
  | {
      kind: "current-session";
      user: UserSummary;
      workspaces: WorkspaceMembershipSummary[];
      expiresAt: string;
    }
  | {
      kind: "workspace-dashboard";
      workspace: WorkspaceMembershipSummary;
      brandKits: BrandKitSummary[];
      designs: DesignSummary[];
    }
  | {
      kind: "workspace-members";
      workspaceId: string;
      members: WorkspaceMemberSummary[];
    }
  | {
      kind: "brand-snapshot";
      brandKitId: string;
      snapshotId: string;
      version: string;
      canonicalHash: string;
      snapshot: BrandSnapshot;
    }
  | {
      kind: "design-revision";
      designId: string;
      designName: string;
      revisionId: string;
      revisionNumber: number;
      parentRevisionId?: string;
      brandSnapshotId: string;
      documentHash: string;
      document: DesignDocument;
      createdAt: string;
      changeNote?: string;
    }
  | RenderJobProjection
  | {
      kind: "completed-render-jobs";
      jobs: RenderJobProjection[];
    };

export type RenderJobProjection = {
  kind: "render-job";
  jobId: string;
  workspaceId: string;
  designId: string;
  revisionId: string;
  state: RenderJobState;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  lastError?: { code: string; detail: string };
  outputs: RenderJobOutput[];
};

export type RenderJobState =
  "claimed" | "completed" | "exhausted" | "failed" | "queued" | "retry_wait";

export type RenderJobOutput = {
  format: "svg" | "png";
  mimeType: "image/svg+xml" | "image/png";
  artifactSha256: string;
  artifactByteSize: number;
  manifestSha256: string;
  manifestByteSize: number;
  fingerprint: string;
};

export type RenderedArtifact = {
  format: "svg" | "png";
  mimeType: "image/svg+xml" | "image/png";
  base64: string;
  byteSize: number;
  fingerprint: string;
  filename: string;
  manifest: RenderManifest;
};

export type UserSummary = {
  id: string;
  email: string;
  displayName: string;
};

export type WorkspaceMembershipSummary = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
};

export type WorkspaceMemberSummary = {
  user: UserSummary;
  role: WorkspaceRole;
  createdAt: string;
};

export type BrandKitSummary = {
  id: string;
  name: string;
  latestSnapshotId: string;
  latestVersion: string;
  updatedAt: string;
};

export type DesignSummary = {
  id: string;
  name: string;
  headRevisionId: string;
  revisionNumber: number;
  updatedAt: string;
};

export type AppFailureCode =
  | "AUTH_REQUIRED"
  | "AUTH_CAPACITY_REACHED"
  | "AUTH_THROTTLED"
  | "INVALID_CREDENTIALS"
  | "SESSION_EXPIRED"
  | "CSRF_REJECTED"
  | "REGISTRATION_CLOSED"
  | "EMAIL_ALREADY_REGISTERED"
  | "INVALID_INPUT"
  | "INVITATION_INVALID_OR_EXPIRED"
  | "RESOURCE_NOT_FOUND"
  | "ROLE_FORBIDDEN"
  | "FINAL_WORKSPACE_OWNER"
  | "WORKSPACE_CAPACITY_REACHED"
  | "REVISION_CONFLICT"
  | "RENDER_CAPACITY_REACHED"
  | "RENDER_REQUEST_CONFLICT"
  | "INVALID_BRAND_SNAPSHOT"
  | "INVALID_DESIGN_DOCUMENT"
  | "UNSUPPORTED_MANUAL_RESOURCE"
  | "RENDER_REJECTED"
  | "RENDER_UNAVAILABLE"
  | "STORE_UNAVAILABLE";

export type AppFailure = {
  ok: false;
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 503 | 504;
  error: {
    code: AppFailureCode;
    title: string;
    detail: string;
    problems?: ValidationProblem[];
    qualityIssues?: QualityIssue[];
  };
};

export type AppSuccess<T> = {
  ok: true;
  status: 200 | 201;
  value: T;
};

export type AppResult<T> = AppSuccess<T> | AppFailure;

export type AppWorkflow = {
  execute(input: CommandEnvelope): Promise<AppResult<CommandReceipt>>;
  read(input: QueryEnvelope): Promise<AppResult<QueryProjection>>;
  /**
   * Internal adapter seam for non-JSON application boundaries such as binary
   * resource admission and immutable export downloads. Route input never gets
   * to supply the resulting actor identity or role.
   */
  authorizeWorkspace(
    input: WorkspaceAuthorizationRequest,
  ): Promise<AppResult<WorkspaceAuthorizationGrant>>;
};
