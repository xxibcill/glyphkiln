ALTER TABLE campaign_canvases
  ADD COLUMN narrative_role text NOT NULL DEFAULT 'context'
  CONSTRAINT campaign_canvases_narrative_role_check CHECK (
    narrative_role IN ('hook', 'context', 'evidence', 'explanation', 'recap', 'action')
  );
