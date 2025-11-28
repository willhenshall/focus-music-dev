/*
  # Create function to get tracks by track IDs

  1. New Functions
    - `get_tracks_by_ids` - Efficiently retrieves audio tracks by an array of track_id values
      - Parameters: track_ids (text array)
      - Returns: Set of audio_tracks records matching the provided track IDs
      - Uses JSONB operator to filter on metadata->>'track_id'
  
  2. Purpose
    - Avoids fetching all 7700+ tracks when only a small subset is needed
    - Improves performance for playlist preview functionality
*/

CREATE OR REPLACE FUNCTION get_tracks_by_ids(track_ids text[])
RETURNS SETOF audio_tracks
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM audio_tracks
  WHERE deleted_at IS NULL
    AND metadata->>'track_id' = ANY(track_ids);
$$;
