/*
  # Fix Compound Version Patterns

  1. Purpose
    - Fix tracks where .##_## patterns remain after version extraction
    - These occur when track had .##_##_P# pattern but only _P# was removed
    - Clean up the .##_## prefix from track names and add to version

  2. Examples
    - "Dragon (Anxiety Remix).02_01" with version "P4" 
      → "Dragon (Anxiety Remix)" with version "02_01_P4"
*/

DO $$
DECLARE
  track_record RECORD;
  track_name TEXT;
  clean_name TEXT;
  version_info TEXT;
  prefix_pattern TEXT;
  updated_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Fixing compound version patterns...';

  FOR track_record IN
    SELECT id, metadata
    FROM audio_tracks
    WHERE deleted_at IS NULL
      AND metadata->>'track_name' ~ '\.\d+_\d+$'
      AND metadata->>'version' IS NOT NULL
      AND metadata->>'version' != 'null'
    ORDER BY id
  LOOP
    track_name := track_record.metadata->>'track_name';
    version_info := track_record.metadata->>'version';

    -- Extract the .##_## pattern
    IF track_name ~ '\.\d+_\d+$' THEN
      prefix_pattern := substring(track_name from '\.(\d+_\d+)$');
      clean_name := regexp_replace(track_name, '\.\d+_\d+$', '');

      -- Combine prefix with existing version
      version_info := prefix_pattern || '_' || version_info;

      -- Update the track
      UPDATE audio_tracks
      SET metadata = jsonb_set(
        jsonb_set(
          metadata,
          '{track_name}',
          to_jsonb(clean_name)
        ),
        '{version}',
        to_jsonb(version_info)
      )
      WHERE id = track_record.id;

      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Compound version pattern fix complete!';
  RAISE NOTICE 'Total tracks updated: %', updated_count;
END $$;
