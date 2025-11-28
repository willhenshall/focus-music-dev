/*
  # Add INSERT policy to system_preferences

  1. Changes
    - Adds INSERT policy for admins to system_preferences table
    - This allows admins to use upsert operations which require both INSERT and UPDATE permissions

  2. Security
    - Only admins can insert new rows
    - Maintains existing UPDATE and SELECT policies
*/

-- Add INSERT policy for admins
CREATE POLICY "Admins can insert system preferences"
  ON system_preferences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );
