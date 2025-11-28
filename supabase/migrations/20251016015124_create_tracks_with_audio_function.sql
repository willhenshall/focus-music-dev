/*
  # Create function to get tracks with audio files

  1. New Functions
    - `get_tracks_with_audio_files()` - Returns only audio tracks that have corresponding files in storage
  
  2. Purpose
    - Filters audio_tracks to only return tracks where the audio file actually exists in the audio-files bucket
    - Ensures playlists only include playable tracks
  
  3. Implementation
    - Uses LEFT JOIN to match tracks with storage objects
    - Filters for non-null storage matches (files that exist)
*/

CREATE OR REPLACE FUNCTION get_tracks_with_audio_files()
RETURNS TABLE (
  id uuid,
  channel_id uuid,
  metadata jsonb,
  created_at timestamptz
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT
    at.id,
    at.channel_id,
    at.metadata,
    at.created_at
  FROM audio_tracks at
  INNER JOIN storage.objects so 
    ON so.name = (at.metadata->>'track_id' || '.mp3')
    AND so.bucket_id = 'audio-files';
$$;