CREATE TABLE campaigns (
  id text PRIMARY KEY
    CONSTRAINT campaigns_id_length_check CHECK (length(id) BETWEEN 1 AND 128),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL
    CONSTRAINT campaigns_name_length_check CHECK (
      length(btrim(name)) BETWEEN 1 AND 160
    ),
  brief text NOT NULL
    CONSTRAINT campaigns_brief_length_check CHECK (
      length(btrim(brief)) BETWEEN 1 AND 4000
    ),
  campaign_seed text NOT NULL
    CONSTRAINT campaigns_seed_length_check CHECK (
      length(btrim(campaign_seed)) BETWEEN 1 AND 256
    ),
  family_id text NOT NULL
    CONSTRAINT campaigns_family_check CHECK (
      family_id IN ('image-led-campaign')
    ),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE (workspace_id, id),
  CONSTRAINT campaigns_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT campaigns_updated_at_check CHECK (updated_at >= created_at),
  CONSTRAINT campaigns_archived_at_check CHECK (
    archived_at IS NULL OR archived_at >= created_at
  )
);
-- glyphkiln:statement-break

CREATE INDEX campaigns_workspace_active_idx
  ON campaigns (workspace_id, updated_at DESC, id)
  WHERE archived_at IS NULL;
-- glyphkiln:statement-break

CREATE TABLE campaign_directions (
  id text PRIMARY KEY
    CONSTRAINT campaign_directions_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  direction_key text NOT NULL
    CONSTRAINT campaign_directions_key_check CHECK (
      length(direction_key) BETWEEN 1 AND 128
      AND direction_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]*$'
    ),
  name text NOT NULL
    CONSTRAINT campaign_directions_name_length_check CHECK (
      length(btrim(name)) BETWEEN 1 AND 160
    ),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, campaign_id, direction_key),
  UNIQUE (workspace_id, campaign_id, id),
  CONSTRAINT campaign_directions_campaign_fk
    FOREIGN KEY (workspace_id, campaign_id)
    REFERENCES campaigns (workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT campaign_directions_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT
);
-- glyphkiln:statement-break

CREATE INDEX campaign_directions_campaign_idx
  ON campaign_directions (workspace_id, campaign_id, created_at, id);
-- glyphkiln:statement-break

CREATE TABLE campaign_direction_locks (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  direction_id text NOT NULL,
  lock_id text NOT NULL
    CONSTRAINT campaign_direction_locks_id_check CHECK (
      lock_id IN ('copy', 'image', 'crop', 'typography', 'palette', 'composition')
    ),
  ordinal integer NOT NULL
    CONSTRAINT campaign_direction_locks_ordinal_check CHECK (
      ordinal BETWEEN 0 AND 5
    ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, direction_id, lock_id),
  UNIQUE (workspace_id, direction_id, ordinal),
  CONSTRAINT campaign_direction_locks_direction_fk
    FOREIGN KEY (workspace_id, campaign_id, direction_id)
    REFERENCES campaign_directions (workspace_id, campaign_id, id)
    ON DELETE CASCADE
);
-- glyphkiln:statement-break

CREATE TABLE campaign_canvases (
  id text PRIMARY KEY
    CONSTRAINT campaign_canvases_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  direction_id text NOT NULL,
  canvas_key text NOT NULL
    CONSTRAINT campaign_canvases_key_check CHECK (
      length(canvas_key) BETWEEN 1 AND 128
      AND canvas_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]*$'
    ),
  design_id text NOT NULL,
  revision_id text NOT NULL,
  template_id text NOT NULL,
  template_version text NOT NULL,
  format_id text NOT NULL,
  composition_variant_id text NOT NULL
    CONSTRAINT campaign_canvases_composition_variant_check CHECK (
      composition_variant_id IN ('focal-editorial')
    ),
  seed_derivation_version text NOT NULL
    CONSTRAINT campaign_canvases_seed_derivation_version_check CHECK (
      seed_derivation_version = 'sha256/canonical-scope-v1'
    ),
  direction_seed text NOT NULL
    CONSTRAINT campaign_canvases_direction_seed_check CHECK (
      direction_seed ~ '^[0-9a-f]{64}$'
    ),
  canvas_seed text NOT NULL
    CONSTRAINT campaign_canvases_canvas_seed_check CHECK (
      canvas_seed ~ '^[0-9a-f]{64}$'
    ),
  ordinal integer NOT NULL
    CONSTRAINT campaign_canvases_ordinal_check CHECK (
      ordinal BETWEEN 0 AND 999
    ),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, campaign_id, direction_id, canvas_key),
  UNIQUE (workspace_id, campaign_id, direction_id, ordinal),
  CONSTRAINT campaign_canvases_direction_fk
    FOREIGN KEY (workspace_id, campaign_id, direction_id)
    REFERENCES campaign_directions (workspace_id, campaign_id, id)
    ON DELETE CASCADE,
  CONSTRAINT campaign_canvases_revision_fk
    FOREIGN KEY (workspace_id, design_id, revision_id)
    REFERENCES design_revisions (workspace_id, design_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT campaign_canvases_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT
);
-- glyphkiln:statement-break

CREATE INDEX campaign_canvases_direction_idx
  ON campaign_canvases (
    workspace_id,
    campaign_id,
    direction_id,
    ordinal,
    id
  );
-- glyphkiln:statement-break

CREATE TRIGGER campaign_direction_locks_append_only
  BEFORE UPDATE OR DELETE ON campaign_direction_locks
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
-- glyphkiln:statement-break

CREATE TRIGGER campaign_canvases_append_only
  BEFORE UPDATE OR DELETE ON campaign_canvases
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
