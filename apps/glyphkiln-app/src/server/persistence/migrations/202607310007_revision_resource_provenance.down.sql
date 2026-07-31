DROP TRIGGER design_revision_resources_append_only
  ON design_revision_resources;
-- glyphkiln:statement-break

DROP TABLE design_revision_resources;
-- glyphkiln:statement-break

ALTER TABLE resource_versions
  DROP CONSTRAINT resource_versions_workspace_id_kind_unique;
