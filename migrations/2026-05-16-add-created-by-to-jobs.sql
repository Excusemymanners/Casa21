-- Add created_by column to jobs for local app compatibility
-- Idempotent: safe to run multiple times

BEGIN;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS created_by uuid;

COMMIT;
