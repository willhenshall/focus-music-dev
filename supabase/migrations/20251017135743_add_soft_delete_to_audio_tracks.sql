/*
  # Add Soft Delete Support to Audio Tracks

  1. Changes
    - Add `deleted_at` column to `audio_tracks` table
    - Add `deleted_by` column to track which admin deleted the track
    - Create index on `deleted_at` for efficient querying
    - Update RLS policies to exclude deleted tracks by default

  2. Notes
    - Tracks with a `deleted_at` timestamp are considered soft-deleted
    - After 28 days, tracks should be permanently deleted (handled by scheduled job)
    - Deleted tracks are hidden from normal queries but accessible in deleted tracks view
*/

-- Add soft delete columns
ALTER TABLE audio_tracks 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for efficient querying of deleted/non-deleted tracks
CREATE INDEX IF NOT EXISTS idx_audio_tracks_deleted_at ON audio_tracks(deleted_at);

-- Drop old policy if exists
DROP POLICY IF EXISTS "Users can view all tracks" ON audio_tracks;

-- Allow users to view non-deleted tracks
CREATE POLICY "Users can view non-deleted tracks"
  ON audio_tracks
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- Allow admins to view deleted tracks
CREATE POLICY "Admins can view deleted tracks"
  ON audio_tracks
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Allow admins to soft delete tracks
CREATE POLICY "Admins can soft delete tracks"
  ON audio_tracks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Allow admins to permanently delete tracks (for cleanup jobs)
CREATE POLICY "Admins can permanently delete old tracks"
  ON audio_tracks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    AND deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '28 days'
  );
