ALTER TABLE campaigns DROP CONSTRAINT campaigns_family_check;
-- glyphkiln:statement-break
ALTER TABLE campaigns ADD CONSTRAINT campaigns_family_check CHECK (family_id IN ('image-led-campaign', 'static-ads'));
-- glyphkiln:statement-break
ALTER TABLE campaign_canvases DROP CONSTRAINT campaign_canvases_composition_variant_check;
-- glyphkiln:statement-break
ALTER TABLE campaign_canvases ADD CONSTRAINT campaign_canvases_composition_variant_check CHECK (composition_variant_id IN ('focal-editorial', 'organic-photo-editorial', 'static-ad'));
