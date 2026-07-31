CREATE TABLE render_jobs (
  id text PRIMARY KEY
    CONSTRAINT render_jobs_id_length_check CHECK (length(id) BETWEEN 1 AND 128),
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  design_id text NOT NULL,
  revision_id text NOT NULL,
  requested_by text NOT NULL,
  idempotency_key text NOT NULL
    CONSTRAINT render_jobs_idempotency_key_length_check CHECK (
      length(idempotency_key) BETWEEN 1 AND 160
    ),
  state text NOT NULL DEFAULT 'queued'
    CONSTRAINT render_jobs_state_check CHECK (
      state IN (
        'queued',
        'retry_wait',
        'claimed',
        'completed',
        'failed',
        'exhausted'
      )
    ),
  attempt_count integer NOT NULL DEFAULT 0
    CONSTRAINT render_jobs_attempt_count_check CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3
    CONSTRAINT render_jobs_max_attempts_check CHECK (
      max_attempts BETWEEN 1 AND 10
    ),
  available_at timestamptz NOT NULL,
  manifest_creation_timestamp timestamptz NOT NULL,
  claimed_by text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  last_error_code text
    CONSTRAINT render_jobs_error_code_length_check CHECK (
      last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 120
    ),
  last_error_detail text
    CONSTRAINT render_jobs_error_detail_length_check CHECK (
      last_error_detail IS NULL OR length(last_error_detail) BETWEEN 1 AND 500
    ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  CONSTRAINT render_jobs_revision_fk
    FOREIGN KEY (workspace_id, design_id, revision_id)
    REFERENCES design_revisions (workspace_id, design_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT render_jobs_requester_fk
    FOREIGN KEY (workspace_id, requested_by)
    REFERENCES workspace_memberships (workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT render_jobs_attempt_bound_check CHECK (
    attempt_count <= max_attempts
  ),
  CONSTRAINT render_jobs_available_at_check CHECK (
    available_at >= created_at
  ),
  CONSTRAINT render_jobs_manifest_timestamp_check CHECK (
    manifest_creation_timestamp >= created_at
  ),
  CONSTRAINT render_jobs_updated_at_check CHECK (updated_at >= created_at),
  CONSTRAINT render_jobs_lease_state_check CHECK (
    (
      state = 'claimed'
      AND claimed_by IS NOT NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at > claimed_at
    )
    OR (
      state <> 'claimed'
      AND claimed_by IS NULL
      AND claimed_at IS NULL
      AND lease_expires_at IS NULL
    )
  ),
  CONSTRAINT render_jobs_terminal_state_check CHECK (
    (
      state IN ('completed', 'failed', 'exhausted')
      AND finished_at IS NOT NULL
    )
    OR (
      state NOT IN ('completed', 'failed', 'exhausted')
      AND finished_at IS NULL
    )
  ),
  CONSTRAINT render_jobs_error_pair_check CHECK (
    (last_error_code IS NULL AND last_error_detail IS NULL)
    OR (last_error_code IS NOT NULL AND last_error_detail IS NOT NULL)
  )
);
-- glyphkiln:statement-break

CREATE INDEX render_jobs_claimable_idx
  ON render_jobs (available_at, created_at, id)
  WHERE state IN ('queued', 'retry_wait', 'claimed');
-- glyphkiln:statement-break

CREATE INDEX render_jobs_workspace_created_idx
  ON render_jobs (workspace_id, created_at DESC, id);
-- glyphkiln:statement-break

CREATE TABLE render_attempts (
  workspace_id text NOT NULL,
  job_id text NOT NULL,
  attempt_number integer NOT NULL
    CONSTRAINT render_attempts_number_check CHECK (attempt_number > 0),
  worker_id text NOT NULL
    CONSTRAINT render_attempts_worker_id_length_check CHECK (
      length(worker_id) BETWEEN 1 AND 160
    ),
  outcome text NOT NULL
    CONSTRAINT render_attempts_outcome_check CHECK (
      outcome IN ('completed', 'retry_scheduled', 'failed', 'exhausted', 'abandoned')
    ),
  error_code text
    CONSTRAINT render_attempts_error_code_length_check CHECK (
      error_code IS NULL OR length(error_code) BETWEEN 1 AND 120
    ),
  error_detail text
    CONSTRAINT render_attempts_error_detail_length_check CHECK (
      error_detail IS NULL OR length(error_detail) BETWEEN 1 AND 500
    ),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, job_id, attempt_number),
  CONSTRAINT render_attempts_job_fk
    FOREIGN KEY (workspace_id, job_id)
    REFERENCES render_jobs (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT render_attempts_time_check CHECK (finished_at >= started_at),
  CONSTRAINT render_attempts_error_pair_check CHECK (
    (
      outcome = 'completed'
      AND error_code IS NULL
      AND error_detail IS NULL
    )
    OR (
      outcome <> 'completed'
      AND error_code IS NOT NULL
      AND error_detail IS NOT NULL
    )
  )
);
-- glyphkiln:statement-break

CREATE INDEX render_attempts_job_idx
  ON render_attempts (workspace_id, job_id, attempt_number DESC);
-- glyphkiln:statement-break

CREATE TABLE render_outputs (
  workspace_id text NOT NULL,
  job_id text NOT NULL,
  format text NOT NULL
    CONSTRAINT render_outputs_format_check CHECK (format IN ('svg', 'png')),
  mime_type text NOT NULL,
  artifact_key text NOT NULL
    CONSTRAINT render_outputs_artifact_key_length_check CHECK (
      length(artifact_key) BETWEEN 1 AND 512
    ),
  artifact_sha256 text NOT NULL
    CONSTRAINT render_outputs_artifact_sha256_check CHECK (
      artifact_sha256 ~ '^[0-9a-f]{64}$'
    ),
  artifact_byte_size integer NOT NULL
    CONSTRAINT render_outputs_artifact_byte_size_check CHECK (
      artifact_byte_size > 0
    ),
  manifest_key text NOT NULL
    CONSTRAINT render_outputs_manifest_key_length_check CHECK (
      length(manifest_key) BETWEEN 1 AND 512
    ),
  manifest_sha256 text NOT NULL
    CONSTRAINT render_outputs_manifest_sha256_check CHECK (
      manifest_sha256 ~ '^[0-9a-f]{64}$'
    ),
  manifest_byte_size integer NOT NULL
    CONSTRAINT render_outputs_manifest_byte_size_check CHECK (
      manifest_byte_size > 0
    ),
  fingerprint text NOT NULL
    CONSTRAINT render_outputs_fingerprint_length_check CHECK (
      length(fingerprint) BETWEEN 1 AND 160
    ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, job_id, format),
  CONSTRAINT render_outputs_job_fk
    FOREIGN KEY (workspace_id, job_id)
    REFERENCES render_jobs (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT render_outputs_mime_type_check CHECK (
    (format = 'svg' AND mime_type = 'image/svg+xml')
    OR (format = 'png' AND mime_type = 'image/png')
  )
);
-- glyphkiln:statement-break

CREATE TRIGGER render_attempts_append_only
  BEFORE UPDATE OR DELETE ON render_attempts
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
-- glyphkiln:statement-break

CREATE TRIGGER render_outputs_append_only
  BEFORE UPDATE OR DELETE ON render_outputs
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
