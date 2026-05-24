-- Create users table for Neon-based auth
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text,
  role text DEFAULT 'employee',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
