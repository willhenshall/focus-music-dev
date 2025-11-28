/*
  # Create User Preferences Table

  1. New Tables
    - `user_preferences`
      - `id` (uuid, primary key) - Unique identifier for the preference record
      - `user_id` (uuid, foreign key) - References the user in auth.users
      - `last_channel_id` (uuid, foreign key) - References the last channel the user listened to
      - `created_at` (timestamptz) - When the preference was first created
      - `updated_at` (timestamptz) - When the preference was last updated

  2. Security
    - Enable RLS on `user_preferences` table
    - Add policies for users to read and update their own preferences

  3. Notes
    - This table stores user-specific preferences like their last listened channel
    - Users can only access their own preference records
*/

-- Create the user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own preferences
CREATE POLICY "Users can read own preferences"
  ON user_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON user_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create an index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the function before each update
CREATE TRIGGER trigger_update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();
