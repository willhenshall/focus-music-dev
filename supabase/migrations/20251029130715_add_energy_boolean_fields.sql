/*
  # Add Energy Level Boolean Fields

  1. Changes
    - Add three new boolean columns to audio_tracks table:
      - `energy_low` (boolean, default false)
      - `energy_medium` (boolean, default false)
      - `energy_high` (boolean, default false)
    - These allow tracks to be assigned to multiple energy levels simultaneously
    - Keeps existing `energy_level` column for backward compatibility

  2. Migration Strategy
    - Migrate existing `energy_level` values to corresponding boolean fields
    - If energy_level = 'low', set energy_low = true
    - If energy_level = 'medium', set energy_medium = true
    - If energy_level = 'high', set energy_high = true

  3. Notes
    - Tracks can now belong to multiple energy playlists
    - The old energy_level field is preserved but may be deprecated later
*/

-- Add the three boolean columns
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS energy_low boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS energy_medium boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS energy_high boolean DEFAULT false;

-- Migrate existing energy_level data to the new boolean fields
UPDATE audio_tracks
SET energy_low = true
WHERE energy_level = 'low';

UPDATE audio_tracks
SET energy_medium = true
WHERE energy_level = 'medium';

UPDATE audio_tracks
SET energy_high = true
WHERE energy_level = 'high';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_audio_tracks_energy_low ON audio_tracks(energy_low) WHERE energy_low = true;
CREATE INDEX IF NOT EXISTS idx_audio_tracks_energy_medium ON audio_tracks(energy_medium) WHERE energy_medium = true;
CREATE INDEX IF NOT EXISTS idx_audio_tracks_energy_high ON audio_tracks(energy_high) WHERE energy_high = true;
