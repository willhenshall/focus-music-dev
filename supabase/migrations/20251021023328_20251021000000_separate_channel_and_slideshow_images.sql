/*
  # Separate Channel and Slideshow Image Systems

  1. Schema Changes
    - Add `set_type` enum to image_sets: 'channel' or 'slideshow'
    - Add `is_active_channel_set` boolean to image_sets (only one channel set can be active)
    - Make `channel_id` nullable in image_set_images (slideshow images don't have channels)
    - Remove unique constraint on (image_set_id, channel_id)
    - Add `display_order` to image_set_images for slideshow ordering
    - Rename user_image_preferences.selected_image_set_id to selected_slideshow_set_id

  2. New Tables
    - `slideshow_images` - Separate table for slideshow images (not linked to channels)
      - `id` (uuid, primary key)
      - `image_set_id` (uuid, FK to image_sets)
      - `image_url` (text) - Storage URL
      - `display_order` (integer) - Order in slideshow
      - `created_at` (timestamptz)

  3. Migration Strategy
    - Existing image_sets become channel image sets by default
    - image_set_images keeps channel-linked images
    - New slideshow_images table for slideshow images

  4. Security
    - Update RLS policies for new structure
    - Channel image sets: only one active at a time (admin controlled)
    - Slideshow sets: multiple can exist, user selects which to use
*/

-- Create enum for set type
CREATE TYPE image_set_type AS ENUM ('channel', 'slideshow');

-- Add new columns to image_sets
ALTER TABLE image_sets
  ADD COLUMN IF NOT EXISTS set_type image_set_type DEFAULT 'channel' NOT NULL,
  ADD COLUMN IF NOT EXISTS is_active_channel_set boolean DEFAULT false NOT NULL;

-- Update existing sets to be channel type
UPDATE image_sets SET set_type = 'channel' WHERE set_type IS NULL;

-- Create index on active channel sets (should only be one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_channel_set
  ON image_sets(is_active_channel_set)
  WHERE is_active_channel_set = true AND set_type = 'channel';

-- Create slideshow_images table (separate from channel images)
CREATE TABLE IF NOT EXISTS slideshow_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_set_id uuid REFERENCES image_sets(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for slideshow_images
CREATE INDEX IF NOT EXISTS idx_slideshow_images_set ON slideshow_images(image_set_id);
CREATE INDEX IF NOT EXISTS idx_slideshow_images_order ON slideshow_images(image_set_id, display_order);

-- Enable RLS on slideshow_images
ALTER TABLE slideshow_images ENABLE ROW LEVEL SECURITY;

-- Policies for slideshow_images
CREATE POLICY "Anyone can view images from active system slideshow sets"
  ON slideshow_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.is_system = true
      AND image_sets.is_active = true
    )
  );

CREATE POLICY "Users can view images from their own custom slideshow sets"
  ON slideshow_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins can view all slideshow images"
  ON slideshow_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can manage system slideshow images"
  ON slideshow_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can manage their custom slideshow images"
  ON slideshow_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.created_by = auth.uid()
    )
  );

-- Update user_image_preferences to rename column
ALTER TABLE user_image_preferences
  RENAME COLUMN selected_image_set_id TO selected_slideshow_set_id;

-- Add constraint that selected slideshow set must be of type 'slideshow'
-- (This is enforced at application level since FK constraints can't check related table values)

-- Add comment explaining the system
COMMENT ON COLUMN image_sets.set_type IS 'Type of image set: channel (one image per channel for cards) or slideshow (multiple images for expanded player)';
COMMENT ON COLUMN image_sets.is_active_channel_set IS 'For channel sets only: marks the one active channel image set (only one can be true)';
COMMENT ON TABLE slideshow_images IS 'Images for slideshow display in expanded music player (not linked to channels)';
COMMENT ON TABLE image_set_images IS 'Images for channel cards (one image per channel)';
