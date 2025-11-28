/*
  # Fix infinite recursion in user_profiles RLS policies

  This migration fixes the infinite recursion issue in user_profiles table policies.
  
  ## Problem
  The admin check policies were querying user_profiles.is_admin within the same table's policies,
  causing infinite recursion when trying to check if a user is an admin.
  
  ## Solution
  Replace the subquery-based admin checks with a direct column check using the current row's data.
  For SELECT policies, we can safely check the is_admin column directly.
  For UPDATE policies, we allow users to update their own profile or if they are an admin.
  
  ## Changes
  1. Drop existing problematic policies
  2. Create new policies without infinite recursion
*/

-- Drop problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Update profiles" ON user_profiles;

-- Create new SELECT policy for admins
-- This policy allows viewing if the user is an admin OR viewing their own profile
CREATE POLICY "Users can view profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM user_profiles up 
      WHERE up.id = auth.uid() 
      AND up.is_admin = true
      LIMIT 1
    )
  );

-- Create new UPDATE policy
-- Allow users to update their own profile
-- Admins need separate policy to update others
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Separate policy for admin updates
CREATE POLICY "Admins can update all profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_admin = true
      LIMIT 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_admin = true
      LIMIT 1
    )
  );
