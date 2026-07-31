-- WARNING: Rolling this migration back discards revocation provenance and
-- makes every previously revoked membership active again.

DROP INDEX workspace_memberships_active_user_idx;
-- glyphkiln:statement-break

ALTER TABLE workspace_memberships
  DROP CONSTRAINT workspace_memberships_revocation_time_check,
  DROP CONSTRAINT workspace_memberships_revocation_pair_check,
  DROP CONSTRAINT workspace_memberships_revoker_fk;
-- glyphkiln:statement-break

ALTER TABLE workspace_memberships
  DROP COLUMN revoked_by,
  DROP COLUMN revoked_at;
