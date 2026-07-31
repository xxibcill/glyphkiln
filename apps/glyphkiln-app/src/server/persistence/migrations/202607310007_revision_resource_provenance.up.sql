-- Pin every selected immutable resource admission to the exact design
-- revision. Core declarations continue to describe render bytes; this
-- app-owned join preserves license/origin identity without widening Core.

ALTER TABLE resource_versions
  ADD CONSTRAINT resource_versions_workspace_id_kind_unique
  UNIQUE (workspace_id, id, kind);
-- glyphkiln:statement-break

CREATE TABLE design_revision_resources (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  design_id text NOT NULL,
  revision_id text NOT NULL,
  resource_id text NOT NULL,
  resource_kind text NOT NULL
    CONSTRAINT design_revision_resources_kind_check CHECK (
      resource_kind IN ('raster-asset', 'font')
    ),
  ordinal integer NOT NULL
    CONSTRAINT design_revision_resources_ordinal_check CHECK (
      ordinal BETWEEN 0 AND 99
    ),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, revision_id, resource_kind, ordinal),
  UNIQUE (workspace_id, revision_id, resource_id),
  CONSTRAINT design_revision_resources_revision_fk
    FOREIGN KEY (workspace_id, design_id, revision_id)
    REFERENCES design_revisions (workspace_id, design_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT design_revision_resources_resource_fk
    FOREIGN KEY (workspace_id, resource_id, resource_kind)
    REFERENCES resource_versions (workspace_id, id, kind)
    ON DELETE RESTRICT
);
-- glyphkiln:statement-break

CREATE INDEX design_revision_resources_resource_idx
  ON design_revision_resources (workspace_id, resource_id, revision_id);
-- glyphkiln:statement-break

INSERT INTO design_revision_resources (
  workspace_id,
  design_id,
  revision_id,
  resource_id,
  resource_kind,
  ordinal,
  created_at
)
SELECT
  revision.workspace_id,
  revision.design_id,
  revision.id,
  asset.value ->> 'id',
  'raster-asset',
  asset.ordinal - 1,
  revision.created_at
FROM design_revisions AS revision
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(
    revision.design_document
      -> 'metadata'
      -> 'resourceVersions'
      -> 'assets',
    '[]'::jsonb
  )
) WITH ORDINALITY AS asset(value, ordinal)
JOIN resource_versions AS resource
  ON resource.workspace_id = revision.workspace_id
 AND resource.id = (asset.value ->> 'id')
 AND resource.kind = 'raster-asset';
-- glyphkiln:statement-break

INSERT INTO design_revision_resources (
  workspace_id,
  design_id,
  revision_id,
  resource_id,
  resource_kind,
  ordinal,
  created_at
)
SELECT
  revision.workspace_id,
  revision.design_id,
  revision.id,
  resource.id,
  'font',
  font.ordinal - 1,
  revision.created_at
FROM design_revisions AS revision
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(
    revision.design_document
      -> 'metadata'
      -> 'resourceVersions'
      -> 'fonts',
    '[]'::jsonb
  )
) WITH ORDINALITY AS font(value, ordinal)
JOIN LATERAL (
  SELECT candidate.id
  FROM resource_versions AS candidate
  WHERE candidate.workspace_id = revision.workspace_id
    AND candidate.kind = 'font'
    AND candidate.font_family = (font.value ->> 'family')
    AND candidate.font_weight = (font.value ->> 'weight')::integer
    AND candidate.font_style = (font.value ->> 'style')
    AND candidate.content_hash = (font.value ->> 'sha256')
  ORDER BY candidate.created_at, candidate.id
  LIMIT 1
) AS resource ON true;
-- glyphkiln:statement-break

CREATE TRIGGER design_revision_resources_append_only
  BEFORE UPDATE OR DELETE ON design_revision_resources
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
