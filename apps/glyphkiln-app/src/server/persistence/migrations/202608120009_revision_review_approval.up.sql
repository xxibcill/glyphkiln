CREATE TABLE revision_reviews (
  id text PRIMARY KEY
    CONSTRAINT revision_reviews_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  design_id text NOT NULL,
  revision_id text NOT NULL,
  state text NOT NULL
    CONSTRAINT revision_reviews_state_check CHECK (
      state IN ('in-review', 'changes-requested', 'approved')
    ),
  started_by text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, design_id, revision_id),
  UNIQUE (workspace_id, id, design_id, revision_id),
  CONSTRAINT revision_reviews_revision_fk
    FOREIGN KEY (workspace_id, design_id, revision_id)
    REFERENCES design_revisions (workspace_id, design_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT revision_reviews_starter_fk
    FOREIGN KEY (workspace_id, started_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT revision_reviews_updater_fk
    FOREIGN KEY (workspace_id, updated_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT revision_reviews_updated_at_check CHECK (updated_at >= started_at)
);
-- glyphkiln:statement-break

ALTER TABLE render_jobs
  ADD CONSTRAINT render_jobs_approval_revision_key
  UNIQUE (workspace_id, id, design_id, revision_id);
-- glyphkiln:statement-break

CREATE TABLE revision_review_comments (
  id text PRIMARY KEY
    CONSTRAINT revision_review_comments_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  review_id text NOT NULL,
  body text NOT NULL
    CONSTRAINT revision_review_comments_body_check CHECK (
      length(btrim(body)) BETWEEN 1 AND 2000
    ),
  anchor_x numeric,
  anchor_y numeric,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  CONSTRAINT revision_review_comments_review_fk
    FOREIGN KEY (workspace_id, review_id)
    REFERENCES revision_reviews (workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT revision_review_comments_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT revision_review_comments_anchor_pair_check CHECK (
    (anchor_x IS NULL AND anchor_y IS NULL)
    OR (
      anchor_x BETWEEN 0 AND 1
      AND anchor_y BETWEEN 0 AND 1
    )
  )
);
-- glyphkiln:statement-break

CREATE INDEX revision_review_comments_review_idx
  ON revision_review_comments (workspace_id, review_id, created_at, id);
-- glyphkiln:statement-break

CREATE TABLE revision_review_transitions (
  id text PRIMARY KEY
    CONSTRAINT revision_review_transitions_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  review_id text NOT NULL,
  from_state text,
  to_state text NOT NULL,
  reason text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  CONSTRAINT revision_review_transitions_review_fk
    FOREIGN KEY (workspace_id, review_id)
    REFERENCES revision_reviews (workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT revision_review_transitions_from_state_check CHECK (
    from_state IS NULL
    OR from_state IN ('in-review', 'changes-requested', 'approved')
  ),
  CONSTRAINT revision_review_transitions_to_state_check CHECK (
    to_state IN ('in-review', 'changes-requested', 'approved')
  ),
  CONSTRAINT revision_review_transitions_reason_check CHECK (
    reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 1000
  ),
  CONSTRAINT revision_review_transitions_creator_fk
    FOREIGN KEY (workspace_id, created_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT
);
-- glyphkiln:statement-break

CREATE INDEX revision_review_transitions_review_idx
  ON revision_review_transitions (workspace_id, review_id, created_at, id);
-- glyphkiln:statement-break

CREATE TABLE revision_approval_receipts (
  id text PRIMARY KEY
    CONSTRAINT revision_approval_receipts_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  review_id text NOT NULL,
  design_id text NOT NULL,
  revision_id text NOT NULL,
  render_job_id text NOT NULL,
  revision_canonical_hash text NOT NULL
    CONSTRAINT revision_approval_receipts_revision_hash_check CHECK (
      revision_canonical_hash ~ '^[0-9a-f]{64}$'
    ),
  resource_pins jsonb NOT NULL
    CONSTRAINT revision_approval_receipts_resource_pins_array_check CHECK (
      jsonb_typeof(resource_pins) = 'array'
    ),
  output_evidence jsonb NOT NULL
    CONSTRAINT revision_approval_receipts_output_evidence_array_check CHECK (
      jsonb_typeof(output_evidence) = 'array'
      AND jsonb_array_length(output_evidence) BETWEEN 1 AND 2
    ),
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, review_id),
  CONSTRAINT revision_approval_receipts_review_fk
    FOREIGN KEY (workspace_id, review_id, design_id, revision_id)
    REFERENCES revision_reviews (workspace_id, id, design_id, revision_id)
    ON DELETE RESTRICT,
  CONSTRAINT revision_approval_receipts_revision_fk
    FOREIGN KEY (workspace_id, design_id, revision_id)
    REFERENCES design_revisions (workspace_id, design_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT revision_approval_receipts_render_job_fk
    FOREIGN KEY (workspace_id, render_job_id, design_id, revision_id)
    REFERENCES render_jobs (workspace_id, id, design_id, revision_id)
    ON DELETE RESTRICT,
  CONSTRAINT revision_approval_receipts_approver_fk
    FOREIGN KEY (workspace_id, approved_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT
);
-- glyphkiln:statement-break

CREATE TRIGGER revision_review_comments_append_only
  BEFORE UPDATE OR DELETE ON revision_review_comments
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
-- glyphkiln:statement-break

CREATE TRIGGER revision_review_transitions_append_only
  BEFORE UPDATE OR DELETE ON revision_review_transitions
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
-- glyphkiln:statement-break

CREATE TRIGGER revision_approval_receipts_append_only
  BEFORE UPDATE OR DELETE ON revision_approval_receipts
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
