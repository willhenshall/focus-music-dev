/*
  # Fix saved_slot_sequences RLS policies for NULL admin values

  1. Changes
    - Update RLS policies to explicitly check for is_admin = true
    - Handle cases where is_admin might be NULL
    - Ensure only users with is_admin explicitly set to true can access sequences

  2. Security
    - More strict checking to ensure NULL is treated as false
    - Only explicitly marked admins can access saved sequences
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can create saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can update saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can delete saved sequences" ON saved_slot_sequences;

-- Recreate policies with explicit NULL handling
CREATE POLICY "Admins can view all saved sequences"
  ON saved_slot_sequences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin IS TRUE
    )
  );

CREATE POLICY "Admins can create saved sequences"
  ON saved_slot_sequences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin IS TRUE
    )
  );

CREATE POLICY "Admins can update saved sequences"
  ON saved_slot_sequences FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin IS TRUE
    )
  );

CREATE POLICY "Admins can delete saved sequences"
  ON saved_slot_sequences FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin IS TRUE
    )
  );