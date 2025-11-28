/*
  # Add Admin Policies for User Profiles

  1. Changes
    - Add policy allowing admins to view all user profiles
    - Add policy allowing admins to update all user profiles (including is_admin flag)
  
  2. Security
    - Policies check that the current user has is_admin = true
    - Non-admin users can still only access their own profiles via existing policies
    - Admins get full read/write access to manage users
*/

-- Policy for admins to view all user profiles
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Policy for admins to update any user profile
CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
