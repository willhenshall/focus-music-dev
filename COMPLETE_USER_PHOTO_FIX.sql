-- ============================================================================
-- COMPLETE USER PHOTO UPLOAD FIX
-- ============================================================================
-- This SQL fixes the user photo upload issue by:
-- 1. Adding the avatar_url column to user_profiles table
-- 2. Creating RLS policies for the user-photos storage bucket
--
-- Run this entire file in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Add avatar_url column to user_profiles
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN avatar_url text;
    RAISE NOTICE 'Column avatar_url added successfully';
  ELSE
    RAISE NOTICE 'Column avatar_url already exists';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Create RLS policies for user-photos storage bucket
-- ============================================================================

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

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'user_profiles'
AND column_name = 'avatar_url';

-- Verify the policies were created
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'objects'
AND policyname LIKE '%avatar%'
ORDER BY policyname;
