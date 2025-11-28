# Fix User Photo Upload - Complete Solution

## ⚠️ CRITICAL: Two Issues Found

The user photo upload is failing because:
1. ❌ The `avatar_url` column is missing from `user_profiles` table
2. ❌ RLS policies for `user-photos` bucket are not applied

## Quick Fix - Run This SQL

### Open Supabase SQL Editor and run `COMPLETE_USER_PHOTO_FIX.sql`

**Or copy and paste this:**

```sql
-- ============================================================================
-- COMPLETE USER PHOTO UPLOAD FIX
-- ============================================================================

-- STEP 1: Add avatar_url column to user_profiles
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

-- STEP 2: Create RLS policies for user-photos storage bucket
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

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

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-photos');
```

## Steps to Apply

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Click **New Query**
4. Copy the SQL above (or use `COMPLETE_USER_PHOTO_FIX.sql`)
5. Click **Run**

## What Gets Fixed

✅ Adds `avatar_url` column to store the photo URL
✅ Creates upload policy (users upload to own folder)
✅ Creates update policy (users update own photos)
✅ Creates delete policy (users delete own photos)
✅ Creates read policy (public can view avatars)

## After Running

- ✅ User photo upload will work
- ✅ Photos stored securely
- ✅ Users can only manage their own photos
- ✅ Error "Failed to upload avatar" will be resolved

## Verification

The SQL includes verification queries at the end that will show:
- Column `avatar_url` exists in `user_profiles`
- 4 storage policies created successfully
