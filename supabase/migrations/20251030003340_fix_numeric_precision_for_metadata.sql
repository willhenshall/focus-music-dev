/*
  # Fix Numeric Precision for Metadata Fields

  1. Changes
    - Alter metadata columns to support larger numeric values
    - Change from NUMERIC(3,2) to NUMERIC(5,2) to support values up to 999.99
    - This allows for metadata values that may be on different scales

  2. Affected Columns
    - speed
    - intensity
    - arousal
    - valence
    - brightness
    - complexity
*/

-- Alter numeric precision to support larger values
ALTER TABLE audio_tracks
  ALTER COLUMN speed TYPE NUMERIC(5,2),
  ALTER COLUMN intensity TYPE NUMERIC(5,2),
  ALTER COLUMN arousal TYPE NUMERIC(5,2),
  ALTER COLUMN valence TYPE NUMERIC(5,2),
  ALTER COLUMN brightness TYPE NUMERIC(5,2),
  ALTER COLUMN complexity TYPE NUMERIC(5,2);
