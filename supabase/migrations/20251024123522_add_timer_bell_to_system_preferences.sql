/*
  # Add timer bell audio URL to system preferences

  1. Changes
    - Adds `timer_bell_url` field to system_preferences table
    - Stores the URL of the custom timer bell audio file
    - Defaults to null (will use programmatic bell sound)

  2. Notes
    - When null, SessionTimer will use the default programmatic bell
    - When set, SessionTimer will load and play the custom audio file
*/

-- Add timer_bell_url field to system_preferences
ALTER TABLE system_preferences
ADD COLUMN IF NOT EXISTS timer_bell_url text;

COMMENT ON COLUMN system_preferences.timer_bell_url IS 'URL of custom timer bell audio file from storage';
