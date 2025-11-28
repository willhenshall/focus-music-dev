/*
  # Backfill Track Metadata from CSV

  1. Process
    - Create temporary table to hold CSV data
    - Import CSV data (will be done manually or via script)
    - Update audio_tracks with matched data from temp table
    - Clean up temporary table

  2. Matching Strategy
    - Primary: Match by track_name and artist_name in metadata JSONB
    - Secondary: Match by track_id if available

  3. Notes
    - This migration creates the structure; data import happens separately
    - Handles 14,790 tracks from CSV export
*/

-- Create temporary table to hold CSV import data
CREATE TEMP TABLE IF NOT EXISTS csv_metadata_import (
  track_id INTEGER,
  track_name TEXT,
  artist_name TEXT,
  album_name TEXT,
  duration NUMERIC,
  tempo INTEGER,
  catalog TEXT,
  locked INTEGER,
  track_user_genre_id INTEGER,
  speed NUMERIC(3,2),
  intensity NUMERIC(3,2),
  arousal NUMERIC(3,2),
  valence NUMERIC(3,2),
  brightness NUMERIC(3,2),
  complexity NUMERIC(3,2),
  music_key_value INTEGER,
  energy_set INTEGER
);

-- Note: CSV data will be imported via COPY command or INSERT statements
-- This is a placeholder migration to document the process

COMMENT ON TABLE csv_metadata_import IS 'Temporary table for importing metadata from CSV export';
