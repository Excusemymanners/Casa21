-- Add client identity fields to jobs for the local app schema
-- Idempotent: safe to run multiple times

BEGIN;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS client_id_series text,
  ADD COLUMN IF NOT EXISTS client_cnp text,
  ADD COLUMN IF NOT EXISTS client_address text;

COMMIT;
