/*
  # Create Atomic Track ID Sequence - APPLY THIS NOW

  ## Instructions
  1. Open Supabase Dashboard SQL Editor
  2. Copy this entire file
  3. Click "Run"

  This creates an atomic sequence that eliminates all track_id race conditions.
*/

-- Step 1: Create sequence starting from current max track_id
DO $$
DECLARE
  max_track_id INTEGER;
BEGIN
  -- Find current max track_id (cast to integer to handle type mismatch)
  SELECT COALESCE(MAX(track_id::integer), 99993) INTO max_track_id
  FROM audio_tracks
  WHERE track_id IS NOT NULL;

  -- Drop if exists
  DROP SEQUENCE IF EXISTS audio_tracks_track_id_seq;

  -- Create sequence
  EXECUTE format('CREATE SEQUENCE audio_tracks_track_id_seq START WITH %s', max_track_id + 1);

  RAISE NOTICE 'Sequence created starting at: %', max_track_id + 1;
END $$;

-- Step 2: Create atomic function
DROP FUNCTION IF EXISTS get_next_track_id();

CREATE FUNCTION get_next_track_id()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_id INTEGER;
BEGIN
  SELECT nextval('audio_tracks_track_id_seq')::INTEGER INTO next_id;
  RETURN next_id;
END;
$$;

-- Step 3: Grant permissions
GRANT EXECUTE ON FUNCTION get_next_track_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_track_id() TO anon;

-- Step 4: Documentation
COMMENT ON FUNCTION get_next_track_id() IS
  'Atomically generates next unique track_id. Eliminates race conditions.';

COMMENT ON SEQUENCE audio_tracks_track_id_seq IS
  'Atomic sequence for unique track IDs. No duplicate IDs possible.';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Track ID sequence installed successfully!';
  RAISE NOTICE '✅ Function get_next_track_id() is ready';
  RAISE NOTICE '✅ Race condition protection active';
END $$;
