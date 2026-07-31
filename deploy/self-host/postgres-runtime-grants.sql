\set ON_ERROR_STOP on

GRANT CONNECT ON DATABASE glyphkiln TO glyphkiln_runtime;
GRANT USAGE ON SCHEMA public TO glyphkiln_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO glyphkiln_runtime;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public
  TO glyphkiln_runtime;

GRANT CONNECT ON DATABASE glyphkiln TO glyphkiln_worker;
GRANT USAGE ON SCHEMA public TO glyphkiln_worker;
GRANT SELECT
  ON schema_migrations,
     design_revision_resources,
     render_jobs,
     render_workspace_queue_schedules,
     resource_versions
  TO glyphkiln_worker;
GRANT SELECT (id, disabled_at)
  ON users
  TO glyphkiln_worker;
GRANT SELECT (id, archived_at)
  ON workspaces
  TO glyphkiln_worker;
GRANT SELECT (workspace_id, user_id, role, revoked_at)
  ON workspace_memberships
  TO glyphkiln_worker;
GRANT SELECT (workspace_id, id, archived_at)
  ON designs
  TO glyphkiln_worker;
GRANT SELECT (
    workspace_id,
    design_id,
    id,
    brand_snapshot_id,
    design_document,
    canonical_hash
  )
  ON design_revisions
  TO glyphkiln_worker;
GRANT SELECT (workspace_id, id, snapshot, canonical_hash)
  ON brand_snapshots
  TO glyphkiln_worker;
GRANT UPDATE (
    state,
    attempt_count,
    available_at,
    claimed_by,
    claimed_at,
    lease_expires_at,
    last_error_code,
    last_error_detail,
    updated_at,
    finished_at
  )
  ON render_jobs
  TO glyphkiln_worker;
GRANT UPDATE (last_claim_order)
  ON render_workspace_queue_schedules
  TO glyphkiln_worker;
GRANT USAGE, SELECT
  ON SEQUENCE render_claim_order_sequence
  TO glyphkiln_worker;
GRANT INSERT
  ON render_attempts, render_outputs
  TO glyphkiln_worker;
