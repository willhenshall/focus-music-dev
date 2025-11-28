-- RLS Policies for user-photos bucket
-- Run this SQL in Supabase SQL Editor if policies are not automatically applied

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
)
WITH CHECK (
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
