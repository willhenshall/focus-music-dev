/*
  # Add Collection Field to Audio Channels

  1. Changes to `audio_channels` table
    - Add `collection` column (text: 'electronic', 'acoustic', 'rhythm', 'textures')
    - Allows categorization of channels into high-level collections
    - Enables "Sort by Collection" feature in user dashboard
    - Admin assigns channels to collections via edit modal

  2. Security
    - No RLS changes needed (inherits existing audio_channels policies)
    - Admin users can update collection values
*/

-- Add collection column to audio_channels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'collection'
  ) THEN
    ALTER TABLE audio_channels
    ADD COLUMN collection text;
  END IF;
END $$;

-- Add check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audio_channels_collection_check'
  ) THEN
    ALTER TABLE audio_channels
    ADD CONSTRAINT audio_channels_collection_check
    CHECK (collection IN ('electronic', 'acoustic', 'rhythm', 'textures'));
  END IF;
END $$;

-- Create index for collection filtering
CREATE INDEX IF NOT EXISTS idx_audio_channels_collection ON audio_channels(collection) WHERE collection IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN audio_channels.collection IS 'Musical collection category: electronic, acoustic, rhythm, or textures. Admin assigns channels to collections via edit modal.';
