/*
  # Clean Up Duplicate Track IDs

  ## Problem
  Multiple tracks were assigned the same track_id due to race condition
  in concurrent uploads before atomic sequence was implemented.

  ## Strategy
  1. Identify all tracks with duplicate track_ids
  2. For each duplicate set, keep one track and reassign new IDs to others
  3. Keep the track that was created first (earliest created_at)
  4. Update file_path and metadata to match new track_ids

  ## Instructions
  Run this in Supabase SQL Editor AFTER installing the atomic sequence
*/

-- Step 1: View all duplicate track_ids
SELECT
  track_id,
  COUNT(*) as count,
  string_agg(
    COALESCE(metadata->>'track_name', 'Unknown') || ' (ID: ' || id::text || ')',
    ', '
    ORDER BY created_at
  ) as tracks
FROM audio_tracks
WHERE track_id IS NOT NULL
  AND deleted_at IS NULL
GROUP BY track_id
HAVING COUNT(*) > 1
ORDER BY track_id;

-- Step 2: Fix duplicates by reassigning new track_ids
DO $$
DECLARE
  dup_record RECORD;
  track_record RECORD;
  new_track_id INTEGER;
  tracks_to_update INTEGER := 0;
  is_first BOOLEAN;
BEGIN
  RAISE NOTICE 'Starting duplicate track_id cleanup...';
  RAISE NOTICE '';

  -- Loop through each duplicate track_id
  FOR dup_record IN
    SELECT track_id, COUNT(*) as dup_count
    FROM audio_tracks
    WHERE track_id IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY track_id
    HAVING COUNT(*) > 1
    ORDER BY track_id
  LOOP
    RAISE NOTICE 'Processing track_id % (% duplicates)', dup_record.track_id, dup_record.dup_count;
    is_first := TRUE;

    -- Loop through tracks with this track_id, ordered by creation time
    FOR track_record IN
      SELECT id, metadata, created_at
      FROM audio_tracks
      WHERE track_id = dup_record.track_id
        AND deleted_at IS NULL
      ORDER BY created_at
    LOOP
      IF is_first THEN
        -- Keep the first track with its original track_id
        RAISE NOTICE '  ✓ Keeping first track: % (ID: %)',
          COALESCE(track_record.metadata->>'track_name', 'Unknown'),
          track_record.id;
        is_first := FALSE;
      ELSE
        -- Reassign new track_id to duplicate
        SELECT get_next_track_id() INTO new_track_id;

        UPDATE audio_tracks
        SET
          track_id = new_track_id,
          file_path = CASE
            WHEN file_path LIKE 'https://pub-%' THEN
              regexp_replace(file_path, '/\d+\.mp3$', '/' || new_track_id || '.mp3')
            ELSE
              new_track_id || '.mp3'
          END,
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{track_id}',
            to_jsonb(new_track_id)
          )
        WHERE id = track_record.id;

        tracks_to_update := tracks_to_update + 1;

        RAISE NOTICE '  → Reassigned: % (ID: %) → New track_id: %',
          COALESCE(track_record.metadata->>'track_name', 'Unknown'),
          track_record.id,
          new_track_id;
      END IF;
    END LOOP;

    RAISE NOTICE '';
  END LOOP;

  RAISE NOTICE '✅ Cleanup complete!';
  RAISE NOTICE '   Total tracks reassigned: %', tracks_to_update;
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Files in storage need to be renamed manually:';
  RAISE NOTICE '   - Old files still have old track_id filenames';
  RAISE NOTICE '   - Either re-upload these tracks OR rename files in storage';
END $$;

-- Step 3: Verify no duplicates remain
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✅ No duplicate track_ids found'
    ELSE '❌ Still have ' || COUNT(*) || ' duplicate track_ids'
  END as status
FROM (
  SELECT track_id, COUNT(*) as count
  FROM audio_tracks
  WHERE track_id IS NOT NULL
    AND deleted_at IS NULL
  GROUP BY track_id
  HAVING COUNT(*) > 1
) duplicates;

-- Step 4: Show all haiku robot tracks to verify
SELECT
  track_id,
  metadata->>'track_name' as track_name,
  metadata->>'energy_level' as energy,
  ROUND((metadata->>'file_size_bytes')::numeric / 1024 / 1024, 2) as size_mb,
  created_at
FROM audio_tracks
WHERE metadata->>'track_name' LIKE '%Haiku Robot%'
  AND deleted_at IS NULL
ORDER BY track_id;
