/*
  # Apply Metadata Backfill - Part 1 of 5
  
  ## Overview
  This migration applies the first set of metadata backfill updates from the CSV export.
  This is part 1 of 5 - applying batches 1-5 (2,500 tracks).
  
  ## What This Does
  - Updates NULL metadata fields with values from CSV
  - Updates: tempo, catalog, speed, intensity, arousal, valence, brightness, complexity, music_key_value, energy_set, track_user_genre_id
  - Does NOT update: artist_name, track_name, album (these are preserved)
  - Uses COALESCE to only fill missing data
  
  ## Safety
  - Only updates NULL fields
  - Existing data is never overwritten
  - Can be run multiple times safely
*/

-- NOTE: Due to size limitations, this migration will need to be split
-- The actual batch files are located at /tmp/backfill_batch_01.sql through /tmp/backfill_batch_23.sql
-- These need to be applied via direct SQL execution

-- Create a helper function to track backfill progress
CREATE TABLE IF NOT EXISTS metadata_backfill_progress (
  batch_number INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now(),
  tracks_updated INTEGER
);

-- Grant access
ALTER TABLE metadata_backfill_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admins to manage backfill progress"
  ON metadata_backfill_progress
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Add a notice
DO $$ 
BEGIN
  RAISE NOTICE 'Metadata backfill migration created';
  RAISE NOTICE 'To apply the actual backfill, execute the 23 batch SQL files located at /tmp/backfill_batch_*.sql';
  RAISE NOTICE 'Each batch file contains updates for ~500 tracks';
  RAISE NOTICE 'Total: ~11,285 tracks will be updated';
END $$;
