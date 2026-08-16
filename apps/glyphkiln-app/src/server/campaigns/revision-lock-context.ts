import { AUTHORING_LOCK_IDS, type AuthoringLockId } from "../ai-authoring";
import type { SqlTransaction } from "../persistence/database";

export type CampaignRevisionLockContext = {
  campaignId: string;
  directionId: string;
  locks: AuthoringLockId[];
  baseDesignId: string;
  baseRevisionId: string;
  baseDocument: unknown;
  baseCanonicalHash: string;
};

export class CampaignRevisionLockContextIntegrityError extends Error {
  constructor() {
    super("Stored campaign lock metadata is invalid.");
    this.name = "CampaignRevisionLockContextIntegrityError";
  }
}

export async function resolveCampaignRevisionLockContexts(
  database: SqlTransaction,
  input: {
    workspaceId: string;
    designId: string;
    revisionId: string;
  },
): Promise<CampaignRevisionLockContext[]> {
  const rows = await database.query<{
    campaign_id: string;
    direction_id: string;
    lock_id: string;
    base_design_id: string;
    base_revision_id: string;
    base_document: unknown;
    base_canonical_hash: string;
  }>(
    `WITH RECURSIVE revision_ancestry AS (
       SELECT id, parent_revision_id
         FROM design_revisions
        WHERE workspace_id = $1
          AND design_id = $2
          AND id = $3
       UNION ALL
       SELECT parent.id, parent.parent_revision_id
         FROM design_revisions parent
         JOIN revision_ancestry child
           ON parent.id = child.parent_revision_id
          AND parent.workspace_id = $1
          AND parent.design_id = $2
     ), target_contexts AS (
       SELECT DISTINCT canvas.workspace_id, canvas.campaign_id, canvas.direction_id
         FROM campaign_canvases canvas
         JOIN revision_ancestry ancestor
           ON ancestor.id = canvas.revision_id
        WHERE canvas.workspace_id = $1
          AND canvas.design_id = $2
     )
     SELECT target.campaign_id,
            target.direction_id,
            lock_record.lock_id,
            base_canvas.design_id AS base_design_id,
            base_canvas.revision_id AS base_revision_id,
            base_revision.design_document AS base_document,
            base_revision.canonical_hash AS base_canonical_hash
       FROM target_contexts target
       JOIN campaign_direction_locks lock_record
         ON lock_record.workspace_id = target.workspace_id
        AND lock_record.campaign_id = target.campaign_id
        AND lock_record.direction_id = target.direction_id
       JOIN LATERAL (
         SELECT design_id, revision_id
           FROM campaign_canvases candidate_base
          WHERE candidate_base.workspace_id = target.workspace_id
            AND candidate_base.campaign_id = target.campaign_id
            AND candidate_base.direction_id = target.direction_id
          ORDER BY candidate_base.ordinal, candidate_base.id
          LIMIT 1
       ) base_canvas ON TRUE
       JOIN design_revisions base_revision
         ON base_revision.workspace_id = target.workspace_id
        AND base_revision.design_id = base_canvas.design_id
        AND base_revision.id = base_canvas.revision_id
      WHERE target.workspace_id = $1
      ORDER BY target.campaign_id, target.direction_id, lock_record.ordinal`,
    [input.workspaceId, input.designId, input.revisionId],
  );

  const contexts = new Map<string, CampaignRevisionLockContext>();
  for (const row of rows) {
    if (!AUTHORING_LOCK_IDS.includes(row.lock_id as AuthoringLockId)) {
      throw new CampaignRevisionLockContextIntegrityError();
    }
    const key = `${row.campaign_id}\u0000${row.direction_id}`;
    const existing = contexts.get(key);
    if (existing === undefined) {
      contexts.set(key, {
        campaignId: row.campaign_id,
        directionId: row.direction_id,
        locks: [row.lock_id as AuthoringLockId],
        baseDesignId: row.base_design_id,
        baseRevisionId: row.base_revision_id,
        baseDocument: row.base_document,
        baseCanonicalHash: row.base_canonical_hash,
      });
      continue;
    }
    if (
      existing.baseDesignId !== row.base_design_id ||
      existing.baseRevisionId !== row.base_revision_id ||
      existing.baseCanonicalHash !== row.base_canonical_hash
    ) {
      throw new CampaignRevisionLockContextIntegrityError();
    }
    existing.locks.push(row.lock_id as AuthoringLockId);
  }
  return [...contexts.values()];
}
