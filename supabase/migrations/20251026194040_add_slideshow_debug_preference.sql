/*
  # Add Slideshow Debug Toggle for Admin Users

  1. Changes
    - Add `show_slideshow_debug` boolean column to `user_preferences` table
    - Default to `false` for all users
    - Allows admin users to toggle slideshow debug overlay visibility

  2. Purpose
    - Provides diagnostic information for debugging slideshow behavior
    - Shows current image, next image, timings, and other slideshow state
    - Controls visibility of slideshow debug overlay in SlideshowOverlay component
*/

-- Add show_slideshow_debug column to user_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_slideshow_debug'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_slideshow_debug boolean DEFAULT false;
  END IF;
END $$;