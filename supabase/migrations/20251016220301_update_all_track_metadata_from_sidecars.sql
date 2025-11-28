/*
  # Update All Track Metadata from JSON Sidecars

  This migration reads JSON sidecar files from the audio-sidecars storage bucket
  and updates the audio_tracks table with proper track names and artist names.

  1. Process
     - Reads each track's metadata to get track_id
     - Fetches corresponding JSON file from audio-sidecars bucket
     - Extracts track_name and artist_name from JSON
     - Updates the track's metadata with proper names

  2. Expected JSON Structure
     - track_name: The actual name of the track
     - artist_name: The artist(s) who created the track

  3. Updates
     - Updates metadata jsonb column with proper track_name and artist_name
     - Preserves all other existing metadata fields
*/

DO $$
DECLARE
  track_record RECORD;
  sidecar_content TEXT;
  sidecar_json JSONB;
  track_id_val TEXT;
  updated_count INT := 0;
  error_count INT := 0;
BEGIN
  RAISE NOTICE 'Starting metadata update from sidecar files...';
  
  FOR track_record IN 
    SELECT id, metadata
    FROM audio_tracks
    WHERE metadata IS NOT NULL
  LOOP
    BEGIN
      -- Extract track_id from metadata
      track_id_val := track_record.metadata->>'track_id';
      
      IF track_id_val IS NULL OR track_id_val = '' THEN
        CONTINUE;
      END IF;
      
      -- Read the JSON sidecar file from storage
      SELECT content::text INTO sidecar_content
      FROM storage.objects
      WHERE bucket_id = 'audio-sidecars' 
        AND name = track_id_val || '.json'
      LIMIT 1;
      
      IF sidecar_content IS NOT NULL THEN
        -- Parse the JSON content
        sidecar_json := sidecar_content::jsonb;
        
        -- Update the track metadata with proper names
        UPDATE audio_tracks
        SET metadata = jsonb_set(
          jsonb_set(
            metadata,
            '{track_name}',
            COALESCE(sidecar_json->'track_name', to_jsonb(track_id_val))
          ),
          '{artist_name}',
          COALESCE(sidecar_json->'artist_name', to_jsonb('Focus.Music'))
        )
        WHERE id = track_record.id;
        
        updated_count := updated_count + 1;
        
        -- Progress indicator every 500 tracks
        IF updated_count % 500 = 0 THEN
          RAISE NOTICE 'Updated % tracks...', updated_count;
        END IF;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      CONTINUE;
    END;
  END LOOP;
  
  RAISE NOTICE 'Metadata update complete!';
  RAISE NOTICE 'Total updated: %', updated_count;
  RAISE NOTICE 'Total errors: %', error_count;
END $$;
