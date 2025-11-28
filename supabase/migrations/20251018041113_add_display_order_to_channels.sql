/*
  # Add Display Order to Audio Channels

  1. Changes
    - Add `display_order` column to `audio_channels` table
      - Integer field to control the order channels appear to end users
      - Lower numbers appear first
      - Defaults to channel_number for backward compatibility
    
  2. Notes
    - The top 3 channels will be overridden by quiz recommendations
    - This order affects remaining channels shown to users
    - Admins can maintain a separate custom view order in the UI
*/

-- Add display_order column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE audio_channels ADD COLUMN display_order INTEGER;
  END IF;
END $$;

-- Initialize display_order with channel_number for existing records
UPDATE audio_channels
SET display_order = channel_number
WHERE display_order IS NULL;

-- Make display_order NOT NULL after initialization
ALTER TABLE audio_channels ALTER COLUMN display_order SET NOT NULL;

-- Add default for new records
ALTER TABLE audio_channels ALTER COLUMN display_order SET DEFAULT 999;