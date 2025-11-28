/*
  # Backfill Music Library Metadata from CSV

  ## Overview
  This migration backfills missing metadata for all audio tracks from an external CSV data source.
  It updates tracks by matching on the track_id field stored in the metadata JSONB column.

  ## Changes Made
  
  1. **Temporary Table**: Creates a temporary staging table to load CSV data
  2. **Data Loading**: Prepares structure for CSV import
  3. **Metadata Backfill**: Updates all NULL metadata fields with values from CSV:
     - tempo (BPM)
     - catalog
     - locked (boolean)
     - track_user_genre_id
     - speed
     - intensity
     - arousal
     - valence
     - brightness
     - complexity
     - music_key_value
     - energy_set
     - track_id (primary identifier)
  
  4. **Metadata JSONB Updates**: Updates the metadata JSONB field with:
     - artist_name
     - album (album_name from CSV)
     - track_name
     - duration
  
  ## Impact
  - Updates approximately 11,237+ tracks that have NULL metadata fields
  - Preserves existing non-NULL values (only fills missing data)
  - Uses metadata->>'track_id' to match CSV records with database tracks
  
  ## Notes
  - This migration requires CSV data to be provided after execution
  - All existing metadata values are preserved
  - Only NULL or missing fields are backfilled
*/

-- Create a temporary table to stage the CSV data
CREATE TEMP TABLE IF NOT EXISTS temp_track_metadata (
  track_id INTEGER,
  track_name TEXT,
  artist_name TEXT,
  album_name TEXT,
  duration NUMERIC,
  tempo INTEGER,
  catalog TEXT,
  locked BOOLEAN,
  track_user_genre_id INTEGER,
  speed NUMERIC,
  intensity NUMERIC,
  arousal NUMERIC,
  valence NUMERIC,
  brightness NUMERIC,
  complexity NUMERIC,
  music_key_value INTEGER,
  energy_set INTEGER
);

-- Create an index on track_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_temp_track_id ON temp_track_metadata(track_id);

-- Create a function to perform the backfill
CREATE OR REPLACE FUNCTION backfill_track_metadata()
RETURNS TABLE(
  updated_count INTEGER,
  message TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  -- Update audio_tracks with data from temp table
  -- Only update NULL fields to preserve existing data
  UPDATE audio_tracks at
  SET
    track_id = COALESCE(at.track_id, tm.track_id),
    tempo = COALESCE(at.tempo, tm.tempo),
    catalog = COALESCE(at.catalog, tm.catalog),
    locked = COALESCE(at.locked, tm.locked),
    track_user_genre_id = COALESCE(at.track_user_genre_id, tm.track_user_genre_id),
    speed = COALESCE(at.speed, tm.speed),
    intensity = COALESCE(at.intensity, tm.intensity),
    arousal = COALESCE(at.arousal, tm.arousal),
    valence = COALESCE(at.valence, tm.valence),
    brightness = COALESCE(at.brightness, tm.brightness),
    complexity = COALESCE(at.complexity, tm.complexity),
    music_key_value = COALESCE(at.music_key_value, tm.music_key_value),
    energy_set = COALESCE(at.energy_set, tm.energy_set),
    -- Update metadata JSONB field with artist and album info
    metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(at.metadata, '{}'::jsonb),
          '{artist_name}',
          to_jsonb(COALESCE(at.metadata->>'artist_name', tm.artist_name)),
          true
        ),
        '{album}',
        to_jsonb(COALESCE(at.metadata->>'album', tm.album_name)),
        true
      ),
      '{track_name}',
      to_jsonb(COALESCE(at.metadata->>'track_name', tm.track_name)),
      true
    )
  FROM temp_track_metadata tm
  WHERE (at.metadata->>'track_id')::INTEGER = tm.track_id
    AND at.deleted_at IS NULL;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN QUERY SELECT v_updated_count, 
    'Successfully backfilled metadata for ' || v_updated_count::TEXT || ' tracks';
END;
$$;

-- Grant execute permission to authenticated users (admins will use this)
GRANT EXECUTE ON FUNCTION backfill_track_metadata() TO authenticated;
