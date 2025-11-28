/*
  # Bulk Insert All Audio Tracks

  Fast bulk insert of all tracks from sidecar metadata
*/

-- First, clear any existing tracks to avoid conflicts
TRUNCATE TABLE audio_tracks;

-- Bulk insert all tracks at once
INSERT INTO audio_tracks (
  id,
  file_path,
  energy_level,
  duration_seconds,
  metadata,
  created_at
)
SELECT
  gen_random_uuid() as id,
  'https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/' || REPLACE(o.name, '.json', '') || '.mp3' as file_path,
  'medium' as energy_level,
  0 as duration_seconds,
  jsonb_build_object(
    'track_id', REPLACE(o.name, '.json', ''),
    'track_name', REPLACE(o.name, '.json', ''),
    'artist_name', 'Focus.Music',
    'file_size', (o.metadata->>'size')::bigint,
    'mimetype', 'audio/mpeg'
  ) as metadata,
  o.created_at
FROM storage.objects o
WHERE o.bucket_id = 'audio-sidecars'
  AND o.name LIKE '%.json';

-- Display result
SELECT 'Total tracks inserted: ' || COUNT(*)::text as result FROM audio_tracks;
