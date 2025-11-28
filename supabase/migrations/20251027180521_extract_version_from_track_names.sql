/*
  # Extract Version Information from Track Names

  1. Purpose
    - Analyze all track names in the audio_tracks table
    - Extract version information from patterns like _v3, _P4, .02_01_P4
    - Clean the track name by removing the version suffix
    - Store the extracted version in a new 'version' metadata field

  2. Patterns Matched
    - `_v#` (e.g., _v1, _v3, _v6)
    - `_P#` (e.g., _P4, _P1)
    - `.##_##_P#` (e.g., .02_01_P4)
    - Combinations at the end of track names

  3. Changes
    - Updates metadata->>'track_name' to remove version suffix
    - Adds/updates metadata->>'version' with extracted version
    - Leaves version as null if no version pattern found
    - Processes all 11,240 tracks
*/

DO $$
DECLARE
  track_record RECORD;
  track_name TEXT;
  clean_name TEXT;
  version_info TEXT;
  updated_count INTEGER := 0;
  total_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting version extraction...';

  FOR track_record IN
    SELECT id, metadata
    FROM audio_tracks
    WHERE deleted_at IS NULL
    ORDER BY id
  LOOP
    total_count := total_count + 1;

    track_name := track_record.metadata->>'track_name';

    IF track_name IS NOT NULL THEN
      -- Initialize
      clean_name := track_name;
      version_info := NULL;

      -- Check for version patterns at the end of the track name
      -- Pattern 1: _v# (e.g., _v3, _v6)
      IF track_name ~ '_v\d+$' THEN
        version_info := substring(track_name from '_v(\d+)$');
        version_info := 'v' || version_info;
        clean_name := regexp_replace(track_name, '_v\d+$', '');

      -- Pattern 2: _P# (e.g., _P4, _P1)
      ELSIF track_name ~ '_P\d+$' THEN
        version_info := substring(track_name from '_P(\d+)$');
        version_info := 'P' || version_info;
        clean_name := regexp_replace(track_name, '_P\d+$', '');

      -- Pattern 3: .##_##_P# (e.g., .02_01_P4)
      ELSIF track_name ~ '\.\d{2}_\d{2}_P\d+$' THEN
        version_info := substring(track_name from '\.(\d{2}_\d{2}_P\d+)$');
        clean_name := regexp_replace(track_name, '\.\d{2}_\d{2}_P\d+$', '');
      END IF;

      -- Update if we found a version or name changed
      IF version_info IS NOT NULL OR clean_name != track_name THEN
        UPDATE audio_tracks
        SET metadata = jsonb_set(
          jsonb_set(
            metadata,
            '{track_name}',
            to_jsonb(TRIM(clean_name))
          ),
          '{version}',
          CASE WHEN version_info IS NOT NULL
            THEN to_jsonb(version_info)
            ELSE 'null'::jsonb
          END
        )
        WHERE id = track_record.id;

        updated_count := updated_count + 1;

        IF updated_count % 1000 = 0 THEN
          RAISE NOTICE 'Processed % tracks, updated %', total_count, updated_count;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Version extraction complete!';
  RAISE NOTICE 'Total tracks processed: %', total_count;
  RAISE NOTICE 'Total tracks updated: %', updated_count;
  RAISE NOTICE 'Tracks with no changes: %', total_count - updated_count;
END $$;
