-- tasks-export-supabase.sql
-- Copiază și rulează în Supabase -> SQL editor.
-- Returnează un JSON frumos cu toate rândurile din `tasks` și un SELECT auxiliar
-- care afișează coloane uzuale (array-urile convertite la JSON pentru a vedea structura).

-- 1) Rezultat JSON compact, ușor de copiat (folosește coloană `tasks_json` din rezultat)
SELECT json_pretty(json_agg(row_to_json(t))) AS tasks_json
FROM (
  SELECT *
  FROM tasks
) t;

-- 2) (Opțional) Listează coloanele comune în mod explicit și convertește array-urile la JSON
-- Înlocuiește sau extinde lista de coloane după cum ai nevoie.
SELECT
  id,
  job_id,
  name,
  description,
  status,
  array_to_json(assigned_to)          AS assigned_to_json,
  assigned_to_email,
  array_to_json(assigned_to_emails)  AS assigned_to_emails_json,
  estimated_hours,
  value,
  created_by,
  created_at,
  completed_by,
  completed_by_email,
  completed_at,
  updated_at
FROM tasks
LIMIT 1000; -- scoate LIMIT dacă ai puține rânduri sau vrei toate

-- Sfaturi:
-- - Dacă nu vezi rezultate, verifică RLS (Row Level Security) pentru tabela `tasks`;
--   SQL Editor rulează cu permisiunile superuser ale proiectului, deci ar trebui să vadă tot.
-- - Copiază valoarea din coloana `tasks_json` (va fi un JSON array). Dacă e foarte mare,
--   folosește părți (de exemplu `WHERE created_at > now() - interval '30 days'`).
-- - Dacă vrei CSV local și ai psql: folosește \copy cu query-ul (vezi fișierul `tasks-export.sql`).

-- Dacă rulezi și mi trimiți JSON-ul (sau un fragment), analizez structura și-ți spun ce modificări
-- la schema/frontend sunt necesare (coloane lipsă, tipuri, array vs scalar etc.).
