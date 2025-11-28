/*
  # Add Admin DELETE Policy for Channels

  1. Changes
    - Add DELETE policy for admins to delete channels

  2. Purpose
    - Allows admin users to delete audio channels
    - INSERT and UPDATE policies already exist, DELETE was missing

  3. Security
    - Policy checks that user is authenticated and has is_admin = true
    - Uses existing is_admin() helper function
*/

-- Policy for admins to delete channels
CREATE POLICY "Admins can delete channels"
  ON audio_channels FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));