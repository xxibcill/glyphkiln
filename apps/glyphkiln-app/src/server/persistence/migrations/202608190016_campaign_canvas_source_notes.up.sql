ALTER TABLE campaign_canvases
  ADD COLUMN source_notes jsonb NOT NULL DEFAULT '[]'::jsonb
  CONSTRAINT campaign_canvases_source_notes_check CHECK (
    jsonb_typeof(source_notes) = 'array'
    AND jsonb_array_length(source_notes) <= 32
    AND octet_length(source_notes::text) <= 90000
  );
