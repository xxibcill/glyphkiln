CREATE SEQUENCE render_claim_order_sequence
  AS bigint
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;
-- glyphkiln:statement-break

CREATE TABLE render_workspace_queue_schedules (
  workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  last_claim_order bigint NOT NULL DEFAULT 0
    CONSTRAINT render_workspace_queue_schedules_claim_order_check CHECK (
      last_claim_order >= 0
    )
);
-- glyphkiln:statement-break

INSERT INTO render_workspace_queue_schedules (workspace_id)
SELECT id
  FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;
-- glyphkiln:statement-break

CREATE INDEX render_workspace_queue_schedules_fair_claim_idx
  ON render_workspace_queue_schedules (last_claim_order, workspace_id);
-- glyphkiln:statement-break

CREATE INDEX render_jobs_workspace_outstanding_idx
  ON render_jobs (workspace_id)
  WHERE state IN ('queued', 'retry_wait', 'claimed');
-- glyphkiln:statement-break

CREATE INDEX render_jobs_workspace_claimable_idx
  ON render_jobs (workspace_id, available_at, created_at, id)
  WHERE state IN ('queued', 'retry_wait', 'claimed');
