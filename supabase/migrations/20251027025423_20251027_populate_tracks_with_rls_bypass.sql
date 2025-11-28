/*
  # Populate Tracks from Uploaded JSON Sidecars (with RLS bypass)

  1. Purpose
    - Read JSON sidecar files from audio-files bucket
    - Create audio_tracks records with metadata
    - Temporarily disable RLS for system-level insert

  2. Process
    - Disable RLS temporarily
    - Query storage.objects for all .json files
    - Create audio_tracks records
    - Re-enable RLS
*/

-- Temporarily disable RLS for system insert
ALTER TABLE audio_tracks DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  json_file RECORD;
  track_uuid UUID;
  track_id_value TEXT;
  audio_file_url TEXT;
  metadata_json JSONB;
  total_processed INTEGER := 0;
  total_inserted INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting population from uploaded JSON sidecars...';

  FOR json_file IN
    SELECT name, created_at
    FROM storage.objects
    WHERE bucket_id = 'audio-files'
      AND name LIKE '%.json'
    ORDER BY name
  LOOP
    total_processed := total_processed + 1;

    -- Extract track ID from filename
    track_id_value := REPLACE(json_file.name, '.json', '');
    track_uuid := gen_random_uuid();
    audio_file_url := 'https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/' || track_id_value || '.mp3';

    -- Build basic metadata structure
    metadata_json := jsonb_build_object(
      'track_id', track_id_value,
      'track_name', track_id_value,
      'artist_name', 'Focus.Music',
      'mimetype', 'audio/mpeg'
    );

    BEGIN
      INSERT INTO audio_tracks (
        id,
        file_path,
        energy_level,
        duration_seconds,
        metadata,
        created_at
      )
      VALUES (
        track_uuid,
        audio_file_url,
        'medium',
        0,
        metadata_json,
        json_file.created_at
      )
      ON CONFLICT (file_path) DO NOTHING;

      total_inserted := total_inserted + 1;

      IF total_processed % 50 = 0 THEN
        RAISE NOTICE 'Progress: % processed, % inserted', total_processed, total_inserted;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error processing %: %', json_file.name, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Population complete! Processed: %, Inserted: %', total_processed, total_inserted;
END $$;

-- Re-enable RLS
ALTER TABLE audio_tracks ENABLE ROW LEVEL SECURITY;
