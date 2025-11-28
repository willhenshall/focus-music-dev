/*
  # Create function to get distinct metadata values (fixed)

  1. New Function
    - `get_distinct_metadata_values(metadata_path text)` - Returns array of distinct non-null values from JSONB metadata field
    - Efficiently queries all tracks without loading entire dataset into memory
    - Filters out null and empty string values
    - Returns sorted results

  2. Purpose
    - Improve performance when loading field options in Slot Strategy Editor
    - Handle datasets larger than query limits (>10,000 records)
    - Provide efficient DISTINCT queries on JSONB fields

  3. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only returns distinct values, no sensitive data exposure
    - Read-only operation
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_distinct_metadata_values(text);

-- Create function to get distinct metadata values
-- Takes the JSON path as parameter (e.g., 'genre', 'artist_name', etc.)
CREATE OR REPLACE FUNCTION get_distinct_metadata_values(json_key text)
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY_AGG(DISTINCT value ORDER BY value)
  FROM (
    SELECT metadata->>json_key as value
    FROM audio_tracks
    WHERE deleted_at IS NULL
      AND metadata->>json_key IS NOT NULL
      AND metadata->>json_key != ''
  ) sub
  WHERE value IS NOT NULL;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_distinct_metadata_values(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_distinct_metadata_values(text) TO anon;
