/*
  # Create storage bucket for timer bell audio

  1. Storage
    - Creates `timer-bell` storage bucket for audio files
    - Enables public access for playback
    - Allows admin uploads only

  2. Security
    - Public read access for all users (needed for audio playback)
    - Only admins can upload/update/delete files
*/

-- Create storage bucket for timer bell audio
INSERT INTO storage.buckets (id, name, public)
VALUES ('timer-bell', 'timer-bell', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access (needed for audio playback)
CREATE POLICY "Anyone can view timer bell audio"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'timer-bell');

-- Only admins can upload timer bell audio
CREATE POLICY "Admins can upload timer bell audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'timer-bell' 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );

-- Only admins can update timer bell audio
CREATE POLICY "Admins can update timer bell audio"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'timer-bell' 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );

-- Only admins can delete timer bell audio
CREATE POLICY "Admins can delete timer bell audio"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'timer-bell' 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );
