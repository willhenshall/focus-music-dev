/*
  # Create Image Sets System

  1. New Tables
    - `image_sets`
      - `id` (uuid, primary key)
      - `name` (text) - Display name of the image set
      - `description` (text, nullable) - Optional description
      - `is_system` (boolean) - True for admin sets, false for user custom sets
      - `created_by` (uuid, FK to auth.users, nullable) - NULL for system sets, user_id for custom sets
      - `is_active` (boolean) - Whether the set is available for selection
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `image_set_images`
      - `id` (uuid, primary key)
      - `image_set_id` (uuid, FK to image_sets)
      - `channel_id` (uuid, FK to audio_channels)
      - `image_url` (text) - Storage URL for the image
      - `created_at` (timestamptz)
      - Unique constraint on (image_set_id, channel_id)

    - `user_image_preferences`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to auth.users)
      - `selected_image_set_id` (uuid, FK to image_sets, nullable)
      - `slideshow_enabled` (boolean) - Whether slideshow is on in fullscreen
      - `slideshow_duration` (integer) - Seconds per image (default 30)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on user_id

  2. Storage
    - Create `image-sets` bucket for storing image set images

  3. Security
    - Enable RLS on all tables
    - System image sets readable by all authenticated users
    - User custom image sets only readable by creator
    - Only admins can create/modify system image sets
    - Users can create/modify their own custom image sets
*/

-- Create image_sets table
CREATE TABLE IF NOT EXISTS image_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_system boolean DEFAULT false NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create image_set_images table
CREATE TABLE IF NOT EXISTS image_set_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_set_id uuid REFERENCES image_sets(id) ON DELETE CASCADE NOT NULL,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(image_set_id, channel_id)
);

-- Create user_image_preferences table
CREATE TABLE IF NOT EXISTS user_image_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  selected_image_set_id uuid REFERENCES image_sets(id) ON DELETE SET NULL,
  slideshow_enabled boolean DEFAULT false NOT NULL,
  slideshow_duration integer DEFAULT 30 NOT NULL CHECK (slideshow_duration >= 5 AND slideshow_duration <= 300),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Create storage bucket for image sets
INSERT INTO storage.buckets (id, name, public)
VALUES ('image-sets', 'image-sets', true)
ON CONFLICT (id) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_image_sets_system ON image_sets(is_system) WHERE is_system = true;
CREATE INDEX IF NOT EXISTS idx_image_sets_user ON image_sets(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_image_set_images_set ON image_set_images(image_set_id);
CREATE INDEX IF NOT EXISTS idx_image_set_images_channel ON image_set_images(channel_id);
CREATE INDEX IF NOT EXISTS idx_user_image_prefs_user ON user_image_preferences(user_id);

-- Enable RLS
ALTER TABLE image_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_set_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_image_preferences ENABLE ROW LEVEL SECURITY;

-- Policies for image_sets
CREATE POLICY "Anyone can view active system image sets"
  ON image_sets FOR SELECT
  USING (is_system = true AND is_active = true);

CREATE POLICY "Users can view their own custom image sets"
  ON image_sets FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can view all image sets"
  ON image_sets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can create system image sets"
  ON image_sets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can create their own custom image sets"
  ON image_sets FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid() AND is_system = false);

CREATE POLICY "Admins can update system image sets"
  ON image_sets FOR UPDATE
  TO authenticated
  USING (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can update their own custom image sets"
  ON image_sets FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() AND is_system = false)
  WITH CHECK (created_by = auth.uid() AND is_system = false);

CREATE POLICY "Admins can delete system image sets"
  ON image_sets FOR DELETE
  TO authenticated
  USING (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can delete their own custom image sets"
  ON image_sets FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() AND is_system = false);

-- Policies for image_set_images
CREATE POLICY "Anyone can view images from active system sets"
  ON image_set_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.is_system = true
      AND image_sets.is_active = true
    )
  );

CREATE POLICY "Users can view images from their own custom sets"
  ON image_set_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins can view all image set images"
  ON image_set_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can manage system set images"
  ON image_set_images FOR ALL
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
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can manage their custom set images"
  ON image_set_images FOR ALL
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
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = auth.uid()
    )
  );

-- Policies for user_image_preferences
CREATE POLICY "Users can view own image preferences"
  ON user_image_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own image preferences"
  ON user_image_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own image preferences"
  ON user_image_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all image preferences"
  ON user_image_preferences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Storage policies for image-sets bucket
CREATE POLICY "Admins can upload to image-sets bucket"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'image-sets' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Authenticated users can upload to their own folder in image-sets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'image-sets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Anyone can view image-sets bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'image-sets');

CREATE POLICY "Admins can update image-sets bucket"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'image-sets' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    bucket_id = 'image-sets' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can update their own folder in image-sets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'image-sets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'image-sets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Admins can delete from image-sets bucket"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'image-sets' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can delete from their own folder in image-sets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'image-sets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );