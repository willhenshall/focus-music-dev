/*
  # Add Preview Flag to Audio Tracks

  1. Changes
    - Add `is_preview` boolean column to `audio_tracks` table
    - Default to false for all existing tracks
    - Add index for efficient querying of preview tracks by channel and energy level
  
  2. Purpose
    - Allow admins to mark one track per channel/energy combination as the preview track
    - Enable public preview playback on quiz results page for non-authenticated users
    - Support future preview features across the platform
*/

-- Add is_preview column to audio_tracks
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS is_preview boolean DEFAULT false NOT NULL;

-- Add index for efficient preview track queries
CREATE INDEX IF NOT EXISTS idx_audio_tracks_preview 
ON audio_tracks(channel_id, energy_level, is_preview) 
WHERE is_preview = true AND deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN audio_tracks.is_preview IS 'Marks this track as the preview track for its channel/energy combination. Only one track per channel/energy should be marked as preview.';