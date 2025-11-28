/*
  # Fix user_profiles INSERT policy for signup

  1. Changes
    - Drop the existing INSERT policy that requires authenticated role
    - Create new INSERT policy that allows users to create their own profile
    - The policy checks that the user_id matches auth.uid() OR allows service_role
  
  2. Security
    - Users can only insert a profile with their own user ID
    - Service role can insert any profile (for admin operations)
    - RLS remains enabled to protect the table
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

-- Create new INSERT policy that works during signup
-- This allows the user to insert their profile when id matches auth.uid()
-- Service role bypasses RLS so it can always insert
CREATE POLICY "Users can insert own profile during signup"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Also ensure service_role can insert (it bypasses RLS by default, but being explicit)
CREATE POLICY "Service role can insert profiles"
  ON user_profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);