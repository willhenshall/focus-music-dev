/*
  # Fix Admin Policies Circular Dependency
  
  1. Problem
    - Current admin policies have circular dependency: they query user_profiles to check is_admin
    - But those queries themselves must pass through RLS policies on user_profiles
    - This causes policy errors and blocks legitimate admin updates
  
  2. Solution
    - Create a SECURITY DEFINER function that bypasses RLS to check admin status
    - Update admin policies to use this function instead of direct subqueries
    - This breaks the circular dependency while maintaining security
  
  3. Security
    - Function uses SECURITY DEFINER to bypass RLS (necessary to break cycle)
    - Function only returns boolean, no data leakage possible
    - Admin status check is still secure and accurate
    - Non-admins still cannot access other users' data
*/

-- Drop existing admin policies that have circular dependency
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;

-- Create a SECURITY DEFINER function to check admin status
-- This bypasses RLS to break the circular dependency
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate admin policies using the function instead of subqueries
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
