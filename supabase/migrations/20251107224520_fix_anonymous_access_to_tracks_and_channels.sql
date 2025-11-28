/*
  # Fix Anonymous Access to Audio Tracks and Channels

  This migration fixes the critical issue preventing the app from working.
  
  ## Problem
  - RLS policies on audio_tracks and audio_channels require authentication
  - Anonymous users cannot view tracks or channels
  - App is completely non-functional without authentication
  
  ## Solution
  - Drop restrictive policies that require authentication
  - Create new policies allowing anonymous (anon) access
  - Maintain security while enabling public read access
  
  ## Changes
  1. Drop old "Anyone can view tracks" policy (authenticated only)
  2. Create new policy allowing anonymous SELECT access to audio_tracks
  3. Drop old "Anyone can view channels" policy (authenticated only)
  4. Create new policy allowing anonymous SELECT access to audio_channels
*/

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Anyone can view tracks" ON audio_tracks;
DROP POLICY IF EXISTS "Anyone can view channels" ON audio_channels;

-- Create new policies allowing anonymous access
CREATE POLICY "Public can view audio tracks"
  ON audio_tracks FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Public can view audio channels"
  ON audio_channels FOR SELECT
  TO anon, authenticated
  USING (true);
