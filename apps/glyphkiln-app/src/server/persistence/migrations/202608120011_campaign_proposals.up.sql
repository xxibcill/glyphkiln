ALTER TABLE campaign_canvases
  ADD CONSTRAINT campaign_canvases_proposal_scope_key
  UNIQUE (
    workspace_id,
    campaign_id,
    direction_id,
    id,
    design_id,
    revision_id
  );
-- glyphkiln:statement-break

CREATE TABLE campaign_proposal_runs (
  id text PRIMARY KEY
    CONSTRAINT campaign_proposal_runs_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  direction_id text NOT NULL,
  base_canvas_id text NOT NULL,
  base_design_id text NOT NULL,
  base_revision_id text NOT NULL,
  provider_id text NOT NULL
    CONSTRAINT campaign_proposal_runs_provider_check CHECK (
      length(provider_id) BETWEEN 1 AND 128
      AND provider_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]*$'
    ),
  model_id text NOT NULL
    CONSTRAINT campaign_proposal_runs_model_check CHECK (
      length(model_id) BETWEEN 1 AND 128
      AND model_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]*$'
    ),
  retention_disclosure text NOT NULL
    CONSTRAINT campaign_proposal_runs_retention_check CHECK (
      length(btrim(retention_disclosure)) BETWEEN 1 AND 500
    ),
  input_hash text NOT NULL
    CONSTRAINT campaign_proposal_runs_input_hash_check CHECK (
      input_hash ~ '^[0-9a-f]{64}$'
    ),
  response_hash text NOT NULL
    CONSTRAINT campaign_proposal_runs_response_hash_check CHECK (
      response_hash ~ '^[0-9a-f]{64}$'
    ),
  locks jsonb NOT NULL
    CONSTRAINT campaign_proposal_runs_locks_array_check CHECK (
      jsonb_typeof(locks) = 'array'
      AND jsonb_array_length(locks) BETWEEN 0 AND 6
    ),
  validation jsonb NOT NULL
    CONSTRAINT campaign_proposal_runs_validation_object_check CHECK (
      jsonb_typeof(validation) = 'object'
    ),
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  CONSTRAINT campaign_proposal_runs_direction_fk
    FOREIGN KEY (workspace_id, campaign_id, direction_id)
    REFERENCES campaign_directions (workspace_id, campaign_id, id)
    ON DELETE CASCADE,
  CONSTRAINT campaign_proposal_runs_canvas_fk
    FOREIGN KEY (
      workspace_id,
      campaign_id,
      direction_id,
      base_canvas_id,
      base_design_id,
      base_revision_id
    )
    REFERENCES campaign_canvases (
      workspace_id,
      campaign_id,
      direction_id,
      id,
      design_id,
      revision_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT campaign_proposal_runs_revision_fk
    FOREIGN KEY (workspace_id, base_design_id, base_revision_id)
    REFERENCES design_revisions (workspace_id, design_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT campaign_proposal_runs_requester_fk
    FOREIGN KEY (workspace_id, requested_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT
);
-- glyphkiln:statement-break

CREATE INDEX campaign_proposal_runs_direction_idx
  ON campaign_proposal_runs (
    workspace_id,
    campaign_id,
    direction_id,
    created_at DESC,
    id
  );
-- glyphkiln:statement-break

CREATE TABLE campaign_proposal_candidates (
  id text PRIMARY KEY
    CONSTRAINT campaign_proposal_candidates_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id text NOT NULL,
  candidate_index integer NOT NULL
    CONSTRAINT campaign_proposal_candidates_index_check CHECK (
      candidate_index BETWEEN 0 AND 3
    ),
  status text NOT NULL
    CONSTRAINT campaign_proposal_candidates_status_check CHECK (
      status IN ('proved', 'rejected')
    ),
  design_document jsonb,
  canonical_hash text
    CONSTRAINT campaign_proposal_candidates_hash_check CHECK (
      canonical_hash IS NULL OR canonical_hash ~ '^[0-9a-f]{64}$'
    ),
  rationale text
    CONSTRAINT campaign_proposal_candidates_rationale_check CHECK (
      rationale IS NULL OR length(btrim(rationale)) BETWEEN 1 AND 1000
    ),
  validation jsonb NOT NULL
    CONSTRAINT campaign_proposal_candidates_validation_object_check CHECK (
      jsonb_typeof(validation) = 'object'
    ),
  proof jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, run_id, id),
  UNIQUE (workspace_id, run_id, candidate_index),
  CONSTRAINT campaign_proposal_candidates_run_fk
    FOREIGN KEY (workspace_id, run_id)
    REFERENCES campaign_proposal_runs (workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT campaign_proposal_candidates_status_payload_check CHECK (
    (
      status = 'proved'
      AND design_document IS NOT NULL
      AND canonical_hash IS NOT NULL
      AND rationale IS NOT NULL
      AND proof IS NOT NULL
      AND jsonb_typeof(proof) = 'object'
    )
    OR (
      status = 'rejected'
      AND proof IS NULL
    )
  )
);
-- glyphkiln:statement-break

CREATE TABLE campaign_proposal_decisions (
  id text PRIMARY KEY
    CONSTRAINT campaign_proposal_decisions_id_length_check CHECK (
      length(id) BETWEEN 1 AND 128
    ),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id text NOT NULL,
  candidate_id text NOT NULL,
  decision text NOT NULL
    CONSTRAINT campaign_proposal_decisions_decision_check CHECK (
      decision IN ('accepted', 'rejected')
    ),
  reason text
    CONSTRAINT campaign_proposal_decisions_reason_check CHECK (
      reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 1000
    ),
  design_id text,
  revision_id text,
  decided_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, candidate_id),
  CONSTRAINT campaign_proposal_decisions_candidate_fk
    FOREIGN KEY (workspace_id, run_id, candidate_id)
    REFERENCES campaign_proposal_candidates (workspace_id, run_id, id)
    ON DELETE CASCADE,
  CONSTRAINT campaign_proposal_decisions_revision_fk
    FOREIGN KEY (workspace_id, design_id, revision_id)
    REFERENCES design_revisions (workspace_id, design_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT campaign_proposal_decisions_actor_fk
    FOREIGN KEY (workspace_id, decided_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT campaign_proposal_decisions_result_check CHECK (
    (decision = 'accepted' AND design_id IS NOT NULL AND revision_id IS NOT NULL)
    OR (decision = 'rejected' AND design_id IS NULL AND revision_id IS NULL)
  )
);
-- glyphkiln:statement-break

CREATE TRIGGER campaign_proposal_runs_append_only
  BEFORE UPDATE OR DELETE ON campaign_proposal_runs
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
-- glyphkiln:statement-break

CREATE TRIGGER campaign_proposal_candidates_append_only
  BEFORE UPDATE OR DELETE ON campaign_proposal_candidates
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
-- glyphkiln:statement-break

CREATE TRIGGER campaign_proposal_decisions_append_only
  BEFORE UPDATE OR DELETE ON campaign_proposal_decisions
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
