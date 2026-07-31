-- WARNING: This rollback deletes queued jobs, attempt history, and immutable
-- render-output metadata. Content-addressed object bytes must be managed
-- separately according to the operator's retention policy.

DROP TRIGGER render_outputs_append_only ON render_outputs;
-- glyphkiln:statement-break

DROP TRIGGER render_attempts_append_only ON render_attempts;
-- glyphkiln:statement-break

DROP TABLE render_outputs;
-- glyphkiln:statement-break

DROP TABLE render_attempts;
-- glyphkiln:statement-break

DROP TABLE render_jobs;
