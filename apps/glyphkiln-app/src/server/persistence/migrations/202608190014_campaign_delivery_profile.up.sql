ALTER TABLE campaign_canvases
  ADD COLUMN delivery_profile_id text;
-- glyphkiln:statement-break

DROP TRIGGER campaign_canvases_append_only ON campaign_canvases;
-- glyphkiln:statement-break

UPDATE campaign_canvases
   SET delivery_profile_id = CASE
     WHEN format_id IN ('instagram-square', 'instagram-portrait')
       THEN 'instagram-native-carousel'
     WHEN format_id = 'tiktok-photo-carousel'
       THEN 'tiktok-organic-photo'
     WHEN format_id = 'tiktok-carousel'
       THEN 'tiktok-carousel-ad'
     ELSE NULL
   END;
-- glyphkiln:statement-break

CREATE TRIGGER campaign_canvases_append_only
  BEFORE UPDATE OR DELETE ON campaign_canvases
  FOR EACH ROW EXECUTE FUNCTION glyphkiln_reject_append_only_change();
-- glyphkiln:statement-break

ALTER TABLE campaign_canvases
  ADD CONSTRAINT campaign_canvases_delivery_profile_check CHECK (
    delivery_profile_id IS NULL
    OR (
      delivery_profile_id IN (
        'instagram-native-carousel',
        'instagram-api-carousel'
      )
      AND format_id IN ('instagram-square', 'instagram-portrait')
    )
    OR (
      delivery_profile_id IN (
        'tiktok-organic-photo',
        'tiktok-content-posting-photo'
      )
      AND format_id = 'tiktok-photo-carousel'
    )
    OR (
      delivery_profile_id = 'tiktok-carousel-ad'
      AND format_id = 'tiktok-carousel'
    )
  );
