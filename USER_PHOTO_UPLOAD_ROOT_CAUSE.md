# User Photo Upload Root Cause Analysis

## Error
**"Error: Failed to upload avatar"**

## Root Cause Analysis

### Issue #1: Missing Database Column ⚠️ CRITICAL
**Error:** `Could not find the 'avatar_url' column of 'user_profiles' in the schema cache`

**Cause:** The migration file `20251017175156_add_user_avatar_support.sql` exists but was never executed on the database. The `avatar_url` column was never added to the `user_profiles` table.

**Impact:** Application cannot store the URL of uploaded photos, causing the upload to fail when trying to update the user profile.

### Issue #2: Missing Storage Bucket ✅ FIXED
**Error:** `Bucket not found`

**Cause:** The `user-photos` storage bucket didn't exist.

**Status:** ✅ Fixed - bucket created with proper configuration (2MB limit, image formats only)

### Issue #3: Missing RLS Policies ⚠️ PENDING
**Cause:** No Row Level Security policies configured for the user-photos bucket.

**Impact:** Even if the bucket exists and column is added, uploads would fail due to missing permissions.

**Status:** ⚠️ Pending - SQL ready to apply

## The Fix

### What Was Done
1. ✅ Created `user-photos` storage bucket
2. ✅ Configured bucket (2MB limit, JPEG/PNG/WEBP only)
3. ✅ Identified missing `avatar_url` column
4. ✅ Created comprehensive SQL fix

### What Needs to Be Done
Run `COMPLETE_USER_PHOTO_FIX.sql` in Supabase SQL Editor to:
1. Add `avatar_url` column to `user_profiles` table
2. Create 4 RLS policies for user-photos bucket security

## Timeline of Events

1. **Migration Created** (2025-10-17): `add_user_avatar_support.sql` created but not executed
2. **Feature Implemented**: Code written to upload user photos
3. **Bucket Missing**: First error - bucket doesn't exist
4. **Bucket Created**: ✅ Resolved via script
5. **Column Missing**: Second error - avatar_url column doesn't exist ⚠️
6. **Comprehensive Fix Created**: Single SQL file to fix all issues

## Solution Files

- **COMPLETE_USER_PHOTO_FIX.sql** - Complete fix (column + policies)
- **APPLY_USER_PHOTO_POLICIES_NOW.md** - Step-by-step instructions
- **USER_PHOTOS_POLICIES.sql** - Just the RLS policies
- **USER_PHOTO_UPLOAD_FIX.md** - Technical documentation

## How to Complete the Fix

### Option 1: Quick Fix (Recommended)
```bash
# Copy and run COMPLETE_USER_PHOTO_FIX.sql in Supabase SQL Editor
```

### Option 2: Manual Steps
1. Run the column addition SQL
2. Run the RLS policies SQL
3. Verify with the queries at the end

## Prevention

This issue occurred because:
1. Migration file existed but wasn't executed
2. No verification that migrations were applied
3. Schema cache didn't include the column

**Recommendation:** Always verify migrations are applied after creation, especially for storage-related features that span multiple systems (database + storage).

## Build Version
**Issue diagnosed and SQL fix created in build 1446**
