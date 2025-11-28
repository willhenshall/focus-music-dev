# What Was Fixed - CDN Deletion Issue

## Summary
Fixed the bug where audio files (like `179095.mp3`) were not being deleted from Cloudflare R2 CDN when tracks were hard-deleted in the Music Library.

---

## Root Cause
The `sync-to-cdn` edge function only attempted to delete files from CDN if the `cdn_url` field existed in the database. However, newly uploaded tracks might not have this field populated immediately, causing the CDN deletion to be skipped entirely.

---

## Files Modified

### 1. `/supabase/functions/sync-to-cdn/index.ts`

**What Changed:**
- Lines 156-217: Complete rewrite of the delete operation logic
- Now ALWAYS attempts CDN deletion regardless of `cdn_url` presence
- Falls back to using `{track_id}.mp3` as filename when `cdn_url` is missing
- Added comprehensive try-catch error handling
- Added detailed logging for debugging

**Key Changes:**
```typescript
// BEFORE: Only deleted if cdn_url existed
if (trackData.cdn_url) {
  const fileName = trackData.cdn_url.split('/').pop() || '';
  await deleteAudioFromCDN(fileName);
}

// AFTER: Always deletes, using track_id as fallback
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

**What Changed:**
- Line 73: Added `track_id`, `cdn_url`, and `storage_locations` to the database query
- Line 102: Improved track ID resolution logic to prioritize `track_id` field
- Better error handling and logging throughout

**Key Changes:**
```typescript
// BEFORE: Limited query
.select("id, file_path, metadata")

// AFTER: Complete query with CDN fields
.select("id, track_id, file_path, metadata, cdn_url, storage_locations")
```

---

## How It Works Now

### Hard Delete Flow:
1. User clicks "Permanently Delete" in Music Library
2. `permanently-delete-tracks` function is called
3. Function queries database for track details (including track_id, cdn_url)
4. **CDN deletion happens FIRST** via `sync-to-cdn` function
5. `sync-to-cdn` uses either:
   - The filename from `cdn_url` if present, OR
   - Falls back to `{track_id}.mp3` (e.g., `179095.mp3`)
6. Deletes both audio file and metadata sidecar from R2
7. Then deletes from Supabase storage
8. Finally removes database record
9. Cleans up channel playlist references
10. Removes analytics data

---

## What This Fixes

✅ **Fixed Issues:**
- Tracks with missing `cdn_url` field now delete properly from CDN
- Newly uploaded tracks delete correctly from CDN
- No more orphan files left in Cloudflare R2
- Consistent deletion behavior across all tracks

❌ **Does NOT Fix:**
- Existing orphan files (like `179095.mp3`) - these need manual cleanup
- Files uploaded before this fix was deployed

---

## Testing

### Before Deployment:
- Build succeeds: ✅ (Build 1471)
- No TypeScript errors: ✅
- All edge function files valid: ✅

### After Deployment (You Need To Do):
1. Upload a test track
2. Note the track_id (e.g., 179200)
3. Hard delete the track
4. Check Cloudflare R2 → `audio/179200.mp3` should be GONE
5. Check Cloudflare R2 → `metadata/179200.json` should be GONE

---

## Deployment Status

**Code Status:** ✅ FIXED (locally)
**Deployment Status:** ⏳ PENDING (you need to deploy)

**What You Need To Do:**
1. Deploy `sync-to-cdn` edge function to Supabase
2. Deploy `permanently-delete-tracks` edge function to Supabase
3. Test with a sample track
4. Manually clean up existing orphan file `179095.mp3` from R2

**See:** `START_HERE.md` for deployment instructions

---

## Cleanup of Existing Orphans

The existing `179095.mp3` file needs manual removal:

1. Go to Cloudflare Dashboard
2. Navigate to R2 Storage
3. Open `focus-music-audio` bucket
4. Go to `audio` folder
5. Search for `179095`
6. Select `179095.mp3`
7. Click Delete
8. Confirm deletion

---

## Monitoring After Deployment

**Check Function Logs:**
1. Supabase Dashboard → Edge Functions → `sync-to-cdn`
2. Click "Logs" tab
3. Look for these messages:
   - `Track {id} CDN status - storage_locations.r2_cdn: ...`
   - `Successfully attempted to delete audio file: {filename}`
   - `Successfully attempted to delete metadata file: {filename}`

**Verify in Cloudflare:**
1. Check "Class B Operations" count in R2 dashboard
2. Should see DELETE operations occurring
3. File count in `audio` folder should decrease

---

**Build:** 1471
**Status:** Code Fixed, Awaiting Deployment
**Date:** November 20, 2025
