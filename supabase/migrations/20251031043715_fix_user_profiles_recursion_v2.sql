/*
  # Fix infinite recursion in user_profiles RLS policies (v2)

  ## Problem
  The admin check policies cause infinite recursion because they query user_profiles 
  within user_profiles policies.
  
  ## Solution
  Create a security definer function that bypasses RLS to check admin status,
  then use this function in the policies.
  
  ## Changes
  1. Create a security definer function to check admin status
  2. Recreate policies using this function
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;

-- Create security definer function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM user_profiles 
    WHERE id = auth.uid() 
    AND is_admin = true
  );
END;
$$;

-- Create new SELECT policy
CREATE POLICY "Users can view own profile or all if admin"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR is_admin());

-- Create new UPDATE policy for own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());
