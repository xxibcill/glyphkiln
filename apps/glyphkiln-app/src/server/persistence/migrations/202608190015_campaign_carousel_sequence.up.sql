ALTER TABLE campaign_canvases
  ADD COLUMN carousel_sequence_key text
  CONSTRAINT campaign_canvases_carousel_sequence_key_check CHECK (
    carousel_sequence_key IS NULL
    OR (
      length(carousel_sequence_key) BETWEEN 1 AND 120
      AND carousel_sequence_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]*$'
    )
  );
-- glyphkiln:statement-break

CREATE INDEX campaign_canvases_carousel_sequence_idx
  ON campaign_canvases (
    workspace_id,
    campaign_id,
    direction_id,
    carousel_sequence_key,
    ordinal,
    id
  )
  WHERE carousel_sequence_key IS NOT NULL;
