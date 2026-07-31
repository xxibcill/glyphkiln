-- App Alpha rollback is explicitly destructive. Emptying resource history
-- allows the original content-identity uniqueness rule to be restored before
-- migration 002 removes these tables.

TRUNCATE resource_ingestions, resource_versions;
-- glyphkiln:statement-break

ALTER TABLE resource_ingestions
  DROP CONSTRAINT resource_ingestions_admission_semantics_check;
-- glyphkiln:statement-break

ALTER TABLE resource_ingestions
  DROP COLUMN admission_semantics_version;
-- glyphkiln:statement-break

ALTER TABLE resource_ingestions
  ADD CONSTRAINT resource_ingestions_duplicate_identity_check CHECK (
    duplicate_of_resource_id IS NULL
    OR duplicate_of_resource_id = resource_id
  );
-- glyphkiln:statement-break

DROP INDEX resource_versions_workspace_content_lookup_idx;
-- glyphkiln:statement-break

CREATE UNIQUE INDEX resource_versions_workspace_identity_idx
  ON resource_versions (
    workspace_id,
    kind,
    content_hash,
    COALESCE(font_family, ''),
    COALESCE(font_weight, 0),
    COALESCE(font_style, '')
  );
