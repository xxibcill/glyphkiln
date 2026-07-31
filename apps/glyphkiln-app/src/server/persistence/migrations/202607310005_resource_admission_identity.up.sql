-- Resource blobs remain content-addressed, but every clean admission is an
-- immutable, selectable provenance record. Legacy rows retain their v1
-- self-reference semantics; new v2 rows point to the earlier admission.

DROP INDEX resource_versions_workspace_identity_idx;
-- glyphkiln:statement-break

CREATE INDEX resource_versions_workspace_content_lookup_idx
  ON resource_versions (
    workspace_id,
    kind,
    content_hash,
    COALESCE(font_family, ''),
    COALESCE(font_weight, 0),
    COALESCE(font_style, ''),
    created_at,
    id
  );
-- glyphkiln:statement-break

ALTER TABLE resource_ingestions
  ADD COLUMN admission_semantics_version smallint NOT NULL DEFAULT 1;
-- glyphkiln:statement-break

ALTER TABLE resource_ingestions
  ALTER COLUMN admission_semantics_version DROP DEFAULT;
-- glyphkiln:statement-break

ALTER TABLE resource_ingestions
  DROP CONSTRAINT resource_ingestions_duplicate_identity_check;
-- glyphkiln:statement-break

ALTER TABLE resource_ingestions
  ADD CONSTRAINT resource_ingestions_admission_semantics_check CHECK (
    (
      admission_semantics_version = 1
      AND (
        duplicate_of_resource_id IS NULL
        OR duplicate_of_resource_id = resource_id
      )
    )
    OR
    (
      admission_semantics_version = 2
      AND (
        duplicate_of_resource_id IS NULL
        OR duplicate_of_resource_id <> resource_id
      )
    )
  );
