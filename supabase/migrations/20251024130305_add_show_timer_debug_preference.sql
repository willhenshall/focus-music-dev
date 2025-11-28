/*
  # Add Timer Debug Toggle for Admin Users

  1. Changes
    - Add `show_timer_debug` boolean column to `user_preferences` table
    - Default to `false` for all users
    - Allows admin users to toggle timer debug overlay visibility

  2. Notes
    - Only visible to admin users in the AudioSettings component
    - Controls visibility of timer debug overlay in SessionTimer component
*/

-- Add show_timer_debug column to user_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_timer_debug'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_timer_debug boolean DEFAULT false;
  END IF;
END $$;