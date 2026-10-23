-- One-off: credits files uploaded before `uploaded_by` existed, from the audit log.
-- Not a migration, and deliberately outside migrations/: it is data, it is
-- best-effort, and it is safe to run again (it only fills NULLs). See
-- docs/deployment.md, "Backfilling uploaders".
--
--   bunx wrangler d1 execute DB --local --json --file=src/lib/server/db/backfill-uploaded-by.sql
--   bunx wrangler d1 execute DB --remote --file=src/lib/server/db/backfill-uploaded-by.sql
--
-- A file is matched to the newest `upload_file` row whose olympiad, year and
-- `detail` text name it. `uploadFile` has written `detail` in this exact form
-- since the log was added; keep the two in step if this is ever run again.
-- The newest row wins, so a file deleted and uploaded again is credited to the
-- second uploader. Files with no matching row (older than the log, imported by
-- SQL, or uploaded by a since-deleted account) stay NULL and count for nobody.
--
-- `latest` is computed once per statement, so `activity_log`, which has no
-- index, is scanned once rather than once per file.

WITH latest AS (
	SELECT olympiad_id, year, detail, user_id
	FROM activity_log
	WHERE id IN (
		SELECT max(id) FROM activity_log
		WHERE action = 'upload_file'
		GROUP BY olympiad_id, year, detail
	)
)
UPDATE year_files
SET uploaded_by = latest.user_id
FROM years, latest
WHERE years.id = year_files.year_id
	AND latest.olympiad_id = years.olympiad_id
	AND latest.year = years.year
	AND latest.detail = 'Uploaded "' || year_files.label || '" for year'
	AND year_files.uploaded_by IS NULL;

WITH latest AS (
	SELECT olympiad_id, year, detail, user_id
	FROM activity_log
	WHERE id IN (
		SELECT max(id) FROM activity_log
		WHERE action = 'upload_file'
		GROUP BY olympiad_id, year, detail
	)
)
UPDATE problem_files
SET uploaded_by = latest.user_id
FROM problems, years, latest
WHERE problems.id = problem_files.problem_id
	AND years.id = problems.year_id
	AND latest.olympiad_id = years.olympiad_id
	AND latest.year = years.year
	AND latest.detail = 'Uploaded "' || problem_files.label || '" for problem ' || problems.number
	AND problem_files.uploaded_by IS NULL;
