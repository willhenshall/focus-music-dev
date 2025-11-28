/*
  # Update Preview Track RLS Policy

  1. Changes
    - Drop the old preview track policy
    - Create new policy using preview_channel_id
    - Ensures anonymous users can only see tracks marked as preview
  
  2. Security
    - Only tracks with is_preview=true and preview_channel_id set are accessible
    - Only non-deleted tracks are accessible
    - Read-only access for anonymous users
*/

-- Drop the old policy
DROP POLICY IF EXISTS "Anyone can view preview tracks" ON audio_tracks;

-- Create new policy using preview_channel_id
CREATE POLICY "Anyone can view preview tracks"
  ON audio_tracks
  FOR SELECT
  TO anon
  USING (
    is_preview = true 
    AND preview_channel_id IS NOT NULL
    AND deleted_at IS NULL
  );