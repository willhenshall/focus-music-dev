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