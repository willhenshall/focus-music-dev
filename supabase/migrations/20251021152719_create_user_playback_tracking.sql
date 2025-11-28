/*
  # Create User Playback Tracking System

  1. New Tables
    - `user_playback_state`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `channel_id` (uuid, references audio_channels)
      - `energy_level` (text: 'low', 'medium', 'high')
      - `last_track_id` (text)
      - `last_position` (integer) - position in playlist
      - `session_id` (uuid) - unique per session
      - `updated_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Strategy Configuration
    - Add `playback_continuation` field to playlist_strategy
      - Options: 'restart_login', 'restart_session', 'continue'

  3. Security
    - Enable RLS on `user_playback_state` table
    - Users can only read/write their own playback state

  4. Indexes
    - Index on (user_id, channel_id, energy_level) for fast lookups
*/

-- Create user_playback_state table
CREATE TABLE IF NOT EXISTS user_playback_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE CASCADE NOT NULL,
  energy_level text NOT NULL CHECK (energy_level IN ('low', 'medium', 'high')),
  last_track_id text NOT NULL,
  last_position integer NOT NULL DEFAULT 0,
  session_id uuid NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, channel_id, energy_level)
);

-- Enable RLS
ALTER TABLE user_playback_state ENABLE ROW LEVEL SECURITY;

-- Users can read their own playback state
CREATE POLICY "Users can read own playback state"
  ON user_playback_state
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own playback state
CREATE POLICY "Users can insert own playback state"
  ON user_playback_state
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own playback state
CREATE POLICY "Users can update own playback state"
  ON user_playback_state
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own playback state
CREATE POLICY "Users can delete own playback state"
  ON user_playback_state
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_playback_state_lookup 
  ON user_playback_state(user_id, channel_id, energy_level);

-- Add playback_continuation to audio_channels playlist_strategy
-- This updates the existing jsonb structure to include continuation settings
DO $$
BEGIN
  -- The playlist_strategy field already exists as jsonb
  -- We'll add continuation settings when channels are updated through the UI
  -- No schema changes needed as jsonb is flexible
END $$;