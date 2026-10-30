-- Responsabil lucrare: un profil (angajat/admin) ales de CEO sau Admin
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS responsible_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_responsible_id_fkey') THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_responsible_id_fkey FOREIGN KEY (responsible_id)
      REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
