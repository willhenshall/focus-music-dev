/*
  # Add Channel Intensity and User Custom Ordering

  1. Changes to `audio_channels` table
    - Add `intensity` column (text: 'low', 'medium', 'high') for admin-defined intensity classification
    - Add index for intensity filtering

  2. New Table: `user_channel_order`
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users)
    - `channel_id` (uuid, references audio_channels)
    - `sort_order` (integer) - user's custom position for this channel
    - `created_at` (timestamp)
    - `updated_at` (timestamp)
    - Unique constraint on (user_id, channel_id)

  3. Security
    - Enable RLS on `user_channel_order`
    - Users can read/write their own channel order
    - Admins can view all channel orders
*/

-- Add intensity to audio_channels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'intensity'
  ) THEN
    ALTER TABLE audio_channels
    ADD COLUMN intensity text DEFAULT 'medium' CHECK (intensity IN ('low', 'medium', 'high'));
  END IF;
END $$;

-- Create index for intensity filtering
CREATE INDEX IF NOT EXISTS idx_audio_channels_intensity ON audio_channels(intensity);

-- Create user_channel_order table
CREATE TABLE IF NOT EXISTS user_channel_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES audio_channels(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, channel_id)
);

-- Enable RLS
ALTER TABLE user_channel_order ENABLE ROW LEVEL SECURITY;

-- Users can read their own channel order
CREATE POLICY "Users can read own channel order"
  ON user_channel_order
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own channel order
CREATE POLICY "Users can insert own channel order"
  ON user_channel_order
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own channel order
CREATE POLICY "Users can update own channel order"
  ON user_channel_order
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own channel order
CREATE POLICY "Users can delete own channel order"
  ON user_channel_order
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all channel orders
CREATE POLICY "Admins can view all channel orders"
  ON user_channel_order
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_channel_order_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_user_channel_order_updated_at_trigger ON user_channel_order;
CREATE TRIGGER update_user_channel_order_updated_at_trigger
  BEFORE UPDATE ON user_channel_order
  FOR EACH ROW
  EXECUTE FUNCTION update_user_channel_order_updated_at();
