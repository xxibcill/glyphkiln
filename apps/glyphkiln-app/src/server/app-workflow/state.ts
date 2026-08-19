import type {
  BrandSnapshot,
  CampaignCompositionVariantId,
  CampaignFamilyId,
  CarouselNarrativeRole,
  CarouselSourceNote,
  DesignDocument,
  DeliveryProfileId,
  FormatId,
  TemplateId,
} from "@glyphkiln/core";

import type { AuthoringLockId } from "@/server/ai-authoring";
import type {
  BrandKitSummary,
  CampaignBoardProjection,
  CampaignCanvasPublicationMetadata,
  CampaignCanvasProjection,
  CampaignDirectionProjection,
  CampaignProposalCandidateProjection,
  CampaignProposalDecisionProjection,
  CampaignProposalIssueProjection,
  CampaignProposalProofProjection,
  CampaignProposalRunProjection,
  CampaignProposalRunSummaryProjection,
  CampaignSummary,
  DesignSummary,
  RevisionApprovalOutputEvidence,
  RevisionApprovalProjection,
  RevisionReviewProjection,
  RevisionReviewState,
  UserSummary,
  WorkspaceMemberSummary,
  WorkspaceMembershipSummary,
} from "./contracts";
import type {
  SqlDatabase,
  SqlJsonValue,
  SqlParameters,
  SqlTransaction,
} from "@/server/persistence/database";
import { resolveCampaignRevisionLockContexts } from "@/server/campaigns/revision-lock-context";
import {
  REVISION_RESOURCE_REFERENCE_COLUMNS,
  mapRevisionResourceReference,
  type RevisionResourcePin,
  type RevisionResourceReference,
  type RevisionResourceReferenceRow,
} from "@/server/resources/revision-resource-provenance";
import type { WorkspaceRole } from "@/server/security/workspace-policy";

const MAX_CAMPAIGN_PROPOSAL_RUN_SUMMARIES_PER_DIRECTION = 20;

export type AuthenticatedSessionRecord = {
  sessionId: string;
  csrfTokenHash: string;
  expiresAt: Date;
  user: UserSummary;
};

export type UserCredentialRecord = UserSummary & {
  passwordHash: string;
};

export type InvitationRecord = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  invitedBy: string;
  expiresAt: Date;
};

export type StoredBrandSnapshot = {
  id: string;
  workspaceId: string;
  brandKitId: string;
  sequence: number;
  version: string;
  canonicalHash: string;
  snapshot: BrandSnapshot;
};

export type StoredDesignHead = {
  id: string;
  name: string;
  headRevisionId?: string;
  headRevisionNumber: number;
};

export type DesignRevisionResourcePin = RevisionResourcePin;

export type StoredDesignRevision = {
  designId: string;
  designName: string;
  revisionId: string;
  revisionNumber: number;
  parentRevisionId?: string;
  brandSnapshotId: string;
  canonicalHash: string;
  document: DesignDocument;
  resourceReferences: RevisionResourceReference[];
  createdAt: Date;
  changeNote?: string;
};

export type StoredCampaign = {
  id: string;
  workspaceId: string;
  name: string;
  brief: string;
  campaignSeed: string;
  familyId: CampaignFamilyId;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredCampaignDirection = {
  id: string;
  workspaceId: string;
  campaignId: string;
  directionKey: string;
  name: string;
  createdAt: Date;
};

export type CampaignLockContext = {
  campaignId: string;
  directionId: string;
  locks: AuthoringLockId[];
  baseDesignId: string;
  baseRevisionId: string;
};

export type StoredCampaignProposalCandidate = {
  id: string;
  workspaceId: string;
  runId: string;
  campaignId: string;
  directionId: string;
  baseDesignId: string;
  baseRevisionId: string;
  index: number;
  status: "proved" | "rejected";
  document?: DesignDocument;
  canonicalHash?: string;
  rationale?: string;
  issues: CampaignProposalIssueProjection[];
  proof?: CampaignProposalProofProjection;
  locks: AuthoringLockId[];
};

export type StoredRevisionReview = {
  id: string;
  workspaceId: string;
  designId: string;
  revisionId: string;
  state: RevisionReviewState;
};

export type NewUserRecord = UserSummary & {
  passwordHash: string;
  createdAt: Date;
};

export type NewSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  createdAt: Date;
  expiresAt: Date;
};

export type NewWorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: Date;
};

export type NewInvitationRecord = {
  id: string;
  workspaceId: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  tokenHash: string;
  invitedBy: string;
  createdAt: Date;
  expiresAt: Date;
};

type DatabaseHandle = SqlDatabase | SqlTransaction;

export class AppState {
  readonly #database: DatabaseHandle;

  constructor(database: DatabaseHandle) {
    this.#database = database;
  }

  async transaction<T>(operation: (state: AppState) => Promise<T>): Promise<T> {
    if (!isDatabase(this.#database)) return operation(this);
    return this.#database.transaction((transaction) =>
      operation(new AppState(transaction)),
    );
  }

  async lockInstallationState(): Promise<{ bootstrapUserId?: string }> {
    const rows = await this.#query<{
      bootstrap_user_id: string | null;
    }>(
      `SELECT bootstrap_user_id
         FROM installation_state
        WHERE singleton = TRUE
          FOR UPDATE`,
    );
    const row = requireRow(rows, "installation_state");
    return {
      ...(row.bootstrap_user_id === null
        ? {}
        : { bootstrapUserId: row.bootstrap_user_id }),
    };
  }

  async findInstallationState(): Promise<{ bootstrapUserId?: string }> {
    const rows = await this.#query<{
      bootstrap_user_id: string | null;
    }>(
      `SELECT bootstrap_user_id
         FROM installation_state
        WHERE singleton = TRUE`,
    );
    const row = requireRow(rows, "installation_state");
    return {
      ...(row.bootstrap_user_id === null
        ? {}
        : { bootstrapUserId: row.bootstrap_user_id }),
    };
  }

  async markInstallationBootstrapped(userId: string, at: Date): Promise<void> {
    await this.#query(
      `UPDATE installation_state
          SET bootstrap_user_id = $1,
              bootstrapped_at = $2
        WHERE singleton = TRUE
          AND bootstrap_user_id IS NULL
      RETURNING singleton`,
      [userId, at],
    );
  }

  async findUserCredentials(email: string): Promise<UserCredentialRecord | undefined> {
    const rows = await this.#query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
    }>(
      `SELECT id, email, display_name, password_hash
         FROM users
        WHERE email = $1
          AND disabled_at IS NULL`,
      [email],
    );
    const row = rows.at(0);
    return row === undefined
      ? undefined
      : {
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          passwordHash: row.password_hash,
        };
  }

  async isLoginBlocked(credentialKeyHash: string, at: Date): Promise<boolean> {
    const rows = await this.#query<{ credential_key_hash: string }>(
      `SELECT credential_key_hash
         FROM login_throttles
        WHERE credential_key_hash = $1
          AND blocked_until > $2`,
      [credentialKeyHash, at],
    );
    return rows.length === 1;
  }

  async recordLoginFailure(input: {
    credentialKeyHash: string;
    at: Date;
    windowExpiresAt: Date;
    blockedUntil: Date;
    threshold: number;
  }): Promise<boolean> {
    const rows = await this.#query<{ blocked_until: Date | string | null }>(
      `INSERT INTO login_throttles (
         credential_key_hash, failed_attempts, window_expires_at,
         blocked_until, updated_at
       ) VALUES ($1, 1, $3, NULL, $2)
       ON CONFLICT (credential_key_hash) DO UPDATE
       SET failed_attempts = CASE
             WHEN login_throttles.window_expires_at <= $2 THEN 1
             ELSE login_throttles.failed_attempts + 1
           END,
           window_expires_at = CASE
             WHEN login_throttles.window_expires_at <= $2 THEN $3
             ELSE login_throttles.window_expires_at
           END,
           blocked_until = CASE
             WHEN login_throttles.blocked_until > $2
               THEN login_throttles.blocked_until
             WHEN (
               CASE
                 WHEN login_throttles.window_expires_at <= $2 THEN 1
                 ELSE login_throttles.failed_attempts + 1
               END
             ) >= $5
               THEN $4
             ELSE NULL
           END,
           updated_at = $2
       RETURNING blocked_until`,
      [
        input.credentialKeyHash,
        input.at,
        input.windowExpiresAt,
        input.blockedUntil,
        input.threshold,
      ],
    );
    return requireRow(rows, "login throttle").blocked_until !== null;
  }

  async clearLoginFailures(credentialKeyHash: string): Promise<void> {
    await this.#query("DELETE FROM login_throttles WHERE credential_key_hash = $1", [
      credentialKeyHash,
    ]);
  }

  async insertUser(user: NewUserRecord): Promise<void> {
    await this.#query(
      `INSERT INTO users (
         id, email, display_name, password_hash, created_at
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [user.id, user.email, user.displayName, user.passwordHash, user.createdAt],
    );
  }

  async insertSession(session: NewSessionRecord): Promise<void> {
    await this.#query(
      `INSERT INTO sessions (
         id, user_id, token_hash, csrf_token_hash, created_at, expires_at, last_seen_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $5)
       RETURNING id`,
      [
        session.id,
        session.userId,
        session.tokenHash,
        session.csrfTokenHash,
        session.createdAt,
        session.expiresAt,
      ],
    );
  }

  async findSession(
    tokenHash: string,
    at: Date,
  ): Promise<AuthenticatedSessionRecord | undefined> {
    const rows = await this.#query<{
      session_id: string;
      csrf_token_hash: string;
      expires_at: Date | string;
      user_id: string;
      email: string;
      display_name: string;
    }>(
      `SELECT s.id AS session_id,
              s.csrf_token_hash,
              s.expires_at,
              u.id AS user_id,
              u.email,
              u.display_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > $2
          AND u.disabled_at IS NULL`,
      [tokenHash, at],
    );
    const row = rows.at(0);
    if (row === undefined) return undefined;
    return {
      sessionId: row.session_id,
      csrfTokenHash: row.csrf_token_hash,
      expiresAt: asDate(row.expires_at),
      user: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
      },
    };
  }

  async touchSession(sessionId: string, at: Date): Promise<void> {
    await this.#query(
      `UPDATE sessions
          SET last_seen_at = GREATEST(last_seen_at, $2)
        WHERE id = $1
          AND revoked_at IS NULL
      RETURNING id`,
      [sessionId, at],
    );
  }

  async revokeSession(sessionId: string, at: Date): Promise<void> {
    await this.#query(
      `UPDATE sessions
          SET revoked_at = COALESCE(revoked_at, $2)
        WHERE id = $1
      RETURNING id`,
      [sessionId, at],
    );
  }

  async revokeAllUserSessions(userId: string, at: Date): Promise<void> {
    await this.#query(
      `SELECT id
         FROM users
        WHERE id = $1
          FOR UPDATE`,
      [userId],
    );
    await this.#query(
      `UPDATE sessions
          SET revoked_at = COALESCE(revoked_at, $2)
        WHERE user_id = $1
          AND revoked_at IS NULL
      RETURNING id`,
      [userId, at],
    );
  }

  async insertWorkspace(workspace: NewWorkspaceRecord): Promise<void> {
    await this.#query(
      `INSERT INTO workspaces (id, name, slug, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        workspace.id,
        workspace.name,
        workspace.slug,
        workspace.createdBy,
        workspace.createdAt,
      ],
    );
  }

  async readWorkspaceCreationUsage(userId: string): Promise<{
    installationWorkspaces: number;
    userWorkspaces: number;
  }> {
    const rows = await this.#query<{
      installation_workspaces: number | string;
      user_workspaces: number | string;
    }>(
      `SELECT count(*)::integer AS installation_workspaces,
              count(*) FILTER (WHERE created_by = $1)::integer AS user_workspaces
         FROM workspaces`,
      [userId],
    );
    const row = requireRow(rows, "workspace creation usage");
    return {
      installationWorkspaces: Number(row.installation_workspaces),
      userWorkspaces: Number(row.user_workspaces),
    };
  }

  async insertMembership(input: {
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO workspace_memberships (
         workspace_id, user_id, role, created_at
       ) VALUES ($1, $2, $3, $4)
       RETURNING workspace_id`,
      [input.workspaceId, input.userId, input.role, input.createdAt],
    );
  }

  async findMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembershipSummary | undefined> {
    const rows = await this.#query<{
      id: string;
      name: string;
      slug: string;
      role: WorkspaceRole;
    }>(
      `SELECT w.id, w.name, w.slug, wm.role
         FROM workspace_memberships wm
         JOIN workspaces w ON w.id = wm.workspace_id
         JOIN users u ON u.id = wm.user_id
        WHERE wm.user_id = $1
          AND wm.workspace_id = $2
          AND wm.revoked_at IS NULL
          AND u.disabled_at IS NULL
          AND w.archived_at IS NULL`,
      [userId, workspaceId],
    );
    return rows[0];
  }

  async listMemberships(userId: string): Promise<WorkspaceMembershipSummary[]> {
    return this.#query<WorkspaceMembershipSummary>(
      `SELECT w.id, w.name, w.slug, wm.role
         FROM workspace_memberships wm
         JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.user_id = $1
          AND wm.revoked_at IS NULL
          AND w.archived_at IS NULL
        ORDER BY w.name, w.id`,
      [userId],
    );
  }

  async lockWorkspaceForMembershipAdministration(
    workspaceId: string,
  ): Promise<boolean> {
    const rows = await this.#query<{ id: string }>(
      `SELECT id
         FROM workspaces
        WHERE id = $1
          AND archived_at IS NULL
          FOR UPDATE`,
      [workspaceId],
    );
    return rows.length === 1;
  }

  async findWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberSummary | undefined> {
    const rows = await this.#query<{
      user_id: string;
      email: string;
      display_name: string;
      role: WorkspaceRole;
      created_at: Date | string;
    }>(
      `SELECT u.id AS user_id,
              u.email,
              u.display_name,
              wm.role,
              wm.created_at
         FROM workspace_memberships wm
         JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
          AND wm.user_id = $2
          AND wm.revoked_at IS NULL`,
      [workspaceId, userId],
    );
    const row = rows.at(0);
    return row === undefined ? undefined : toWorkspaceMemberSummary(row);
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberSummary[]> {
    const rows = await this.#query<{
      user_id: string;
      email: string;
      display_name: string;
      role: WorkspaceRole;
      created_at: Date | string;
    }>(
      `SELECT u.id AS user_id,
              u.email,
              u.display_name,
              wm.role,
              wm.created_at
         FROM workspace_memberships wm
         JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
          AND wm.revoked_at IS NULL
        ORDER BY
          CASE wm.role
            WHEN 'owner' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'editor' THEN 3
            ELSE 4
          END,
          lower(u.display_name),
          u.id`,
      [workspaceId],
    );
    return rows.map(toWorkspaceMemberSummary);
  }

  async countActiveWorkspaceOwners(workspaceId: string): Promise<number> {
    const rows = await this.#query<{ owner_count: number | string }>(
      `SELECT count(*)::integer AS owner_count
         FROM workspace_memberships
        WHERE workspace_id = $1
          AND role = 'owner'
          AND revoked_at IS NULL`,
      [workspaceId],
    );
    return Number(requireRow(rows, "active owner count").owner_count);
  }

  async changeWorkspaceMemberRole(input: {
    workspaceId: string;
    userId: string;
    role: Exclude<WorkspaceRole, "owner">;
  }): Promise<boolean> {
    const rows = await this.#query<{ user_id: string }>(
      `UPDATE workspace_memberships
          SET role = $3
        WHERE workspace_id = $1
          AND user_id = $2
          AND revoked_at IS NULL
      RETURNING user_id`,
      [input.workspaceId, input.userId, input.role],
    );
    return rows.length === 1;
  }

  async revokeWorkspaceMember(input: {
    workspaceId: string;
    userId: string;
    revokedBy: string;
    revokedAt: Date;
  }): Promise<boolean> {
    const rows = await this.#query<{ user_id: string }>(
      `UPDATE workspace_memberships
          SET revoked_at = $4,
              revoked_by = $3
        WHERE workspace_id = $1
          AND user_id = $2
          AND revoked_at IS NULL
      RETURNING user_id`,
      [input.workspaceId, input.userId, input.revokedBy, input.revokedAt],
    );
    return rows.length === 1;
  }

  async revokeActiveInvitations(
    workspaceId: string,
    email: string,
    at: Date,
  ): Promise<void> {
    await this.#query(
      `UPDATE workspace_invitations
          SET revoked_at = $3
        WHERE workspace_id = $1
          AND email = $2
          AND accepted_at IS NULL
          AND revoked_at IS NULL
      RETURNING id`,
      [workspaceId, email, at],
    );
  }

  async revokeActiveInvitationsByInviter(
    workspaceId: string,
    invitedBy: string,
    at: Date,
  ): Promise<void> {
    await this.#query(
      `UPDATE workspace_invitations
          SET revoked_at = $3
        WHERE workspace_id = $1
          AND invited_by = $2
          AND accepted_at IS NULL
          AND revoked_at IS NULL
      RETURNING id`,
      [workspaceId, invitedBy, at],
    );
  }

  async insertInvitation(invitation: NewInvitationRecord): Promise<void> {
    await this.#query(
      `INSERT INTO workspace_invitations (
         id, workspace_id, email, role, token_hash, invited_by, created_at, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        invitation.id,
        invitation.workspaceId,
        invitation.email,
        invitation.role,
        invitation.tokenHash,
        invitation.invitedBy,
        invitation.createdAt,
        invitation.expiresAt,
      ],
    );
  }

  async lockInvitation(
    tokenHash: string,
    at: Date,
  ): Promise<InvitationRecord | undefined> {
    const rows = await this.#query<{
      id: string;
      workspace_id: string;
      workspace_name: string;
      workspace_slug: string;
      email: string;
      role: Exclude<WorkspaceRole, "owner">;
      invited_by: string;
      expires_at: Date | string;
    }>(
      `SELECT i.id,
              i.workspace_id,
              w.name AS workspace_name,
              w.slug AS workspace_slug,
              i.email,
              i.role,
              i.invited_by,
              i.expires_at
         FROM workspace_invitations i
         JOIN workspaces w ON w.id = i.workspace_id
        WHERE i.token_hash = $1
          AND i.accepted_at IS NULL
          AND i.revoked_at IS NULL
          AND i.expires_at > $2
          AND w.archived_at IS NULL
          FOR UPDATE OF i`,
      [tokenHash, at],
    );
    const row = rows.at(0);
    return row === undefined
      ? undefined
      : {
          id: row.id,
          workspaceId: row.workspace_id,
          workspaceName: row.workspace_name,
          workspaceSlug: row.workspace_slug,
          email: row.email,
          role: row.role,
          invitedBy: row.invited_by,
          expiresAt: asDate(row.expires_at),
        };
  }

  async findInvitation(
    tokenHash: string,
    at: Date,
  ): Promise<InvitationRecord | undefined> {
    const rows = await this.#query<{
      id: string;
      workspace_id: string;
      workspace_name: string;
      workspace_slug: string;
      email: string;
      role: Exclude<WorkspaceRole, "owner">;
      invited_by: string;
      expires_at: Date | string;
    }>(
      `SELECT i.id,
              i.workspace_id,
              w.name AS workspace_name,
              w.slug AS workspace_slug,
              i.email,
              i.role,
              i.invited_by,
              i.expires_at
         FROM workspace_invitations i
         JOIN workspaces w ON w.id = i.workspace_id
        WHERE i.token_hash = $1
          AND i.accepted_at IS NULL
          AND i.revoked_at IS NULL
          AND i.expires_at > $2
          AND w.archived_at IS NULL`,
      [tokenHash, at],
    );
    const row = rows.at(0);
    return row === undefined
      ? undefined
      : {
          id: row.id,
          workspaceId: row.workspace_id,
          workspaceName: row.workspace_name,
          workspaceSlug: row.workspace_slug,
          email: row.email,
          role: row.role,
          invitedBy: row.invited_by,
          expiresAt: asDate(row.expires_at),
        };
  }

  async acceptInvitation(
    workspaceId: string,
    invitationId: string,
    userId: string,
    at: Date,
  ): Promise<void> {
    await this.#query(
      `UPDATE workspace_invitations
          SET accepted_by = $3,
              accepted_at = $4
        WHERE workspace_id = $1
          AND id = $2
          AND accepted_at IS NULL
          AND revoked_at IS NULL
      RETURNING id`,
      [workspaceId, invitationId, userId, at],
    );
  }

  async lockBrandKit(
    workspaceId: string,
    brandKitId: string,
  ): Promise<{ id: string; name: string } | undefined> {
    const rows = await this.#query<{ id: string; name: string }>(
      `SELECT id, name
         FROM brand_kits
        WHERE workspace_id = $1
          AND id = $2
          AND archived_at IS NULL
          FOR UPDATE`,
      [workspaceId, brandKitId],
    );
    return rows[0];
  }

  async insertBrandKit(input: {
    id: string;
    workspaceId: string;
    name: string;
    createdBy: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO brand_kits (
         id, workspace_id, name, created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING id`,
      [input.id, input.workspaceId, input.name, input.createdBy, input.createdAt],
    );
  }

  async nextBrandSnapshotSequence(
    workspaceId: string,
    brandKitId: string,
  ): Promise<number> {
    const rows = await this.#query<{ next_sequence: number | string }>(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
         FROM brand_snapshots
        WHERE workspace_id = $1
          AND brand_kit_id = $2`,
      [workspaceId, brandKitId],
    );
    return Number(requireRow(rows, "brand snapshot sequence").next_sequence);
  }

  async insertBrandSnapshot(input: {
    id: string;
    workspaceId: string;
    brandKitId: string;
    sequence: number;
    version: string;
    snapshot: BrandSnapshot;
    canonicalHash: string;
    createdBy: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO brand_snapshots (
         id, workspace_id, brand_kit_id, sequence, version, snapshot,
         canonical_hash, created_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING id`,
      [
        input.id,
        input.workspaceId,
        input.brandKitId,
        input.sequence,
        input.version,
        input.snapshot,
        input.canonicalHash,
        input.createdBy,
        input.createdAt,
      ],
    );
    await this.#query(
      `UPDATE brand_kits
          SET updated_at = $3
        WHERE workspace_id = $1
          AND id = $2
      RETURNING id`,
      [input.workspaceId, input.brandKitId, input.createdAt],
    );
  }

  async findBrandSnapshot(
    workspaceId: string,
    snapshotId: string,
  ): Promise<StoredBrandSnapshot | undefined> {
    const rows = await this.#query<{
      id: string;
      workspace_id: string;
      brand_kit_id: string;
      sequence: number | string;
      version: string;
      snapshot: BrandSnapshot | string;
      canonical_hash: string;
    }>(
      `SELECT id,
              workspace_id,
              brand_kit_id,
              sequence,
              version,
              snapshot,
              canonical_hash
         FROM brand_snapshots
        WHERE workspace_id = $1
          AND id = $2`,
      [workspaceId, snapshotId],
    );
    const row = rows.at(0);
    return row === undefined
      ? undefined
      : {
          id: row.id,
          workspaceId: row.workspace_id,
          brandKitId: row.brand_kit_id,
          sequence: Number(row.sequence),
          version: row.version,
          canonicalHash: row.canonical_hash,
          snapshot: parseJson<BrandSnapshot>(row.snapshot),
        };
  }

  async insertDesign(input: {
    id: string;
    workspaceId: string;
    name: string;
    createdBy: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO designs (
         id, workspace_id, name, created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING id`,
      [input.id, input.workspaceId, input.name, input.createdBy, input.createdAt],
    );
  }

  async lockDesignHead(
    workspaceId: string,
    designId: string,
  ): Promise<StoredDesignHead | undefined> {
    const rows = await this.#query<{
      id: string;
      name: string;
      head_revision_id: string | null;
      head_revision_number: number | string | null;
    }>(
      `SELECT d.id,
              d.name,
              d.head_revision_id,
              r.revision_number AS head_revision_number
         FROM designs d
         LEFT JOIN design_revisions r
           ON r.workspace_id = d.workspace_id
          AND r.design_id = d.id
          AND r.id = d.head_revision_id
        WHERE d.workspace_id = $1
          AND d.id = $2
          AND d.archived_at IS NULL
          FOR UPDATE OF d`,
      [workspaceId, designId],
    );
    const row = rows.at(0);
    return row === undefined
      ? undefined
      : {
          id: row.id,
          name: row.name,
          ...(row.head_revision_id === null
            ? {}
            : { headRevisionId: row.head_revision_id }),
          headRevisionNumber:
            row.head_revision_number === null ? 0 : Number(row.head_revision_number),
        };
  }

  async insertDesignRevision(input: {
    id: string;
    workspaceId: string;
    designId: string;
    revisionNumber: number;
    parentRevisionId?: string;
    brandSnapshotId: string;
    document: DesignDocument;
    canonicalHash: string;
    resourceReferences?: readonly DesignRevisionResourcePin[];
    changeNote?: string;
    createdBy: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO design_revisions (
         id, workspace_id, design_id, revision_number, parent_revision_id,
         brand_snapshot_id, design_document, canonical_hash, source, change_note,
         created_by, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'manual', $9, $10, $11
       )
       RETURNING id`,
      [
        input.id,
        input.workspaceId,
        input.designId,
        input.revisionNumber,
        input.parentRevisionId ?? null,
        input.brandSnapshotId,
        input.document,
        input.canonicalHash,
        input.changeNote ?? null,
        input.createdBy,
        input.createdAt,
      ],
    );
    for (const reference of input.resourceReferences ?? []) {
      await this.#query(
        `INSERT INTO design_revision_resources (
           workspace_id,
           design_id,
           revision_id,
           resource_id,
           resource_kind,
           ordinal,
           created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.workspaceId,
          input.designId,
          input.id,
          reference.resourceId,
          reference.resourceKind,
          reference.ordinal,
          input.createdAt,
        ],
      );
    }
  }

  async setDesignHead(input: {
    workspaceId: string;
    designId: string;
    expectedHeadRevisionId?: string;
    headRevisionId: string;
    updatedAt: Date;
  }): Promise<boolean> {
    const rows = await this.#query<{ id: string }>(
      `UPDATE designs
          SET head_revision_id = $3,
              updated_at = $4
        WHERE workspace_id = $1
          AND id = $2
          AND head_revision_id IS NOT DISTINCT FROM $5
      RETURNING id`,
      [
        input.workspaceId,
        input.designId,
        input.headRevisionId,
        input.updatedAt,
        input.expectedHeadRevisionId ?? null,
      ],
    );
    return rows.length === 1;
  }

  async findDesignRevision(input: {
    workspaceId: string;
    designId: string;
    revisionId?: string;
  }): Promise<StoredDesignRevision | undefined> {
    const rows = await this.#query<{
      design_id: string;
      design_name: string;
      revision_id: string;
      revision_number: number | string;
      parent_revision_id: string | null;
      brand_snapshot_id: string;
      canonical_hash: string;
      design_document: DesignDocument | string;
      created_at: Date | string;
      change_note: string | null;
    }>(
      `SELECT d.id AS design_id,
              d.name AS design_name,
              r.id AS revision_id,
              r.revision_number,
              r.parent_revision_id,
              r.brand_snapshot_id,
              r.canonical_hash,
              r.design_document,
              r.created_at,
              r.change_note
         FROM designs d
         JOIN design_revisions r
           ON r.workspace_id = d.workspace_id
          AND r.design_id = d.id
          AND r.id = COALESCE($3, d.head_revision_id)
        WHERE d.workspace_id = $1
          AND d.id = $2
          AND d.archived_at IS NULL`,
      [input.workspaceId, input.designId, input.revisionId ?? null],
    );
    const row = rows.at(0);
    if (row === undefined) return undefined;
    const resourceRows = await this.#query<RevisionResourceReferenceRow>(
      `SELECT ${REVISION_RESOURCE_REFERENCE_COLUMNS}
         FROM design_revision_resources AS reference
         JOIN resource_versions AS resource
           ON resource.workspace_id = reference.workspace_id
          AND resource.id = reference.resource_id
          AND resource.kind = reference.resource_kind
        WHERE reference.workspace_id = $1
          AND reference.revision_id = $2
        ORDER BY reference.resource_kind, reference.ordinal`,
      [input.workspaceId, row.revision_id],
    );
    const resourceReferences = resourceRows.flatMap((resourceRow) => {
      const reference = mapRevisionResourceReference(resourceRow);
      return reference === undefined ? [] : [reference];
    });
    if (resourceReferences.length !== resourceRows.length) {
      throw new Error("Stored revision resource metadata is invalid.");
    }
    return {
      designId: row.design_id,
      designName: row.design_name,
      revisionId: row.revision_id,
      revisionNumber: Number(row.revision_number),
      ...(row.parent_revision_id === null
        ? {}
        : { parentRevisionId: row.parent_revision_id }),
      brandSnapshotId: row.brand_snapshot_id,
      canonicalHash: row.canonical_hash,
      document: parseJson<DesignDocument>(row.design_document),
      resourceReferences,
      createdAt: asDate(row.created_at),
      ...(row.change_note === null ? {} : { changeNote: row.change_note }),
    };
  }

  async insertCampaign(input: {
    id: string;
    workspaceId: string;
    name: string;
    brief: string;
    campaignSeed: string;
    familyId: CampaignFamilyId;
    createdBy: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO campaigns (
         id, workspace_id, name, brief, campaign_seed, family_id,
         created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id`,
      [
        input.id,
        input.workspaceId,
        input.name,
        input.brief,
        input.campaignSeed,
        input.familyId,
        input.createdBy,
        input.createdAt,
      ],
    );
  }

  async findCampaign(
    workspaceId: string,
    campaignId: string,
  ): Promise<StoredCampaign | undefined> {
    const rows = await this.#query<{
      id: string;
      workspace_id: string;
      name: string;
      brief: string;
      campaign_seed: string;
      family_id: CampaignFamilyId;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT id, workspace_id, name, brief, campaign_seed, family_id,
              created_at, updated_at
         FROM campaigns
        WHERE workspace_id = $1
          AND id = $2
          AND archived_at IS NULL`,
      [workspaceId, campaignId],
    );
    const row = rows.at(0);
    return row === undefined
      ? undefined
      : {
          id: row.id,
          workspaceId: row.workspace_id,
          name: row.name,
          brief: row.brief,
          campaignSeed: row.campaign_seed,
          familyId: row.family_id,
          createdAt: asDate(row.created_at),
          updatedAt: asDate(row.updated_at),
        };
  }

  async listCampaigns(workspaceId: string): Promise<CampaignSummary[]> {
    const rows = await this.#query<{
      id: string;
      name: string;
      brief: string;
      campaign_seed: string;
      family_id: CampaignFamilyId;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT id, name, brief, campaign_seed, family_id, created_at, updated_at
         FROM campaigns
        WHERE workspace_id = $1
          AND archived_at IS NULL
        ORDER BY updated_at DESC, id`,
      [workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      brief: row.brief,
      campaignSeed: row.campaign_seed,
      familyId: row.family_id,
      createdAt: asDate(row.created_at).toISOString(),
      updatedAt: asDate(row.updated_at).toISOString(),
    }));
  }

  async insertCampaignDirection(input: {
    id: string;
    workspaceId: string;
    campaignId: string;
    directionKey: string;
    name: string;
    locks: readonly AuthoringLockId[];
    createdBy: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO campaign_directions (
         id, workspace_id, campaign_id, direction_key, name, created_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.id,
        input.workspaceId,
        input.campaignId,
        input.directionKey,
        input.name,
        input.createdBy,
        input.createdAt,
      ],
    );
    for (const [ordinal, lock] of input.locks.entries()) {
      await this.#query(
        `INSERT INTO campaign_direction_locks (
           workspace_id, campaign_id, direction_id, lock_id, ordinal, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.workspaceId, input.campaignId, input.id, lock, ordinal, input.createdAt],
      );
    }
    await this.#touchCampaign(input.workspaceId, input.campaignId, input.createdAt);
  }

  async findCampaignDirection(input: {
    workspaceId: string;
    campaignId: string;
    directionId: string;
  }): Promise<StoredCampaignDirection | undefined> {
    const rows = await this.#query<{
      id: string;
      workspace_id: string;
      campaign_id: string;
      direction_key: string;
      name: string;
      created_at: Date | string;
    }>(
      `SELECT id, workspace_id, campaign_id, direction_key, name, created_at
         FROM campaign_directions
        WHERE workspace_id = $1
          AND campaign_id = $2
          AND id = $3`,
      [input.workspaceId, input.campaignId, input.directionId],
    );
    const row = rows.at(0);
    return row === undefined
      ? undefined
      : {
          id: row.id,
          workspaceId: row.workspace_id,
          campaignId: row.campaign_id,
          directionKey: row.direction_key,
          name: row.name,
          createdAt: asDate(row.created_at),
        };
  }

  async lockCampaignDirection(input: {
    workspaceId: string;
    campaignId: string;
    directionId: string;
  }): Promise<StoredCampaignDirection | undefined> {
    const rows = await this.#query<{
      id: string;
      workspace_id: string;
      campaign_id: string;
      direction_key: string;
      name: string;
      created_at: Date | string;
    }>(
      `SELECT id, workspace_id, campaign_id, direction_key, name, created_at
         FROM campaign_directions
        WHERE workspace_id = $1
          AND campaign_id = $2
          AND id = $3
          FOR UPDATE`,
      [input.workspaceId, input.campaignId, input.directionId],
    );
    const row = rows.at(0);
    return row === undefined
      ? undefined
      : {
          id: row.id,
          workspaceId: row.workspace_id,
          campaignId: row.campaign_id,
          directionKey: row.direction_key,
          name: row.name,
          createdAt: asDate(row.created_at),
        };
  }

  async insertCampaignCanvas(
    input: {
      id: string;
      workspaceId: string;
      campaignId: string;
      directionId: string;
      canvasKey: string;
      designId: string;
      revisionId: string;
      templateId: TemplateId;
      templateVersion: string;
      format: FormatId;
      compositionVariantId: CampaignCompositionVariantId;
      seedDerivationVersion: string;
      directionSeed: string;
      canvasSeed: string;
      ordinal: number;
      createdBy: string;
      createdAt: Date;
    } & CampaignCanvasPublicationMetadata,
  ): Promise<void> {
    await this.#query(
      `INSERT INTO campaign_canvases (
         id, workspace_id, campaign_id, direction_id, canvas_key,
         design_id, revision_id, template_id, template_version, format_id,
         composition_variant_id, narrative_role, delivery_profile_id,
         carousel_sequence_key, publisher_alt_text, source_notes,
         seed_derivation_version, direction_seed, canvas_seed, ordinal,
         created_by, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16::jsonb, $17, $18, $19, $20, $21, $22
       )
       RETURNING id`,
      [
        input.id,
        input.workspaceId,
        input.campaignId,
        input.directionId,
        input.canvasKey,
        input.designId,
        input.revisionId,
        input.templateId,
        input.templateVersion,
        input.format,
        input.compositionVariantId,
        input.narrativeRole,
        input.deliveryProfileId ?? null,
        input.carouselSequenceKey ?? null,
        input.altText ?? null,
        (input.sourceNotes ?? []) as readonly SqlJsonValue[],
        input.seedDerivationVersion,
        input.directionSeed,
        input.canvasSeed,
        input.ordinal,
        input.createdBy,
        input.createdAt,
      ],
    );
    await this.#touchCampaign(input.workspaceId, input.campaignId, input.createdAt);
  }

  async readCampaignBoard(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignBoardProjection | undefined> {
    const campaign = await this.findCampaign(workspaceId, campaignId);
    if (campaign === undefined) return undefined;
    const directionRows = await this.#query<{
      id: string;
      direction_key: string;
      name: string;
      created_at: Date | string;
    }>(
      `SELECT id, direction_key, name, created_at
         FROM campaign_directions
        WHERE workspace_id = $1
          AND campaign_id = $2
        ORDER BY created_at, id`,
      [workspaceId, campaignId],
    );
    const lockRows = await this.#query<{
      direction_id: string;
      lock_id: AuthoringLockId;
    }>(
      `SELECT direction_id, lock_id
         FROM campaign_direction_locks
        WHERE workspace_id = $1
          AND campaign_id = $2
        ORDER BY direction_id, ordinal`,
      [workspaceId, campaignId],
    );
    const canvasRows = await this.#query<{
      id: string;
      direction_id: string;
      canvas_key: string;
      design_id: string;
      revision_id: string;
      template_id: TemplateId;
      template_version: string;
      format_id: FormatId;
      composition_variant_id: CampaignCompositionVariantId;
      narrative_role: CarouselNarrativeRole;
      delivery_profile_id: DeliveryProfileId | null;
      carousel_sequence_key: string | null;
      publisher_alt_text: string | null;
      source_notes: readonly CarouselSourceNote[] | string;
      seed_derivation_version: string;
      direction_seed: string;
      canvas_seed: string;
      ordinal: number | string;
      created_at: Date | string;
    }>(
      `SELECT id, direction_id, canvas_key, design_id, revision_id,
              template_id, template_version, format_id,
              composition_variant_id, narrative_role, delivery_profile_id,
              carousel_sequence_key, publisher_alt_text, source_notes,
              seed_derivation_version, direction_seed, canvas_seed, ordinal, created_at
         FROM campaign_canvases
        WHERE workspace_id = $1
          AND campaign_id = $2
        ORDER BY direction_id, ordinal, id`,
      [workspaceId, campaignId],
    );
    const proposalRunRows = await this.#query<{
      id: string;
      direction_id: string;
      provider_id: string;
      model_id: string;
      candidate_count: number | string;
      decided_count: number | string;
      accepted_count: number | string;
      created_at: Date | string;
    }>(
      `WITH ranked_runs AS (
         SELECT id, direction_id, provider_id, model_id, created_at,
                row_number() OVER (
                  PARTITION BY direction_id
                  ORDER BY created_at DESC, id DESC
                ) AS history_ordinal
           FROM campaign_proposal_runs
          WHERE workspace_id = $1
            AND campaign_id = $2
       )
       SELECT ranked.id, ranked.direction_id, ranked.provider_id, ranked.model_id,
              (
                SELECT count(*)::integer
                  FROM campaign_proposal_candidates candidate
                 WHERE candidate.workspace_id = $1
                   AND candidate.run_id = ranked.id
              ) AS candidate_count,
              (
                SELECT count(*)::integer
                  FROM campaign_proposal_decisions decision
                 WHERE decision.workspace_id = $1
                   AND decision.run_id = ranked.id
              ) AS decided_count,
              (
                SELECT count(*)::integer
                  FROM campaign_proposal_decisions decision
                 WHERE decision.workspace_id = $1
                   AND decision.run_id = ranked.id
                   AND decision.decision = 'accepted'
              ) AS accepted_count,
              ranked.created_at
         FROM ranked_runs ranked
        WHERE ranked.history_ordinal <= $3
        ORDER BY ranked.direction_id, ranked.history_ordinal`,
      [workspaceId, campaignId, MAX_CAMPAIGN_PROPOSAL_RUN_SUMMARIES_PER_DIRECTION + 1],
    );
    const locksByDirection = new Map<string, AuthoringLockId[]>();
    for (const row of lockRows) {
      const locks = locksByDirection.get(row.direction_id) ?? [];
      locks.push(row.lock_id);
      locksByDirection.set(row.direction_id, locks);
    }
    const canvasesByDirection = new Map<string, CampaignCanvasProjection[]>();
    for (const row of canvasRows) {
      const canvases = canvasesByDirection.get(row.direction_id) ?? [];
      canvases.push(toCampaignCanvasProjection(row));
      canvasesByDirection.set(row.direction_id, canvases);
    }
    const proposalRunsByDirection = new Map<
      string,
      CampaignProposalRunSummaryProjection[]
    >();
    for (const row of proposalRunRows) {
      const runs = proposalRunsByDirection.get(row.direction_id) ?? [];
      runs.push({
        id: row.id,
        providerId: row.provider_id,
        modelId: row.model_id,
        candidateCount: Number(row.candidate_count),
        decidedCount: Number(row.decided_count),
        acceptedCount: Number(row.accepted_count),
        createdAt: asDate(row.created_at).toISOString(),
      });
      proposalRunsByDirection.set(row.direction_id, runs);
    }
    return {
      kind: "campaign-board",
      campaign: toCampaignSummary(campaign),
      directions: directionRows.map((row): CampaignDirectionProjection => ({
        id: row.id,
        directionKey: row.direction_key,
        name: row.name,
        locks: locksByDirection.get(row.id) ?? [],
        createdAt: asDate(row.created_at).toISOString(),
        canvases: canvasesByDirection.get(row.id) ?? [],
        proposalRuns: (proposalRunsByDirection.get(row.id) ?? []).slice(
          0,
          MAX_CAMPAIGN_PROPOSAL_RUN_SUMMARIES_PER_DIRECTION,
        ),
        proposalRunsTruncated:
          (proposalRunsByDirection.get(row.id)?.length ?? 0) >
          MAX_CAMPAIGN_PROPOSAL_RUN_SUMMARIES_PER_DIRECTION,
      })),
    };
  }

  async readCampaignDirectionLocks(input: {
    workspaceId: string;
    campaignId: string;
    directionId: string;
  }): Promise<AuthoringLockId[] | undefined> {
    const direction = await this.findCampaignDirection(input);
    if (direction === undefined) return undefined;
    const rows = await this.#query<{ lock_id: AuthoringLockId }>(
      `SELECT lock_id
         FROM campaign_direction_locks
        WHERE workspace_id = $1
          AND campaign_id = $2
          AND direction_id = $3
        ORDER BY ordinal`,
      [input.workspaceId, input.campaignId, input.directionId],
    );
    return rows.map((row) => row.lock_id);
  }

  async findCampaignCanvas(input: {
    workspaceId: string;
    campaignId: string;
    directionId: string;
    canvasId: string;
  }): Promise<CampaignCanvasProjection | undefined> {
    const rows = await this.#query<{
      id: string;
      direction_id: string;
      canvas_key: string;
      design_id: string;
      revision_id: string;
      template_id: TemplateId;
      template_version: string;
      format_id: FormatId;
      composition_variant_id: CampaignCompositionVariantId;
      narrative_role: CarouselNarrativeRole;
      delivery_profile_id: DeliveryProfileId | null;
      carousel_sequence_key: string | null;
      publisher_alt_text: string | null;
      source_notes: readonly CarouselSourceNote[] | string;
      seed_derivation_version: string;
      direction_seed: string;
      canvas_seed: string;
      ordinal: number | string;
      created_at: Date | string;
    }>(
      `SELECT id, direction_id, canvas_key, design_id, revision_id,
              template_id, template_version, format_id,
              composition_variant_id, narrative_role, delivery_profile_id,
              carousel_sequence_key, publisher_alt_text, source_notes,
              seed_derivation_version, direction_seed, canvas_seed, ordinal, created_at
         FROM campaign_canvases
        WHERE workspace_id = $1
          AND campaign_id = $2
          AND direction_id = $3
          AND id = $4`,
      [input.workspaceId, input.campaignId, input.directionId, input.canvasId],
    );
    const row = rows.at(0);
    return row === undefined ? undefined : toCampaignCanvasProjection(row);
  }

  async listCampaignLockContextsForRevision(input: {
    workspaceId: string;
    designId: string;
    revisionId: string;
  }): Promise<CampaignLockContext[]> {
    return (await resolveCampaignRevisionLockContexts(this.#database, input)).map(
      (context) => ({
        campaignId: context.campaignId,
        directionId: context.directionId,
        locks: context.locks,
        baseDesignId: context.baseDesignId,
        baseRevisionId: context.baseRevisionId,
      }),
    );
  }

  async insertCampaignProposalRun(input: {
    id: string;
    workspaceId: string;
    campaignId: string;
    directionId: string;
    baseCanvasId: string;
    baseDesignId: string;
    baseRevisionId: string;
    providerId: string;
    modelId: string;
    retentionDisclosure: string;
    inputHash: string;
    responseHash: string;
    locks: readonly AuthoringLockId[];
    validation: SqlJsonValue;
    requestedBy: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO campaign_proposal_runs (
         id, workspace_id, campaign_id, direction_id, base_canvas_id,
         base_design_id, base_revision_id, provider_id, model_id,
         retention_disclosure, input_hash, response_hash, locks, validation,
         requested_by, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13::jsonb, $14::jsonb, $15, $16
       )`,
      [
        input.id,
        input.workspaceId,
        input.campaignId,
        input.directionId,
        input.baseCanvasId,
        input.baseDesignId,
        input.baseRevisionId,
        input.providerId,
        input.modelId,
        input.retentionDisclosure,
        input.inputHash,
        input.responseHash,
        [...input.locks],
        input.validation,
        input.requestedBy,
        input.createdAt,
      ],
    );
  }

  async insertCampaignProposalCandidate(input: {
    id: string;
    workspaceId: string;
    runId: string;
    index: number;
    status: "proved" | "rejected";
    document?: DesignDocument;
    canonicalHash?: string;
    rationale?: string;
    issues: readonly CampaignProposalIssueProjection[];
    proof?: CampaignProposalProofProjection;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO campaign_proposal_candidates (
         id, workspace_id, run_id, candidate_index, status, design_document,
         canonical_hash, rationale, validation, proof, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, $11
       )`,
      [
        input.id,
        input.workspaceId,
        input.runId,
        input.index,
        input.status,
        input.document ?? null,
        input.canonicalHash ?? null,
        input.rationale ?? null,
        { issues: [...input.issues] },
        input.proof === undefined ? null : stripProposalProofBytes(input.proof),
        input.createdAt,
      ],
    );
  }

  async insertCampaignProposalDecision(input: {
    id: string;
    workspaceId: string;
    runId: string;
    candidateId: string;
    decision: "accepted" | "rejected";
    reason?: string;
    designId?: string;
    revisionId?: string;
    actorUserId: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO campaign_proposal_decisions (
         id, workspace_id, run_id, candidate_id, decision, reason,
         design_id, revision_id, decided_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.id,
        input.workspaceId,
        input.runId,
        input.candidateId,
        input.decision,
        input.reason ?? null,
        input.designId ?? null,
        input.revisionId ?? null,
        input.actorUserId,
        input.createdAt,
      ],
    );
  }

  async hasCampaignProposalDecision(input: {
    workspaceId: string;
    runId: string;
    candidateId: string;
  }): Promise<boolean> {
    const rows = await this.#query<{ decided: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM campaign_proposal_decisions
          WHERE workspace_id = $1
            AND run_id = $2
            AND candidate_id = $3
       ) AS decided`,
      [input.workspaceId, input.runId, input.candidateId],
    );
    return rows.at(0)?.decided ?? false;
  }

  async findCampaignProposalCandidate(input: {
    workspaceId: string;
    campaignId: string;
    runId: string;
    candidateId: string;
  }): Promise<StoredCampaignProposalCandidate | undefined> {
    const rows = await this.#query<{
      id: string;
      workspace_id: string;
      run_id: string;
      campaign_id: string;
      direction_id: string;
      base_design_id: string;
      base_revision_id: string;
      candidate_index: number | string;
      status: "proved" | "rejected";
      design_document: DesignDocument | string | null;
      canonical_hash: string | null;
      rationale: string | null;
      validation: { issues?: CampaignProposalIssueProjection[] } | string;
      proof: CampaignProposalProofProjection | string | null;
      locks: AuthoringLockId[] | string;
    }>(
      `SELECT candidate.id, candidate.workspace_id, candidate.run_id,
              run.campaign_id, run.direction_id, run.base_design_id,
              run.base_revision_id, candidate.candidate_index, candidate.status,
              candidate.design_document, candidate.canonical_hash,
              candidate.rationale, candidate.validation, candidate.proof, run.locks
         FROM campaign_proposal_candidates candidate
         JOIN campaign_proposal_runs run
           ON run.workspace_id = candidate.workspace_id
          AND run.id = candidate.run_id
        WHERE candidate.workspace_id = $1
          AND run.campaign_id = $2
          AND candidate.run_id = $3
          AND candidate.id = $4`,
      [input.workspaceId, input.campaignId, input.runId, input.candidateId],
    );
    const row = rows.at(0);
    if (row === undefined) return undefined;
    const validation = parseJson<{ issues?: CampaignProposalIssueProjection[] }>(
      row.validation,
    );
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      runId: row.run_id,
      campaignId: row.campaign_id,
      directionId: row.direction_id,
      baseDesignId: row.base_design_id,
      baseRevisionId: row.base_revision_id,
      index: Number(row.candidate_index),
      status: row.status,
      ...(row.design_document === null
        ? {}
        : { document: parseJson<DesignDocument>(row.design_document) }),
      ...(row.canonical_hash === null ? {} : { canonicalHash: row.canonical_hash }),
      ...(row.rationale === null ? {} : { rationale: row.rationale }),
      issues: validation.issues ?? [],
      ...(row.proof === null
        ? {}
        : { proof: parseJson<CampaignProposalProofProjection>(row.proof) }),
      locks: parseJson<AuthoringLockId[]>(row.locks),
    };
  }

  async readCampaignProposalRun(input: {
    workspaceId: string;
    campaignId: string;
    runId: string;
  }): Promise<CampaignProposalRunProjection | undefined> {
    const runRows = await this.#query<{
      id: string;
      workspace_id: string;
      campaign_id: string;
      direction_id: string;
      base_canvas_id: string;
      base_design_id: string;
      base_revision_id: string;
      provider_id: string;
      model_id: string;
      retention_disclosure: string;
      input_hash: string;
      response_hash: string;
      locks: AuthoringLockId[] | string;
      created_at: Date | string;
    }>(
      `SELECT id, workspace_id, campaign_id, direction_id, base_canvas_id,
              base_design_id, base_revision_id, provider_id, model_id,
              retention_disclosure, input_hash, response_hash, locks, created_at
         FROM campaign_proposal_runs
        WHERE workspace_id = $1
          AND campaign_id = $2
          AND id = $3`,
      [input.workspaceId, input.campaignId, input.runId],
    );
    const run = runRows.at(0);
    if (run === undefined) return undefined;
    const candidateRows = await this.#query<{
      id: string;
      candidate_index: number | string;
      status: "proved" | "rejected";
      design_document: DesignDocument | string | null;
      canonical_hash: string | null;
      rationale: string | null;
      validation: { issues?: CampaignProposalIssueProjection[] } | string;
      proof: CampaignProposalProofProjection | string | null;
    }>(
      `SELECT id, candidate_index, status, design_document, canonical_hash,
              rationale, validation, proof
         FROM campaign_proposal_candidates
        WHERE workspace_id = $1
          AND run_id = $2
        ORDER BY candidate_index`,
      [input.workspaceId, input.runId],
    );
    const decisionRows = await this.#query<{
      id: string;
      candidate_id: string;
      decision: "accepted" | "rejected";
      reason: string | null;
      design_id: string | null;
      revision_id: string | null;
      user_id: string;
      email: string;
      display_name: string;
      created_at: Date | string;
    }>(
      `SELECT decision.id, decision.candidate_id, decision.decision,
              decision.reason, decision.design_id, decision.revision_id,
              user_record.id AS user_id, user_record.email,
              user_record.display_name, decision.created_at
         FROM campaign_proposal_decisions decision
         JOIN users user_record ON user_record.id = decision.decided_by
        WHERE decision.workspace_id = $1
          AND decision.run_id = $2
        ORDER BY decision.created_at, decision.id`,
      [input.workspaceId, input.runId],
    );
    const decisions = new Map(
      decisionRows.map((row) => [row.candidate_id, toCampaignProposalDecision(row)]),
    );
    return {
      kind: "campaign-proposal-run",
      id: run.id,
      workspaceId: run.workspace_id,
      campaignId: run.campaign_id,
      directionId: run.direction_id,
      baseCanvasId: run.base_canvas_id,
      baseDesignId: run.base_design_id,
      baseRevisionId: run.base_revision_id,
      descriptor: {
        providerId: run.provider_id,
        modelId: run.model_id,
        retentionDisclosure: run.retention_disclosure,
      },
      inputHash: run.input_hash,
      responseHash: run.response_hash,
      locks: parseJson<AuthoringLockId[]>(run.locks),
      createdAt: asDate(run.created_at).toISOString(),
      candidates: candidateRows.map((row): CampaignProposalCandidateProjection => {
        const validation = parseJson<{
          issues?: CampaignProposalIssueProjection[];
        }>(row.validation);
        const decision = decisions.get(row.id);
        return {
          id: row.id,
          index: Number(row.candidate_index),
          status: row.status,
          ...(row.rationale === null
            ? {}
            : { rationale: { kind: "model-suggestion", text: row.rationale } }),
          ...(row.design_document === null
            ? {}
            : { document: parseJson<DesignDocument>(row.design_document) }),
          ...(row.canonical_hash === null ? {} : { canonicalHash: row.canonical_hash }),
          issues: validation.issues ?? [],
          ...(row.proof === null
            ? {}
            : { proof: parseJson<CampaignProposalProofProjection>(row.proof) }),
          ...(decision === undefined ? {} : { decision }),
        };
      }),
    };
  }

  async lockRevisionReview(input: {
    workspaceId: string;
    designId: string;
    revisionId: string;
  }): Promise<StoredRevisionReview | undefined> {
    const rows = await this.#query<{
      id: string;
      workspace_id: string;
      design_id: string;
      revision_id: string;
      state: RevisionReviewState;
    }>(
      `SELECT id, workspace_id, design_id, revision_id, state
         FROM revision_reviews
        WHERE workspace_id = $1
          AND design_id = $2
          AND revision_id = $3
          FOR UPDATE`,
      [input.workspaceId, input.designId, input.revisionId],
    );
    const row = rows.at(0);
    return row === undefined
      ? undefined
      : {
          id: row.id,
          workspaceId: row.workspace_id,
          designId: row.design_id,
          revisionId: row.revision_id,
          state: row.state,
        };
  }

  async findRevisionReviewById(
    workspaceId: string,
    reviewId: string,
  ): Promise<StoredRevisionReview | undefined> {
    const rows = await this.#query<{
      id: string;
      workspace_id: string;
      design_id: string;
      revision_id: string;
      state: RevisionReviewState;
    }>(
      `SELECT id, workspace_id, design_id, revision_id, state
         FROM revision_reviews
        WHERE workspace_id = $1
          AND id = $2`,
      [workspaceId, reviewId],
    );
    const row = rows.at(0);
    return row === undefined
      ? undefined
      : {
          id: row.id,
          workspaceId: row.workspace_id,
          designId: row.design_id,
          revisionId: row.revision_id,
          state: row.state,
        };
  }

  async insertRevisionReview(input: {
    id: string;
    workspaceId: string;
    designId: string;
    revisionId: string;
    actorUserId: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO revision_reviews (
         id, workspace_id, design_id, revision_id, state,
         started_by, started_at, updated_by, updated_at
       ) VALUES ($1, $2, $3, $4, 'in-review', $5, $6, $5, $6)
       RETURNING id`,
      [
        input.id,
        input.workspaceId,
        input.designId,
        input.revisionId,
        input.actorUserId,
        input.createdAt,
      ],
    );
  }

  async setRevisionReviewState(input: {
    workspaceId: string;
    reviewId: string;
    expectedState: RevisionReviewState;
    state: RevisionReviewState;
    actorUserId: string;
    updatedAt: Date;
  }): Promise<boolean> {
    const rows = await this.#query<{ id: string }>(
      `UPDATE revision_reviews
          SET state = $4,
              updated_by = $5,
              updated_at = $6
        WHERE workspace_id = $1
          AND id = $2
          AND state = $3
      RETURNING id`,
      [
        input.workspaceId,
        input.reviewId,
        input.expectedState,
        input.state,
        input.actorUserId,
        input.updatedAt,
      ],
    );
    return rows.length === 1;
  }

  async insertRevisionReviewTransition(input: {
    id: string;
    workspaceId: string;
    reviewId: string;
    fromState?: RevisionReviewState;
    toState: RevisionReviewState;
    reason?: string;
    actorUserId: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO revision_review_transitions (
         id, workspace_id, review_id, from_state, to_state, reason,
         created_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        input.id,
        input.workspaceId,
        input.reviewId,
        input.fromState ?? null,
        input.toState,
        input.reason ?? null,
        input.actorUserId,
        input.createdAt,
      ],
    );
  }

  async insertRevisionReviewComment(input: {
    id: string;
    workspaceId: string;
    reviewId: string;
    body: string;
    anchor?: { x: number; y: number };
    actorUserId: string;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO revision_review_comments (
         id, workspace_id, review_id, body, anchor_x, anchor_y,
         created_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        input.id,
        input.workspaceId,
        input.reviewId,
        input.body,
        input.anchor?.x ?? null,
        input.anchor?.y ?? null,
        input.actorUserId,
        input.createdAt,
      ],
    );
  }

  async insertRevisionApproval(input: {
    id: string;
    workspaceId: string;
    reviewId: string;
    designId: string;
    revisionId: string;
    renderJobId: string;
    revisionCanonicalHash: string;
    resourcePins: RevisionApprovalProjection["resourcePins"];
    outputEvidence: readonly RevisionApprovalOutputEvidence[];
    actorUserId: string;
    approvedAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO revision_approval_receipts (
         id, workspace_id, review_id, design_id, revision_id, render_job_id,
         revision_canonical_hash, resource_pins, output_evidence,
         approved_by, approved_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
       RETURNING id`,
      [
        input.id,
        input.workspaceId,
        input.reviewId,
        input.designId,
        input.revisionId,
        input.renderJobId,
        input.revisionCanonicalHash,
        input.resourcePins,
        input.outputEvidence,
        input.actorUserId,
        input.approvedAt,
      ],
    );
  }

  async readRevisionReview(input: {
    workspaceId: string;
    designId: string;
    revisionId: string;
  }): Promise<RevisionReviewProjection | undefined> {
    const reviewRows = await this.#query<{
      id: string;
      state: RevisionReviewState;
      started_at: Date | string;
      started_by_id: string;
      started_by_email: string;
      started_by_name: string;
      updated_at: Date | string;
      updated_by_id: string;
      updated_by_email: string;
      updated_by_name: string;
    }>(
      `SELECT review.id,
              review.state,
              review.started_at,
              starter.id AS started_by_id,
              starter.email AS started_by_email,
              starter.display_name AS started_by_name,
              review.updated_at,
              updater.id AS updated_by_id,
              updater.email AS updated_by_email,
              updater.display_name AS updated_by_name
         FROM revision_reviews AS review
         JOIN users AS starter ON starter.id = review.started_by
         JOIN users AS updater ON updater.id = review.updated_by
        WHERE review.workspace_id = $1
          AND review.design_id = $2
          AND review.revision_id = $3`,
      [input.workspaceId, input.designId, input.revisionId],
    );
    const review = reviewRows.at(0);
    if (review === undefined) return undefined;
    const [commentRows, transitionRows, approvalRows] = await Promise.all([
      this.#query<{
        id: string;
        body: string;
        anchor_x: number | string | null;
        anchor_y: number | string | null;
        created_at: Date | string;
        created_by_id: string;
        created_by_email: string;
        created_by_name: string;
      }>(
        `SELECT comment.id, comment.body, comment.anchor_x, comment.anchor_y,
                comment.created_at,
                author.id AS created_by_id,
                author.email AS created_by_email,
                author.display_name AS created_by_name
           FROM revision_review_comments AS comment
           JOIN users AS author ON author.id = comment.created_by
          WHERE comment.workspace_id = $1
            AND comment.review_id = $2
          ORDER BY comment.created_at, comment.id`,
        [input.workspaceId, review.id],
      ),
      this.#query<{
        id: string;
        from_state: RevisionReviewState | null;
        to_state: RevisionReviewState;
        reason: string | null;
        created_at: Date | string;
        created_by_id: string;
        created_by_email: string;
        created_by_name: string;
      }>(
        `SELECT transition.id, transition.from_state, transition.to_state,
                transition.reason, transition.created_at,
                actor.id AS created_by_id,
                actor.email AS created_by_email,
                actor.display_name AS created_by_name
           FROM revision_review_transitions AS transition
           JOIN users AS actor ON actor.id = transition.created_by
          WHERE transition.workspace_id = $1
            AND transition.review_id = $2
          ORDER BY transition.created_at, transition.id`,
        [input.workspaceId, review.id],
      ),
      this.#query<{
        id: string;
        render_job_id: string;
        revision_canonical_hash: string;
        resource_pins: RevisionApprovalProjection["resourcePins"] | string;
        output_evidence: RevisionApprovalOutputEvidence[] | string;
        approved_at: Date | string;
        approved_by_id: string;
        approved_by_email: string;
        approved_by_name: string;
      }>(
        `SELECT approval.id, approval.render_job_id,
                approval.revision_canonical_hash, approval.resource_pins,
                approval.output_evidence, approval.approved_at,
                approver.id AS approved_by_id,
                approver.email AS approved_by_email,
                approver.display_name AS approved_by_name
           FROM revision_approval_receipts AS approval
           JOIN users AS approver ON approver.id = approval.approved_by
          WHERE approval.workspace_id = $1
            AND approval.review_id = $2`,
        [input.workspaceId, review.id],
      ),
    ]);
    const approvalRow = approvalRows.at(0);
    return {
      kind: "revision-review",
      id: review.id,
      workspaceId: input.workspaceId,
      designId: input.designId,
      revisionId: input.revisionId,
      state: review.state,
      startedBy: userFromJoinedRow(review, "started_by"),
      startedAt: asDate(review.started_at).toISOString(),
      updatedBy: userFromJoinedRow(review, "updated_by"),
      updatedAt: asDate(review.updated_at).toISOString(),
      comments: commentRows.map((row) => ({
        id: row.id,
        body: row.body,
        ...(row.anchor_x === null || row.anchor_y === null
          ? {}
          : { anchor: { x: Number(row.anchor_x), y: Number(row.anchor_y) } }),
        createdBy: userFromJoinedRow(row, "created_by"),
        createdAt: asDate(row.created_at).toISOString(),
      })),
      transitions: transitionRows.map((row) => ({
        id: row.id,
        ...(row.from_state === null ? {} : { fromState: row.from_state }),
        toState: row.to_state,
        ...(row.reason === null ? {} : { reason: row.reason }),
        createdBy: userFromJoinedRow(row, "created_by"),
        createdAt: asDate(row.created_at).toISOString(),
      })),
      ...(approvalRow === undefined
        ? {}
        : {
            approval: {
              id: approvalRow.id,
              renderJobId: approvalRow.render_job_id,
              revisionCanonicalHash: approvalRow.revision_canonical_hash,
              resourcePins: parseJson(approvalRow.resource_pins),
              outputEvidence: parseJson(approvalRow.output_evidence),
              approvedBy: userFromJoinedRow(approvalRow, "approved_by"),
              approvedAt: asDate(approvalRow.approved_at).toISOString(),
            },
          }),
    };
  }

  async listBrandKits(workspaceId: string): Promise<BrandKitSummary[]> {
    const rows = await this.#query<{
      id: string;
      name: string;
      latest_snapshot_id: string;
      latest_version: string;
      updated_at: Date | string;
    }>(
      `SELECT DISTINCT ON (b.id)
              b.id,
              b.name,
              s.id AS latest_snapshot_id,
              s.version AS latest_version,
              b.updated_at
         FROM brand_kits b
         JOIN brand_snapshots s
           ON s.workspace_id = b.workspace_id
          AND s.brand_kit_id = b.id
        WHERE b.workspace_id = $1
          AND b.archived_at IS NULL
        ORDER BY b.id, s.sequence DESC`,
      [workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      latestSnapshotId: row.latest_snapshot_id,
      latestVersion: row.latest_version,
      updatedAt: asDate(row.updated_at).toISOString(),
    }));
  }

  async listDesigns(workspaceId: string): Promise<DesignSummary[]> {
    const rows = await this.#query<{
      id: string;
      name: string;
      head_revision_id: string;
      revision_number: number | string;
      updated_at: Date | string;
    }>(
      `SELECT d.id,
              d.name,
              d.head_revision_id,
              r.revision_number,
              d.updated_at
         FROM designs d
         JOIN design_revisions r
           ON r.workspace_id = d.workspace_id
          AND r.design_id = d.id
          AND r.id = d.head_revision_id
        WHERE d.workspace_id = $1
          AND d.archived_at IS NULL
        ORDER BY d.updated_at DESC, d.id`,
      [workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      headRevisionId: row.head_revision_id,
      revisionNumber: Number(row.revision_number),
      updatedAt: asDate(row.updated_at).toISOString(),
    }));
  }

  async appendAuditEvent(input: {
    id: string;
    workspaceId?: string;
    actorUserId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    metadata?: Readonly<Record<string, SqlJsonValue | undefined>>;
    createdAt: Date;
  }): Promise<void> {
    await this.#query(
      `INSERT INTO audit_events (
         id, workspace_id, actor_user_id, action, target_type, target_id,
         metadata, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING id`,
      [
        input.id,
        input.workspaceId ?? null,
        input.actorUserId ?? null,
        input.action,
        input.targetType,
        input.targetId ?? null,
        input.metadata ?? {},
        input.createdAt,
      ],
    );
  }

  async #touchCampaign(
    workspaceId: string,
    campaignId: string,
    updatedAt: Date,
  ): Promise<void> {
    await this.#query(
      `UPDATE campaigns
          SET updated_at = GREATEST(updated_at, $3)
        WHERE workspace_id = $1
          AND id = $2
          AND archived_at IS NULL
      RETURNING id`,
      [workspaceId, campaignId, updatedAt],
    );
  }

  #query<Row extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<Row[]> {
    return this.#database.query<Row>(statement, parameters);
  }
}

function requireRow<Row>(rows: Row[], description: string): Row {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Missing required ${description} row.`);
  }
  return row;
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toCampaignSummary(campaign: StoredCampaign): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    brief: campaign.brief,
    campaignSeed: campaign.campaignSeed,
    familyId: campaign.familyId,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

function toCampaignCanvasProjection(row: {
  id: string;
  canvas_key: string;
  design_id: string;
  revision_id: string;
  template_id: TemplateId;
  template_version: string;
  format_id: FormatId;
  composition_variant_id: CampaignCompositionVariantId;
  narrative_role: CarouselNarrativeRole;
  delivery_profile_id: DeliveryProfileId | null;
  carousel_sequence_key: string | null;
  publisher_alt_text: string | null;
  source_notes: readonly CarouselSourceNote[] | string;
  seed_derivation_version: string;
  direction_seed: string;
  canvas_seed: string;
  ordinal: number | string;
  created_at: Date | string;
}): CampaignCanvasProjection {
  const sourceNotes = parseJson(row.source_notes);
  return {
    id: row.id,
    canvasKey: row.canvas_key,
    designId: row.design_id,
    revisionId: row.revision_id,
    template: { id: row.template_id, version: row.template_version },
    format: row.format_id,
    compositionVariantId: row.composition_variant_id,
    narrativeRole: row.narrative_role,
    ...(row.delivery_profile_id === null
      ? {}
      : { deliveryProfileId: row.delivery_profile_id }),
    ...(row.carousel_sequence_key === null
      ? {}
      : { carouselSequenceKey: row.carousel_sequence_key }),
    ...(row.publisher_alt_text === null ? {} : { altText: row.publisher_alt_text }),
    ...(sourceNotes.length === 0
      ? {}
      : {
          sourceNotes: sourceNotes.map((note) => ({
            label: note.label,
            ...(note.url === undefined ? {} : { url: note.url }),
          })),
        }),
    seedDerivationVersion: row.seed_derivation_version,
    directionSeed: row.direction_seed,
    canvasSeed: row.canvas_seed,
    ordinal: Number(row.ordinal),
    createdAt: asDate(row.created_at).toISOString(),
  };
}

function stripProposalProofBytes(proof: CampaignProposalProofProjection): SqlJsonValue {
  return {
    qualityIssues: proof.qualityIssues as unknown as SqlJsonValue,
    evidence: proof.evidence as unknown as SqlJsonValue,
    outputs: proof.outputs.map(
      ({ format, mimeType, byteSize, fingerprint, filename, manifest }) =>
        ({
          format,
          mimeType,
          byteSize,
          fingerprint,
          filename,
          manifest,
        }) as unknown as SqlJsonValue,
    ),
  };
}

function toCampaignProposalDecision(row: {
  id: string;
  decision: "accepted" | "rejected";
  reason: string | null;
  design_id: string | null;
  revision_id: string | null;
  user_id: string;
  email: string;
  display_name: string;
  created_at: Date | string;
}): CampaignProposalDecisionProjection {
  return {
    id: row.id,
    decision: row.decision,
    ...(row.reason === null ? {} : { reason: row.reason }),
    ...(row.design_id === null ? {} : { designId: row.design_id }),
    ...(row.revision_id === null ? {} : { revisionId: row.revision_id }),
    decidedBy: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
    },
    createdAt: asDate(row.created_at).toISOString(),
  };
}

function toWorkspaceMemberSummary(row: {
  user_id: string;
  email: string;
  display_name: string;
  role: WorkspaceRole;
  created_at: Date | string;
}): WorkspaceMemberSummary {
  return {
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
    },
    role: row.role,
    createdAt: asDate(row.created_at).toISOString(),
  };
}

function userFromJoinedRow(
  row: Record<string, unknown>,
  prefix: "approved_by" | "created_by" | "started_by" | "updated_by",
): UserSummary {
  const id = row[`${prefix}_id`];
  const email = row[`${prefix}_email`];
  const displayName = row[`${prefix}_name`];
  if (
    typeof id !== "string" ||
    typeof email !== "string" ||
    typeof displayName !== "string"
  ) {
    throw new Error("Stored revision-review actor metadata is invalid.");
  }
  return { id, email, displayName };
}

function isDatabase(value: DatabaseHandle): value is SqlDatabase {
  return "transaction" in value;
}
