-- Rulează în Supabase SQL Editor sau local psql
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Valori posibile: 'cadastru_sporadic', 'cadastru_sistematic', 'topografie', 'administrativ', NULL (general)
