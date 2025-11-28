/*
  # Update Preview System to Single Channel

  1. Changes
    - Add preview_channel_id column to store which specific channel this track is a preview for
    - Update is_preview logic to work with a single channel selection
    - Drop the old composite index and create new one
  
  2. Purpose
    - Each track can only be a preview for ONE channel (not per channel/energy)
    - Admin selects from the channels that use this track
    - Simplifies preview management and makes it more intuitive
*/

-- Add column to store which channel this is a preview for
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS preview_channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL;

-- Drop old index
DROP INDEX IF EXISTS idx_audio_tracks_preview;

-- Create new index for preview tracks by selected channel
CREATE INDEX IF NOT EXISTS idx_audio_tracks_preview_channel 
ON audio_tracks(preview_channel_id, is_preview) 
WHERE is_preview = true AND deleted_at IS NULL;

-- Add constraint: if is_preview is true, preview_channel_id must be set
-- Note: We'll enforce this in application logic for better user experience

-- Update existing preview tracks to set preview_channel_id to their current channel_id
UPDATE audio_tracks
SET preview_channel_id = channel_id
WHERE is_preview = true AND preview_channel_id IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN audio_tracks.preview_channel_id IS 'The specific channel this track is a preview for. A track can only be a preview for one channel.';