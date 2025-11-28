/*
  # Add User Avatar Support

  1. Changes
    - Add `avatar_url` column to `user_profiles` table
    - Create `user-photos` storage bucket for profile pictures
    - Set up RLS policies for the bucket

  2. Security
    - Users can only upload their own photos
    - Photos are publicly readable
    - Only authenticated users can upload
*/

-- Add avatar_url column to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

-- Create user-photos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-photos', 'user-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;

-- Allow authenticated users to upload their own photos
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own photos
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'user-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own photos
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to all user photos
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-photos');
