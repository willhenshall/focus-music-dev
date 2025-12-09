/*
  # Create function to get distinct column values

  1. New Function
    - `get_distinct_column_values(column_name text)` - Returns array of distinct non-null values from a specified column
    - Efficiently queries all tracks without loading entire dataset into memory
    - Filters out null and empty string values
    - Returns sorted results

  2. Purpose
    - Improve performance when loading field options in Slot Strategy Editor
    - Handle datasets larger than query limits (>10,000 records)
    - Provide efficient DISTINCT queries on direct column fields

  3. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only returns distinct values, no sensitive data exposure
    - Read-only operation
    - Only allows whitelisted column names to prevent SQL injection
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_distinct_column_values(text);

-- Create function to get distinct column values
-- Takes the column name as parameter (e.g., 'genre', 'artist_name', 'catalog', etc.)
CREATE OR REPLACE FUNCTION get_distinct_column_values(column_name text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result text[];
BEGIN
  -- Whitelist of allowed columns to prevent SQL injection
  IF column_name NOT IN ('genre', 'artist_name', 'catalog', 'energy_level', 'track_name', 'music_key_value', 'speed', 'intensity', 'brightness', 'complexity') THEN
    RAISE EXCEPTION 'Invalid column name: %', column_name;
  END IF;

  -- Execute dynamic query to get distinct values
  EXECUTE format(
    'SELECT ARRAY_AGG(DISTINCT val ORDER BY val)
     FROM (
       SELECT %I::text as val
       FROM audio_tracks
       WHERE deleted_at IS NULL
         AND %I IS NOT NULL
         AND %I::text != ''''
     ) sub
     WHERE val IS NOT NULL',
    column_name, column_name, column_name
  ) INTO result;

  RETURN COALESCE(result, ARRAY[]::text[]);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_distinct_column_values(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_distinct_column_values(text) TO anon;
