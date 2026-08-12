import {
  canonicalJson,
  hashCanonical,
  validateDesignDocument,
  type DesignDocument,
} from "@glyphkiln/core";

import type { SqlDatabase } from "../persistence/database";
import type { ClaimedRenderJob } from "../render-queue";
import {
  AUTHORING_LOCK_IDS,
  validateAuthoringLocks,
  type AuthoringLockId,
} from "../ai-authoring";
import {
  REVISION_RESOURCE_REFERENCE_COLUMNS,
  mapRevisionResourceReference,
  resourceReferencesMatchDocument,
  type RevisionResourceReferenceRow,
} from "../resources/revision-resource-provenance";
import { hasCapability, type WorkspaceRole } from "../security/workspace-policy";

type RevisionRow = {
  design_document: DesignDocument | string;
  revision_hash: string;
  brand_snapshot: unknown;
  brand_hash: string;
  role: WorkspaceRole;
};

export class RenderRevisionError extends Error {
  constructor(
    public readonly code:
      | "RENDER_AUTHORIZATION_REVOKED"
      | "RENDER_CAMPAIGN_LOCK_VIOLATION"
      | "RENDER_REVISION_CORRUPTED"
      | "RENDER_REVISION_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "RenderRevisionError";
  }
}

export async function loadAuthorizedRenderRevision(
  database: SqlDatabase,
  claim: ClaimedRenderJob,
): Promise<DesignDocument> {
  const rows = await database.query<RevisionRow>(
    `SELECT r.design_document,
            r.canonical_hash AS revision_hash,
            bs.snapshot AS brand_snapshot,
            bs.canonical_hash AS brand_hash,
            wm.role
       FROM render_jobs j
       JOIN workspaces w
         ON w.id = j.workspace_id
       JOIN designs d
         ON d.workspace_id = j.workspace_id
        AND d.id = j.design_id
       JOIN design_revisions r
         ON r.workspace_id = j.workspace_id
        AND r.design_id = j.design_id
        AND r.id = j.revision_id
       JOIN brand_snapshots bs
         ON bs.workspace_id = r.workspace_id
        AND bs.id = r.brand_snapshot_id
       JOIN workspace_memberships wm
         ON wm.workspace_id = j.workspace_id
        AND wm.user_id = j.requested_by
       JOIN users u
         ON u.id = wm.user_id
      WHERE j.workspace_id = $1
        AND j.id = $2
        AND j.design_id = $3
        AND j.revision_id = $4
        AND j.requested_by = $5
        AND j.state = 'claimed'
        AND j.attempt_count = $6
        AND j.claimed_by = $7
        AND w.archived_at IS NULL
        AND wm.revoked_at IS NULL
        AND u.disabled_at IS NULL
        AND d.archived_at IS NULL`,
    [
      claim.workspaceId,
      claim.jobId,
      claim.designId,
      claim.revisionId,
      claim.requestedBy,
      claim.attemptNumber,
      claim.workerId,
    ],
  );
  const row = rows.at(0);
  if (row === undefined) {
    throw new RenderRevisionError(
      "RENDER_REVISION_NOT_FOUND",
      "The claimed render job no longer resolves to its workspace revision.",
    );
  }
  if (!hasCapability(row.role, "request_export")) {
    throw new RenderRevisionError(
      "RENDER_AUTHORIZATION_REVOKED",
      "The requester no longer has permission to export this workspace revision.",
    );
  }
  const validation = validateDesignDocument(parseJson(row.design_document));
  if (!validation.success || hashCanonical(validation.data) !== row.revision_hash) {
    throw corruptedRevision();
  }
  const brandSnapshot = parseJson(row.brand_snapshot);
  if (
    hashCanonical(validation.data.brand) !== row.brand_hash ||
    canonicalJson(validation.data.brand) !== canonicalJson(brandSnapshot)
  ) {
    throw corruptedRevision();
  }
  const resourceRows = await database.query<RevisionResourceReferenceRow>(
    `SELECT ${REVISION_RESOURCE_REFERENCE_COLUMNS}
       FROM design_revision_resources AS reference
       JOIN resource_versions AS resource
         ON resource.workspace_id = reference.workspace_id
        AND resource.id = reference.resource_id
        AND resource.kind = reference.resource_kind
      WHERE reference.workspace_id = $1
        AND reference.design_id = $2
        AND reference.revision_id = $3
      ORDER BY reference.resource_kind, reference.ordinal`,
    [claim.workspaceId, claim.designId, claim.revisionId],
  );
  const references = resourceRows.flatMap((resourceRow) => {
    const reference = mapRevisionResourceReference(resourceRow);
    return reference === undefined ? [] : [reference];
  });
  if (references.length !== resourceRows.length) {
    throw corruptedRevision();
  }
  if (!resourceReferencesMatchDocument(validation.data, references)) {
    throw corruptedRevision();
  }
  await assertCampaignLocks(database, claim, validation.data);
  return validation.data;
}

async function assertCampaignLocks(
  database: SqlDatabase,
  claim: ClaimedRenderJob,
  candidate: DesignDocument,
): Promise<void> {
  const rows = await database.query<{
    campaign_id: string;
    direction_id: string;
    lock_id: string;
    lock_ordinal: number | string;
    base_document: DesignDocument | string;
    base_hash: string;
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
            lock_record.ordinal AS lock_ordinal,
            base_revision.design_document AS base_document,
            base_revision.canonical_hash AS base_hash
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
    [claim.workspaceId, claim.designId, claim.revisionId],
  );
  const contexts = new Map<
    string,
    { base: DesignDocument; baseHash: string; locks: AuthoringLockId[] }
  >();
  for (const row of rows) {
    if (!AUTHORING_LOCK_IDS.includes(row.lock_id as AuthoringLockId)) {
      throw corruptedRevision();
    }
    const key = `${row.campaign_id}\u0000${row.direction_id}`;
    const existing = contexts.get(key);
    if (existing === undefined) {
      contexts.set(key, {
        base: parseJson(row.base_document) as DesignDocument,
        baseHash: row.base_hash,
        locks: [row.lock_id as AuthoringLockId],
      });
    } else {
      existing.locks.push(row.lock_id as AuthoringLockId);
    }
  }
  for (const context of contexts.values()) {
    const baseValidation = validateDesignDocument(context.base);
    if (
      !baseValidation.success ||
      hashCanonical(baseValidation.data) !== context.baseHash
    ) {
      throw corruptedRevision();
    }
    if (
      !validateAuthoringLocks(baseValidation.data, candidate, context.locks).success
    ) {
      throw new RenderRevisionError(
        "RENDER_CAMPAIGN_LOCK_VIOLATION",
        "The stored campaign revision no longer preserves its server-owned locks.",
      );
    }
  }
}

function corruptedRevision(): RenderRevisionError {
  return new RenderRevisionError(
    "RENDER_REVISION_CORRUPTED",
    "The immutable revision or brand snapshot failed its canonical integrity check.",
  );
}

function parseJson(input: unknown): unknown {
  return typeof input === "string" ? (JSON.parse(input) as unknown) : input;
}
