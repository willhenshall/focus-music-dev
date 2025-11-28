/*
  # Update Channel Structure for External Playlists

  ## Changes
  
  1. Add playlist_data column to audio_channels
     - Stores the external JSON playlist definitions (low, medium, high)
     - JSONB format with track_ids arrays for each energy level
  
  2. Modify playlists table
     - Remove algorithm_version (not using custom algorithm)
     - Simplify to just reference the channel's external playlist data
  
  ## Notes
  
  - Each channel has 3 subchannels (low/medium/high energy)
  - Playlist order comes from external JSON files
  - No custom algorithm - just play tracks in provided order
*/

-- Add playlist_data to audio_channels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'playlist_data'
  ) THEN
    ALTER TABLE audio_channels ADD COLUMN playlist_data jsonb DEFAULT '{"low": [], "medium": [], "high": []}';
  END IF;
END $$;

-- Update playlists table to remove algorithm_version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'playlists' AND column_name = 'algorithm_version'
  ) THEN
    ALTER TABLE playlists DROP COLUMN algorithm_version;
  END IF;
END $$;

-- Add comment to document the new structure
COMMENT ON COLUMN audio_channels.playlist_data IS 'External playlist definitions: {"low": [track_ids], "medium": [track_ids], "high": [track_ids]}';
