-- Add total_value column to jobs table used by frontend
-- Idempotent: safe to run multiple times

BEGIN;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS total_value numeric DEFAULT 0;

COMMIT;
