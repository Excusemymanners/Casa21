-- Backfill missing employee profiles from existing auth users
-- Idempotent: safe to run multiple times

INSERT INTO public.profiles (email, full_name, role)
SELECT u.email, COALESCE(u.full_name, split_part(u.email, '@', 1)), COALESCE(u.role, 'employee')
FROM public.users u
LEFT JOIN public.profiles p ON p.email = u.email
WHERE p.id IS NULL;
