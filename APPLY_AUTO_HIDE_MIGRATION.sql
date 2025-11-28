/*
  # Add Auto-Hide Tab Navigation Preference

  1. Changes
    - Add `auto_hide_tab_navigation` column to `user_preferences` table
      - Type: boolean
      - Default: true (auto-hide enabled by default)
      - Not null constraint

  2. Purpose
    - Allows users to control whether the tab navigation bar auto-hides
    - Enhances user experience by providing customizable interface behavior
    - Default behavior follows Apple Dock-style auto-hide pattern

  3. Notes
    - Existing records will automatically get the default value (true)
    - Users can toggle this preference in the Settings > Preferences tab
    - The preference persists across sessions
    - When enabled, navigation auto-hides on the Channels tab only
    - Navigation can be revealed by hovering near the top of the page

  4. How to Apply
    - Copy this entire SQL block
    - Run it against your Supabase database using:
      * Supabase Dashboard SQL Editor, OR
      * psql command line, OR
      * Your preferred database migration tool
*/

-- Add the auto_hide_tab_navigation column to user_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'auto_hide_tab_navigation'
  ) THEN
    ALTER TABLE user_preferences
    ADD COLUMN auto_hide_tab_navigation boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- Create an index for faster filtering (optional but recommended for performance)
CREATE INDEX IF NOT EXISTS idx_user_preferences_auto_hide
ON user_preferences(auto_hide_tab_navigation);

-- Verify the column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'auto_hide_tab_navigation'
  ) THEN
    RAISE NOTICE 'SUCCESS: auto_hide_tab_navigation column added successfully!';
  ELSE
    RAISE NOTICE 'ERROR: Failed to add auto_hide_tab_navigation column';
  END IF;
END $$;
