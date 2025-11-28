/*
  # Backfill channels field from sidecar JSON files

  1. Problem
    - Legacy channel names are stored in sidecar JSON files as 'channels' field
    - After database migration, this field was not imported into metadata JSONB
    - Slot strategy editor needs this field for "Genre (Legacy Channel)" dropdown
    - 50,000+ existing users depend on this legacy channel functionality

  2. Solution
    - Create a temporary function to backfill channels from sidecar files
    - This updates the metadata JSONB column to include channels and channel_ids
    - Preserves all existing metadata while adding the missing fields

  3. Data Source
    - Sidecar JSON files in 'audio-sidecars' storage bucket
    - Files are named {track_id}.json
    - Structure: { "metadata": { "channels": "Channel Name", "channel_ids": "123" } }

  4. Impact
    - Restores legacy channel filtering functionality
    - Enables slot strategy editor to show legacy channel options
    - No data loss - only adds missing fields
*/

-- Create a temporary function to update a single track's metadata with channels info
CREATE OR REPLACE FUNCTION backfill_track_channels(
  p_track_id text,
  p_channels text,
  p_channel_ids text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_metadata jsonb;
  v_updated_metadata jsonb;
BEGIN
  -- Get current metadata
  SELECT metadata INTO v_current_metadata
  FROM audio_tracks
  WHERE metadata->>'track_id' = p_track_id
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_current_metadata IS NULL THEN
    RETURN false;
  END IF;

  -- Update metadata with channels and channel_ids
  v_updated_metadata := v_current_metadata
    || jsonb_build_object('channels', p_channels)
    || jsonb_build_object('channel_ids', p_channel_ids);

  -- Update the track
  UPDATE audio_tracks
  SET metadata = v_updated_metadata
  WHERE metadata->>'track_id' = p_track_id
    AND deleted_at IS NULL;

  RETURN true;
END;
$$;

-- Grant execute to authenticated users and service role
GRANT EXECUTE ON FUNCTION backfill_track_channels(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION backfill_track_channels(text, text, text) TO service_role;

-- Note: The actual backfill must be done via application code that can:
-- 1. Read sidecar files from storage
-- 2. Call this function for each track
-- This migration only creates the helper function

COMMENT ON FUNCTION backfill_track_channels IS
'Helper function to backfill channels field from sidecar JSON files. Must be called from application code.';
