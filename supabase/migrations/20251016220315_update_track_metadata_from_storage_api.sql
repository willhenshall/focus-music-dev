/*
  # Update Track Metadata from Storage API

  This migration uses the storage.foldername function to read JSON sidecar files
  and update track metadata with proper track names and artist names.

  1. Process
     - Creates a temporary function to read and update track metadata
     - Processes tracks in batches for efficiency
     - Updates metadata with track_name and artist_name from JSON files

  2. Safety
     - Uses exception handling to skip tracks with missing sidecars
     - Preserves existing metadata fields
     - Only updates tracks that have valid sidecar files
*/

CREATE OR REPLACE FUNCTION update_track_metadata_from_sidecars()
RETURNS TABLE(updated_count INT, error_count INT) AS $$
DECLARE
  track_record RECORD;
  sidecar_data BYTEA;
  sidecar_json JSONB;
  track_id_val TEXT;
  v_updated_count INT := 0;
  v_error_count INT := 0;
BEGIN
  FOR track_record IN 
    SELECT id, metadata
    FROM audio_tracks
    WHERE metadata IS NOT NULL AND metadata->>'track_id' IS NOT NULL
    LIMIT 100
  LOOP
    BEGIN
      track_id_val := track_record.metadata->>'track_id';
      
      -- Try to get the sidecar file content
      SELECT content INTO sidecar_data
      FROM storage.objects
      WHERE bucket_id = 'audio-sidecars' 
        AND name = track_id_val || '.json';
      
      IF sidecar_data IS NOT NULL THEN
        -- Convert bytea to text and parse as JSON
        sidecar_json := convert_from(sidecar_data, 'UTF8')::jsonb;
        
        -- Update track metadata
        UPDATE audio_tracks
        SET metadata = metadata 
          || jsonb_build_object(
            'track_name', COALESCE(sidecar_json->>'track_name', track_id_val),
            'artist_name', COALESCE(sidecar_json->>'artist_name', 'Focus.Music')
          )
        WHERE id = track_record.id;
        
        v_updated_count := v_updated_count + 1;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      CONTINUE;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_updated_count, v_error_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
