import {
  canonicalJson,
  hashCanonical,
  validateDesignDocument,
  type DesignDocument,
} from "@glyphkiln/core";

import type { SqlDatabase } from "../persistence/database";
import type { ClaimedRenderJob } from "../render-queue";
import { validateAuthoringLocks } from "../ai-authoring";
import {
  CampaignRevisionLockContextIntegrityError,
  resolveCampaignRevisionLockContexts,
} from "../campaigns/revision-lock-context";
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
  let contexts;
  try {
    contexts = await resolveCampaignRevisionLockContexts(database, {
      workspaceId: claim.workspaceId,
      designId: claim.designId,
      revisionId: claim.revisionId,
    });
  } catch (error) {
    if (error instanceof CampaignRevisionLockContextIntegrityError) {
      throw corruptedRevision();
    }
    throw error;
  }
  for (const context of contexts) {
    const baseValidation = validateDesignDocument(parseJson(context.baseDocument));
    if (
      !baseValidation.success ||
      hashCanonical(baseValidation.data) !== context.baseCanonicalHash
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
