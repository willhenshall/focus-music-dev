/*
  # Fix Saved Sequences RLS for Duplicate Function

  1. Changes
    - Drop existing RLS policies on saved_slot_sequences
    - Create new policies that avoid circular dependency issues
    - Use security definer function for admin check to improve performance
  
  2. Security
    - Only admins can create, read, update, and delete saved sequences
    - Uses optimized admin check function
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can create saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can update saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can delete saved sequences" ON saved_slot_sequences;

-- Create helper function for admin check (if not exists)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create new policies with simplified checks
CREATE POLICY "Admins can view all saved sequences"
  ON saved_slot_sequences
  FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can create saved sequences"
  ON saved_slot_sequences
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update saved sequences"
  ON saved_slot_sequences
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete saved sequences"
  ON saved_slot_sequences
  FOR DELETE
  TO authenticated
  USING (is_admin());
