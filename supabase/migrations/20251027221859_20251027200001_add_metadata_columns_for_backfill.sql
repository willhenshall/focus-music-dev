/*
  # Add Metadata Columns for Backfill

  1. Changes
    - Add new columns to audio_tracks for structured metadata:
      - tempo: BPM of the track
      - catalog: Catalog classification
      - locked: Whether track is locked
      - track_user_genre_id: Genre identifier
      - speed: Speed rating (0-1)
      - intensity: Intensity rating (0-1)
      - arousal: Arousal rating (0-1)
      - valence: Valence rating (0-1)
      - brightness: Brightness rating (0-1)
      - complexity: Complexity rating (0-1)
      - music_key_value: Musical key value
      - energy_set: Energy set classification
      - track_id: Original track ID from source system

  2. Notes
    - These columns will be populated from CSV backfill data
    - Existing metadata JSONB column will be preserved for flexibility
    - All new columns are nullable to allow gradual backfill
*/

-- Add new metadata columns to audio_tracks
ALTER TABLE audio_tracks
  ADD COLUMN IF NOT EXISTS tempo INTEGER,
  ADD COLUMN IF NOT EXISTS catalog TEXT,
  ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_user_genre_id INTEGER,
  ADD COLUMN IF NOT EXISTS speed NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS intensity NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS arousal NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS valence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS brightness NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS complexity NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS music_key_value INTEGER,
  ADD COLUMN IF NOT EXISTS energy_set INTEGER,
  ADD COLUMN IF NOT EXISTS track_id INTEGER;

-- Create index on track_id for faster lookups during backfill
CREATE INDEX IF NOT EXISTS idx_audio_tracks_track_id ON audio_tracks(track_id);

-- Add comment explaining the structure
COMMENT ON COLUMN audio_tracks.tempo IS 'Beats per minute (BPM) of the track';
COMMENT ON COLUMN audio_tracks.catalog IS 'Catalog classification (e.g., inbox, published)';
COMMENT ON COLUMN audio_tracks.locked IS 'Whether track is locked for editing';
COMMENT ON COLUMN audio_tracks.track_user_genre_id IS 'Genre identifier from source system';
COMMENT ON COLUMN audio_tracks.speed IS 'Speed rating from 0.0 to 1.0';
COMMENT ON COLUMN audio_tracks.intensity IS 'Intensity rating from 0.0 to 1.0';
COMMENT ON COLUMN audio_tracks.arousal IS 'Arousal rating from 0.0 to 1.0';
COMMENT ON COLUMN audio_tracks.valence IS 'Valence rating from 0.0 to 1.0';
COMMENT ON COLUMN audio_tracks.brightness IS 'Brightness rating from 0.0 to 1.0';
COMMENT ON COLUMN audio_tracks.complexity IS 'Complexity rating from 0.0 to 1.0';
COMMENT ON COLUMN audio_tracks.music_key_value IS 'Musical key value';
COMMENT ON COLUMN audio_tracks.energy_set IS 'Energy set classification (1=low, 2=medium, 3=high)';
COMMENT ON COLUMN audio_tracks.track_id IS 'Original track ID from source system';
