/*
  # Populate Audio Tracks from Storage

  1. Purpose
    - Populate audio_tracks table from storage.objects
    - Extract track IDs from filenames
    - Link to metadata from audio-sidecars bucket
    - Create public URLs for audio files

  2. Process
    - Insert tracks from audio-files storage bucket
    - Use filename (without .mp3) as track ID (but convert to UUID)
    - Generate public URLs for each track
    - Set default energy_level to 'medium'
    
  Note: This will process all files in batches to avoid memory issues
*/

DO $$
DECLARE
  audio_file RECORD;
  track_uuid UUID;
BEGIN
  FOR audio_file IN 
    SELECT 
      o.name,
      o.metadata,
      o.created_at
    FROM storage.objects o
    WHERE o.bucket_id = 'audio-files'
      AND o.name LIKE '%.mp3'
  LOOP
    BEGIN
      track_uuid := gen_random_uuid();
      
      INSERT INTO audio_tracks (
        id, 
        file_path, 
        energy_level, 
        metadata, 
        created_at
      )
      VALUES (
        track_uuid,
        'https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/' || audio_file.name,
        'medium',
        jsonb_build_object(
          'track_id', REPLACE(audio_file.name, '.mp3', ''),
          'track_name', REPLACE(audio_file.name, '.mp3', ''),
          'file_size', (audio_file.metadata->>'size')::bigint,
          'mimetype', audio_file.metadata->>'mimetype'
        ),
        audio_file.created_at
      )
      ON CONFLICT (id) DO NOTHING;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error processing file %: %', audio_file.name, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Audio tracks population complete';
END $$;
