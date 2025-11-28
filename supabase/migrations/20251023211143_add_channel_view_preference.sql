/*
  # Add Channel View Preference
  
  1. Changes
    - Add `channel_view_mode` column to `user_preferences` table (text, default 'grid')
  
  2. Purpose
    - Allows users to toggle between grid (card) view and list view for channels
    - Persists user's viewing preference across sessions
  
  3. Notes
    - Valid values are 'grid' and 'list'
    - Defaults to 'grid' (card view) which is the current display mode
*/

-- Add channel_view_mode column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'channel_view_mode'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN channel_view_mode text DEFAULT 'grid' CHECK (channel_view_mode IN ('grid', 'list'));
  END IF;
END $$;
