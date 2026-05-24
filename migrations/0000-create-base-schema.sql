-- Base schema to recreate minimal tables expected by the app
-- Idempotent: safe to run multiple times

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  full_name text,
  role text DEFAULT 'employee',
  created_at timestamptz DEFAULT now()
);

-- Jobs (minimal)
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  client_email text,
  client_name text,
  client_id_series text,
  client_cnp text,
  client_address text,
  client_phone text,
  order_number text,
  amount_paid numeric,
  created_by uuid,
  status text DEFAULT 'open',
  completed_at timestamptz,
  reception_number bigint,
  priority text DEFAULT 'normal',
  created_at timestamptz DEFAULT now()
);

-- Tasks (minimal)
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  name text,
  description text,
  status text DEFAULT 'open',
  assigned_to uuid[],
  assigned_to_emails text[],
  assigned_to_emails_text text,
  deadline timestamptz,
  estimated_hours numeric,
  value numeric,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  completed_by uuid,
  completed_by_email text,
  completed_at timestamptz,
  updated_at timestamptz
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_tasks_job_id ON public.tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
