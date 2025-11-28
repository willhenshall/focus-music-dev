/*
  # Add image URL to audio channels

  1. Changes
    - Add `image_url` column to `audio_channels` table to store background image URLs
    
  2. Details
    - Column stores the public URL or storage path for channel background images
    - Used to display custom backgrounds in channel selector boxes and music player footer
    - Nullable to allow channels without images
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE audio_channels ADD COLUMN image_url text;
  END IF;
END $$;
