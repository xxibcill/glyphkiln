-- Campaign canvases are append-only, so static-ad campaigns cannot be removed
-- here. Refuse the rollback explicitly instead of failing on a CHECK violation.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM campaigns WHERE family_id = 'static-ads')
    OR EXISTS (
      SELECT 1 FROM campaign_canvases WHERE composition_variant_id = 'static-ad'
    ) THEN
    RAISE EXCEPTION 'Cannot roll back 202609250018_static_ad_campaign while static-ad campaigns exist.';
  END IF;
END
$$;
-- glyphkiln:statement-break
ALTER TABLE campaign_canvases DROP CONSTRAINT campaign_canvases_composition_variant_check;
-- glyphkiln:statement-break
ALTER TABLE campaign_canvases ADD CONSTRAINT campaign_canvases_composition_variant_check CHECK (composition_variant_id IN ('focal-editorial', 'organic-photo-editorial'));
-- glyphkiln:statement-break
ALTER TABLE campaigns DROP CONSTRAINT campaigns_family_check;
-- glyphkiln:statement-break
ALTER TABLE campaigns ADD CONSTRAINT campaigns_family_check CHECK (family_id IN ('image-led-campaign'));
