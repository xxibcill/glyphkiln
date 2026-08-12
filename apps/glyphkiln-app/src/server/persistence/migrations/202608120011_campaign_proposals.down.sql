DROP TRIGGER campaign_proposal_decisions_append_only
  ON campaign_proposal_decisions;
-- glyphkiln:statement-break

DROP TRIGGER campaign_proposal_candidates_append_only
  ON campaign_proposal_candidates;
-- glyphkiln:statement-break

DROP TRIGGER campaign_proposal_runs_append_only
  ON campaign_proposal_runs;
-- glyphkiln:statement-break

DROP TABLE campaign_proposal_decisions;
-- glyphkiln:statement-break

DROP TABLE campaign_proposal_candidates;
-- glyphkiln:statement-break

DROP TABLE campaign_proposal_runs;
-- glyphkiln:statement-break

ALTER TABLE campaign_canvases
  DROP CONSTRAINT campaign_canvases_proposal_scope_key;
