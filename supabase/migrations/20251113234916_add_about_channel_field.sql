/*
  # Add About Channel Field

  1. Changes
    - Add `about_channel` column to `audio_channels` table
      - Supports markdown formatted text up to 200 words
      - Optional field (nullable)
      - Includes optional image_url and external_link fields
    
  2. Security
    - No RLS changes needed (inherits existing channel policies)
*/

-- Add about_channel field with markdown support
ALTER TABLE audio_channels 
ADD COLUMN IF NOT EXISTS about_channel TEXT,
ADD COLUMN IF NOT EXISTS about_image_url TEXT,
ADD COLUMN IF NOT EXISTS about_external_link TEXT;

-- Add comment for documentation
COMMENT ON COLUMN audio_channels.about_channel IS 'Markdown formatted description about the channel (max 200 words recommended)';
COMMENT ON COLUMN audio_channels.about_image_url IS 'Optional image URL for the about section';
COMMENT ON COLUMN audio_channels.about_external_link IS 'Optional external link for more information';
