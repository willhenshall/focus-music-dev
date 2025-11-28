/*
  # Add RLS Policies for Preview Tracks

  1. Changes
    - Add policy to allow anonymous users to read preview tracks
    - This enables the quiz results page to fetch and play preview tracks for non-authenticated users
  
  2. Security
    - Only tracks marked as is_preview=true are accessible
    - Only non-deleted tracks are accessible
    - Read-only access for anonymous users
*/

-- Allow anonymous users to read preview tracks
CREATE POLICY "Anyone can view preview tracks"
  ON audio_tracks
  FOR SELECT
  TO anon
  USING (
    is_preview = true 
    AND deleted_at IS NULL
  );
