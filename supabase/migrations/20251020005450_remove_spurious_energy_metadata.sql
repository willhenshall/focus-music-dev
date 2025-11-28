/*
  # Remove Spurious Energy Metadata Tag

  1. Changes
    - Removes the incorrect "energy: medium" metadata tag from all audio_tracks
    - This tag was from the legacy Focus@Will system and is not used in the new system
    - The new system uses energy levels stored in the audio_channels.playlist_data structure

  2. Notes
    - This only removes the "energy" key from the metadata JSONB column
    - All other metadata (track_id, duration, bpm, etc.) remains intact
    - No data loss - just cleaning up incorrect/unused metadata
*/

-- Remove the 'energy' key from all track metadata
UPDATE audio_tracks
SET metadata = metadata - 'energy'
WHERE metadata ? 'energy';
