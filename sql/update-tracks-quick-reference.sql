-- AUDIO TRACKS NULL FIELD UPDATE - QUICK REFERENCE SQL
-- Run these in order in the Supabase SQL Editor

-- STEP 1: CREATE BACKUP
CREATE TABLE audio_tracks_backup_20250119 AS 
SELECT * FROM audio_tracks;

SELECT COUNT(*) as backup_count FROM audio_tracks_backup_20250119;

-- STEP 2: ANALYZE CURRENT STATE
SELECT 
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE track_id IS NULL) as null_track_id,
  COUNT(*) FILTER (WHERE tempo IS NULL) as null_tempo,
  COUNT(*) FILTER (WHERE speed IS NULL) as null_speed
FROM audio_tracks;

-- STEP 3: UPDATE FILE PATHS
UPDATE audio_tracks
SET 
  file_path = REPLACE(file_path, 
                      'https://eafyytltuwuxuuoevavo.supabase.co',
                      'https://xewajlyswijmjxuajhif.supabase.co'),
  updated_at = NOW()
WHERE file_path LIKE '%eafyytltuwuxuuoevavo%';

-- STEP 4: VERIFY
SELECT 
  COUNT(*) FILTER (WHERE file_path LIKE '%xewajlyswijmjxuajhif%') as new_urls,
  COUNT(*) as total
FROM audio_tracks;
