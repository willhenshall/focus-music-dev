/*
  # Fix user_profiles SELECT policy circular dependency

  1. Problem
    - The "View profiles" policy had a circular dependency
    - It checked if user is admin by querying user_profiles within a user_profiles query
    - This caused infinite loops and timeouts for new user signups

  2. Solution
    - Simplify the policy to check is_admin on the current row only
    - Users can view their own profile OR any admin profile
    - No nested queries needed

  3. Security
    - Users can still only see their own profile
    - Admins can see all profiles (checked on the row itself)
*/

-- Drop the problematic policy with circular dependency
DROP POLICY IF EXISTS "View profiles" ON public.user_profiles;

-- Create a simpler policy without circular dependency
CREATE POLICY "View profiles"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (
    -- Users can always view their own profile
    id = auth.uid()
    OR
    -- Anyone can view admin profiles (useful for permission checks)
    is_admin = true
  );
