import type { BrandSnapshot, DesignDocument } from "@glyphkiln/core";

import type {
  BrandKitSummary,
  DesignSummary,
  UserSummary,
  WorkspaceMemberSummary,
  WorkspaceMembershipSummary,
} from "./contracts";
import type {
  SqlDatabase,
  SqlParameters,
  SqlTransaction,
} from "@/server/persistence/database";
import type { RevisionResourceReference } from "@/server/resources/revision-resource-provenance";
import type { WorkspaceRole } from "@/server/security/workspace-policy";

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

export type DesignRevisionResourceReference = RevisionResourceReference;

export type StoredDesignRevision = {
  designId: string;
  designName: string;
  revisionId: string;
  revisionNumber: number;
  parentRevisionId?: string;
  brandSnapshotId: string;
  canonicalHash: string;
  document: DesignDocument;
  resourceReferences: DesignRevisionResourceReference[];
  createdAt: Date;
  changeNote?: string;
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
    invitationId: string,
    userId: string,
    at: Date,
  ): Promise<void> {
    await this.#query(
      `UPDATE workspace_invitations
          SET accepted_by = $2,
              accepted_at = $3
        WHERE id = $1
          AND accepted_at IS NULL
          AND revoked_at IS NULL
      RETURNING id`,
      [invitationId, userId, at],
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
        JSON.stringify(input.snapshot),
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
    resourceReferences?: readonly DesignRevisionResourceReference[];
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
        JSON.stringify(input.document),
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
    const resourceRows = await this.#query<{
      resource_id: string;
      resource_kind: "raster-asset" | "font";
      ordinal: number | string;
    }>(
      `SELECT resource_id, resource_kind, ordinal
         FROM design_revision_resources
        WHERE workspace_id = $1
          AND revision_id = $2
        ORDER BY resource_kind, ordinal`,
      [input.workspaceId, row.revision_id],
    );
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
      resourceReferences: resourceRows.map((resourceRow) => ({
        resourceId: resourceRow.resource_id,
        resourceKind: resourceRow.resource_kind,
        ordinal: Number(resourceRow.ordinal),
      })),
      createdAt: asDate(row.created_at),
      ...(row.change_note === null ? {} : { changeNote: row.change_note }),
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
    metadata?: Record<string, unknown>;
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
        JSON.stringify(input.metadata ?? {}),
        input.createdAt,
      ],
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

function isDatabase(value: DatabaseHandle): value is SqlDatabase {
  return "transaction" in value;
}
