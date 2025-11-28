/*
  # Add Session Timer Preferences

  1. Changes
    - Add `session_timer_duration` column to user_preferences table
      - Stores the last used timer duration in seconds
      - Default value: 1800 (30 minutes)
    - Add `session_timer_enabled` column to user_preferences table
      - Tracks whether the user has an active timer set
      - Default value: false

  2. Notes
    - Users can set custom timer durations for their focus sessions
    - Timer state persists across sessions for convenience
    - Duration stored in seconds for precision
*/

-- Add session timer duration preference (in seconds, default 30 minutes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'session_timer_duration'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN session_timer_duration integer DEFAULT 1800;
  END IF;
END $$;

-- Add session timer enabled flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'session_timer_enabled'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN session_timer_enabled boolean DEFAULT false;
  END IF;
END $$;