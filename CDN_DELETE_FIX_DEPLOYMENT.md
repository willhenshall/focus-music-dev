# CDN Hard Delete Fix - Deployment Guide

## Problem
When tracks were hard deleted in the Music Library, they were not being deleted from the Cloudflare R2 CDN. For example, `179095.mp3` remained in the CDN even after hard deletion from the app.

## Root Cause
The `sync-to-cdn` edge function had a critical bug where it would only delete files from CDN if the `cdn_url` field was present in the database. However, newly uploaded tracks might not have `cdn_url` set immediately, or the field could be missing, causing the deletion to be skipped.

## Changes Made

### 1. `/supabase/functions/sync-to-cdn/index.ts`
**Key Changes:**
- Now ALWAYS attempts to delete from CDN when delete operation is called, regardless of `cdn_url` presence
- Falls back to using `{track_id}.mp3` as filename if `cdn_url` is not available
- Added comprehensive error handling and logging
- Removed the conditional check that was preventing deletions

**Before:**
```typescript
if (trackData.cdn_url) {
  const fileName = trackData.cdn_url.split('/').pop() || '';
  await deleteAudioFromCDN(fileName);
}
```

**After:**
```typescript
let fileName = '';
if (trackData.cdn_url) {
  fileName = trackData.cdn_url.split('/').pop() || '';
} else {
  fileName = `${trackId}.mp3`;
  console.log(`No cdn_url found, using track_id as filename: ${fileName}`);
}

try {
  await deleteAudioFromCDN(fileName);
  console.log(`Successfully attempted to delete audio file: ${fileName}`);
} catch (error: any) {
  console.error(`Error deleting audio file ${fileName}:`, error.message);
}
```

### 2. `/supabase/functions/permanently-delete-tracks/index.ts`
**Key Changes:**
- Added `track_id`, `cdn_url`, and `storage_locations` to the track query
- Moved CDN deletion to happen BEFORE Supabase storage deletion
- Updated track ID resolution to prioritize the `track_id` column

**Query Enhancement:**
```typescript
// Before
select("id, file_path, metadata")

// After
select("id, track_id, file_path, metadata, cdn_url, storage_locations")
```

## Deployment Instructions

### Option 1: Deploy via Supabase Dashboard
1. Go to your Supabase Dashboard
2. Navigate to Edge Functions
3. Find `sync-to-cdn` function
4. Click "Deploy new version"
5. Copy the contents of `/supabase/functions/sync-to-cdn/index.ts`
6. Deploy
7. Repeat for `permanently-delete-tracks` function

### Option 2: Deploy via Supabase CLI
If you have Supabase CLI installed:

```bash
# Deploy sync-to-cdn function
supabase functions deploy sync-to-cdn

# Deploy permanently-delete-tracks function
supabase functions deploy permanently-delete-tracks
```

### Option 3: Deploy Both Functions Together
```bash
supabase functions deploy sync-to-cdn permanently-delete-tracks
```

## Testing the Fix

### Test Case 1: Delete Existing CDN File (179095.mp3)
1. Go to Music Library in admin dashboard
2. Search for track 179095 (if it still exists in database)
3. Select the track and hard delete it
4. Check Cloudflare R2 dashboard at `audio/179095.mp3` - it should be deleted

### Test Case 2: Upload New Track and Delete
1. Upload a new track to the Music Library
2. Note the track_id (e.g., 179100)
3. Hard delete the track immediately
4. Verify the file is removed from both:
   - Supabase storage (audio-files bucket)
   - Cloudflare R2 CDN (audio/ folder)

### Test Case 3: Manually Delete Orphaned File
If `179095.mp3` is still in the CDN, you can:
- Manually delete it from Cloudflare R2 dashboard, OR
- Create a test track with ID 179095, sync it to CDN, then delete it (this will properly clean up)

## Verification

After deployment, check the Supabase Function Logs for:
- `Track {trackId} CDN status - storage_locations.r2_cdn: ...`
- `Successfully attempted to delete audio file: {filename}`
- `Successfully attempted to delete metadata file: {filename}`

## Expected Behavior

✅ **Soft Delete**: Files remain in both Supabase and CDN (for 28-day recovery period)

✅ **Hard Delete**: Files are removed from:
1. Cloudflare R2 CDN (audio/ and metadata/ folders)
2. Supabase storage (audio-files bucket)
3. Database record
4. Channel playlist references
5. Analytics data

## Monitoring

To verify CDN deletions are working:
1. Check Cloudflare R2 Operations count in dashboard
2. Monitor "Class B Operations" for DELETE requests
3. Check Supabase Function Logs for successful deletion messages
4. Verify track count in R2 bucket decreases after hard deletes

## Rollback

If issues occur, the previous version can be restored by reverting:
- `/supabase/functions/sync-to-cdn/index.ts`
- `/supabase/functions/permanently-delete-tracks/index.ts`

Then redeploy the previous versions.

---

**Build Version**: 1469
**Date**: 2025-11-19
**Status**: Ready for Deployment
