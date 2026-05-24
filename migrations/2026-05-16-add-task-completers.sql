-- Add JSONB `completers` to tasks to track multiple completers and their shares
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='completers') THEN
    ALTER TABLE public.tasks ADD COLUMN completers jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Backfill from legacy completed_by / completed_by_email if present
DO $$ BEGIN
  IF (SELECT to_regclass('public.tasks')) IS NOT NULL THEN
    UPDATE public.tasks
    SET completers = jsonb_build_array(jsonb_build_object('id', completed_by::text, 'email', completed_by_email, 'completed_at', to_char(completed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
    WHERE (completers = '[]'::jsonb OR completers IS NULL) AND completed_by IS NOT NULL;
  END IF;
END $$;
