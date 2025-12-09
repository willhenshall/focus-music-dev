-- Fix: get_bulk_track_assignments data format mismatch
-- Bug: Function expected playlist_data->energy->'tracks' but actual data has tracks directly at playlist_data->energy
-- Solution: Support BOTH formats (direct array and nested 'tracks' key)

-- First, drop the duplicate integer[] version if it exists
DROP FUNCTION IF EXISTS get_bulk_track_assignments(integer[]);

-- Recreate with fixed logic - handles both playlist data formats
CREATE OR REPLACE FUNCTION get_bulk_track_assignments(track_ids text[])
RETURNS TABLE (track_id text, channel_id uuid, channel_name text, energy_level text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $func$
BEGIN
  RETURN QUERY
  SELECT DISTINCT t.track_id::text, c.id, c.channel_name, e.energy
  FROM audio_tracks t
  CROSS JOIN audio_channels c
  CROSS JOIN unnest(ARRAY['low', 'medium', 'high']) AS e(energy)
  WHERE t.track_id::text = ANY(track_ids) 
    AND t.deleted_at IS NULL 
    AND c.playlist_data IS NOT NULL
    AND (
      -- Format 1: Direct array at energy level (current format)
      (jsonb_typeof(c.playlist_data->e.energy) = 'array' 
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.playlist_data->e.energy) AS ti WHERE (ti->>'track_id')::text = t.track_id::text))
      OR 
      -- Format 2: Nested under 'tracks' key (legacy format)
      (c.playlist_data->e.energy->'tracks' IS NOT NULL 
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.playlist_data->e.energy->'tracks') AS ti WHERE (ti->>'track_id')::text = t.track_id::text))
    );
END;
$func$;
