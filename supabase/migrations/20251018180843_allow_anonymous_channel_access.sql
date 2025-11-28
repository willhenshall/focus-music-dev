/*
  # Allow Anonymous Access to Audio Channels
  
  1. Changes
    - Add RLS policy to allow anonymous (anon) users to view audio channels
    - This enables the quiz to load channel data for anonymous users
  
  2. Security
    - Read-only access for anonymous users
    - Maintains existing authenticated and admin policies
*/

CREATE POLICY "Anonymous users can view channels"
  ON audio_channels
  FOR SELECT
  TO anon
  USING (true);
