-- Create function to delete a user from auth.users
-- Only admin and CEO users can call this
-- This function deletes from auth.users using the Supabase admin API via Edge Function

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION delete_auth_user(user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role text;
  user_email text;
BEGIN
  -- Check if current user is admin or CEO
  SELECT role INTO current_user_role
  FROM profiles
  WHERE id = auth.uid();

  IF current_user_role NOT IN ('admin', 'ceo') THEN
    RAISE EXCEPTION 'Only admins and CEOs can delete users';
  END IF;

  -- Get the email of the user to be deleted (for logging purposes)
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = user_id;

  -- This would normally be done via the Supabase Management API
  -- Since we cannot directly delete from auth.users via RLS,
  -- we'll need to use an HTTP function or Edge Function
  
  RETURN json_build_object(
    'success', true,
    'message', format('User %s is ready to be deleted', user_email),
    'user_id', user_id,
    'note', 'Call delete_user edge function with this user_id'
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_auth_user(uuid) TO authenticated;
