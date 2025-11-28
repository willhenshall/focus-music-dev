/*
  # Add Audio Visibility Preferences

  1. Changes
    - Add `show_audio_diagnostics` column to `user_preferences` table (boolean, default false)
    - Add `show_queue` column to `user_preferences` table (boolean, default true)

  2. Purpose
    - Allows admin users to toggle visibility of Web Audio API diagnostics
    - Allows admin users to toggle visibility of music player queue

  3. Notes
    - Audio diagnostics are hidden by default (admin-only feature)
    - Queue is shown by default (standard functionality)
*/

-- Add show_audio_diagnostics column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_audio_diagnostics'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_audio_diagnostics boolean DEFAULT false;
  END IF;
END $$;

-- Add show_queue column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_queue'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_queue boolean DEFAULT true;
  END IF;
END $$;
