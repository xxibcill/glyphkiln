ALTER TABLE resource_versions
  DROP CONSTRAINT resource_versions_color_normalization_provenance_check;
-- glyphkiln:statement-break

ALTER TABLE resource_versions
  DROP COLUMN color_normalization_policy_version,
  DROP COLUMN color_normalization_source_hash,
  DROP COLUMN color_normalization_source_media_type;
