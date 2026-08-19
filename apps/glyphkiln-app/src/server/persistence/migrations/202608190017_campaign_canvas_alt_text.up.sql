ALTER TABLE campaign_canvases
  ADD COLUMN publisher_alt_text text
  CONSTRAINT campaign_canvases_publisher_alt_text_check CHECK (
    publisher_alt_text IS NULL
    OR length(btrim(publisher_alt_text)) BETWEEN 1 AND 2000
  );
