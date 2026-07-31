CREATE TABLE resource_versions (
  id text PRIMARY KEY
    CONSTRAINT resource_versions_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL
    CONSTRAINT resource_versions_kind_check CHECK (
      kind IN ('raster-asset', 'font')
    ),
  content_hash text NOT NULL
    CONSTRAINT resource_versions_content_hash_check CHECK (
      content_hash ~ '^[0-9a-f]{64}$'
    ),
  storage_key text NOT NULL
    CONSTRAINT resource_versions_storage_key_check CHECK (
      length(storage_key) BETWEEN 1 AND 512
      AND storage_key !~ '(^|/)\.\.?(/|$)'
    ),
  media_type text NOT NULL
    CONSTRAINT resource_versions_media_type_check CHECK (
      media_type IN ('image/png', 'image/jpeg', 'font/ttf', 'font/otf')
    ),
  byte_size integer NOT NULL
    CONSTRAINT resource_versions_byte_size_check CHECK (byte_size > 0),
  width integer,
  height integer,
  font_family text,
  font_weight integer,
  font_style text,
  origin_kind text NOT NULL
    CONSTRAINT resource_versions_origin_kind_check CHECK (
      origin_kind IN ('user-upload', 'licensed-library', 'generated', 'unknown')
    ),
  origin_source_name text,
  origin_source_reference text,
  generative_image_model text,
  license_status text NOT NULL
    CONSTRAINT resource_versions_license_status_check CHECK (
      license_status IN ('owned', 'licensed', 'public-domain', 'unknown')
    ),
  license_identifier text,
  license_name text,
  license_reference text,
  license_notes text,
  scanner_verdict text NOT NULL
    CONSTRAINT resource_versions_scanner_verdict_check CHECK (
      scanner_verdict = 'clean'
    ),
  scanner_name text NOT NULL,
  scanner_version text NOT NULL,
  scanner_reference text,
  scanned_at timestamptz NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  CONSTRAINT resource_versions_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT resource_versions_shape_check CHECK (
    (
      kind = 'raster-asset'
      AND media_type IN ('image/png', 'image/jpeg')
      AND width BETWEEN 1 AND 8192
      AND height BETWEEN 1 AND 8192
      AND width::bigint * height::bigint <= 40000000
      AND byte_size <= 16777216
      AND font_family IS NULL
      AND font_weight IS NULL
      AND font_style IS NULL
    )
    OR
    (
      kind = 'font'
      AND media_type IN ('font/ttf', 'font/otf')
      AND byte_size <= 10485760
      AND width IS NULL
      AND height IS NULL
      AND length(font_family) BETWEEN 1 AND 120
      AND font_weight BETWEEN 100 AND 900
      AND font_weight % 100 = 0
      AND font_style IN ('normal', 'italic')
    )
  ),
  CONSTRAINT resource_versions_origin_source_name_check CHECK (
    origin_source_name IS NULL
    OR length(origin_source_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT resource_versions_origin_source_reference_check CHECK (
    origin_source_reference IS NULL
    OR length(origin_source_reference) BETWEEN 1 AND 500
  ),
  CONSTRAINT resource_versions_generative_model_check CHECK (
    generative_image_model IS NULL
    OR length(generative_image_model) BETWEEN 1 AND 200
  ),
  CONSTRAINT resource_versions_license_identifier_check CHECK (
    license_identifier IS NULL
    OR length(license_identifier) BETWEEN 1 AND 128
  ),
  CONSTRAINT resource_versions_license_name_check CHECK (
    license_name IS NULL OR length(license_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT resource_versions_license_reference_check CHECK (
    license_reference IS NULL
    OR length(license_reference) BETWEEN 1 AND 500
  ),
  CONSTRAINT resource_versions_license_notes_check CHECK (
    license_notes IS NULL OR length(license_notes) BETWEEN 1 AND 2000
  ),
  CONSTRAINT resource_versions_scanner_name_check CHECK (
    length(scanner_name) BETWEEN 1 AND 120
  ),
  CONSTRAINT resource_versions_scanner_version_check CHECK (
    length(scanner_version) BETWEEN 1 AND 120
  ),
  CONSTRAINT resource_versions_scanner_reference_check CHECK (
    scanner_reference IS NULL OR length(scanner_reference) BETWEEN 1 AND 500
  )
);
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
-- glyphkiln:statement-break

CREATE INDEX resource_versions_workspace_created_idx
  ON resource_versions (workspace_id, kind, created_at DESC, id);
-- glyphkiln:statement-break

CREATE TABLE resource_ingestions (
  id text PRIMARY KEY
    CONSTRAINT resource_ingestions_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  resource_id text NOT NULL,
  duplicate_of_resource_id text,
  original_filename text
    CONSTRAINT resource_ingestions_filename_check CHECK (
      original_filename IS NULL
      OR length(original_filename) BETWEEN 1 AND 255
    ),
  declared_media_type text NOT NULL
    CONSTRAINT resource_ingestions_media_type_check CHECK (
      declared_media_type IN (
        'image/png',
        'image/jpeg',
        'font/ttf',
        'font/otf'
      )
    ),
  origin_kind text NOT NULL
    CONSTRAINT resource_ingestions_origin_kind_check CHECK (
      origin_kind IN ('user-upload', 'licensed-library', 'generated', 'unknown')
    ),
  origin_source_name text,
  origin_source_reference text,
  generative_image_model text,
  license_status text NOT NULL
    CONSTRAINT resource_ingestions_license_status_check CHECK (
      license_status IN ('owned', 'licensed', 'public-domain', 'unknown')
    ),
  license_identifier text,
  license_name text,
  license_reference text,
  license_notes text,
  scanner_verdict text NOT NULL
    CONSTRAINT resource_ingestions_scanner_verdict_check CHECK (
      scanner_verdict = 'clean'
    ),
  scanner_name text NOT NULL
    CONSTRAINT resource_ingestions_scanner_name_check CHECK (
      length(scanner_name) BETWEEN 1 AND 120
    ),
  scanner_version text NOT NULL
    CONSTRAINT resource_ingestions_scanner_version_check CHECK (
      length(scanner_version) BETWEEN 1 AND 120
    ),
  scanner_reference text
    CONSTRAINT resource_ingestions_scanner_reference_check CHECK (
      scanner_reference IS NULL OR length(scanner_reference) BETWEEN 1 AND 500
    ),
  scanned_at timestamptz NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  CONSTRAINT resource_ingestions_resource_fk
    FOREIGN KEY (workspace_id, resource_id)
    REFERENCES resource_versions (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT resource_ingestions_duplicate_fk
    FOREIGN KEY (workspace_id, duplicate_of_resource_id)
    REFERENCES resource_versions (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT resource_ingestions_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT resource_ingestions_duplicate_identity_check CHECK (
    duplicate_of_resource_id IS NULL
    OR duplicate_of_resource_id = resource_id
  ),
  CONSTRAINT resource_ingestions_origin_source_name_check CHECK (
    origin_source_name IS NULL
    OR length(origin_source_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT resource_ingestions_origin_source_reference_check CHECK (
    origin_source_reference IS NULL
    OR length(origin_source_reference) BETWEEN 1 AND 500
  ),
  CONSTRAINT resource_ingestions_generative_model_check CHECK (
    generative_image_model IS NULL
    OR length(generative_image_model) BETWEEN 1 AND 200
  ),
  CONSTRAINT resource_ingestions_license_identifier_check CHECK (
    license_identifier IS NULL
    OR length(license_identifier) BETWEEN 1 AND 128
  ),
  CONSTRAINT resource_ingestions_license_name_check CHECK (
    license_name IS NULL OR length(license_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT resource_ingestions_license_reference_check CHECK (
    license_reference IS NULL
    OR length(license_reference) BETWEEN 1 AND 500
  ),
  CONSTRAINT resource_ingestions_license_notes_check CHECK (
    license_notes IS NULL OR length(license_notes) BETWEEN 1 AND 2000
  )
);
-- glyphkiln:statement-break

CREATE INDEX resource_ingestions_workspace_created_idx
  ON resource_ingestions (workspace_id, created_at DESC, id);
-- glyphkiln:statement-break

CREATE TRIGGER resource_versions_append_only
  BEFORE UPDATE OR DELETE ON resource_versions
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
-- glyphkiln:statement-break

CREATE TRIGGER resource_ingestions_append_only
  BEFORE UPDATE OR DELETE ON resource_ingestions
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
