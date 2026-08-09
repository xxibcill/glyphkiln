import { hashCanonical, type DesignDocument } from "@glyphkiln/core";

import type { SqlDatabase } from "@/server/persistence/database";
import type { WorkspaceRole } from "@/server/security/workspace-policy";

import { createPreviewDesign } from "./preview-design";

const PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$Z2x5cGhraWxu$YXBwLWFscGhh";

export type RenderJobFixture = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly brandKitId: string;
  readonly brandSnapshotId: string;
  readonly designId: string;
  readonly revisionId: string;
  readonly document: DesignDocument;
};

export async function seedRenderJobFixture(
  database: SqlDatabase,
  suffix: string,
  role: WorkspaceRole = "editor",
): Promise<RenderJobFixture> {
  const userId = `user-${suffix}`;
  const workspaceId = `workspace-${suffix}`;
  const brandKitId = `brand-${suffix}`;
  const brandSnapshotId = `snapshot-${suffix}`;
  const designId = `design-${suffix}`;
  const revisionId = `revision-${suffix}`;
  const base = createPreviewDesign();
  const document: DesignDocument = {
    ...base,
    id: designId,
    brand: {
      ...base.brand,
      snapshotId: brandKitId,
      name: `Brand ${suffix}`,
    },
  };
  const timestamp = new Date("2026-07-31T01:00:00.000Z");
  await database.query(
    `INSERT INTO users (id, email, display_name, password_hash, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, `${suffix}@example.test`, `User ${suffix}`, PASSWORD_HASH, timestamp],
  );
  await database.query(
    `INSERT INTO workspaces (id, name, slug, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [workspaceId, `Workspace ${suffix}`, `workspace-${suffix}`, userId, timestamp],
  );
  await database.query(
    `INSERT INTO workspace_memberships (
       workspace_id, user_id, role, created_at
     ) VALUES ($1, $2, $3, $4)`,
    [workspaceId, userId, role, timestamp],
  );
  await database.query(
    `INSERT INTO brand_kits (
       id, workspace_id, name, created_by, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $5)`,
    [brandKitId, workspaceId, `Brand ${suffix}`, userId, timestamp],
  );
  await database.query(
    `INSERT INTO brand_snapshots (
       id,
       workspace_id,
       brand_kit_id,
       sequence,
       version,
       snapshot,
       canonical_hash,
       created_by,
       created_at
     ) VALUES ($1, $2, $3, 1, '1.0.0', $4::jsonb, $5, $6, $7)`,
    [
      brandSnapshotId,
      workspaceId,
      brandKitId,
      document.brand,
      hashCanonical(document.brand),
      userId,
      timestamp,
    ],
  );
  await database.query(
    `INSERT INTO designs (
       id, workspace_id, name, created_by, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $5)`,
    [designId, workspaceId, `Design ${suffix}`, userId, timestamp],
  );
  await database.query(
    `INSERT INTO design_revisions (
       id,
       workspace_id,
       design_id,
       revision_number,
       brand_snapshot_id,
       design_document,
       canonical_hash,
       source,
       created_by,
       created_at
     ) VALUES ($1, $2, $3, 1, $4, $5::jsonb, $6, 'manual', $7, $8)`,
    [
      revisionId,
      workspaceId,
      designId,
      brandSnapshotId,
      document,
      hashCanonical(document),
      userId,
      timestamp,
    ],
  );
  await database.query(
    `UPDATE designs
        SET head_revision_id = $3
      WHERE workspace_id = $1
        AND id = $2`,
    [workspaceId, designId, revisionId],
  );
  return {
    workspaceId,
    userId,
    brandKitId,
    brandSnapshotId,
    designId,
    revisionId,
    document,
  };
}
