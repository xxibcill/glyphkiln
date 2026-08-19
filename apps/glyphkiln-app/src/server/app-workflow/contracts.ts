import type {
  AssetOrigin,
  BrandSnapshot,
  CampaignCompositionVariantId,
  CarouselNarrativeRole,
  CarouselSourceNote,
  CampaignFamilyId,
  DesignDocument,
  DeliveryProfileId,
  FormatId,
  QualityIssue,
  RenderEvidence,
  RenderManifest,
  TemplateId,
  TextBoundsEvidence,
  ValidationProblem,
} from "@glyphkiln/core";

import type { AuthoringLockId } from "@/server/ai-authoring";
import type { ResourceLicense } from "@/server/resources";

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

export type CampaignCanvasPublicationMetadata = {
  narrativeRole: CarouselNarrativeRole;
  deliveryProfileId?: DeliveryProfileId;
  carouselSequenceKey?: string;
  altText?: string;
  sourceNotes?: readonly CarouselSourceNote[];
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
      baseRevision?: { designId: string; revisionId: string };
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
      type: "campaign.create";
      workspaceId: string;
      name: string;
      brief: string;
      campaignSeed: string;
      familyId: CampaignFamilyId;
    }
  | {
      type: "campaign.direction.create";
      workspaceId: string;
      campaignId: string;
      directionKey: string;
      name: string;
      locks: AuthoringLockId[];
    }
  | {
      type: "campaign.direction.branch";
      workspaceId: string;
      campaignId: string;
      sourceDirectionId: string;
      directionKey: string;
      name: string;
    }
  | ({
      type: "campaign.canvas.attach";
      workspaceId: string;
      campaignId: string;
      directionId: string;
      canvasKey: string;
      designId: string;
      revisionId: string;
      compositionVariantId: CampaignCompositionVariantId;
      ordinal: number;
    } & CampaignCanvasPublicationMetadata)
  | {
      type: "campaign.proposals.request";
      workspaceId: string;
      campaignId: string;
      directionId: string;
      baseCanvasId: string;
      candidateCount: 3 | 4;
    }
  | {
      type: "campaign.proposal.accept";
      workspaceId: string;
      campaignId: string;
      runId: string;
      candidateId: string;
      designName: string;
    }
  | {
      type: "campaign.proposal.reject";
      workspaceId: string;
      campaignId: string;
      runId: string;
      candidateId: string;
      reason?: string;
    }
  | {
      type: "revision.review.submit";
      workspaceId: string;
      designId: string;
      revisionId: string;
    }
  | {
      type: "revision.review.comment";
      workspaceId: string;
      reviewId: string;
      body: string;
      anchor?: { x: number; y: number };
    }
  | {
      type: "revision.review.request-changes";
      workspaceId: string;
      designId: string;
      revisionId: string;
      reason: string;
    }
  | {
      type: "revision.review.approve";
      workspaceId: string;
      designId: string;
      revisionId: string;
      renderJobId: string;
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
  | { type: "workspace.resources"; workspaceId: string }
  | { type: "campaign.board"; workspaceId: string; campaignId: string }
  | {
      type: "campaign.canvas.seed";
      workspaceId: string;
      campaignId: string;
      directionId: string;
      canvasKey: string;
      templateId: TemplateId;
      format: FormatId;
      compositionVariantId: CampaignCompositionVariantId;
    }
  | {
      type: "campaign.proposal.run";
      workspaceId: string;
      campaignId: string;
      runId: string;
    }
  | {
      type: "campaign.handoff";
      workspaceId: string;
      campaignId: string;
      directionId: string;
    }
  | {
      type: "revision.compare";
      workspaceId: string;
      leftDesignId: string;
      leftRevisionId: string;
      rightDesignId: string;
      rightRevisionId: string;
    }
  | {
      type: "revision.review";
      workspaceId: string;
      designId: string;
      revisionId: string;
    }
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

export type DesignSavedReceipt = {
  kind: "design-saved";
  designId: string;
  revisionId: string;
  revisionNumber: number;
  documentHash: string;
  document: DesignDocument;
};

export type DesignRevisionProjection = {
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
      evidence: RenderEvidence;
      outputs: RenderedArtifact[];
    }
  | DesignSavedReceipt
  | {
      kind: "campaign-created";
      campaign: CampaignSummary;
    }
  | {
      kind: "campaign-direction-created";
      campaignId: string;
      direction: CampaignDirectionProjection;
    }
  | {
      kind: "campaign-canvas-attached";
      campaignId: string;
      directionId: string;
      canvas: CampaignCanvasProjection;
    }
  | { kind: "campaign-proposals-created"; run: CampaignProposalRunProjection }
  | {
      kind: "campaign-proposal-accepted";
      decision: CampaignProposalDecisionProjection;
      design: DesignSavedReceipt;
    }
  | {
      kind: "campaign-proposal-rejected";
      decision: CampaignProposalDecisionProjection;
    }
  | { kind: "revision-review-submitted"; review: RevisionReviewProjection }
  | {
      kind: "revision-review-commented";
      reviewId: string;
      comment: RevisionReviewCommentProjection;
    }
  | { kind: "revision-changes-requested"; review: RevisionReviewProjection }
  | {
      kind: "revision-approved";
      review: RevisionReviewProjection;
      approval: RevisionApprovalProjection;
    }
  | {
      kind: "revision-rendered";
      designId: string;
      revisionId: string;
      document: DesignDocument;
      qualityIssues: QualityIssue[];
      evidence: RenderEvidence;
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
      campaigns: CampaignSummary[];
      features: {
        campaignWorkflow: boolean;
      };
    }
  | {
      kind: "workspace-members";
      workspaceId: string;
      members: WorkspaceMemberSummary[];
    }
  | {
      kind: "workspace-resources";
      workspaceId: string;
      resources: SelectableResourceProjection[];
      truncated: boolean;
    }
  | CampaignBoardProjection
  | CampaignCanvasSeedProjection
  | CampaignProposalRunProjection
  | CampaignHandoffProjection
  | RevisionComparisonProjection
  | RevisionReviewProjection
  | {
      kind: "brand-snapshot";
      brandKitId: string;
      snapshotId: string;
      version: string;
      canonicalHash: string;
      snapshot: BrandSnapshot;
    }
  | DesignRevisionProjection
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

type SelectableResourceBase = {
  id: string;
  contentHash: string;
  byteSize: number;
  origin: AssetOrigin;
  license: ResourceLicense;
  createdAt: string;
};

export type SelectableResourceProjection =
  | (SelectableResourceBase & {
      kind: "raster-asset";
      mediaType: "image/png" | "image/jpeg";
      width: number;
      height: number;
    })
  | (SelectableResourceBase & {
      kind: "font";
      mediaType: "font/ttf" | "font/otf";
      family: string;
      weight: number;
      style: "normal" | "italic";
    });

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

export type CampaignSummary = {
  id: string;
  name: string;
  brief: string;
  campaignSeed: string;
  familyId: CampaignFamilyId;
  createdAt: string;
  updatedAt: string;
};

export type CampaignCanvasProjection = {
  id: string;
  canvasKey: string;
  designId: string;
  revisionId: string;
  template: {
    id: TemplateId;
    version: string;
  };
  format: FormatId;
  compositionVariantId: CampaignCompositionVariantId;
  seedDerivationVersion: string;
  directionSeed: string;
  canvasSeed: string;
  ordinal: number;
  createdAt: string;
} & CampaignCanvasPublicationMetadata;

export type CampaignCanvasSeedProjection = {
  kind: "campaign-canvas-seed";
  workspaceId: string;
  campaignId: string;
  directionId: string;
  canvasKey: string;
  template: {
    id: TemplateId;
    version: string;
  };
  format: FormatId;
  compositionVariantId: CampaignCompositionVariantId;
  seedDerivationVersion: string;
  directionSeed: string;
  canvasSeed: string;
};

export type CampaignDirectionProjection = {
  id: string;
  directionKey: string;
  name: string;
  locks: AuthoringLockId[];
  createdAt: string;
  canvases: CampaignCanvasProjection[];
  proposalRuns: CampaignProposalRunSummaryProjection[];
  proposalRunsTruncated: boolean;
};

export type CampaignBoardProjection = {
  kind: "campaign-board";
  campaign: CampaignSummary;
  directions: CampaignDirectionProjection[];
};

export type CampaignProposalIssueProjection = {
  code: string;
  message: string;
  candidateIndex?: number;
  lock?: AuthoringLockId;
};

export type CampaignProposalProofProjection = {
  qualityIssues: QualityIssue[];
  evidence:
    | RenderEvidence
    | {
        version: "1.0.0";
        safeArea: RenderEvidence["safeArea"];
        text: Omit<TextBoundsEvidence, "fontSize">[];
        crops: RenderEvidence["crops"];
        contrast: RenderEvidence["contrast"];
      };
  outputs: CampaignProposalProofOutputProjection[];
};

export type CampaignProposalProofOutputProjection = Omit<RenderedArtifact, "base64"> & {
  base64?: string;
};

export type CampaignProposalCandidateProjection = {
  id: string;
  index: number;
  status: "proved" | "rejected";
  rationale?: { kind: "model-suggestion"; text: string };
  document?: DesignDocument;
  canonicalHash?: string;
  issues: CampaignProposalIssueProjection[];
  proof?: CampaignProposalProofProjection;
  decision?: CampaignProposalDecisionProjection;
};

export type CampaignProposalRunProjection = {
  kind: "campaign-proposal-run";
  id: string;
  workspaceId: string;
  campaignId: string;
  directionId: string;
  baseCanvasId: string;
  baseDesignId: string;
  baseRevisionId: string;
  descriptor: {
    providerId: string;
    modelId: string;
    retentionDisclosure: string;
  };
  inputHash: string;
  responseHash: string;
  locks: AuthoringLockId[];
  createdAt: string;
  candidates: CampaignProposalCandidateProjection[];
};

export type CampaignProposalRunSummaryProjection = {
  id: string;
  providerId: string;
  modelId: string;
  candidateCount: number;
  decidedCount: number;
  acceptedCount: number;
  createdAt: string;
};

export type CampaignProposalDecisionProjection = {
  id: string;
  decision: "accepted" | "rejected";
  reason?: string;
  designId?: string;
  revisionId?: string;
  decidedBy: UserSummary;
  createdAt: string;
};

export type RevisionComparisonSideProjection = {
  revision: DesignRevisionProjection;
  qualityIssues: QualityIssue[];
  evidence: RenderEvidence;
  outputs: RenderedArtifact[];
};

export type RevisionComparisonProjection = {
  kind: "revision-comparison";
  left: RevisionComparisonSideProjection;
  right: RevisionComparisonSideProjection;
};

export type CampaignHandoffProjection = {
  kind: "campaign-handoff";
  campaignId: string;
  directionId: string;
  filename: string;
  mediaType: "application/vnd.glyphkiln.campaign-handoff+json";
  byteSize: number;
  sha256: string;
  base64: string;
  fileCount: number;
  approvedCanvasCount: number;
  unapprovedCanvasCount: number;
};

export type RevisionReviewState = "in-review" | "changes-requested" | "approved";

export type RevisionReviewCommentProjection = {
  id: string;
  body: string;
  anchor?: { x: number; y: number };
  createdBy: UserSummary;
  createdAt: string;
};

export type RevisionReviewTransitionProjection = {
  id: string;
  fromState?: RevisionReviewState;
  toState: RevisionReviewState;
  reason?: string;
  createdBy: UserSummary;
  createdAt: string;
};

export type RevisionApprovalOutputEvidence = {
  format: "svg" | "png";
  artifactSha256: string;
  manifestSha256: string;
  fingerprint: string;
};

export type RevisionApprovalProjection = {
  id: string;
  renderJobId: string;
  revisionCanonicalHash: string;
  resourcePins: readonly {
    resourceId: string;
    resourceKind: "raster-asset" | "font";
    ordinal: number;
    contentHash: string;
  }[];
  outputEvidence: readonly RevisionApprovalOutputEvidence[];
  approvedBy: UserSummary;
  approvedAt: string;
};

export type RevisionReviewProjection = {
  kind: "revision-review";
  id: string;
  workspaceId: string;
  designId: string;
  revisionId: string;
  state: RevisionReviewState;
  startedBy: UserSummary;
  startedAt: string;
  updatedBy: UserSummary;
  updatedAt: string;
  comments: RevisionReviewCommentProjection[];
  transitions: RevisionReviewTransitionProjection[];
  approval?: RevisionApprovalProjection;
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
  | "INVALID_CAMPAIGN_CANVAS"
  | "CAMPAIGN_LOCK_VIOLATION"
  | "CAMPAIGN_WORKFLOW_DISABLED"
  | "AI_AUTHORING_DISABLED"
  | "AI_PROPOSAL_REJECTED"
  | "REVIEW_CONFLICT"
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
