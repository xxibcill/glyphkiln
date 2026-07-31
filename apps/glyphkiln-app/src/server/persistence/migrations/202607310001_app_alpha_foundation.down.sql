-- WARNING: This rollback drops every App Alpha identity, workspace, brand, and
-- design record. The migration runner requires an explicit data-loss opt-in.

DROP TRIGGER design_revisions_append_only ON design_revisions;
-- glyphkiln:statement-break

DROP TRIGGER brand_snapshots_append_only ON brand_snapshots;
-- glyphkiln:statement-break

DROP TRIGGER audit_events_append_only ON audit_events;
-- glyphkiln:statement-break

ALTER TABLE designs DROP CONSTRAINT designs_head_revision_same_design_fk;
-- glyphkiln:statement-break

DROP TABLE design_revisions;
-- glyphkiln:statement-break

DROP TABLE designs;
-- glyphkiln:statement-break

DROP TABLE brand_snapshots;
-- glyphkiln:statement-break

DROP TABLE brand_kits;
-- glyphkiln:statement-break

DROP TABLE audit_events;
-- glyphkiln:statement-break

DROP TABLE workspace_invitations;
-- glyphkiln:statement-break

DROP TABLE workspace_memberships;
-- glyphkiln:statement-break

DROP TABLE workspaces;
-- glyphkiln:statement-break

DROP TABLE login_throttles;
-- glyphkiln:statement-break

DROP TABLE sessions;
-- glyphkiln:statement-break

DROP TABLE installation_state;
-- glyphkiln:statement-break

DROP TABLE users;
-- glyphkiln:statement-break

DROP FUNCTION glyphkiln_reject_append_only_change();
