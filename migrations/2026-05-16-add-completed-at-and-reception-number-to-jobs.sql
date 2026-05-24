-- Add completion and reception fields to jobs for local app compatibility
-- Idempotent: safe to run multiple times

BEGIN;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reception_number bigint;

CREATE SEQUENCE IF NOT EXISTS public.job_reception_seq START 1;

CREATE OR REPLACE FUNCTION public.assign_reception_number_to_job(
  p_job_id uuid,
  p_completed_at timestamptz DEFAULT NULL
)
RETURNS TABLE (reception_number bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_reception_number bigint;
BEGIN
  v_reception_number := nextval('public.job_reception_seq');

  UPDATE public.jobs
  SET reception_number = v_reception_number,
      completed_at = COALESCE(p_completed_at, completed_at),
      status = 'completed'
  WHERE id = p_job_id;

  RETURN QUERY SELECT v_reception_number;
END;
$$;

COMMIT;
