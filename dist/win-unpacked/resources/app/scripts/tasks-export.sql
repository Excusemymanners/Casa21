-- tasks-export.sql
-- Use this in Supabase SQL Editor to get a pretty JSON array of all rows in `tasks`.
-- Paste the result or download it from the editor.
--
-- Example (Supabase SQL editor): run this query and copy the `tasks_json` cell value.

-- Pretty JSON output (safe for arrays / nested types)
SELECT json_pretty(json_agg(row_to_json(t))) AS tasks_json
FROM (
  SELECT *
  FROM tasks
) t;

-- -------------------------------------------------------------
-- If you have psql locally and a Postgres connection string, run
-- the following to export a CSV file on your machine. Replace the
-- connection details and output path as needed.
--
-- Example (PowerShell / psql):
-- $env:PGHOST='db.host'
-- $env:PGPORT='5432'
-- $env:PGUSER='postgres'
-- $env:PGPASSWORD='your_password'
-- $env:PGDATABASE='your_db'
-- psql -c "\copy (SELECT id, job_id, name, description, status,
--   COALESCE(array_to_json(assigned_to)::text,'[]') AS assigned_to_json,
--   assigned_to_email,
--   COALESCE(array_to_json(assigned_to_emails)::text,'[]') AS assigned_to_emails_json,
--   estimated_hours, value, created_by, created_at, completed_by, completed_by_email, completed_at, updated_at
-- FROM tasks) TO 'tasks.csv' CSV HEADER"
--
-- Note: Using \copy writes to your local filesystem. The CSV will contain JSON-encoded array fields.

-- -------------------------------------------------------------
-- If you prefer a query that explicitly lists common task columns (edit as needed):
-- SELECT id, job_id, name, description, status,
--        array_to_json(assigned_to)        AS assigned_to,
--        assigned_to_email,
--        array_to_json(assigned_to_emails) AS assigned_to_emails,
--        estimated_hours, value, created_by, created_at, completed_by, completed_by_email, completed_at, updated_at
-- FROM tasks;

-- -------------------------------------------------------------
-- Troubleshooting / tips:
-- - If the Supabase SQL editor returns an error, check your RLS policies and permissions.
-- - If you get empty results, confirm you're connected to the correct database/schema.
-- - If you want only recent rows, add a WHERE clause (e.g. WHERE created_at > now() - interval '30 days').

-- End of file
