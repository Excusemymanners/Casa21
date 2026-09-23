-- Rulează în Supabase SQL Editor sau local psql
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT NULL;
ALTER TABLE public.jobs  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT NULL;
