ALTER TABLE resource_versions
  ADD COLUMN color_normalization_policy_version text,
  ADD COLUMN color_normalization_source_hash text,
  ADD COLUMN color_normalization_source_media_type text;
-- glyphkiln:statement-break

ALTER TABLE resource_versions
  ADD CONSTRAINT resource_versions_color_normalization_provenance_check CHECK (
    (
      color_normalization_policy_version IS NULL
      AND color_normalization_source_hash IS NULL
      AND color_normalization_source_media_type IS NULL
    )
    OR
    (
      kind = 'raster-asset'
      AND media_type = 'image/png'
      AND color_normalization_policy_version = 'canonical-srgb-png-v1'
      AND color_normalization_source_hash ~ '^[0-9a-f]{64}$'
      AND color_normalization_source_media_type IN ('image/png', 'image/jpeg')
    )
  );
