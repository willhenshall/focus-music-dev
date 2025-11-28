/*
  # Add session count tracking to user preferences

  1. Changes
    - Add `session_count` column to `user_preferences` table to track number of user sessions
    - Default value is 0
    - Used to show new user onboarding elements for first 5 sessions
  
  2. Purpose
    - Track user sessions to display personalized channel recommendations frame
    - Frame will be shown for first 5 sessions only
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'session_count'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN session_count INTEGER DEFAULT 0;
  END IF;
END $$;