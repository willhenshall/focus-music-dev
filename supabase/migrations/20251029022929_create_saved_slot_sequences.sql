/*
  # Create saved slot sequences table

  1. New Tables
    - `saved_slot_sequences`
      - `id` (uuid, primary key) - Unique identifier for each saved sequence
      - `name` (text, not null) - User-provided name for the sequence
      - `description` (text) - Optional description
      - `channel_id` (uuid) - Original channel this was created for (nullable, for reference)
      - `energy_tier` (text) - Original energy tier (low/medium/high)
      - `num_slots` (integer) - Number of slots in the sequence
      - `recent_repeat_window` (integer) - Recent repeat window value
      - `definitions` (jsonb) - Array of slot definitions
      - `rule_groups` (jsonb) - Array of rule groups
      - `playback_continuation` (text) - Playback continuation setting
      - `created_by` (uuid, references auth.users) - Admin who created this
      - `created_at` (timestamptz) - When the sequence was created
      - `updated_at` (timestamptz) - Last update time

  2. Security
    - Enable RLS on `saved_slot_sequences` table
    - Only admins can read, create, update, and delete saved sequences
    - All admins can access all saved sequences (shared admin library)

  3. Indexes
    - Index on created_by for faster queries
    - Index on name for searching
*/

-- Create the saved_slot_sequences table
CREATE TABLE IF NOT EXISTS saved_slot_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  energy_tier text CHECK (energy_tier IN ('low', 'medium', 'high')),
  num_slots integer NOT NULL DEFAULT 20,
  recent_repeat_window integer NOT NULL DEFAULT 5,
  definitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  playback_continuation text DEFAULT 'continue',
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE saved_slot_sequences ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_saved_sequences_created_by ON saved_slot_sequences(created_by);
CREATE INDEX IF NOT EXISTS idx_saved_sequences_name ON saved_slot_sequences(name);
CREATE INDEX IF NOT EXISTS idx_saved_sequences_created_at ON saved_slot_sequences(created_at DESC);

-- RLS Policies: Only admins can access saved sequences
CREATE POLICY "Admins can view all saved sequences"
  ON saved_slot_sequences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can create saved sequences"
  ON saved_slot_sequences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update saved sequences"
  ON saved_slot_sequences FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete saved sequences"
  ON saved_slot_sequences FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_sequences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_saved_sequences_updated_at
  BEFORE UPDATE ON saved_slot_sequences
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_sequences_updated_at();