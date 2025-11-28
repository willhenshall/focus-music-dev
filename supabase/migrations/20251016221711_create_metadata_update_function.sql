/*
  # Create Metadata Update Function

  Creates a function to update track metadata from public sidecar JSON files.

  1. Setup
     - Enables http extension for fetching remote JSON
     - Creates reusable function for single track updates

  2. Function: update_single_track_metadata
     - Fetches sidecar JSON via public URL
     - Updates track metadata with proper names
     - Returns success/failure boolean

  3. Usage
     - Can be called for individual tracks or in batches
     - Safe to run multiple times (idempotent)
*/

-- Enable http extension if not already enabled
CREATE EXTENSION IF NOT EXISTS http;

-- Create function to update a single track's metadata
CREATE OR REPLACE FUNCTION update_single_track_metadata(track_uuid UUID, track_id_param TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  sidecar_url TEXT;
  http_response http_response;
  sidecar_json JSONB;
  current_metadata JSONB;
BEGIN
  -- Build the public URL for the sidecar file
  sidecar_url := 'https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-sidecars/' || track_id_param || '.json';
  
  -- Fetch the sidecar file via HTTP
  SELECT * INTO http_response FROM http_get(sidecar_url);
  
  -- Check if request was successful
  IF http_response.status != 200 THEN
    RETURN FALSE;
  END IF;
  
  -- Parse the JSON response
  sidecar_json := http_response.content::jsonb;
  
  -- Get current metadata
  SELECT metadata INTO current_metadata
  FROM audio_tracks
  WHERE id = track_uuid;
  
  -- Update the track with new metadata
  UPDATE audio_tracks
  SET metadata = current_metadata || jsonb_build_object(
    'track_name', COALESCE(sidecar_json->>'track_name', track_id_param),
    'artist_name', COALESCE(sidecar_json->>'artist_name', 'Focus.Music'),
    'album_name', sidecar_json->>'album_name',
    'duration', sidecar_json->>'duration',
    'tempo', sidecar_json->>'tempo',
    'bpm', sidecar_json->>'tempo',
    'genre_category', sidecar_json->>'genre_category'
  ),
  duration_seconds = COALESCE(
    (sidecar_json->>'duration')::NUMERIC::INT,
    duration_seconds
  )
  WHERE id = track_uuid;
  
  RETURN TRUE;
  
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
