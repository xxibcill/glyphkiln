CREATE TABLE users (
  id text PRIMARY KEY
    CONSTRAINT users_id_length_check CHECK (length(id) BETWEEN 1 AND 128),
  email text NOT NULL UNIQUE
    CONSTRAINT users_email_normalized_check CHECK (
      email = lower(btrim(email))
      AND length(email) BETWEEN 3 AND 320
    ),
  display_name text NOT NULL
    CONSTRAINT users_display_name_length_check CHECK (
      length(btrim(display_name)) BETWEEN 1 AND 200
    ),
  password_hash text NOT NULL
    CONSTRAINT users_password_hash_argon2id_check CHECK (
      password_hash LIKE '$argon2id$%'
      AND length(password_hash) <= 1024
    ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at timestamptz
);
-- glyphkiln:statement-break

CREATE TABLE installation_state (
  singleton boolean PRIMARY KEY
    CONSTRAINT installation_state_singleton_check CHECK (singleton),
  bootstrap_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bootstrapped_at timestamptz,
  CONSTRAINT installation_state_bootstrap_pair_check CHECK (
    (bootstrap_user_id IS NULL AND bootstrapped_at IS NULL)
    OR (bootstrap_user_id IS NOT NULL AND bootstrapped_at IS NOT NULL)
  )
);
-- glyphkiln:statement-break

INSERT INTO installation_state (singleton) VALUES (TRUE);
-- glyphkiln:statement-break

CREATE TABLE sessions (
  id text PRIMARY KEY
    CONSTRAINT sessions_id_length_check CHECK (length(id) BETWEEN 1 AND 128),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE
    CONSTRAINT sessions_token_hash_check CHECK (
      token_hash ~ '^[0-9a-f]{64}$'
    ),
  csrf_token_hash text NOT NULL
    CONSTRAINT sessions_csrf_token_hash_check CHECK (
      csrf_token_hash ~ '^[0-9a-f]{64}$'
    ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamptz,
  CONSTRAINT sessions_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT sessions_last_seen_check CHECK (last_seen_at >= created_at),
  CONSTRAINT sessions_revocation_check CHECK (
    revoked_at IS NULL OR revoked_at >= created_at
  )
);
-- glyphkiln:statement-break

CREATE INDEX sessions_user_active_idx
  ON sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;
-- glyphkiln:statement-break

CREATE TABLE login_throttles (
  credential_key_hash text PRIMARY KEY
    CONSTRAINT login_throttles_key_hash_check CHECK (
      credential_key_hash ~ '^[0-9a-f]{64}$'
    ),
  failed_attempts integer NOT NULL
    CONSTRAINT login_throttles_failed_attempts_check CHECK (
      failed_attempts BETWEEN 1 AND 100000
    ),
  window_expires_at timestamptz NOT NULL,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL,
  CONSTRAINT login_throttles_blocked_until_check CHECK (
    blocked_until IS NULL OR blocked_until >= updated_at
  )
);
-- glyphkiln:statement-break

CREATE TABLE workspaces (
  id text PRIMARY KEY
    CONSTRAINT workspaces_id_length_check CHECK (length(id) BETWEEN 1 AND 128),
  name text NOT NULL
    CONSTRAINT workspaces_name_length_check CHECK (
      length(btrim(name)) BETWEEN 1 AND 200
    ),
  slug text NOT NULL UNIQUE
    CONSTRAINT workspaces_slug_check CHECK (
      slug = lower(slug)
      AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      AND length(slug) BETWEEN 1 AND 80
  ),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  CONSTRAINT workspaces_archived_at_check CHECK (
    archived_at IS NULL OR archived_at >= created_at
  )
);
-- glyphkiln:statement-break

CREATE TABLE workspace_memberships (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id text GENERATED ALWAYS AS (user_id) STORED,
  role text NOT NULL
    CONSTRAINT workspace_memberships_role_check CHECK (
      role IN ('owner', 'admin', 'editor', 'viewer')
    ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id),
  UNIQUE (workspace_id, id)
);
-- glyphkiln:statement-break

CREATE INDEX workspace_memberships_user_idx
  ON workspace_memberships (user_id, workspace_id);
-- glyphkiln:statement-break

CREATE TABLE workspace_invitations (
  id text PRIMARY KEY
    CONSTRAINT workspace_invitations_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL
    CONSTRAINT workspace_invitations_email_normalized_check CHECK (
      email = lower(btrim(email))
      AND length(email) BETWEEN 3 AND 320
    ),
  role text NOT NULL
    CONSTRAINT workspace_invitations_role_check CHECK (
      role IN ('admin', 'editor', 'viewer')
    ),
  token_hash text NOT NULL UNIQUE
    CONSTRAINT workspace_invitations_token_hash_check CHECK (
      token_hash ~ '^[0-9a-f]{64}$'
    ),
  invited_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  accepted_by text,
  accepted_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (workspace_id, id),
  CONSTRAINT workspace_invitations_inviter_fk
    FOREIGN KEY (workspace_id, invited_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT workspace_invitations_acceptor_fk
    FOREIGN KEY (workspace_id, accepted_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT workspace_invitations_expiry_check CHECK (
    expires_at > created_at
  ),
  CONSTRAINT workspace_invitations_acceptance_pair_check CHECK (
    (accepted_by IS NULL AND accepted_at IS NULL)
    OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
  ),
  CONSTRAINT workspace_invitations_terminal_state_check CHECK (
    accepted_at IS NULL OR revoked_at IS NULL
  )
);
-- glyphkiln:statement-break

CREATE INDEX workspace_invitations_workspace_email_idx
  ON workspace_invitations (workspace_id, email, created_at DESC);
-- glyphkiln:statement-break

CREATE TABLE audit_events (
  id text PRIMARY KEY
    CONSTRAINT audit_events_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL
    CONSTRAINT audit_events_action_length_check CHECK (
      length(action) BETWEEN 1 AND 160
    ),
  target_type text NOT NULL
    CONSTRAINT audit_events_target_type_length_check CHECK (
      length(target_type) BETWEEN 1 AND 80
    ),
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT audit_events_metadata_object_check CHECK (
      jsonb_typeof(metadata) = 'object'
    ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  CONSTRAINT audit_events_actor_fk
    FOREIGN KEY (workspace_id, actor_user_id)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT audit_events_workspace_actor_check CHECK (
    workspace_id IS NULL OR actor_user_id IS NOT NULL
  )
);
-- glyphkiln:statement-break

CREATE INDEX audit_events_workspace_created_idx
  ON audit_events (workspace_id, created_at DESC, id);
-- glyphkiln:statement-break

CREATE TABLE brand_kits (
  id text PRIMARY KEY
    CONSTRAINT brand_kits_id_length_check CHECK (length(id) BETWEEN 1 AND 128),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL
    CONSTRAINT brand_kits_name_length_check CHECK (
      length(btrim(name)) BETWEEN 1 AND 200
    ),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE (workspace_id, id),
  CONSTRAINT brand_kits_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT brand_kits_updated_at_check CHECK (updated_at >= created_at),
  CONSTRAINT brand_kits_archived_at_check CHECK (
    archived_at IS NULL OR archived_at >= created_at
  )
);
-- glyphkiln:statement-break

CREATE INDEX brand_kits_workspace_active_idx
  ON brand_kits (workspace_id, updated_at DESC, id)
  WHERE archived_at IS NULL;
-- glyphkiln:statement-break

CREATE TABLE brand_snapshots (
  id text PRIMARY KEY
    CONSTRAINT brand_snapshots_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_kit_id text NOT NULL,
  sequence integer NOT NULL
    CONSTRAINT brand_snapshots_sequence_check CHECK (sequence > 0),
  version text NOT NULL
    CONSTRAINT brand_snapshots_version_check CHECK (
      version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
      AND length(version) <= 128
    ),
  snapshot jsonb NOT NULL
    CONSTRAINT brand_snapshots_snapshot_object_check CHECK (
      jsonb_typeof(snapshot) = 'object'
    ),
  canonical_hash text NOT NULL
    CONSTRAINT brand_snapshots_canonical_hash_check CHECK (
      canonical_hash ~ '^[0-9a-f]{64}$'
    ),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, brand_kit_id, sequence),
  UNIQUE (workspace_id, brand_kit_id, version),
  CONSTRAINT brand_snapshots_brand_kit_fk
    FOREIGN KEY (workspace_id, brand_kit_id)
    REFERENCES brand_kits (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT brand_snapshots_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT
);
-- glyphkiln:statement-break

CREATE INDEX brand_snapshots_workspace_kit_latest_idx
  ON brand_snapshots (workspace_id, brand_kit_id, sequence DESC);
-- glyphkiln:statement-break

CREATE TABLE designs (
  id text PRIMARY KEY
    CONSTRAINT designs_id_length_check CHECK (length(id) BETWEEN 1 AND 128),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL
    CONSTRAINT designs_name_length_check CHECK (
      length(btrim(name)) BETWEEN 1 AND 200
    ),
  head_revision_id text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE (workspace_id, id),
  CONSTRAINT designs_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT designs_updated_at_check CHECK (updated_at >= created_at),
  CONSTRAINT designs_archived_at_check CHECK (
    archived_at IS NULL OR archived_at >= created_at
  )
);
-- glyphkiln:statement-break

CREATE INDEX designs_workspace_active_idx
  ON designs (workspace_id, updated_at DESC, id)
  WHERE archived_at IS NULL;
-- glyphkiln:statement-break

CREATE TABLE design_revisions (
  id text PRIMARY KEY
    CONSTRAINT design_revisions_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  design_id text NOT NULL,
  revision_number integer NOT NULL
    CONSTRAINT design_revisions_number_check CHECK (revision_number > 0),
  parent_revision_id text,
  brand_snapshot_id text NOT NULL,
  design_document jsonb NOT NULL
    CONSTRAINT design_revisions_document_object_check CHECK (
      jsonb_typeof(design_document) = 'object'
    ),
  canonical_hash text NOT NULL
    CONSTRAINT design_revisions_canonical_hash_check CHECK (
      canonical_hash ~ '^[0-9a-f]{64}$'
    ),
  source text NOT NULL DEFAULT 'manual'
    CONSTRAINT design_revisions_source_check CHECK (source = 'manual'),
  change_note text
    CONSTRAINT design_revisions_change_note_length_check CHECK (
      change_note IS NULL OR length(change_note) <= 2000
    ),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, design_id, id),
  UNIQUE (workspace_id, design_id, revision_number),
  CONSTRAINT design_revisions_design_fk
    FOREIGN KEY (workspace_id, design_id)
    REFERENCES designs (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT design_revisions_brand_snapshot_fk
    FOREIGN KEY (workspace_id, brand_snapshot_id)
    REFERENCES brand_snapshots (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT design_revisions_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT
);
-- glyphkiln:statement-break

ALTER TABLE design_revisions
  ADD CONSTRAINT design_revisions_parent_same_design_fk
  FOREIGN KEY (workspace_id, design_id, parent_revision_id)
  REFERENCES design_revisions (workspace_id, design_id, id)
  ON DELETE RESTRICT;
-- glyphkiln:statement-break

ALTER TABLE designs
  ADD CONSTRAINT designs_head_revision_same_design_fk
  FOREIGN KEY (workspace_id, id, head_revision_id)
  REFERENCES design_revisions (workspace_id, design_id, id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;
-- glyphkiln:statement-break

CREATE INDEX design_revisions_snapshot_idx
  ON design_revisions (workspace_id, brand_snapshot_id);
-- glyphkiln:statement-break

CREATE FUNCTION glyphkiln_reject_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;
-- glyphkiln:statement-break

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
-- glyphkiln:statement-break

CREATE TRIGGER brand_snapshots_append_only
  BEFORE UPDATE OR DELETE ON brand_snapshots
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
-- glyphkiln:statement-break

CREATE TRIGGER design_revisions_append_only
  BEFORE UPDATE OR DELETE ON design_revisions
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
