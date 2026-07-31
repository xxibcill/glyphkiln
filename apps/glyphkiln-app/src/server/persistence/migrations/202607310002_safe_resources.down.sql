-- WARNING: This rollback deletes admitted resource metadata and ingestion
-- history. Content-addressed blobs are retained for operator-led cleanup.

DROP TRIGGER resource_ingestions_append_only ON resource_ingestions;
-- glyphkiln:statement-break

DROP TRIGGER resource_versions_append_only ON resource_versions;
-- glyphkiln:statement-break

DROP TABLE resource_ingestions;
-- glyphkiln:statement-break

DROP TABLE resource_versions;
