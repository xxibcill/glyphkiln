ALTER TABLE campaign_canvases
  DROP CONSTRAINT campaign_canvases_composition_variant_check;
-- glyphkiln:statement-break

ALTER TABLE campaign_canvases
  ADD CONSTRAINT campaign_canvases_composition_variant_check CHECK (
    composition_variant_id IN ('focal-editorial', 'organic-photo-editorial')
  );
