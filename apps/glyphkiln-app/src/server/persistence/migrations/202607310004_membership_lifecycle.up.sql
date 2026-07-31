-- Membership rows are provenance records and remain addressable by the
-- workspace-qualified foreign keys created by earlier migrations. Revocation
-- changes authorization state without deleting those records.

ALTER TABLE workspace_memberships
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by text;
-- glyphkiln:statement-break

ALTER TABLE workspace_memberships
  ADD CONSTRAINT workspace_memberships_revoker_fk
    FOREIGN KEY (workspace_id, revoked_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT workspace_memberships_revocation_pair_check CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  ),
  ADD CONSTRAINT workspace_memberships_revocation_time_check CHECK (
    revoked_at IS NULL OR revoked_at >= created_at
  );
-- glyphkiln:statement-break

CREATE INDEX workspace_memberships_active_user_idx
  ON workspace_memberships (user_id, workspace_id)
  WHERE revoked_at IS NULL;
