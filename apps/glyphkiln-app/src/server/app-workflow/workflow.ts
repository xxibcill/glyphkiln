import { BrandSnapshotSchema } from "@glyphkiln/core/schema";
import {
  CAMPAIGN_FAMILY_REGISTRY,
  canonicalJson,
  createCampaignCanvasKey,
  createCampaignDirectionKey,
  deriveCampaignSeeds,
  hashCanonical,
  sha256,
  validateDesignDocument,
  AUTHORING_TEMPLATE_KEYS,
} from "@glyphkiln/core";
import type {
  AssetDeclaration,
  DesignDocument,
  FontDeclaration,
  QualityIssue,
  ValidationProblem,
} from "@glyphkiln/core";

import {
  AUTHORING_LOCK_IDS,
  BRIEF_INTERPRETER_INPUT_CONTRACT_VERSION,
  BriefInterpreterProviderError,
  validateAuthoringLocks,
  validateBriefInterpreterResponse,
  type AuthoringLockId,
  type BriefInterpreter,
} from "@/server/ai-authoring";
import type { PreviewResponse, PreviewSuccess } from "@/features/project-preview/types";
import { createProjectPreview } from "@/lib/project-preview/render-preview";
import { compareCanonicalStrings } from "@/lib/deterministic-order";
import type { SqlDatabase, SqlJsonValue } from "@/server/persistence/database";
import {
  RenderQueueError,
  type RenderJobView,
  type RenderQueue,
} from "@/server/render-queue";
import {
  AdmittedRenderResourceResolver,
  BuiltInRenderResourceResolver,
  RenderResourceResolutionError,
  type RenderResourceResolver,
  type ResolvedRenderResources,
} from "@/server/render-worker/resource-resolver";
import {
  InProcessRenderAdmissionController,
  type RenderAdmissionController,
} from "@/server/render-worker/render-admission";
import type { ResourceStore } from "@/server/resources";
import type { ResourceVersion } from "@/server/resources";
import {
  resourceReferencesMatchDocument,
  type RevisionResourcePin,
} from "@/server/resources/revision-resource-provenance";
import {
  Argon2idPasswordHasher,
  CryptoSecretFactory,
  DUMMY_PASSWORD_HASH,
  INVITATION_DURATION_MS,
  SESSION_DURATION_MS,
  canInviteRole,
  hashSecret,
  hasCapability,
  normalizeEmail,
  systemClock,
  validatePassword,
  verifySecretHash,
} from "@/server/security";
import type {
  Clock,
  NormalizedEmail,
  PasswordHasher,
  SecretFactory,
  WorkspaceAction,
} from "@/server/security";

import {
  constructManualDocument,
  type ManualResourceVersions,
} from "./document-factory";
import { AppCommandSchema, AppQuerySchema } from "./schemas";
import { AppState } from "./state";
import type {
  AppCommand,
  AppFailure,
  AppFailureCode,
  AppQuery,
  AppResult,
  AppWorkflow,
  CampaignCanvasProjection,
  CampaignDirectionProjection,
  CampaignHandoffProjection,
  CampaignProposalCandidateProjection,
  CampaignProposalDecisionProjection,
  CampaignProposalIssueProjection,
  CampaignProposalProofProjection,
  CampaignProposalRunProjection,
  CampaignSummary,
  CommandEnvelope,
  CommandReceipt,
  ManualDraft,
  QueryEnvelope,
  QueryProjection,
  DesignRevisionProjection,
  RevisionApprovalProjection,
  RevisionComparisonProjection,
  RevisionApprovalOutputEvidence,
  RevisionReviewCommentProjection,
  RenderJobProjection,
  RenderedArtifact,
  RequestEvidence,
  SessionGrant,
  WorkspaceAuthorizationGrant,
  WorkspaceAuthorizationRequest,
  WorkspaceMembershipSummary,
} from "./contracts";
import type {
  AuthenticatedSessionRecord,
  InvitationRecord,
  StoredBrandSnapshot,
  StoredDesignRevision,
} from "./state";
import {
  CampaignHandoffArchive,
  CampaignHandoffArchiveLimitError,
  MAXIMUM_CAMPAIGN_HANDOFF_ARCHIVE_BYTES,
  type CampaignHandoffFile,
} from "./campaign-handoff-archive";

type ManualRenderer = (
  document: DesignDocument,
  resources: ResolvedRenderResources,
  creationTimestamp?: Date,
) => Promise<PreviewResponse>;

const LOGIN_FAILURE_THRESHOLD = 5;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_SELECTABLE_WORKSPACE_RESOURCES = 500;
const MAXIMUM_CAMPAIGN_HANDOFF_CANVASES = 64;

export type WorkspaceCreationLimits = {
  readonly maximumWorkspacesPerInstallation: number;
  readonly maximumWorkspacesPerUser: number;
};

export const DEFAULT_WORKSPACE_CREATION_LIMITS: WorkspaceCreationLimits = Object.freeze(
  {
    maximumWorkspacesPerInstallation: 100,
    maximumWorkspacesPerUser: 5,
  },
);

type NewSessionBundle = {
  record: {
    id: string;
    userId: string;
    tokenHash: string;
    csrfTokenHash: string;
    createdAt: Date;
    expiresAt: Date;
  };
  token: string;
  csrfToken: string;
};

export type AppWorkflowDependencies = {
  database: SqlDatabase;
  bootstrapTokenHash?: string;
  passwordHasher?: PasswordHasher;
  secretFactory?: SecretFactory;
  clock?: Clock;
  render?: ManualRenderer;
  renderAdmission?: RenderAdmissionController;
  renderQueue?: RenderQueue;
  resourceStore?: ResourceStore;
  resourceResolver?: RenderResourceResolver;
  briefInterpreter?: BriefInterpreter;
  workspaceCreationLimits?: WorkspaceCreationLimits;
};

type AuthenticatedContext = {
  session: AuthenticatedSessionRecord;
  state: AppState;
};

type ManualResourceDeclarations = {
  assets: AssetDeclaration[];
  fonts: FontDeclaration[];
  resourceReferences: RevisionResourcePin[];
  resourceVersions: ManualResourceVersions;
};

class WorkflowFault extends Error {
  readonly failure: AppFailure;

  constructor(failure: AppFailure) {
    super(failure.error.code);
    this.name = "WorkflowFault";
    this.failure = failure;
  }
}

export function createAppWorkflow(dependencies: AppWorkflowDependencies): AppWorkflow {
  return new AppWorkflowImplementation(dependencies);
}

class AppWorkflowImplementation implements AppWorkflow {
  readonly #state: AppState;
  readonly #bootstrapTokenHash: string | undefined;
  readonly #passwordHasher: PasswordHasher;
  readonly #secretFactory: SecretFactory;
  readonly #clock: Clock;
  readonly #render: ManualRenderer;
  readonly #renderAdmission: RenderAdmissionController;
  readonly #renderQueue: RenderQueue | undefined;
  readonly #resourceStore: ResourceStore | undefined;
  readonly #resourceResolver: RenderResourceResolver;
  readonly #briefInterpreter: BriefInterpreter | undefined;
  readonly #workspaceCreationLimits: WorkspaceCreationLimits;

  constructor(dependencies: AppWorkflowDependencies) {
    this.#state = new AppState(dependencies.database);
    this.#bootstrapTokenHash = dependencies.bootstrapTokenHash;
    this.#passwordHasher = dependencies.passwordHasher ?? new Argon2idPasswordHasher();
    this.#secretFactory = dependencies.secretFactory ?? new CryptoSecretFactory();
    this.#clock = dependencies.clock ?? systemClock;
    this.#render =
      dependencies.render ??
      (async (document, resources, creationTimestamp) =>
        (await createProjectPreview(document, undefined, resources, creationTimestamp))
          .body);
    this.#renderAdmission =
      dependencies.renderAdmission ?? new InProcessRenderAdmissionController();
    this.#renderQueue = dependencies.renderQueue;
    this.#resourceStore = dependencies.resourceStore;
    this.#resourceResolver =
      dependencies.resourceResolver ??
      (dependencies.resourceStore === undefined
        ? new BuiltInRenderResourceResolver()
        : new AdmittedRenderResourceResolver(dependencies.resourceStore));
    this.#briefInterpreter = dependencies.briefInterpreter;
    this.#workspaceCreationLimits = validateWorkspaceCreationLimits(
      dependencies.workspaceCreationLimits ?? DEFAULT_WORKSPACE_CREATION_LIMITS,
    );
  }

  async execute(envelope: CommandEnvelope): Promise<AppResult<CommandReceipt>> {
    const parsed = AppCommandSchema.safeParse(envelope.command);
    if (!parsed.success) {
      return invalidInput(parsed.error.issues.map(toValidationProblem));
    }

    try {
      return await this.#executeCommand(parsed.data, envelope.evidence);
    } catch (error) {
      return mapUnexpectedFailure(error);
    }
  }

  async read(envelope: QueryEnvelope): Promise<AppResult<QueryProjection>> {
    const parsed = AppQuerySchema.safeParse(envelope.query);
    if (!parsed.success) {
      return invalidInput(parsed.error.issues.map(toValidationProblem));
    }

    try {
      return await this.#readQuery(parsed.data, envelope.evidence);
    } catch (error) {
      return mapUnexpectedFailure(error);
    }
  }

  async authorizeWorkspace(
    input: WorkspaceAuthorizationRequest,
  ): Promise<AppResult<WorkspaceAuthorizationGrant>> {
    try {
      const context = await this.#authenticate(
        input.evidence,
        input.requireMutationProof,
      );
      const workspace = await this.#authorizeWorkspace(
        context,
        input.workspaceId,
        input.action,
      );
      return success({
        kind: "workspace-authorized",
        user: context.session.user,
        workspace,
      });
    } catch (error) {
      return mapUnexpectedFailure(error);
    }
  }

  async #executeCommand(
    command: AppCommand,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    switch (command.type) {
      case "bootstrap.register":
        return this.#bootstrapRegister(command);
      case "invitation.register":
        return this.#registerWithInvitation(command);
      case "session.login":
        return this.#login(command, evidence);
      case "session.logout":
        return this.#logout(evidence);
      case "workspace.create":
        return this.#createWorkspace(command, evidence);
      case "invitation.create":
        return this.#createInvitation(command, evidence);
      case "invitation.accept":
        return this.#acceptInvitation(command, evidence);
      case "workspace.member.role.change":
        return this.#changeWorkspaceMemberRole(command, evidence);
      case "workspace.member.revoke":
        return this.#revokeWorkspaceMember(command, evidence);
      case "brand.publish":
        return this.#publishBrandSnapshot(command, evidence);
      case "design.preview":
        return this.#previewDesign(command, evidence);
      case "design.create":
        return this.#createDesign(command, evidence);
      case "design.revise":
        return this.#reviseDesign(command, evidence);
      case "campaign.create":
        return this.#createCampaign(command, evidence);
      case "campaign.direction.create":
        return this.#createCampaignDirection(command, evidence);
      case "campaign.direction.branch":
        return this.#branchCampaignDirection(command, evidence);
      case "campaign.canvas.attach":
        return this.#attachCampaignCanvas(command, evidence);
      case "campaign.proposals.request":
        return this.#requestCampaignProposals(command, evidence);
      case "campaign.proposal.accept":
        return this.#acceptCampaignProposal(command, evidence);
      case "campaign.proposal.reject":
        return this.#rejectCampaignProposal(command, evidence);
      case "revision.review.submit":
        return this.#submitRevisionReview(command, evidence);
      case "revision.review.comment":
        return this.#commentOnRevisionReview(command, evidence);
      case "revision.review.request-changes":
        return this.#requestRevisionChanges(command, evidence);
      case "revision.review.approve":
        return this.#approveRevision(command, evidence);
      case "revision.render":
        return this.#renderRevision(command, evidence);
      case "revision.export.request":
        return this.#requestRevisionExport(command, evidence);
    }
  }

  async #readQuery(
    query: AppQuery,
    evidence: Pick<RequestEvidence, "sessionToken">,
  ): Promise<AppResult<QueryProjection>> {
    const context = await this.#authenticate(evidence, false);

    switch (query.type) {
      case "session.current": {
        const workspaces = await context.state.listMemberships(context.session.user.id);
        return success({
          kind: "current-session",
          user: context.session.user,
          workspaces,
          expiresAt: context.session.expiresAt.toISOString(),
        });
      }
      case "workspace.dashboard": {
        const membership = await this.#authorizeWorkspace(
          context,
          query.workspaceId,
          "read_workspace",
        );
        const [brandKits, designs, campaigns] = await Promise.all([
          context.state.listBrandKits(query.workspaceId),
          context.state.listDesigns(query.workspaceId),
          context.state.listCampaigns(query.workspaceId),
        ]);
        return success({
          kind: "workspace-dashboard",
          workspace: membership,
          brandKits,
          designs,
          campaigns,
        });
      }
      case "workspace.members": {
        await this.#authorizeWorkspace(
          context,
          query.workspaceId,
          "administer_workspace",
        );
        return success({
          kind: "workspace-members",
          workspaceId: query.workspaceId,
          members: await context.state.listWorkspaceMembers(query.workspaceId),
        });
      }
      case "workspace.resources": {
        await this.#authorizeWorkspace(context, query.workspaceId, "read_workspace");
        if (this.#resourceStore === undefined) {
          return success({
            kind: "workspace-resources",
            workspaceId: query.workspaceId,
            resources: [],
            truncated: false,
          });
        }
        const resources = await this.#resourceStore.listByWorkspace(
          query.workspaceId,
          MAX_SELECTABLE_WORKSPACE_RESOURCES + 1,
        );
        return success({
          kind: "workspace-resources",
          workspaceId: query.workspaceId,
          resources: resources
            .slice(0, MAX_SELECTABLE_WORKSPACE_RESOURCES)
            .map(toSelectableResourceProjection),
          truncated: resources.length > MAX_SELECTABLE_WORKSPACE_RESOURCES,
        });
      }
      case "campaign.board": {
        await this.#authorizeWorkspace(context, query.workspaceId, "read_campaigns");
        const board = await context.state.readCampaignBoard(
          query.workspaceId,
          query.campaignId,
        );
        if (board === undefined) throw resourceNotFound();
        return success(board);
      }
      case "campaign.proposal.run": {
        await this.#authorizeWorkspace(context, query.workspaceId, "read_campaigns");
        const run = await context.state.readCampaignProposalRun(query);
        if (run === undefined) throw resourceNotFound();
        return success(run);
      }
      case "campaign.handoff": {
        await this.#authorizeWorkspace(context, query.workspaceId, "request_export");
        return success(await this.#buildCampaignHandoff(context.state, query));
      }
      case "revision.compare": {
        await this.#authorizeWorkspace(context, query.workspaceId, "read_revisions");
        return success(await this.#compareRevisions(context.state, query));
      }
      case "revision.review": {
        await this.#authorizeWorkspace(context, query.workspaceId, "read_reviews");
        const review = await context.state.readRevisionReview(query);
        if (review === undefined) throw resourceNotFound();
        return success(review);
      }
      case "brand.snapshot": {
        await this.#authorizeWorkspace(context, query.workspaceId, "read_brands");
        const record = await context.state.findBrandSnapshot(
          query.workspaceId,
          query.brandSnapshotId,
        );
        if (record === undefined) throw resourceNotFound();
        return success({
          kind: "brand-snapshot",
          brandKitId: record.brandKitId,
          snapshotId: record.id,
          version: record.version,
          canonicalHash: record.canonicalHash,
          snapshot: record.snapshot,
        });
      }
      case "design.revision": {
        await this.#authorizeWorkspace(context, query.workspaceId, "read_revisions");
        const revision = await this.#loadTrustedRevision(
          context.state,
          query.workspaceId,
          query.designId,
          query.revision === "head" ? undefined : query.revision.revisionId,
        );
        return success(toRevisionProjection(revision));
      }
      case "render.job": {
        await this.#authorizeWorkspace(
          context,
          query.workspaceId,
          "read_completed_exports",
        );
        if (this.#renderQueue === undefined) throw renderQueueUnavailable();
        const job = await this.#renderQueue.inspect(query.workspaceId, query.jobId);
        if (job === undefined) throw resourceNotFound();
        return success(toRenderJobProjection(job));
      }
      case "render.jobs.completed": {
        await this.#authorizeWorkspace(
          context,
          query.workspaceId,
          "read_completed_exports",
        );
        if (this.#renderQueue === undefined) throw renderQueueUnavailable();
        const jobs = await this.#renderQueue.listCompleted(
          query.workspaceId,
          query.revisionId,
        );
        return success({
          kind: "completed-render-jobs",
          jobs: jobs.map(toRenderJobProjection),
        });
      }
    }
  }

  async #bootstrapRegister(
    command: Extract<AppCommand, { type: "bootstrap.register" }>,
  ): Promise<AppResult<CommandReceipt>> {
    const installation = await this.#state.findInstallationState();
    if (installation.bootstrapUserId !== undefined) {
      throw registrationClosed();
    }
    if (!verifySecretHash(command.bootstrapToken, this.#bootstrapTokenHash ?? "")) {
      throw registrationClosed();
    }
    const email = normalizeEmailOrFail(command.email);
    requireValidPassword(command.password);
    const passwordHash = await this.#passwordHasher.hash(command.password);
    const now = this.#clock.now();
    const userId = this.#secretFactory.createId();
    const workspaceId = this.#secretFactory.createId();
    const session = this.#newSession(userId, now);

    const grant = await this.#state.transaction(async (state) => {
      const installation = await state.lockInstallationState();
      if (installation.bootstrapUserId !== undefined) {
        throw registrationClosed();
      }
      if ((await state.findUserCredentials(email)) !== undefined) {
        throw emailAlreadyRegistered();
      }

      try {
        await state.insertUser({
          id: userId,
          email,
          displayName: command.displayName,
          passwordHash,
          createdAt: now,
        });
        const workspace = createWorkspaceRecord(
          workspaceId,
          command.workspaceName,
          userId,
          now,
        );
        await state.insertWorkspace(workspace);
        await state.insertMembership({
          workspaceId,
          userId,
          role: "owner",
          createdAt: now,
        });
        await state.insertSession(session.record);
        await state.markInstallationBootstrapped(userId, now);
        await this.#audit(state, {
          workspaceId,
          actorUserId: userId,
          action: "installation.bootstrapped",
          targetType: "workspace",
          targetId: workspaceId,
          createdAt: now,
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw emailAlreadyRegistered();
        throw error;
      }

      return this.#sessionGrant(state, {
        session,
        user: { id: userId, email, displayName: command.displayName },
      });
    });

    return success(grant, 201);
  }

  async #registerWithInvitation(
    command: Extract<AppCommand, { type: "invitation.register" }>,
  ): Promise<AppResult<CommandReceipt>> {
    const email = normalizeEmailOrFail(command.email);
    const now = this.#clock.now();
    const invitationTokenHash = hashSecret(command.invitationToken);
    const preflightInvitation = await this.#state.findInvitation(
      invitationTokenHash,
      now,
    );
    if (
      preflightInvitation?.email !== email ||
      !(await this.#invitationIssuerCanGrant(this.#state, preflightInvitation))
    ) {
      throw invalidInvitation();
    }
    if ((await this.#state.findUserCredentials(email)) !== undefined) {
      throw emailAlreadyRegistered();
    }
    requireValidPassword(command.password);
    const passwordHash = await this.#passwordHasher.hash(command.password);
    const userId = this.#secretFactory.createId();
    const session = this.#newSession(userId, now);

    const grant = await this.#state.transaction(async (state) => {
      const invitation = await this.#lockAuthorizedInvitation(
        state,
        invitationTokenHash,
        preflightInvitation.workspaceId,
        now,
      );
      if (invitation.email !== email) {
        throw invalidInvitation();
      }
      if ((await state.findUserCredentials(email)) !== undefined) {
        throw emailAlreadyRegistered();
      }

      try {
        await state.insertUser({
          id: userId,
          email,
          displayName: command.displayName,
          passwordHash,
          createdAt: now,
        });
        await state.insertMembership({
          workspaceId: invitation.workspaceId,
          userId,
          role: invitation.role,
          createdAt: now,
        });
        await state.acceptInvitation(
          invitation.workspaceId,
          invitation.id,
          userId,
          now,
        );
        await state.insertSession(session.record);
        await this.#audit(state, {
          workspaceId: invitation.workspaceId,
          actorUserId: userId,
          action: "invitation.accepted",
          targetType: "invitation",
          targetId: invitation.id,
          createdAt: now,
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw emailAlreadyRegistered();
        throw error;
      }

      return this.#sessionGrant(state, {
        session,
        user: { id: userId, email, displayName: command.displayName },
      });
    });

    return success(grant, 201);
  }

  async #login(
    command: Extract<AppCommand, { type: "session.login" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const email = normalizeEmailOrFail(command.email);
    const credentialKeyHash = hashSecret(
      `${evidence.authenticationPartition ?? "local"}\u0000${email}`,
    );
    const now = this.#clock.now();
    if (await this.#state.isLoginBlocked(credentialKeyHash, now)) {
      throw loginThrottled();
    }
    const credentials = await this.#state.findUserCredentials(email);
    const passwordHash = credentials?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await this.#passwordHasher.verify(
      command.password,
      passwordHash,
    );
    if (!passwordMatches || credentials === undefined) {
      const blocked = await this.#state.recordLoginFailure({
        credentialKeyHash,
        at: now,
        windowExpiresAt: new Date(now.getTime() + LOGIN_FAILURE_WINDOW_MS),
        blockedUntil: new Date(now.getTime() + LOGIN_BLOCK_DURATION_MS),
        threshold: LOGIN_FAILURE_THRESHOLD,
      });
      if (blocked) throw loginThrottled();
      throw fault(
        401,
        "INVALID_CREDENTIALS",
        "Sign in failed",
        "The email address or password did not match an active account.",
      );
    }

    const session = this.#newSession(credentials.id, now);
    const grant = await this.#state.transaction(async (state) => {
      await state.clearLoginFailures(credentialKeyHash);
      await state.insertSession(session.record);
      await this.#audit(state, {
        actorUserId: credentials.id,
        action: "session.created",
        targetType: "session",
        targetId: session.record.id,
        createdAt: now,
      });
      return this.#sessionGrant(state, {
        session,
        user: {
          id: credentials.id,
          email: credentials.email,
          displayName: credentials.displayName,
        },
      });
    });
    return success(grant);
  }

  async #logout(evidence: RequestEvidence): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    const now = this.#clock.now();
    await context.state.transaction(async (state) => {
      await state.revokeSession(context.session.sessionId, now);
      await this.#audit(state, {
        actorUserId: context.session.user.id,
        action: "session.revoked",
        targetType: "session",
        targetId: context.session.sessionId,
        createdAt: now,
      });
    });
    return success({ kind: "session-revoked" });
  }

  async #createWorkspace(
    command: Extract<AppCommand, { type: "workspace.create" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    const workspaceId = this.#secretFactory.createId();
    const now = this.#clock.now();
    const workspace = createWorkspaceRecord(
      workspaceId,
      command.name,
      context.session.user.id,
      now,
    );

    await context.state.transaction(async (state) => {
      await state.lockInstallationState();
      const usage = await state.readWorkspaceCreationUsage(context.session.user.id);
      if (
        usage.userWorkspaces >=
          this.#workspaceCreationLimits.maximumWorkspacesPerUser ||
        usage.installationWorkspaces >=
          this.#workspaceCreationLimits.maximumWorkspacesPerInstallation
      ) {
        throw workspaceCapacityReached();
      }
      await state.insertWorkspace(workspace);
      await state.insertMembership({
        workspaceId,
        userId: context.session.user.id,
        role: "owner",
        createdAt: now,
      });
      await this.#audit(state, {
        workspaceId,
        actorUserId: context.session.user.id,
        action: "workspace.created",
        targetType: "workspace",
        targetId: workspaceId,
        createdAt: now,
      });
    });
    return success(
      {
        kind: "workspace-created",
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          role: "owner",
        },
      },
      201,
    );
  }

  async #createInvitation(
    command: Extract<AppCommand, { type: "invitation.create" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    const membership = await this.#membershipOrNotFound(context, command.workspaceId);
    if (!canInviteRole(membership.role, command.role)) {
      throw roleForbidden();
    }
    const email = normalizeEmailOrFail(command.email);
    const now = this.#clock.now();
    const invitationToken = this.#secretFactory.createToken();
    const invitationId = this.#secretFactory.createId();
    const expiresAt = new Date(now.getTime() + INVITATION_DURATION_MS);

    await context.state.transaction(async (state) => {
      if (
        !(await state.lockWorkspaceForMembershipAdministration(command.workspaceId))
      ) {
        throw resourceNotFound();
      }
      const currentMembership = await state.findMembership(
        context.session.user.id,
        command.workspaceId,
      );
      if (currentMembership === undefined) throw resourceNotFound();
      if (!canInviteRole(currentMembership.role, command.role)) {
        throw roleForbidden();
      }
      await state.revokeActiveInvitations(command.workspaceId, email, now);
      await state.insertInvitation({
        id: invitationId,
        workspaceId: command.workspaceId,
        email,
        role: command.role,
        tokenHash: hashSecret(invitationToken),
        invitedBy: context.session.user.id,
        createdAt: now,
        expiresAt,
      });
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "invitation.created",
        targetType: "invitation",
        targetId: invitationId,
        metadata: { role: command.role },
        createdAt: now,
      });
    });

    return success(
      {
        kind: "invitation-created",
        invitationId,
        invitationToken,
        expiresAt: expiresAt.toISOString(),
        email,
        role: command.role,
      },
      201,
    );
  }

  async #acceptInvitation(
    command: Extract<AppCommand, { type: "invitation.accept" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    const now = this.#clock.now();
    const invitationTokenHash = hashSecret(command.invitationToken);
    const preflightInvitation = await context.state.findInvitation(
      invitationTokenHash,
      now,
    );
    if (
      preflightInvitation?.email !== context.session.user.email ||
      !(await this.#invitationIssuerCanGrant(context.state, preflightInvitation))
    ) {
      throw invalidInvitation();
    }
    const workspace = await context.state.transaction(async (state) => {
      const invitation = await this.#lockAuthorizedInvitation(
        state,
        invitationTokenHash,
        preflightInvitation.workspaceId,
        now,
      );
      if (invitation.email !== context.session.user.email) {
        throw invalidInvitation();
      }
      const existing = await state.findMembership(
        context.session.user.id,
        invitation.workspaceId,
      );
      if (existing === undefined) {
        await state.insertMembership({
          workspaceId: invitation.workspaceId,
          userId: context.session.user.id,
          role: invitation.role,
          createdAt: now,
        });
      }
      await state.acceptInvitation(
        invitation.workspaceId,
        invitation.id,
        context.session.user.id,
        now,
      );
      await this.#audit(state, {
        workspaceId: invitation.workspaceId,
        actorUserId: context.session.user.id,
        action: "invitation.accepted",
        targetType: "invitation",
        targetId: invitation.id,
        createdAt: now,
      });
      return (
        existing ?? {
          id: invitation.workspaceId,
          name: invitation.workspaceName,
          slug: invitation.workspaceSlug,
          role: invitation.role,
        }
      );
    });
    return success({ kind: "invitation-accepted", workspace });
  }

  async #changeWorkspaceMemberRole(
    command: Extract<AppCommand, { type: "workspace.member.role.change" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    const now = this.#clock.now();
    const member = await context.state.transaction(async (state) => {
      await this.#authorizeMembershipAdministration(
        state,
        context.session.user.id,
        command.workspaceId,
      );
      const target = await state.findWorkspaceMember(
        command.workspaceId,
        command.userId,
      );
      if (target === undefined) throw resourceNotFound();
      if (
        target.role === "owner" &&
        (await state.countActiveWorkspaceOwners(command.workspaceId)) <= 1
      ) {
        throw finalWorkspaceOwner();
      }
      if (target.role === command.role) return target;
      if (
        !(await state.changeWorkspaceMemberRole({
          workspaceId: command.workspaceId,
          userId: command.userId,
          role: command.role,
        }))
      ) {
        throw resourceNotFound();
      }
      if (!canInviteRole(command.role, "viewer")) {
        await state.revokeActiveInvitationsByInviter(
          command.workspaceId,
          command.userId,
          now,
        );
      }
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "workspace_membership.role_changed",
        targetType: "workspace_membership",
        targetId: command.userId,
        metadata: {
          previousRole: target.role,
          role: command.role,
        },
        createdAt: now,
      });
      return { ...target, role: command.role };
    });
    return success({
      kind: "workspace-member-role-changed",
      workspaceId: command.workspaceId,
      member,
    });
  }

  async #revokeWorkspaceMember(
    command: Extract<AppCommand, { type: "workspace.member.revoke" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    const now = this.#clock.now();
    const currentSessionRevoked = command.userId === context.session.user.id;
    await context.state.transaction(async (state) => {
      await this.#authorizeMembershipAdministration(
        state,
        context.session.user.id,
        command.workspaceId,
      );
      const target = await state.findWorkspaceMember(
        command.workspaceId,
        command.userId,
      );
      if (target === undefined) throw resourceNotFound();
      if (
        target.role === "owner" &&
        (await state.countActiveWorkspaceOwners(command.workspaceId)) <= 1
      ) {
        throw finalWorkspaceOwner();
      }
      if (
        !(await state.revokeWorkspaceMember({
          workspaceId: command.workspaceId,
          userId: command.userId,
          revokedBy: context.session.user.id,
          revokedAt: now,
        }))
      ) {
        throw resourceNotFound();
      }
      await state.revokeActiveInvitationsByInviter(
        command.workspaceId,
        command.userId,
        now,
      );
      await state.revokeAllUserSessions(command.userId, now);
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "workspace_membership.revoked",
        targetType: "workspace_membership",
        targetId: command.userId,
        metadata: {
          previousRole: target.role,
          sessionsRevokedInstallationWide: true,
        },
        createdAt: now,
      });
    });
    return success({
      kind: "workspace-member-revoked",
      workspaceId: command.workspaceId,
      userId: command.userId,
      currentSessionRevoked,
    });
  }

  async #publishBrandSnapshot(
    command: Extract<AppCommand, { type: "brand.publish" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(
      context,
      command.workspaceId,
      "publish_brand_snapshot",
    );
    const now = this.#clock.now();
    const created = await context.state.transaction(async (state) => {
      const brandKitId = command.brandKitId ?? this.#secretFactory.createId();
      let brandName = command.name;
      if (command.brandKitId === undefined) {
        await state.insertBrandKit({
          id: brandKitId,
          workspaceId: command.workspaceId,
          name: brandName,
          createdBy: context.session.user.id,
          createdAt: now,
        });
      } else {
        const brandKit = await state.lockBrandKit(
          command.workspaceId,
          command.brandKitId,
        );
        if (brandKit === undefined) throw resourceNotFound();
        brandName = brandKit.name;
      }
      const sequence = await state.nextBrandSnapshotSequence(
        command.workspaceId,
        brandKitId,
      );
      const version = brandVersion(sequence);
      const snapshotValidation = BrandSnapshotSchema.safeParse({
        ...command.snapshot,
        snapshotId: brandKitId,
        version,
        name: brandName,
      });
      if (!snapshotValidation.success) {
        throw fault(
          422,
          "INVALID_BRAND_SNAPSHOT",
          "Brand snapshot needs attention",
          "The brand settings do not satisfy the Core snapshot contract.",
          { problems: snapshotValidation.error.issues.map(toValidationProblem) },
        );
      }
      const snapshotId = this.#secretFactory.createId();
      const canonicalHash = hashCanonical(snapshotValidation.data);
      await state.insertBrandSnapshot({
        id: snapshotId,
        workspaceId: command.workspaceId,
        brandKitId,
        sequence,
        version,
        snapshot: snapshotValidation.data,
        canonicalHash,
        createdBy: context.session.user.id,
        createdAt: now,
      });
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "brand_snapshot.published",
        targetType: "brand_snapshot",
        targetId: snapshotId,
        metadata: { brandKitId, version, canonicalHash },
        createdAt: now,
      });
      return {
        brandKitId,
        snapshotId,
        version,
        canonicalHash,
        snapshot: snapshotValidation.data,
      };
    });

    return success({ kind: "brand-snapshot-published", ...created }, 201);
  }

  async #previewDesign(
    command: Extract<AppCommand, { type: "design.preview" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(context, command.workspaceId, "preview_design");
    const brand = await this.#brandSnapshotOrNotFound(
      context.state,
      command.workspaceId,
      command.brandSnapshotId,
    );
    const previewId = `preview_${hashCanonical({
      workspaceId: command.workspaceId,
      brandSnapshotId: command.brandSnapshotId,
      draft: command.draft,
      baseRevision: command.baseRevision,
    }).slice(0, 24)}`;
    const resources = await this.#resolveManualResourceDeclarations(
      command.workspaceId,
      command.draft,
    );
    const construction = constructManualDocument({
      documentId: previewId,
      brand: brand.snapshot,
      draft: command.draft,
      ...resources,
    });
    if (!construction.ok) throw invalidDocument(construction.problems);
    if (command.baseRevision !== undefined) {
      await this.#loadTrustedRevision(
        context.state,
        command.workspaceId,
        command.baseRevision.designId,
        command.baseRevision.revisionId,
      );
      await this.#assertCampaignAdaptationLocks(context.state, {
        workspaceId: command.workspaceId,
        designId: command.baseRevision.designId,
        revisionId: command.baseRevision.revisionId,
        candidate: construction.document,
      });
    }
    const rendered = await this.#renderDocument(
      command.workspaceId,
      construction.document,
    );
    return success({
      kind: "design-previewed",
      document: rendered.document,
      qualityIssues: rendered.qualityIssues,
      evidence: rendered.evidence,
      outputs: rendered.outputs,
    });
  }

  async #createDesign(
    command: Extract<AppCommand, { type: "design.create" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(context, command.workspaceId, "create_design");
    const resources = await this.#resolveManualResourceDeclarations(
      command.workspaceId,
      command.draft,
    );
    const designId = this.#secretFactory.createId();
    const revisionId = this.#secretFactory.createId();
    const now = this.#clock.now();

    const saved = await context.state.transaction(async (state) => {
      const brand = await this.#brandSnapshotOrNotFound(
        state,
        command.workspaceId,
        command.brandSnapshotId,
      );
      const construction = constructManualDocument({
        documentId: designId,
        brand: brand.snapshot,
        draft: command.draft,
        ...resources,
      });
      if (!construction.ok) throw invalidDocument(construction.problems);
      const documentHash = hashCanonical(construction.document);
      await state.insertDesign({
        id: designId,
        workspaceId: command.workspaceId,
        name: command.name,
        createdBy: context.session.user.id,
        createdAt: now,
      });
      await state.insertDesignRevision({
        id: revisionId,
        workspaceId: command.workspaceId,
        designId,
        revisionNumber: 1,
        brandSnapshotId: brand.id,
        document: construction.document,
        canonicalHash: documentHash,
        resourceReferences: resources.resourceReferences,
        createdBy: context.session.user.id,
        createdAt: now,
      });
      if (
        !(await state.setDesignHead({
          workspaceId: command.workspaceId,
          designId,
          headRevisionId: revisionId,
          updatedAt: now,
        }))
      ) {
        throw revisionConflict();
      }
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "design.created",
        targetType: "design",
        targetId: designId,
        metadata: { revisionId, documentHash },
        createdAt: now,
      });
      return {
        designId,
        revisionId,
        revisionNumber: 1,
        documentHash,
        document: construction.document,
      };
    });
    return success({ kind: "design-saved", ...saved }, 201);
  }

  async #reviseDesign(
    command: Extract<AppCommand, { type: "design.revise" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(context, command.workspaceId, "revise_design");
    const resources = await this.#resolveManualResourceDeclarations(
      command.workspaceId,
      command.draft,
    );
    const revisionId = this.#secretFactory.createId();
    const now = this.#clock.now();
    const saved = await context.state.transaction(async (state) => {
      const design = await state.lockDesignHead(command.workspaceId, command.designId);
      if (design === undefined) throw resourceNotFound();
      if (design.headRevisionId !== command.baseRevisionId) {
        throw revisionConflict();
      }
      const brand = await this.#brandSnapshotOrNotFound(
        state,
        command.workspaceId,
        command.brandSnapshotId,
      );
      const construction = constructManualDocument({
        documentId: command.designId,
        brand: brand.snapshot,
        draft: command.draft,
        ...resources,
      });
      if (!construction.ok) throw invalidDocument(construction.problems);
      await this.#assertCampaignAdaptationLocks(state, {
        workspaceId: command.workspaceId,
        designId: command.designId,
        revisionId: command.baseRevisionId,
        candidate: construction.document,
      });
      const revisionNumber = design.headRevisionNumber + 1;
      const documentHash = hashCanonical(construction.document);
      await state.insertDesignRevision({
        id: revisionId,
        workspaceId: command.workspaceId,
        designId: command.designId,
        revisionNumber,
        parentRevisionId: command.baseRevisionId,
        brandSnapshotId: brand.id,
        document: construction.document,
        canonicalHash: documentHash,
        resourceReferences: resources.resourceReferences,
        ...(command.changeNote === undefined ? {} : { changeNote: command.changeNote }),
        createdBy: context.session.user.id,
        createdAt: now,
      });
      if (
        !(await state.setDesignHead({
          workspaceId: command.workspaceId,
          designId: command.designId,
          expectedHeadRevisionId: command.baseRevisionId,
          headRevisionId: revisionId,
          updatedAt: now,
        }))
      ) {
        throw revisionConflict();
      }
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "design.revised",
        targetType: "design_revision",
        targetId: revisionId,
        metadata: {
          designId: command.designId,
          parentRevisionId: command.baseRevisionId,
          revisionNumber,
          documentHash,
        },
        createdAt: now,
      });
      return {
        designId: command.designId,
        revisionId,
        revisionNumber,
        documentHash,
        document: construction.document,
      };
    });
    return success({ kind: "design-saved", ...saved }, 201);
  }

  async #createCampaign(
    command: Extract<AppCommand, { type: "campaign.create" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(
      context,
      command.workspaceId,
      "coordinate_campaigns",
    );
    const campaignId = this.#secretFactory.createId();
    const now = this.#clock.now();
    const campaign = await context.state.transaction(async (state) => {
      await state.insertCampaign({
        id: campaignId,
        workspaceId: command.workspaceId,
        name: command.name,
        brief: command.brief,
        campaignSeed: command.campaignSeed,
        familyId: command.familyId,
        createdBy: context.session.user.id,
        createdAt: now,
      });
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "campaign.created",
        targetType: "campaign",
        targetId: campaignId,
        metadata: {
          familyId: command.familyId,
          campaignSeed: command.campaignSeed,
        },
        createdAt: now,
      });
      return {
        id: campaignId,
        name: command.name,
        brief: command.brief,
        campaignSeed: command.campaignSeed,
        familyId: command.familyId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      } satisfies CampaignSummary;
    });
    return success({ kind: "campaign-created", campaign }, 201);
  }

  async #createCampaignDirection(
    command: Extract<AppCommand, { type: "campaign.direction.create" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(
      context,
      command.workspaceId,
      "coordinate_campaigns",
    );
    const directionId = this.#secretFactory.createId();
    const now = this.#clock.now();
    const locks = AUTHORING_LOCK_IDS.filter((lock) => command.locks.includes(lock));
    const direction = await context.state.transaction(async (state) => {
      const campaign = await state.findCampaign(
        command.workspaceId,
        command.campaignId,
      );
      if (campaign === undefined) throw resourceNotFound();
      createCampaignDirectionKey(command.directionKey);
      await state.insertCampaignDirection({
        id: directionId,
        workspaceId: command.workspaceId,
        campaignId: command.campaignId,
        directionKey: command.directionKey,
        name: command.name,
        locks,
        createdBy: context.session.user.id,
        createdAt: now,
      });
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "campaign.direction.created",
        targetType: "campaign_direction",
        targetId: directionId,
        metadata: {
          campaignId: command.campaignId,
          directionKey: command.directionKey,
          locks,
        },
        createdAt: now,
      });
      return {
        id: directionId,
        directionKey: command.directionKey,
        name: command.name,
        locks: [...locks],
        createdAt: now.toISOString(),
        canvases: [],
      } satisfies CampaignDirectionProjection;
    });
    return success(
      {
        kind: "campaign-direction-created",
        campaignId: command.campaignId,
        direction,
      },
      201,
    );
  }

  async #branchCampaignDirection(
    command: Extract<AppCommand, { type: "campaign.direction.branch" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(
      context,
      command.workspaceId,
      "coordinate_campaigns",
    );
    const directionId = this.#secretFactory.createId();
    const now = this.#clock.now();
    const direction = await context.state.transaction(async (state) => {
      const [campaign, source, locks] = await Promise.all([
        state.findCampaign(command.workspaceId, command.campaignId),
        state.findCampaignDirection({
          workspaceId: command.workspaceId,
          campaignId: command.campaignId,
          directionId: command.sourceDirectionId,
        }),
        state.readCampaignDirectionLocks({
          workspaceId: command.workspaceId,
          campaignId: command.campaignId,
          directionId: command.sourceDirectionId,
        }),
      ]);
      if (campaign === undefined || source === undefined || locks === undefined) {
        throw resourceNotFound();
      }
      createCampaignDirectionKey(command.directionKey);
      await state.insertCampaignDirection({
        id: directionId,
        workspaceId: command.workspaceId,
        campaignId: command.campaignId,
        directionKey: command.directionKey,
        name: command.name,
        locks,
        createdBy: context.session.user.id,
        createdAt: now,
      });
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "campaign.direction.branched",
        targetType: "campaign_direction",
        targetId: directionId,
        metadata: {
          campaignId: command.campaignId,
          sourceDirectionId: command.sourceDirectionId,
          directionKey: command.directionKey,
          locks,
        },
        createdAt: now,
      });
      return {
        id: directionId,
        directionKey: command.directionKey,
        name: command.name,
        locks: [...locks],
        createdAt: now.toISOString(),
        canvases: [],
      } satisfies CampaignDirectionProjection;
    });
    return success(
      {
        kind: "campaign-direction-created",
        campaignId: command.campaignId,
        direction,
      },
      201,
    );
  }

  async #attachCampaignCanvas(
    command: Extract<AppCommand, { type: "campaign.canvas.attach" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(
      context,
      command.workspaceId,
      "coordinate_campaigns",
    );
    const canvasId = this.#secretFactory.createId();
    const now = this.#clock.now();
    const canvas = await context.state.transaction(async (state) => {
      const direction = await state.lockCampaignDirection({
        workspaceId: command.workspaceId,
        campaignId: command.campaignId,
        directionId: command.directionId,
      });
      const [campaign, revision] = await Promise.all([
        state.findCampaign(command.workspaceId, command.campaignId),
        this.#loadTrustedRevision(
          state,
          command.workspaceId,
          command.designId,
          command.revisionId,
        ),
      ]);
      if (campaign === undefined || direction === undefined) {
        throw resourceNotFound();
      }
      const family = CAMPAIGN_FAMILY_REGISTRY[campaign.familyId];
      const familyMember = family.members.find(
        (member) =>
          member.template.id === revision.document.template.id &&
          member.template.version === revision.document.template.version &&
          member.formats.some((format) => format === revision.document.format),
      );
      if (familyMember === undefined) throw invalidCampaignCanvas();
      const seeds = deriveCampaignSeeds({
        campaignSeed: campaign.campaignSeed,
        familyId: campaign.familyId,
        directionKey: createCampaignDirectionKey(direction.directionKey),
        canvasKey: createCampaignCanvasKey(command.canvasKey),
        template: familyMember.template,
        format: revision.document.format,
        compositionVariantId: command.compositionVariantId,
      });
      if (revision.document.seed !== seeds.canvasSeed) {
        throw invalidCampaignCanvas(
          "Create the exact revision with the campaign-derived canvas seed before attaching it to the board.",
        );
      }
      const board = await state.readCampaignBoard(
        command.workspaceId,
        command.campaignId,
      );
      const boardDirection = board?.directions.find(
        (entry) => entry.id === command.directionId,
      );
      if (boardDirection === undefined) throw resourceNotFound();
      const baselineCanvas = boardDirection.canvases.at(0);
      if (baselineCanvas !== undefined) {
        const baseline = await this.#loadTrustedRevision(
          state,
          command.workspaceId,
          baselineCanvas.designId,
          baselineCanvas.revisionId,
        );
        requireAuthoringLocks(
          baseline.document,
          revision.document,
          boardDirection.locks,
        );
      }
      await state.insertCampaignCanvas({
        id: canvasId,
        workspaceId: command.workspaceId,
        campaignId: command.campaignId,
        directionId: command.directionId,
        canvasKey: command.canvasKey,
        designId: command.designId,
        revisionId: command.revisionId,
        templateId: revision.document.template.id,
        templateVersion: revision.document.template.version,
        format: revision.document.format,
        compositionVariantId: command.compositionVariantId,
        seedDerivationVersion: seeds.version,
        directionSeed: seeds.directionSeed,
        canvasSeed: seeds.canvasSeed,
        ordinal: command.ordinal,
        createdBy: context.session.user.id,
        createdAt: now,
      });
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "campaign.canvas.attached",
        targetType: "campaign_canvas",
        targetId: canvasId,
        metadata: {
          campaignId: command.campaignId,
          directionId: command.directionId,
          canvasKey: command.canvasKey,
          designId: command.designId,
          revisionId: command.revisionId,
          seedDerivationVersion: seeds.version,
          directionSeed: seeds.directionSeed,
          canvasSeed: seeds.canvasSeed,
        },
        createdAt: now,
      });
      return {
        id: canvasId,
        canvasKey: command.canvasKey,
        designId: command.designId,
        revisionId: command.revisionId,
        template: { ...revision.document.template },
        format: revision.document.format,
        compositionVariantId: command.compositionVariantId,
        seedDerivationVersion: seeds.version,
        directionSeed: seeds.directionSeed,
        canvasSeed: seeds.canvasSeed,
        ordinal: command.ordinal,
        createdAt: now.toISOString(),
      } satisfies CampaignCanvasProjection;
    });
    return success(
      {
        kind: "campaign-canvas-attached",
        campaignId: command.campaignId,
        directionId: command.directionId,
        canvas,
      },
      201,
    );
  }

  async #requestCampaignProposals(
    command: Extract<AppCommand, { type: "campaign.proposals.request" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(
      context,
      command.workspaceId,
      "coordinate_campaigns",
    );
    if (this.#briefInterpreter === undefined) throw aiAuthoringDisabled();
    const [campaign, direction, locks, baseCanvas] = await Promise.all([
      context.state.findCampaign(command.workspaceId, command.campaignId),
      context.state.findCampaignDirection({
        workspaceId: command.workspaceId,
        campaignId: command.campaignId,
        directionId: command.directionId,
      }),
      context.state.readCampaignDirectionLocks({
        workspaceId: command.workspaceId,
        campaignId: command.campaignId,
        directionId: command.directionId,
      }),
      context.state.findCampaignCanvas({
        workspaceId: command.workspaceId,
        campaignId: command.campaignId,
        directionId: command.directionId,
        canvasId: command.baseCanvasId,
      }),
    ]);
    if (
      campaign === undefined ||
      direction === undefined ||
      locks === undefined ||
      baseCanvas === undefined
    ) {
      throw resourceNotFound();
    }
    const base = await this.#loadTrustedRevision(
      context.state,
      command.workspaceId,
      baseCanvas.designId,
      baseCanvas.revisionId,
    );
    await this.#assertStoredCampaignLocks(context.state, command.workspaceId, base);
    const templateKey = AUTHORING_TEMPLATE_KEYS.find(
      (key) => key === `${base.document.template.id}@${base.document.template.version}`,
    );
    if (templateKey === undefined) throw invalidCampaignCanvas();
    const interpreterInput = {
      contractVersion: BRIEF_INTERPRETER_INPUT_CONTRACT_VERSION,
      brief: campaign.brief,
      candidateCount: command.candidateCount,
      baseDocument: base.document,
      brandSnapshot: base.document.brand,
      templateKeys: [templateKey],
      locks,
    } as const;
    let providerResponse: unknown;
    let responseHash: string;
    try {
      const result = await this.#briefInterpreter.interpret(interpreterInput);
      providerResponse = result.response;
      responseHash = result.responseHash;
    } catch (error) {
      if (error instanceof BriefInterpreterProviderError) {
        throw fault(
          error.code === "INTERPRETER_INPUT_INVALID" ? 422 : 503,
          "AI_PROPOSAL_REJECTED",
          "Proposal provider did not return usable directions",
          error.message,
        );
      }
      throw fault(
        503,
        "AI_PROPOSAL_REJECTED",
        "Proposal provider unavailable",
        "The optional proposal provider did not complete the bounded request.",
      );
    }
    if (!/^[0-9a-f]{64}$/.test(responseHash)) {
      throw fault(
        422,
        "AI_PROPOSAL_REJECTED",
        "Proposal response evidence was invalid",
        "The configured provider adapter did not return a valid response hash.",
      );
    }
    const evaluated = validateBriefInterpreterResponse(providerResponse);
    if (evaluated.issues.some((issue) => issue.source === "response")) {
      throw fault(
        422,
        "AI_PROPOSAL_REJECTED",
        "Proposal provider returned an invalid response",
        "The provider response did not satisfy the bounded proposal contract.",
      );
    }
    const responseIssuesByCandidate = new Map<
      number,
      CampaignProposalIssueProjection[]
    >();
    for (const issue of evaluated.issues) {
      if (issue.candidateIndex === undefined) continue;
      const candidateIssues = responseIssuesByCandidate.get(issue.candidateIndex) ?? [];
      candidateIssues.push(toProposalResponseIssue(issue));
      responseIssuesByCandidate.set(issue.candidateIndex, candidateIssues);
    }
    const runId = this.#secretFactory.createId();
    const now = this.#clock.now();
    const candidates: CampaignProposalCandidateProjection[] = [];
    for (const candidate of evaluated.candidates) {
      const candidateId = this.#secretFactory.createId();
      const responseIssues = responseIssuesByCandidate.get(candidate.index) ?? [];
      if (candidate.status === "rejected") {
        candidates.push({
          id: candidateId,
          index: candidate.index,
          status: "rejected",
          issues: [...candidate.issues.map(toProposalResponseIssue), ...responseIssues],
        });
        continue;
      }
      if (candidate.validation.status === "invalid") {
        candidates.push({
          id: candidateId,
          index: candidate.index,
          status: "rejected",
          rationale: candidate.rationale,
          issues: [
            ...candidate.validation.issues.map(toProposalDocumentIssue),
            ...responseIssues,
          ],
        });
        continue;
      }
      const document = candidate.validation.document;
      const invariantIssues = proposalInvariantIssues(base.document, document);
      const lockValidation = validateAuthoringLocks(base.document, document, locks);
      const issues = [
        ...responseIssues,
        ...candidate.validation.issues.map(toProposalDocumentIssue),
        ...invariantIssues,
        ...lockValidation.issues.map(toProposalLockIssue),
      ];
      if (
        responseIssues.length > 0 ||
        invariantIssues.length > 0 ||
        !lockValidation.success
      ) {
        candidates.push({
          id: candidateId,
          index: candidate.index,
          status: "rejected",
          rationale: candidate.rationale,
          issues,
        });
        continue;
      }
      let proof: CampaignProposalProofProjection;
      try {
        const rendered = await this.#renderDocument(
          command.workspaceId,
          document,
          campaign.createdAt,
        );
        proof = {
          qualityIssues: rendered.qualityIssues,
          evidence: rendered.evidence,
          outputs: rendered.outputs.map((output) => ({ ...output })),
        };
      } catch {
        candidates.push({
          id: candidateId,
          index: candidate.index,
          status: "rejected",
          rationale: candidate.rationale,
          issues: [
            ...issues,
            {
              code: "RESOURCE_BACKED_PROOF_FAILED",
              message:
                "Core could not reproduce this candidate with the exact admitted resources.",
              candidateIndex: candidate.index,
            },
          ],
        });
        continue;
      }
      candidates.push({
        id: candidateId,
        index: candidate.index,
        status: "proved",
        rationale: candidate.rationale,
        document,
        canonicalHash: hashCanonical(document),
        issues,
        proof,
      });
    }
    const run: CampaignProposalRunProjection = {
      kind: "campaign-proposal-run",
      id: runId,
      workspaceId: command.workspaceId,
      campaignId: command.campaignId,
      directionId: command.directionId,
      baseCanvasId: command.baseCanvasId,
      baseDesignId: base.designId,
      baseRevisionId: base.revisionId,
      descriptor: { ...this.#briefInterpreter.descriptor },
      inputHash: hashCanonical(interpreterInput),
      responseHash,
      locks: [...locks],
      createdAt: now.toISOString(),
      candidates,
    };
    await context.state.transaction(async (state) => {
      await state.insertCampaignProposalRun({
        id: run.id,
        workspaceId: command.workspaceId,
        campaignId: command.campaignId,
        directionId: command.directionId,
        baseCanvasId: command.baseCanvasId,
        baseDesignId: base.designId,
        baseRevisionId: base.revisionId,
        providerId: run.descriptor.providerId,
        modelId: run.descriptor.modelId,
        retentionDisclosure: run.descriptor.retentionDisclosure,
        inputHash: run.inputHash,
        responseHash: run.responseHash,
        locks,
        validation: asSqlJson(evaluated),
        requestedBy: context.session.user.id,
        createdAt: now,
      });
      for (const candidate of candidates) {
        await state.insertCampaignProposalCandidate({
          id: candidate.id,
          workspaceId: command.workspaceId,
          runId: run.id,
          index: candidate.index,
          status: candidate.status,
          ...(candidate.document === undefined ? {} : { document: candidate.document }),
          ...(candidate.canonicalHash === undefined
            ? {}
            : { canonicalHash: candidate.canonicalHash }),
          ...(candidate.rationale === undefined
            ? {}
            : { rationale: candidate.rationale.text }),
          issues: candidate.issues,
          ...(candidate.proof === undefined ? {} : { proof: candidate.proof }),
          createdAt: now,
        });
      }
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "campaign.proposals.requested",
        targetType: "campaign_proposal_run",
        targetId: run.id,
        metadata: {
          campaignId: command.campaignId,
          directionId: command.directionId,
          baseRevisionId: base.revisionId,
          providerId: run.descriptor.providerId,
          modelId: run.descriptor.modelId,
          inputHash: run.inputHash,
          responseHash: run.responseHash,
          provedCandidates: candidates.filter(
            (candidate) => candidate.status === "proved",
          ).length,
        },
        createdAt: now,
      });
    });
    return success({ kind: "campaign-proposals-created", run }, 201);
  }

  async #acceptCampaignProposal(
    command: Extract<AppCommand, { type: "campaign.proposal.accept" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(
      context,
      command.workspaceId,
      "coordinate_campaigns",
    );
    const candidate = await context.state.findCampaignProposalCandidate(command);
    if (
      candidate?.status !== "proved" ||
      candidate.document === undefined ||
      candidate.canonicalHash === undefined
    ) {
      throw resourceNotFound();
    }
    if (await context.state.hasCampaignProposalDecision(command)) {
      throw proposalDecisionConflict();
    }
    const [campaign, currentLocks, base] = await Promise.all([
      context.state.findCampaign(command.workspaceId, command.campaignId),
      context.state.readCampaignDirectionLocks({
        workspaceId: command.workspaceId,
        campaignId: command.campaignId,
        directionId: candidate.directionId,
      }),
      this.#loadTrustedRevision(
        context.state,
        command.workspaceId,
        candidate.baseDesignId,
        candidate.baseRevisionId,
      ),
    ]);
    if (campaign === undefined || currentLocks === undefined) throw resourceNotFound();
    if (canonicalJson(currentLocks) !== canonicalJson(candidate.locks)) {
      throw storeUnavailable();
    }
    if (proposalInvariantIssues(base.document, candidate.document).length > 0) {
      throw aiProposalRejected();
    }
    requireAuthoringLocks(base.document, candidate.document, currentLocks);
    const designId = this.#secretFactory.createId();
    const revisionId = this.#secretFactory.createId();
    const decisionId = this.#secretFactory.createId();
    const now = this.#clock.now();
    const acceptedDocument = { ...candidate.document, id: designId };
    const validation = validateDesignDocument(acceptedDocument);
    if (!validation.success) throw aiProposalRejected();
    if (!resourceReferencesMatchDocument(validation.data, base.resourceReferences)) {
      throw aiProposalRejected();
    }
    await this.#renderDocument(command.workspaceId, validation.data, campaign.createdAt);
    const documentHash = hashCanonical(validation.data);
    const decision: CampaignProposalDecisionProjection = {
      id: decisionId,
      decision: "accepted",
      designId,
      revisionId,
      decidedBy: context.session.user,
      createdAt: now.toISOString(),
    };
    try {
      await context.state.transaction(async (state) => {
        await state.insertDesign({
          id: designId,
          workspaceId: command.workspaceId,
          name: command.designName,
          createdBy: context.session.user.id,
          createdAt: now,
        });
        await state.insertDesignRevision({
          id: revisionId,
          workspaceId: command.workspaceId,
          designId,
          revisionNumber: 1,
          brandSnapshotId: base.brandSnapshotId,
          document: validation.data,
          canonicalHash: documentHash,
          resourceReferences: base.resourceReferences.map((reference) => ({
            resourceId: reference.resourceId,
            resourceKind: reference.resourceKind,
            ordinal: reference.ordinal,
          })),
          changeNote: `Accepted proposal ${command.runId}:${candidate.index.toString()}`,
          createdBy: context.session.user.id,
          createdAt: now,
        });
        if (
          !(await state.setDesignHead({
            workspaceId: command.workspaceId,
            designId,
            headRevisionId: revisionId,
            updatedAt: now,
          }))
        ) {
          throw revisionConflict();
        }
        await state.insertCampaignProposalDecision({
          id: decisionId,
          workspaceId: command.workspaceId,
          runId: command.runId,
          candidateId: command.candidateId,
          decision: "accepted",
          designId,
          revisionId,
          actorUserId: context.session.user.id,
          createdAt: now,
        });
        await this.#audit(state, {
          workspaceId: command.workspaceId,
          actorUserId: context.session.user.id,
          action: "campaign.proposal.accepted",
          targetType: "campaign_proposal_candidate",
          targetId: command.candidateId,
          metadata: {
            campaignId: command.campaignId,
            runId: command.runId,
            designId,
            revisionId,
            documentHash,
          },
          createdAt: now,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw proposalDecisionConflict();
      throw error;
    }
    return success(
      {
        kind: "campaign-proposal-accepted",
        decision,
        design: {
          kind: "design-saved",
          designId,
          revisionId,
          revisionNumber: 1,
          documentHash,
          document: validation.data,
        },
      },
      201,
    );
  }

  async #rejectCampaignProposal(
    command: Extract<AppCommand, { type: "campaign.proposal.reject" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(
      context,
      command.workspaceId,
      "coordinate_campaigns",
    );
    const candidate = await context.state.findCampaignProposalCandidate(command);
    if (candidate === undefined) throw resourceNotFound();
    if (await context.state.hasCampaignProposalDecision(command)) {
      throw proposalDecisionConflict();
    }
    const decisionId = this.#secretFactory.createId();
    const now = this.#clock.now();
    const decision: CampaignProposalDecisionProjection = {
      id: decisionId,
      decision: "rejected",
      ...(command.reason === undefined ? {} : { reason: command.reason }),
      decidedBy: context.session.user,
      createdAt: now.toISOString(),
    };
    try {
      await context.state.transaction(async (state) => {
        await state.insertCampaignProposalDecision({
          id: decisionId,
          workspaceId: command.workspaceId,
          runId: command.runId,
          candidateId: command.candidateId,
          decision: "rejected",
          ...(command.reason === undefined ? {} : { reason: command.reason }),
          actorUserId: context.session.user.id,
          createdAt: now,
        });
        await this.#audit(state, {
          workspaceId: command.workspaceId,
          actorUserId: context.session.user.id,
          action: "campaign.proposal.rejected",
          targetType: "campaign_proposal_candidate",
          targetId: command.candidateId,
          metadata: { campaignId: command.campaignId, runId: command.runId },
          createdAt: now,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw proposalDecisionConflict();
      throw error;
    }
    return success({ kind: "campaign-proposal-rejected", decision }, 201);
  }

  async #compareRevisions(
    state: AppState,
    query: Extract<AppQuery, { type: "revision.compare" }>,
  ): Promise<RevisionComparisonProjection> {
    const [left, right] = await Promise.all([
      this.#loadTrustedRevision(
        state,
        query.workspaceId,
        query.leftDesignId,
        query.leftRevisionId,
      ),
      this.#loadTrustedRevision(
        state,
        query.workspaceId,
        query.rightDesignId,
        query.rightRevisionId,
      ),
    ]);
    await Promise.all([
      this.#assertStoredCampaignLocks(state, query.workspaceId, left),
      this.#assertStoredCampaignLocks(state, query.workspaceId, right),
    ]);
    const leftProof = await this.#renderDocument(
      query.workspaceId,
      left.document,
      left.createdAt,
    );
    const rightProof = await this.#renderDocument(
      query.workspaceId,
      right.document,
      right.createdAt,
    );
    return {
      kind: "revision-comparison",
      left: {
        revision: toRevisionProjection(left),
        qualityIssues: leftProof.qualityIssues,
        evidence: leftProof.evidence,
        outputs: leftProof.outputs,
      },
      right: {
        revision: toRevisionProjection(right),
        qualityIssues: rightProof.qualityIssues,
        evidence: rightProof.evidence,
        outputs: rightProof.outputs,
      },
    };
  }

  async #buildCampaignHandoff(
    state: AppState,
    query: Extract<AppQuery, { type: "campaign.handoff" }>,
  ): Promise<CampaignHandoffProjection> {
    const board = await state.readCampaignBoard(query.workspaceId, query.campaignId);
    if (board === undefined) throw resourceNotFound();
    if (!board.directions.some((direction) => direction.canvases.length > 0)) {
      throw invalidCampaignCanvas(
        "Attach at least one exact saved revision before building a campaign handoff.",
      );
    }
    const handoffCanvasCount = board.directions.reduce(
      (count, direction) => count + direction.canvases.length,
      0,
    );
    if (handoffCanvasCount > MAXIMUM_CAMPAIGN_HANDOFF_CANVASES) {
      throw invalidCampaignCanvas(
        `A verified handoff is limited to ${MAXIMUM_CAMPAIGN_HANDOFF_CANVASES.toString()} exact canvases.`,
      );
    }
    const archive = new CampaignHandoffArchive();
    let approvedCanvasCount = 0;
    let unapprovedCanvasCount = 0;
    const campaignPrefix = `${slugBase(board.campaign.name)}-${board.campaign.id
      .replaceAll(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 24)}`;
    for (const [directionIndex, direction] of board.directions.entries()) {
      const baselineCanvas = direction.canvases.at(0);
      if (baselineCanvas === undefined) continue;
      for (const [canvasIndex, canvas] of direction.canvases.entries()) {
        const revision = await this.#loadTrustedRevision(
          state,
          query.workspaceId,
          canvas.designId,
          canvas.revisionId,
        );
        requireAuthoringLocks(
          (
            await this.#loadTrustedRevision(
              state,
              query.workspaceId,
              baselineCanvas.designId,
              baselineCanvas.revisionId,
            )
          ).document,
          revision.document,
          direction.locks,
        );
        const review = await state.readRevisionReview({
          workspaceId: query.workspaceId,
          designId: canvas.designId,
          revisionId: canvas.revisionId,
        });
        let manifestCreationTimestamp = new Date(board.campaign.createdAt);
        if (review?.approval !== undefined && this.#renderQueue !== undefined) {
          const approvedJob = await this.#renderQueue.inspect(
            query.workspaceId,
            review.approval.renderJobId,
          );
          if (
            approvedJob?.state === "completed" &&
            approvedJob.designId === canvas.designId &&
            approvedJob.revisionId === canvas.revisionId
          ) {
            manifestCreationTimestamp = approvedJob.manifestCreationTimestamp;
          }
        }
        const proof = await this.#renderDocument(
          query.workspaceId,
          revision.document,
          manifestCreationTimestamp,
        );
        const resourcePins = revision.resourceReferences.map((reference) => ({
          resourceId: reference.resourceId,
          resourceKind: reference.resourceKind,
          ordinal: reference.ordinal,
          contentHash: reference.contentHash,
        }));
        const approvalStatus =
          review?.approval !== undefined &&
          handoffProofMatchesApproval({
            approval: review.approval,
            revisionCanonicalHash: revision.canonicalHash,
            resourcePins,
            outputs: proof.outputs,
          })
            ? "approved"
            : "unapproved";
        if (approvalStatus === "approved") approvedCanvasCount += 1;
        else unapprovedCanvasCount += 1;
        const canvasPrefix = [
          campaignPrefix,
          `${directionIndex.toString().padStart(2, "0")}-${direction.directionKey}`,
          `${canvasIndex.toString().padStart(3, "0")}-${canvas.canvasKey}`,
        ].join("/");
        addCampaignHandoffFiles(
          archive,
          handoffJsonFile(
            `${canvasPrefix}.design.json`,
            revision.document,
            approvalStatus,
          ),
          handoffJsonFile(
            `${canvasPrefix}.resources.json`,
            {
              revisionId: revision.revisionId,
              documentHash: revision.canonicalHash,
              resourcePins,
            },
            approvalStatus,
          ),
          handoffJsonFile(
            `${canvasPrefix}.approval.json`,
            review?.approval === undefined
              ? {
                  status: "unapproved",
                  reviewState: review?.state ?? "not-submitted",
                  revisionId: revision.revisionId,
                }
              : approvalStatus === "approved"
                ? { status: "approved", receipt: review.approval }
                : {
                    status: "unapproved",
                    reason: "included-proofs-do-not-match-approval-receipt",
                    receipt: review.approval,
                  },
            approvalStatus,
          ),
        );
        for (const output of proof.outputs) {
          const bytes = Buffer.from(output.base64, "base64");
          addCampaignHandoffFiles(
            archive,
            handoffBinaryFile(
              `${canvasPrefix}.${output.format}`,
              output.mimeType,
              bytes,
              approvalStatus,
            ),
            handoffJsonFile(
              `${canvasPrefix}.${output.format}.manifest.json`,
              output.manifest,
              approvalStatus,
            ),
          );
        }
      }
    }
    const { files, bytes: archiveBytes } = encodeCampaignHandoffArchive(archive, {
      campaign: board.campaign,
      summary: { approvedCanvasCount, unapprovedCanvasCount },
    });
    return {
      kind: "campaign-handoff",
      campaignId: board.campaign.id,
      filename: `${campaignPrefix}.gk-handoff.json`,
      mediaType: "application/vnd.glyphkiln.campaign-handoff+json",
      byteSize: archiveBytes.byteLength,
      sha256: sha256(archiveBytes),
      base64: Buffer.from(archiveBytes).toString("base64"),
      fileCount: files.length,
      approvedCanvasCount,
      unapprovedCanvasCount,
    };
  }

  async #submitRevisionReview(
    command: Extract<AppCommand, { type: "revision.review.submit" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(context, command.workspaceId, "manage_reviews");
    const now = this.#clock.now();
    await context.state.transaction(async (state) => {
      await requireCurrentDesignHead(
        state,
        command.workspaceId,
        command.designId,
        command.revisionId,
      );
      await this.#loadTrustedRevision(
        state,
        command.workspaceId,
        command.designId,
        command.revisionId,
      );
      const existing = await state.lockRevisionReview(command);
      let reviewId: string;
      let fromState: "changes-requested" | undefined;
      if (existing === undefined) {
        reviewId = this.#secretFactory.createId();
        await state.insertRevisionReview({
          id: reviewId,
          workspaceId: command.workspaceId,
          designId: command.designId,
          revisionId: command.revisionId,
          actorUserId: context.session.user.id,
          createdAt: now,
        });
      } else {
        reviewId = existing.id;
        if (existing.state === "approved") throw reviewConflict();
        if (existing.state === "in-review") return;
        fromState = "changes-requested";
        if (
          !(await state.setRevisionReviewState({
            workspaceId: command.workspaceId,
            reviewId,
            expectedState: existing.state,
            state: "in-review",
            actorUserId: context.session.user.id,
            updatedAt: now,
          }))
        ) {
          throw reviewConflict();
        }
      }
      await state.insertRevisionReviewTransition({
        id: this.#secretFactory.createId(),
        workspaceId: command.workspaceId,
        reviewId,
        ...(fromState === undefined ? {} : { fromState }),
        toState: "in-review",
        actorUserId: context.session.user.id,
        createdAt: now,
      });
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "revision.review.submitted",
        targetType: "revision_review",
        targetId: reviewId,
        metadata: {
          designId: command.designId,
          revisionId: command.revisionId,
        },
        createdAt: now,
      });
    });
    const review = await context.state.readRevisionReview(command);
    if (review === undefined) throw storeUnavailable();
    return success({ kind: "revision-review-submitted", review }, 201);
  }

  async #commentOnRevisionReview(
    command: Extract<AppCommand, { type: "revision.review.comment" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(context, command.workspaceId, "comment_reviews");
    const review = await context.state.findRevisionReviewById(
      command.workspaceId,
      command.reviewId,
    );
    if (review === undefined) throw resourceNotFound();
    const commentId = this.#secretFactory.createId();
    const now = this.#clock.now();
    await context.state.transaction(async (state) => {
      await state.insertRevisionReviewComment({
        id: commentId,
        workspaceId: command.workspaceId,
        reviewId: command.reviewId,
        body: command.body,
        ...(command.anchor === undefined ? {} : { anchor: command.anchor }),
        actorUserId: context.session.user.id,
        createdAt: now,
      });
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "revision.review.commented",
        targetType: "revision_review_comment",
        targetId: commentId,
        metadata: { reviewId: command.reviewId, revisionId: review.revisionId },
        createdAt: now,
      });
    });
    const comment: RevisionReviewCommentProjection = {
      id: commentId,
      body: command.body,
      ...(command.anchor === undefined ? {} : { anchor: { ...command.anchor } }),
      createdBy: context.session.user,
      createdAt: now.toISOString(),
    };
    return success(
      { kind: "revision-review-commented", reviewId: command.reviewId, comment },
      201,
    );
  }

  async #requestRevisionChanges(
    command: Extract<AppCommand, { type: "revision.review.request-changes" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(context, command.workspaceId, "manage_reviews");
    const now = this.#clock.now();
    await context.state.transaction(async (state) => {
      await requireCurrentDesignHead(
        state,
        command.workspaceId,
        command.designId,
        command.revisionId,
      );
      const review = await state.lockRevisionReview(command);
      if (review?.state !== "in-review") throw reviewConflict();
      if (
        !(await state.setRevisionReviewState({
          workspaceId: command.workspaceId,
          reviewId: review.id,
          expectedState: "in-review",
          state: "changes-requested",
          actorUserId: context.session.user.id,
          updatedAt: now,
        }))
      ) {
        throw reviewConflict();
      }
      await state.insertRevisionReviewTransition({
        id: this.#secretFactory.createId(),
        workspaceId: command.workspaceId,
        reviewId: review.id,
        fromState: "in-review",
        toState: "changes-requested",
        reason: command.reason,
        actorUserId: context.session.user.id,
        createdAt: now,
      });
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "revision.review.changes-requested",
        targetType: "revision_review",
        targetId: review.id,
        metadata: {
          designId: command.designId,
          revisionId: command.revisionId,
        },
        createdAt: now,
      });
    });
    const review = await context.state.readRevisionReview(command);
    if (review === undefined) throw storeUnavailable();
    return success({ kind: "revision-changes-requested", review });
  }

  async #approveRevision(
    command: Extract<AppCommand, { type: "revision.review.approve" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(context, command.workspaceId, "approve_revisions");
    if (this.#renderQueue === undefined) throw renderQueueUnavailable();
    const renderJob = await this.#renderQueue.inspect(
      command.workspaceId,
      command.renderJobId,
    );
    if (
      renderJob?.state !== "completed" ||
      renderJob.designId !== command.designId ||
      renderJob.revisionId !== command.revisionId ||
      renderJob.outputs.length === 0
    ) {
      throw reviewConflict();
    }
    const outputEvidence = renderJob.outputs
      .map((output): RevisionApprovalOutputEvidence => ({
        format: output.format,
        artifactSha256: output.artifactSha256,
        manifestSha256: output.manifestSha256,
        fingerprint: output.fingerprint,
      }))
      .sort((left, right) => compareCanonicalStrings(left.format, right.format));
    const now = this.#clock.now();
    await context.state.transaction(async (state) => {
      await requireCurrentDesignHead(
        state,
        command.workspaceId,
        command.designId,
        command.revisionId,
      );
      const revision = await this.#loadTrustedRevision(
        state,
        command.workspaceId,
        command.designId,
        command.revisionId,
      );
      const review = await state.lockRevisionReview(command);
      if (review?.state !== "in-review") throw reviewConflict();
      const approvalId = this.#secretFactory.createId();
      await state.insertRevisionApproval({
        id: approvalId,
        workspaceId: command.workspaceId,
        reviewId: review.id,
        designId: command.designId,
        revisionId: command.revisionId,
        renderJobId: command.renderJobId,
        revisionCanonicalHash: revision.canonicalHash,
        resourcePins: revision.resourceReferences.map((reference) => ({
          resourceId: reference.resourceId,
          resourceKind: reference.resourceKind,
          ordinal: reference.ordinal,
          contentHash: reference.contentHash,
        })),
        outputEvidence,
        actorUserId: context.session.user.id,
        approvedAt: now,
      });
      if (
        !(await state.setRevisionReviewState({
          workspaceId: command.workspaceId,
          reviewId: review.id,
          expectedState: "in-review",
          state: "approved",
          actorUserId: context.session.user.id,
          updatedAt: now,
        }))
      ) {
        throw reviewConflict();
      }
      await state.insertRevisionReviewTransition({
        id: this.#secretFactory.createId(),
        workspaceId: command.workspaceId,
        reviewId: review.id,
        fromState: "in-review",
        toState: "approved",
        actorUserId: context.session.user.id,
        createdAt: now,
      });
      await this.#audit(state, {
        workspaceId: command.workspaceId,
        actorUserId: context.session.user.id,
        action: "revision.review.approved",
        targetType: "revision_approval_receipt",
        targetId: approvalId,
        metadata: {
          reviewId: review.id,
          designId: command.designId,
          revisionId: command.revisionId,
          renderJobId: command.renderJobId,
          revisionCanonicalHash: revision.canonicalHash,
        },
        createdAt: now,
      });
    });
    const review = await context.state.readRevisionReview(command);
    if (review?.approval === undefined) throw storeUnavailable();
    return success({ kind: "revision-approved", review, approval: review.approval });
  }

  async #renderRevision(
    command: Extract<AppCommand, { type: "revision.render" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(context, command.workspaceId, "request_export");
    const revision = await this.#loadTrustedRevision(
      context.state,
      command.workspaceId,
      command.designId,
      command.revisionId,
    );
    await this.#assertStoredCampaignLocks(context.state, command.workspaceId, revision);
    const rendered = await this.#renderDocument(command.workspaceId, revision.document);
    return success({
      kind: "revision-rendered",
      designId: revision.designId,
      revisionId: revision.revisionId,
      document: rendered.document,
      qualityIssues: rendered.qualityIssues,
      evidence: rendered.evidence,
      outputs: rendered.outputs,
    });
  }

  async #requestRevisionExport(
    command: Extract<AppCommand, { type: "revision.export.request" }>,
    evidence: RequestEvidence,
  ): Promise<AppResult<CommandReceipt>> {
    const context = await this.#authenticate(evidence, true);
    await this.#authorizeWorkspace(context, command.workspaceId, "request_export");
    const revision = await this.#loadTrustedRevision(
      context.state,
      command.workspaceId,
      command.designId,
      command.revisionId,
    );
    await this.#assertStoredCampaignLocks(context.state, command.workspaceId, revision);
    if (this.#renderQueue === undefined) throw renderQueueUnavailable();
    const now = this.#clock.now();
    try {
      const queued = await this.#renderQueue.enqueue({
        jobId: this.#secretFactory.createId(),
        workspaceId: command.workspaceId,
        designId: command.designId,
        revisionId: command.revisionId,
        requestedBy: context.session.user.id,
        idempotencyKey: command.idempotencyKey,
        createdAt: now,
        manifestCreationTimestamp: now,
      });
      return success(
        {
          kind: "render-job-queued",
          jobId: queued.jobId,
          workspaceId: queued.workspaceId,
          state: queued.state,
          created: queued.created,
        },
        queued.created ? 201 : 200,
      );
    } catch (error) {
      if (!(error instanceof RenderQueueError)) throw error;
      if (error.code === "IDEMPOTENCY_CONFLICT") {
        throw fault(
          409,
          "RENDER_REQUEST_CONFLICT",
          "Export request key is already in use",
          "Use a new request key or retry the original revision export.",
        );
      }
      if (error.code === "INVALID_QUEUE_INPUT") {
        throw fault(
          422,
          "INVALID_INPUT",
          "Export request needs attention",
          "Review the export request and try again.",
        );
      }
      if (
        error.code === "WORKSPACE_JOB_CAPACITY_REACHED" ||
        error.code === "INSTALLATION_JOB_CAPACITY_REACHED"
      ) {
        throw fault(
          429,
          "RENDER_CAPACITY_REACHED",
          "Export queue is full",
          "Wait for an outstanding export to finish before requesting another.",
        );
      }
      throw renderQueueUnavailable();
    }
  }

  async #lockAuthorizedInvitation(
    state: AppState,
    tokenHash: string,
    expectedWorkspaceId: string,
    now: Date,
  ): Promise<InvitationRecord> {
    if (!(await state.lockWorkspaceForMembershipAdministration(expectedWorkspaceId))) {
      throw invalidInvitation();
    }
    const invitation = await state.lockInvitation(tokenHash, now);
    if (
      invitation?.workspaceId !== expectedWorkspaceId ||
      !(await this.#invitationIssuerCanGrant(state, invitation))
    ) {
      throw invalidInvitation();
    }
    return invitation;
  }

  async #invitationIssuerCanGrant(
    state: AppState,
    invitation: InvitationRecord,
  ): Promise<boolean> {
    const inviter = await state.findMembership(
      invitation.invitedBy,
      invitation.workspaceId,
    );
    return inviter !== undefined && canInviteRole(inviter.role, invitation.role);
  }

  async #authorizeMembershipAdministration(
    state: AppState,
    actorUserId: string,
    workspaceId: string,
  ): Promise<void> {
    if (!(await state.lockWorkspaceForMembershipAdministration(workspaceId))) {
      throw resourceNotFound();
    }
    const membership = await state.findMembership(actorUserId, workspaceId);
    if (membership === undefined) throw resourceNotFound();
    if (!hasCapability(membership.role, "administer_workspace")) {
      throw roleForbidden();
    }
  }

  async #authenticate(
    evidence: Pick<RequestEvidence, "sessionToken" | "csrfToken">,
    requireMutationProof: boolean,
  ): Promise<AuthenticatedContext> {
    if (evidence.sessionToken === undefined) throw authenticationRequired();
    const now = this.#clock.now();
    const session = await this.#state.findSession(
      hashSecret(evidence.sessionToken),
      now,
    );
    if (session === undefined) throw authenticationRequired();
    if (
      requireMutationProof &&
      (evidence.csrfToken === undefined ||
        !verifySecretHash(evidence.csrfToken, session.csrfTokenHash))
    ) {
      throw fault(
        403,
        "CSRF_REJECTED",
        "Mutation proof rejected",
        "Refresh the session and try the action again from the Glyphkiln application.",
      );
    }
    await this.#state.touchSession(session.sessionId, now);
    return { session, state: this.#state };
  }

  async #membershipOrNotFound(
    context: AuthenticatedContext,
    workspaceId: string,
  ): Promise<WorkspaceMembershipSummary> {
    const membership = await context.state.findMembership(
      context.session.user.id,
      workspaceId,
    );
    if (membership === undefined) throw resourceNotFound();
    return membership;
  }

  async #authorizeWorkspace(
    context: AuthenticatedContext,
    workspaceId: string,
    action: WorkspaceAction,
  ): Promise<WorkspaceMembershipSummary> {
    const membership = await this.#membershipOrNotFound(context, workspaceId);
    if (!hasCapability(membership.role, action)) throw roleForbidden();
    return membership;
  }

  async #brandSnapshotOrNotFound(
    state: AppState,
    workspaceId: string,
    snapshotId: string,
  ): Promise<StoredBrandSnapshot> {
    const brand = await state.findBrandSnapshot(workspaceId, snapshotId);
    if (brand === undefined) throw resourceNotFound();
    const validation = BrandSnapshotSchema.safeParse(brand.snapshot);
    if (!validation.success || hashCanonical(validation.data) !== brand.canonicalHash) {
      throw storeUnavailable();
    }
    return { ...brand, snapshot: validation.data };
  }

  async #loadTrustedRevision(
    state: AppState,
    workspaceId: string,
    designId: string,
    revisionId?: string,
  ): Promise<StoredDesignRevision> {
    const revision = await state.findDesignRevision({
      workspaceId,
      designId,
      ...(revisionId === undefined ? {} : { revisionId }),
    });
    if (revision === undefined) throw resourceNotFound();
    const validation = validateDesignDocument(revision.document);
    if (
      !validation.success ||
      hashCanonical(validation.data) !== revision.canonicalHash
    ) {
      throw storeUnavailable();
    }
    const brand = await this.#brandSnapshotOrNotFound(
      state,
      workspaceId,
      revision.brandSnapshotId,
    );
    if (canonicalJson(validation.data.brand) !== canonicalJson(brand.snapshot)) {
      throw storeUnavailable();
    }
    if (
      !resourceReferencesMatchDocument(validation.data, revision.resourceReferences)
    ) {
      throw storeUnavailable();
    }
    return { ...revision, document: validation.data };
  }

  async #assertCampaignAdaptationLocks(
    state: AppState,
    input: {
      workspaceId: string;
      designId: string;
      revisionId: string;
      candidate: DesignDocument;
    },
  ): Promise<void> {
    const contexts = await state.listCampaignLockContextsForRevision(input);
    for (const context of contexts) {
      const baseline = await this.#loadTrustedRevision(
        state,
        input.workspaceId,
        context.baseDesignId,
        context.baseRevisionId,
      );
      requireAuthoringLocks(baseline.document, input.candidate, context.locks);
    }
  }

  async #assertStoredCampaignLocks(
    state: AppState,
    workspaceId: string,
    revision: StoredDesignRevision,
  ): Promise<void> {
    await this.#assertCampaignAdaptationLocks(state, {
      workspaceId,
      designId: revision.designId,
      revisionId: revision.revisionId,
      candidate: revision.document,
    });
  }

  async #resolveManualResourceDeclarations(
    workspaceId: string,
    draft: ManualDraft,
  ): Promise<ManualResourceDeclarations> {
    const selection = draft.resources;
    if (
      selection === undefined ||
      (selection.assetIds.length === 0 && selection.fontIds.length === 0)
    ) {
      return {
        assets: [],
        fonts: [],
        resourceReferences: [],
        resourceVersions: { assets: [], fonts: [] },
      };
    }
    if (this.#resourceStore === undefined) {
      throw fault(
        422,
        "UNSUPPORTED_MANUAL_RESOURCE",
        "Admitted resources are unavailable",
        "Configure immutable resource storage before selecting uploaded assets or fonts.",
      );
    }
    const assets: AssetDeclaration[] = [];
    const assetVersions: ManualResourceVersions["assets"] = [];
    for (const resourceId of selection.assetIds) {
      const resource = await this.#resourceStore.findById(workspaceId, resourceId);
      if (resource?.workspaceId !== workspaceId || resource.kind !== "raster-asset") {
        throw resourceNotFound();
      }
      assets.push({
        id: resource.id,
        mimeType: resource.mediaType,
        sha256: resource.contentHash,
        width: resource.width,
        height: resource.height,
        origin: { ...resource.origin },
      });
      assetVersions.push({
        id: resource.id,
        sha256: resource.contentHash,
        origin: { ...resource.origin },
        license: { ...resource.license },
      });
    }
    const fonts: FontDeclaration[] = [];
    const fontVersions: ManualResourceVersions["fonts"] = [];
    const fontFaces = new Set<string>();
    for (const resourceId of selection.fontIds) {
      const resource = await this.#resourceStore.findById(workspaceId, resourceId);
      if (resource?.workspaceId !== workspaceId || resource.kind !== "font") {
        throw resourceNotFound();
      }
      const face = [resource.family, resource.weight.toString(), resource.style].join(
        "\u0000",
      );
      if (fontFaces.has(face)) {
        throw invalidDocument([
          {
            path: "draft.resources.fontIds",
            code: "DUPLICATE_FONT_FACE_SELECTION",
            message:
              "Select only one immutable version for each font family, weight, and style.",
          },
        ]);
      }
      fontFaces.add(face);
      fonts.push({
        family: resource.family,
        weight: resource.weight,
        style: resource.style,
        sha256: resource.contentHash,
      });
      fontVersions.push({
        id: resource.id,
        family: resource.family,
        weight: resource.weight,
        style: resource.style,
        sha256: resource.contentHash,
        origin: { ...resource.origin },
        license: { ...resource.license },
      });
    }
    assetVersions.sort((left, right) => compareCanonicalStrings(left.id, right.id));
    fontVersions.sort(compareResourceFontVersions);
    return {
      assets,
      fonts,
      resourceVersions: {
        assets: assetVersions,
        fonts: fontVersions,
      },
      resourceReferences: [
        ...assetVersions.map((resource, ordinal) => ({
          resourceId: resource.id,
          resourceKind: "raster-asset" as const,
          ordinal,
        })),
        ...fontVersions.map((resource, ordinal) => ({
          resourceId: resource.id,
          resourceKind: "font" as const,
          ordinal,
        })),
      ],
    };
  }

  async #renderDocument(
    workspaceId: string,
    document: DesignDocument,
    creationTimestamp?: Date,
  ): Promise<{
    document: DesignDocument;
    qualityIssues: QualityIssue[];
    evidence: PreviewSuccess["evidence"];
    outputs: RenderedArtifact[];
  }> {
    let admitted:
      | { readonly accepted: true; readonly value: PreviewResponse }
      | { readonly accepted: false };
    try {
      admitted = await this.#renderAdmission.run(workspaceId, async () => {
        const resources = await this.#resourceResolver.resolve({
          workspaceId,
          document,
        });
        return this.#render(document, resources, creationTimestamp);
      });
    } catch (error) {
      if (
        error instanceof RenderResourceResolutionError &&
        error.code === "RESOURCE_LIMIT_EXCEEDED"
      ) {
        throw fault(
          413,
          "RENDER_REJECTED",
          "Render resources are too large",
          "The selected assets or fonts exceed the bounded renderer resource profile.",
        );
      }
      throw fault(
        503,
        "RENDER_UNAVAILABLE",
        "Renderer unavailable",
        "The isolated renderer did not complete the request.",
      );
    }
    if (!admitted.accepted) {
      throw fault(
        429,
        "RENDER_CAPACITY_REACHED",
        "Renderer is busy",
        "Wait for the current bounded preview to finish before starting another.",
      );
    }
    const response = admitted.value;
    if (!response.ok) {
      const status =
        response.status === 413
          ? 413
          : response.status === 504
            ? 504
            : response.status >= 500
              ? 503
              : response.status === 429
                ? 429
                : 422;
      throw fault(
        status,
        response.status >= 500 ? "RENDER_UNAVAILABLE" : "RENDER_REJECTED",
        response.title,
        response.detail,
        {
          ...(response.problems === undefined ? {} : { problems: response.problems }),
          ...(response.qualityIssues === undefined
            ? {}
            : { qualityIssues: response.qualityIssues }),
        },
      );
    }
    if (canonicalJson(response.document) !== canonicalJson(document)) {
      throw storeUnavailable();
    }
    return {
      document: response.document,
      qualityIssues: response.qualityIssues,
      evidence: response.evidence,
      outputs: response.outputs,
    };
  }

  #newSession(userId: string, now: Date): NewSessionBundle {
    const token = this.#secretFactory.createToken();
    const csrfToken = this.#secretFactory.createToken();
    return {
      record: {
        id: this.#secretFactory.createId(),
        userId,
        tokenHash: hashSecret(token),
        csrfTokenHash: hashSecret(csrfToken),
        createdAt: now,
        expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
      },
      token,
      csrfToken,
    };
  }

  async #sessionGrant(
    state: AppState,
    input: {
      session: NewSessionBundle;
      user: SessionGrant["user"];
    },
  ): Promise<SessionGrant> {
    return {
      kind: "session-granted",
      sessionToken: input.session.token,
      csrfToken: input.session.csrfToken,
      expiresAt: input.session.record.expiresAt.toISOString(),
      user: input.user,
      workspaces: await state.listMemberships(input.user.id),
    };
  }

  #audit(
    state: AppState,
    input: Omit<Parameters<AppState["appendAuditEvent"]>[0], "id">,
  ): Promise<void> {
    return state.appendAuditEvent({
      id: this.#secretFactory.createId(),
      ...input,
    });
  }
}

function handoffJsonFile(
  path: string,
  value: unknown,
  approvalStatus: CampaignHandoffFile["approvalStatus"],
): CampaignHandoffFile {
  return handoffBinaryFile(
    path,
    "application/json",
    new TextEncoder().encode(`${canonicalJson(value)}\n`),
    approvalStatus,
  );
}

function addCampaignHandoffFiles(
  archive: CampaignHandoffArchive,
  ...files: readonly CampaignHandoffFile[]
): void {
  try {
    archive.add(...files);
  } catch (error) {
    if (error instanceof CampaignHandoffArchiveLimitError) {
      throw invalidCampaignCanvas(
        `A verified handoff must be ${MAXIMUM_CAMPAIGN_HANDOFF_ARCHIVE_BYTES.toString()} bytes or smaller.`,
      );
    }
    throw error;
  }
}

function encodeCampaignHandoffArchive(
  archive: CampaignHandoffArchive,
  input: Parameters<CampaignHandoffArchive["encode"]>[0],
): ReturnType<CampaignHandoffArchive["encode"]> {
  try {
    return archive.encode(input);
  } catch (error) {
    if (error instanceof CampaignHandoffArchiveLimitError) {
      throw invalidCampaignCanvas(
        `A verified handoff must be ${MAXIMUM_CAMPAIGN_HANDOFF_ARCHIVE_BYTES.toString()} bytes or smaller.`,
      );
    }
    throw error;
  }
}

function handoffBinaryFile(
  path: string,
  mediaType: string,
  bytes: Uint8Array,
  approvalStatus: CampaignHandoffFile["approvalStatus"],
): CampaignHandoffFile {
  return {
    path,
    mediaType,
    byteSize: bytes.byteLength,
    sha256: sha256(bytes),
    base64: Buffer.from(bytes).toString("base64"),
    approvalStatus,
  };
}

function handoffProofMatchesApproval(input: {
  approval: RevisionApprovalProjection;
  revisionCanonicalHash: string;
  resourcePins: RevisionApprovalProjection["resourcePins"];
  outputs: RenderedArtifact[];
}): boolean {
  if (
    input.approval.revisionCanonicalHash !== input.revisionCanonicalHash ||
    canonicalJson(input.approval.resourcePins) !== canonicalJson(input.resourcePins) ||
    input.approval.outputEvidence.length !== input.outputs.length
  ) {
    return false;
  }
  return input.outputs.every((output) => {
    const evidence = input.approval.outputEvidence.find(
      (candidate) => candidate.format === output.format,
    );
    if (evidence?.fingerprint !== output.fingerprint) {
      return false;
    }
    const artifactBytes = Buffer.from(output.base64, "base64");
    const manifestBytes = new TextEncoder().encode(
      `${canonicalJson(output.manifest)}\n`,
    );
    return (
      sha256(artifactBytes) === evidence.artifactSha256 &&
      sha256(manifestBytes) === evidence.manifestSha256
    );
  });
}

function proposalInvariantIssues(
  base: DesignDocument,
  candidate: DesignDocument,
): CampaignProposalIssueProjection[] {
  const checks: readonly {
    code: string;
    message: string;
    baseValue: unknown;
    candidateValue: unknown;
  }[] = [
    {
      code: "DOCUMENT_ID_SERVER_OWNED",
      message: "A proposal cannot choose or change the stored document identity.",
      baseValue: base.id,
      candidateValue: candidate.id,
    },
    {
      code: "BRAND_SNAPSHOT_SERVER_OWNED",
      message: "A proposal must retain the exact operator-selected brand snapshot.",
      baseValue: base.brand,
      candidateValue: candidate.brand,
    },
    {
      code: "RESOURCE_SELECTION_SERVER_OWNED",
      message: "A proposal must retain the exact operator-selected asset declarations.",
      baseValue: base.assets,
      candidateValue: candidate.assets,
    },
    {
      code: "FONT_SELECTION_SERVER_OWNED",
      message: "A proposal must retain the exact operator-selected font declarations.",
      baseValue: base.fonts,
      candidateValue: candidate.fonts,
    },
    {
      code: "TEMPLATE_COORDINATION_SERVER_OWNED",
      message: "A proposal must retain the coordinated exact template version.",
      baseValue: base.template,
      candidateValue: candidate.template,
    },
    {
      code: "FORMAT_COORDINATION_SERVER_OWNED",
      message: "A proposal must retain the coordinated canvas format.",
      baseValue: base.format,
      candidateValue: candidate.format,
    },
    {
      code: "SEED_COORDINATION_SERVER_OWNED",
      message: "A proposal must retain the server-derived campaign canvas seed.",
      baseValue: base.seed,
      candidateValue: candidate.seed,
    },
  ];
  return checks.flatMap((check) =>
    canonicalJson(check.baseValue) === canonicalJson(check.candidateValue)
      ? []
      : [{ code: check.code, message: check.message }],
  );
}

function toProposalResponseIssue(issue: {
  code: string;
  message: string;
  candidateIndex?: number;
}): CampaignProposalIssueProjection {
  return {
    code: issue.code,
    message: issue.message,
    ...(issue.candidateIndex === undefined
      ? {}
      : { candidateIndex: issue.candidateIndex }),
  };
}

function toProposalDocumentIssue(issue: {
  code: string;
  message: string;
}): CampaignProposalIssueProjection {
  return { code: issue.code, message: issue.message };
}

function toProposalLockIssue(issue: {
  code: string;
  message: string;
  lock?: AuthoringLockId;
}): CampaignProposalIssueProjection {
  return {
    code: issue.code,
    message: issue.message,
    ...(issue.lock === undefined ? {} : { lock: issue.lock }),
  };
}

function asSqlJson(value: unknown): SqlJsonValue {
  return JSON.parse(canonicalJson(value)) as SqlJsonValue;
}

function createWorkspaceRecord(
  id: string,
  name: string,
  createdBy: string,
  createdAt: Date,
) {
  return {
    id,
    name,
    slug: `${slugBase(name)}-${id.replaceAll("-", "").slice(0, 8)}`,
    createdBy,
    createdAt,
  };
}

async function requireCurrentDesignHead(
  state: AppState,
  workspaceId: string,
  designId: string,
  revisionId: string,
): Promise<void> {
  const design = await state.lockDesignHead(workspaceId, designId);
  if (design === undefined) throw resourceNotFound();
  if (design.headRevisionId !== revisionId) throw revisionConflict();
}

function slugBase(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 48);
  return slug === "" ? "workspace" : slug;
}

function brandVersion(sequence: number): string {
  return `1.0.${(sequence - 1).toString()}`;
}

function normalizeEmailOrFail(email: string): NormalizedEmail {
  try {
    return normalizeEmail(email);
  } catch {
    throw fault(
      422,
      "INVALID_INPUT",
      "Email address needs attention",
      "Enter a complete email address, such as name@example.com.",
    );
  }
}

function requireValidPassword(password: string): void {
  const validation = validatePassword(password);
  if (validation.valid) return;
  throw fault(
    422,
    "INVALID_INPUT",
    "Password needs attention",
    "Use a password between 12 and 128 characters.",
  );
}

function toRevisionProjection(
  revision: StoredDesignRevision,
): DesignRevisionProjection {
  return {
    kind: "design-revision",
    designId: revision.designId,
    designName: revision.designName,
    revisionId: revision.revisionId,
    revisionNumber: revision.revisionNumber,
    ...(revision.parentRevisionId === undefined
      ? {}
      : { parentRevisionId: revision.parentRevisionId }),
    brandSnapshotId: revision.brandSnapshotId,
    documentHash: revision.canonicalHash,
    document: revision.document,
    createdAt: revision.createdAt.toISOString(),
    ...(revision.changeNote === undefined ? {} : { changeNote: revision.changeNote }),
  };
}

function compareResourceFontVersions(
  left: ManualResourceVersions["fonts"][number],
  right: ManualResourceVersions["fonts"][number],
): number {
  return compareCanonicalStrings(
    [left.family, left.weight.toString(), left.style, left.id].join("\u0000"),
    [right.family, right.weight.toString(), right.style, right.id].join("\u0000"),
  );
}

function toRenderJobProjection(job: RenderJobView): RenderJobProjection {
  return {
    kind: "render-job",
    jobId: job.jobId,
    workspaceId: job.workspaceId,
    designId: job.designId,
    revisionId: job.revisionId,
    state: job.state,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    ...(job.finishedAt === undefined
      ? {}
      : { finishedAt: job.finishedAt.toISOString() }),
    ...(job.lastError === undefined ? {} : { lastError: { ...job.lastError } }),
    outputs: job.outputs.map((output) => ({
      format: output.format,
      mimeType: output.mimeType,
      artifactSha256: output.artifactSha256,
      artifactByteSize: output.artifactByteSize,
      manifestSha256: output.manifestSha256,
      manifestByteSize: output.manifestByteSize,
      fingerprint: output.fingerprint,
    })),
  };
}

function success<T>(value: T, status: 200 | 201 = 200): AppResult<T> {
  return { ok: true, status, value };
}

function invalidInput(problems: ValidationProblem[]): AppFailure {
  return failure(
    422,
    "INVALID_INPUT",
    "Request needs attention",
    "Review the structured fields and try again.",
    { problems },
  );
}

function invalidDocument(problems: ValidationProblem[]): WorkflowFault {
  return fault(
    422,
    "INVALID_DESIGN_DOCUMENT",
    "Design document needs attention",
    "Core rejected the constructed manual design document.",
    { problems },
  );
}

function invalidCampaignCanvas(
  detail = "Use a template, version, format, and composition variant from the campaign family.",
): WorkflowFault {
  return fault(
    422,
    "INVALID_CAMPAIGN_CANVAS",
    "Campaign canvas needs attention",
    detail,
  );
}

function requireAuthoringLocks(
  base: DesignDocument,
  candidate: DesignDocument,
  locks: readonly AuthoringLockId[],
): void {
  const validation = validateAuthoringLocks(base, candidate, locks);
  if (validation.success) return;
  throw fault(
    422,
    "CAMPAIGN_LOCK_VIOLATION",
    "Campaign locks must be preserved",
    validation.issues.map((issue) => issue.message).join(" "),
  );
}

function invalidInvitation(): WorkflowFault {
  return fault(
    404,
    "INVITATION_INVALID_OR_EXPIRED",
    "Invitation unavailable",
    "The invitation is invalid, expired, revoked, already used, or bound to another email address.",
  );
}

function registrationClosed(): WorkflowFault {
  return fault(
    403,
    "REGISTRATION_CLOSED",
    "Registration is unavailable",
    "Sign in with an existing account or join with a valid invitation.",
  );
}

function authenticationRequired(): WorkflowFault {
  return fault(
    401,
    "AUTH_REQUIRED",
    "Sign in required",
    "Sign in with an active Glyphkiln account to continue.",
  );
}

function loginThrottled(): WorkflowFault {
  return fault(
    429,
    "AUTH_THROTTLED",
    "Sign in temporarily paused",
    "Wait 15 minutes before trying this email address again.",
  );
}

function roleForbidden(): WorkflowFault {
  return fault(
    403,
    "ROLE_FORBIDDEN",
    "Workspace role does not permit this action",
    "Ask a workspace administrator for the required access.",
  );
}

function finalWorkspaceOwner(): WorkflowFault {
  return fault(
    409,
    "FINAL_WORKSPACE_OWNER",
    "Workspace needs an active owner",
    "Add another owner through a future ownership-transfer flow before demoting or revoking the final active owner.",
  );
}

function workspaceCapacityReached(): WorkflowFault {
  return fault(
    409,
    "WORKSPACE_CAPACITY_REACHED",
    "Workspace capacity reached",
    "This account or installation has reached its configured workspace limit.",
  );
}

function resourceNotFound(): WorkflowFault {
  return fault(
    404,
    "RESOURCE_NOT_FOUND",
    "Resource unavailable",
    "The resource does not exist in this workspace or is not available to this account.",
  );
}

function revisionConflict(): WorkflowFault {
  return fault(
    409,
    "REVISION_CONFLICT",
    "A newer revision already exists",
    "Reopen the latest revision, review the changes, and revise it again.",
  );
}

function reviewConflict(): WorkflowFault {
  return fault(
    409,
    "REVIEW_CONFLICT",
    "Review state changed",
    "Reload the exact head revision and its current review state before continuing.",
  );
}

function aiAuthoringDisabled(): WorkflowFault {
  return fault(
    503,
    "AI_AUTHORING_DISABLED",
    "Optional proposals are disabled",
    "An operator must configure the proposal provider before this workspace can request AI directions.",
  );
}

function aiProposalRejected(): WorkflowFault {
  return fault(
    422,
    "AI_PROPOSAL_REJECTED",
    "Proposal can no longer be accepted",
    "The stored proposal no longer passes its resource, lock, or Core proof boundary.",
  );
}

function proposalDecisionConflict(): WorkflowFault {
  return fault(
    409,
    "AI_PROPOSAL_REJECTED",
    "Proposal decision already recorded",
    "Reload the proposal run to see the immutable human decision.",
  );
}

function renderQueueUnavailable(): WorkflowFault {
  return fault(
    503,
    "RENDER_UNAVAILABLE",
    "Async exports are unavailable",
    "The durable render queue is not ready. Try again after the service recovers.",
  );
}

function emailAlreadyRegistered(): WorkflowFault {
  return fault(
    409,
    "EMAIL_ALREADY_REGISTERED",
    "Account already exists",
    "Sign in with this email address instead.",
  );
}

function storeUnavailable(): WorkflowFault {
  return fault(
    503,
    "STORE_UNAVAILABLE",
    "Stored state could not be trusted",
    "Glyphkiln could not safely read the requested immutable record.",
  );
}

function fault(
  status: AppFailure["status"],
  code: AppFailureCode,
  title: string,
  detail: string,
  additions: Partial<AppFailure["error"]> = {},
): WorkflowFault {
  return new WorkflowFault(failure(status, code, title, detail, additions));
}

function failure(
  status: AppFailure["status"],
  code: AppFailureCode,
  title: string,
  detail: string,
  additions: Partial<AppFailure["error"]> = {},
): AppFailure {
  return {
    ok: false,
    status,
    error: { code, title, detail, ...additions },
  };
}

function mapUnexpectedFailure(error: unknown): AppFailure {
  if (error instanceof WorkflowFault) return error.failure;
  return failure(
    503,
    "STORE_UNAVAILABLE",
    "Application state unavailable",
    "Glyphkiln could not complete the operation safely. Try again after the service recovers.",
  );
}

function toValidationProblem(issue: {
  path: PropertyKey[];
  code: string;
  message: string;
}): ValidationProblem {
  return {
    path: issue.path.map(String).join("."),
    code: issue.code,
    message: issue.message,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function toSelectableResourceProjection(resource: ResourceVersion) {
  const common = {
    id: resource.id,
    contentHash: resource.contentHash,
    byteSize: resource.byteSize,
    origin: { ...resource.origin },
    license: { ...resource.license },
    createdAt: resource.createdAt.toISOString(),
  };
  return resource.kind === "raster-asset"
    ? {
        ...common,
        kind: resource.kind,
        mediaType: resource.mediaType,
        width: resource.width,
        height: resource.height,
      }
    : {
        ...common,
        kind: resource.kind,
        mediaType: resource.mediaType,
        family: resource.family,
        weight: resource.weight,
        style: resource.style,
      };
}

function validateWorkspaceCreationLimits(
  input: WorkspaceCreationLimits,
): WorkspaceCreationLimits {
  if (
    !Number.isSafeInteger(input.maximumWorkspacesPerInstallation) ||
    input.maximumWorkspacesPerInstallation < 1 ||
    input.maximumWorkspacesPerInstallation > 100_000 ||
    !Number.isSafeInteger(input.maximumWorkspacesPerUser) ||
    input.maximumWorkspacesPerUser < 1 ||
    input.maximumWorkspacesPerUser > 1_000 ||
    input.maximumWorkspacesPerUser > input.maximumWorkspacesPerInstallation
  ) {
    throw new RangeError("Workspace creation limits are outside the supported range.");
  }
  return Object.freeze({ ...input });
}
