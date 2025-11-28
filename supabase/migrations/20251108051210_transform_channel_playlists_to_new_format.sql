/*
  # Transform Channel Playlist Data to New Format

  1. Changes
    - Read existing playlist_data from migration format
    - Transform from: {"low": [{"track_id": 123, "weight": 1}]}
    - Transform to: {"low": {"tracks": [{"track_id": 123, "weight": 1}], "k": 100, "energy": "LOW"}}
    - Apply transformation for all channels and energy levels

  2. Notes
    - Preserves track_id and weight data from original migration
    - Adds required structure fields (k, energy, channel, model_version)
    - Maintains compatibility with playlister algorithm expectations
*/

-- This will be populated by reading the original migration file
-- For now, applying the structure transformation
-- The actual track data needs to be inserted from the original migration

-- First, let's check if we need to update or if data already exists
DO $$
DECLARE
  channel_rec RECORD;
BEGIN
  -- Log start
  RAISE NOTICE 'Starting playlist data transformation...';
  
  -- For each channel, ensure proper structure exists
  FOR channel_rec IN SELECT id, channel_number, channel_name FROM audio_channels LOOP
    UPDATE audio_channels
    SET playlist_data = jsonb_build_object(
      'low', jsonb_build_object(
        'k', 100,
        'energy', 'LOW',
        'tracks', COALESCE((playlist_data->'low'), '[]'::jsonb),
        'channel', channel_rec.channel_name,
        'model_version', 'v1'
      ),
      'medium', jsonb_build_object(
        'k', 100,
        'energy', 'MEDIUM',
        'tracks', COALESCE((playlist_data->'medium'), '[]'::jsonb),
        'channel', channel_rec.channel_name,
        'model_version', 'v1'
      ),
      'high', jsonb_build_object(
        'k', 100,
        'energy', 'HIGH',
        'tracks', COALESCE((playlist_data->'high'), '[]'::jsonb),
        'channel', channel_rec.channel_name,
        'model_version', 'v1'
      )
    )
    WHERE id = channel_rec.id
    AND (
      playlist_data IS NULL 
      OR NOT (playlist_data ? 'low' AND playlist_data->'low' ? 'tracks')
    );
  END LOOP;
  
  RAISE NOTICE 'Playlist structure transformation complete';
END $$;