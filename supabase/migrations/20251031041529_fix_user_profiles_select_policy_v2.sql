/*
  # Fix User Profiles SELECT Policy
  
  1. Security Fix
    - Drop the broken "View profiles" policy that checks `is_admin = true` on the target profile
    - Create a correct policy that allows users to view their own profile
    - Create a separate policy for admins to view all profiles
  
  This fixes the authentication bug where users cannot view their own profiles and get logged out.
*/

-- Drop the broken policy
DROP POLICY IF EXISTS "View profiles" ON user_profiles;

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
