/*
  # Fix Image Set Images RLS for Upsert Operations

  ## Problem
  The "Admins can manage system set images" policy uses FOR ALL with both USING and WITH CHECK.
  When doing an upsert operation on a non-existent row, the USING clause fails because it tries
  to join with image_set_images.image_set_id which doesn't exist yet for a new insert.

  ## Solution
  Drop the FOR ALL policy and create separate INSERT, UPDATE, and DELETE policies.
  The INSERT policy only needs WITH CHECK (no USING), which fixes upsert operations.

  ## Changes
  1. Drop the problematic FOR ALL policies
  2. Create separate INSERT, UPDATE, DELETE policies for admins
  3. Create separate INSERT, UPDATE, DELETE policies for users
*/

-- Drop the problematic FOR ALL policies
DROP POLICY IF EXISTS "Admins can manage system set images" ON image_set_images;
DROP POLICY IF EXISTS "Users can manage their custom set images" ON image_set_images;

-- Admin policies for system image sets (separate INSERT, UPDATE, DELETE)
CREATE POLICY "Admins can insert system set images"
  ON image_set_images FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = image_set_id
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update system set images"
  ON image_set_images FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = image_set_id
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete system set images"
  ON image_set_images FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  );

-- User policies for custom image sets (separate INSERT, UPDATE, DELETE)
CREATE POLICY "Users can insert their custom set images"
  ON image_set_images FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_id
      AND image_sets.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update their custom set images"
  ON image_set_images FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_id
      AND image_sets.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete their custom set images"
  ON image_set_images FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = auth.uid()
    )
  );
