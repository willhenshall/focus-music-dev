/*
  # Populate All Audio Tracks from Sidecar Files

  1. Purpose
    - Populate audio_tracks from all sidecar metadata files in storage
    - Each sidecar JSON file represents one track
    - Extract track IDs from sidecar filenames
    - Generate proper audio file URLs

  2. Details
    - Process all 7699+ sidecar files from storage.objects
    - Use track_id from filename (without .json extension)
    - Set default duration_seconds to 0 (will be updated from metadata later)
    - Create proper file paths to audio-files bucket
*/

DO $$
DECLARE
  sidecar_file RECORD;
  track_uuid UUID;
  track_id_value TEXT;
  audio_file_url TEXT;
  total_inserted INT := 0;
BEGIN
  RAISE NOTICE 'Starting to populate audio_tracks from sidecar files...';

  FOR sidecar_file IN
    SELECT
      o.name,
      o.metadata,
      o.created_at
    FROM storage.objects o
    WHERE o.bucket_id = 'audio-sidecars'
      AND o.name LIKE '%.json'
    ORDER BY o.name
  LOOP
    BEGIN
      track_uuid := gen_random_uuid();
      track_id_value := REPLACE(sidecar_file.name, '.json', '');
      audio_file_url := 'https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/' || track_id_value || '.mp3';

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
        jsonb_build_object(
          'track_id', track_id_value,
          'track_name', track_id_value,
          'artist_name', 'Focus.Music',
          'file_size', (sidecar_file.metadata->>'size')::bigint,
          'mimetype', 'audio/mpeg'
        ),
        sidecar_file.created_at
      )
      ON CONFLICT (file_path) DO UPDATE
      SET metadata = EXCLUDED.metadata;

      total_inserted := total_inserted + 1;

      IF total_inserted % 1000 = 0 THEN
        RAISE NOTICE 'Processed % tracks...', total_inserted;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error processing file %: %', sidecar_file.name, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Population complete! Total tracks inserted/updated: %', total_inserted;
  RAISE NOTICE 'Final count in audio_tracks: %', (SELECT COUNT(*) FROM audio_tracks);
END $$;
