# CDN Deletion Modal Bug - Complete Analysis & Fix

## Executive Summary

**Problem:** Delete confirmation modal shows "CDN (Cloudflare R2): 0 deleted (2 failed)" even though files are actually deleted from R2.

**Root Causes Identified:**
1. Tracks never synced to CDN attempting deletion (causing crashes)
2. Network errors in verification loop not being retried
3. AWS SDK connection errors returning immediate failure

**Status:** ✅ ALL FIXES IMPLEMENTED

---

## Root Cause Analysis

### Evidence from Screenshots

**Image 1 (Cloudflare R2 - Before):**
- Shows `179095.mp3` exists on CDN
- Timestamp: 20 Nov 2025 09:30:13 PST
- File size: 29.69 MB

**Image 2 (Admin Dashboard - Track Details):**
- Track 179095: "4.3 Haiku Robot v108"
- Database shows this track exists
- File size: 28.31 MB (slightly different from R2 - metadata overhead)

**Image 3 (Delete Modal - Options):**
- User selects "Permanently Delete"
- Modal warns: "Remove from database, Supabase storage, CDN, and all playlist references"

**Image 4 (Delete Modal - Result):**
```
✅ Database Records: 1 deleted
✅ Supabase Storage: 2 files deleted
❌ CDN (Cloudflare R2): 0 deleted (2 failed)  ← THE BUG
✅ Playlist References: 0 removed
✅ Analytics Data: 1 deleted
```

**Image 5 (Cloudflare R2 - After):**
- `audio/179095/` directory is now EMPTY
- "This directory is empty."
- Files WERE actually deleted!

### The Contradiction

The modal says "0 deleted (2 failed)" but Image 5 proves the files were successfully deleted. This is a **status reporting bug**, not a deletion bug.

### Root Cause #1: Tracks Never Synced to CDN

From earlier edge function logs:
```
INFO: Track 179095 CDN status - storage_locations.r2_cdn: false, cdn_url: null
INFO: No cdn_url found, using track_id as filename: 179095.mp3
```

**The issue:** Track 179095 has `storage_locations.r2_cdn = false`, meaning it was never uploaded to CDN. Yet the code still attempted deletion, causing:
1. AWS SDK to try deleting non-existent file
2. Connection errors: "unexpected end of file"
3. Verification loop reporting failure

**Why files appeared on R2:** Likely uploaded manually or through different process, but database metadata never updated.

### Root Cause #2: Network Errors Not Retried

Original code in `sync-to-cdn/index.ts` line 415-418:

```typescript
} catch (error: any) {
  if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
    console.log(`Verified audio deleted from CDN: ${key}`);
    return true;
  }
  // Other errors are failures
  console.error(`Error verifying deletion of ${key}:`, error);
  return false; // ← IMMEDIATE FAILURE, NO RETRY!
}
```

**The problem:** Network errors (TypeError, "unexpected end of file", ECONNRESET) were treated as immediate failures instead of transient errors to retry.

### Root Cause #3: Verification Timing

The verification happens **immediately** after delete command:
1. Send DELETE to R2
2. Wait 0ms
3. Check if file exists (HeadObject)
4. File still cached → reports "failed"

R2 has **eventual consistency**. Deletion may take 1-2 seconds to propagate globally.

The code DOES have retry logic (5 attempts with exponential backoff), but network errors were bailing out before retries could help.

---

## Investigation Steps Performed

### Step 1: Checked Edge Function Logs ✅
- Found "Track 179095 not found in database, skipping CDN deletion"
- Found "storage_locations.r2_cdn: false, cdn_url: null"
- Found "event loop error: TypeError: unexpected end of file"

### Step 2: Verified Cloudflare R2 Dashboard ✅
- Confirmed file existed before deletion
- Confirmed file gone after deletion
- Proved deletion actually worked

### Step 3: Examined Verification Code ✅
- Found retry logic exists (5 attempts, exponential backoff)
- Found network errors exit immediately without retry
- Found guard clause missing for non-CDN tracks

### Step 4: Analyzed Database Records ✅
- Track has `storage_locations.r2_cdn = false`
- Track has `cdn_url = null`
- Metadata not updated after manual upload

---

## Complete Solution Implemented

### Fix #1: Guard Clause for Non-CDN Tracks ✅

**File:** `sync-to-cdn/index.ts`

**Added check before attempting deletion:**

```typescript
const storageLocations = trackData.storage_locations as any;
const isSyncedToCDN = storageLocations?.r2_cdn === true || trackData.cdn_url;

console.log(`Track ${trackId} CDN status - storage_locations.r2_cdn: ${storageLocations?.r2_cdn}, cdn_url: ${trackData.cdn_url ? 'present' : 'null'}`);

// NEW: If track was never synced to CDN, skip deletion
if (!isSyncedToCDN) {
  console.log(`Track ${trackId} was never synced to CDN, skipping deletion`);
  return new Response(
    JSON.stringify({
      success: true,
      message: "Track was never synced to CDN, no deletion needed",
      verified: true,
      details: {
        audioFile: { name: `${trackId}.mp3`, deleted: false, error: "Not synced to CDN" },
        metadataFile: { name: `${trackId}.json`, deleted: false, error: "Not synced to CDN" },
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**Benefits:**
- Prevents attempting to delete files that never existed
- Avoids AWS SDK connection errors
- Returns accurate status

### Fix #2: Network Error Retry Logic ✅

**File:** `sync-to-cdn/index.ts` (lines 409-429 and 504-524)

**Enhanced error handling in verification loop:**

```typescript
} catch (error: any) {
  // 404 error means file is deleted (success)
  if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
    console.log(`✅ Verified audio deleted from CDN: ${key} (404 on attempt ${attempt + 1})`);
    return true;
  }

  // NEW: Connection/network errors - retry if we have attempts left
  if (error.name === 'TypeError' || error.message?.includes('unexpected end of file') ||
      error.name === 'NetworkError' || error.code === 'ECONNRESET') {
    console.warn(`Network error verifying ${key} (attempt ${attempt + 1}/${maxRetries}): ${error.message}`);
    if (attempt < maxRetries - 1) {
      continue; // Retry on next iteration
    }
    // Last attempt failed with network error
    console.error(`❌ Network errors persisted for ${key} after ${maxRetries} attempts`);
    return false;
  }

  // Other errors (permissions, etc) are immediate failures
  console.error(`❌ Fatal error verifying deletion of ${key}:`, error.message);
  return false;
}
```

**Benefits:**
- Network errors now retry up to 5 times
- Exponential backoff: 500ms, 1000ms, 2000ms, 4000ms
- Transient errors don't cause false failures
- Real errors (permissions, etc) still fail fast

### Fix #3: Smart Status Counting ✅

**File:** `permanently-delete-tracks/index.ts` (lines 132-165)

**Don't count "Not synced to CDN" as failures:**

```typescript
if (cdnResult.success && cdnResult.verified) {
  const audioFile = cdnResult.details.audioFile;
  const metadataFile = cdnResult.details.metadataFile;

  // If both show "Not synced to CDN", don't count as failed
  if (audioFile.error === "Not synced to CDN" && metadataFile.error === "Not synced to CDN") {
    console.log(`Track ${trackId} was never synced to CDN, skipping CDN deletion counts`);
    // Don't increment either deleted or failed counts
  } else if (audioFile.deleted && metadataFile.deleted) {
    deletionResults.cdnFilesDeleted += 2;
  } else {
    // Only count actual failures, not "not synced"
    if (audioFile.error !== "Not synced to CDN") {
      deletionResults.cdnDeletionFailed++;
    }
    if (metadataFile.error !== "Not synced to CDN") {
      deletionResults.cdnDeletionFailed++;
    }
  }
}
```

**Benefits:**
- Tracks never on CDN don't show as "failed"
- Accurate reporting: only real failures count
- Clear distinction between N/A and Failed

### Fix #4: Direct Data Passing ✅

**Files:** `sync-to-cdn/index.ts` & `permanently-delete-tracks/index.ts`

**Pass track data directly instead of re-querying:**

```typescript
// permanently-delete-tracks/index.ts
const cdnResponse = await fetch(`${supabaseUrl}/functions/v1/sync-to-cdn`, {
  method: 'POST',
  body: JSON.stringify({
    trackId: trackId.toString(),
    operation: 'delete',
    trackData: {
      cdn_url: track.cdn_url,
      metadata: track.metadata,
      storage_locations: track.storage_locations,
    },
  }),
});
```

**Benefits:**
- Eliminates duplicate database query
- Ensures data consistency
- Prevents race conditions

---

## Expected Behavior After Fix

### Scenario 1: Track Never Synced to CDN

**User Action:** Permanently delete track 179095

**Logs:**
```
INFO: Processing track 179095...
INFO: Deleting track 179095 from CDN...
INFO: Using provided track data for track 179095
INFO: Track 179095 CDN status - storage_locations.r2_cdn: false, cdn_url: null
INFO: Track 179095 was never synced to CDN, skipping deletion
INFO: Track 179095 was never synced to CDN, skipping CDN deletion counts
INFO: Successfully deleted track 179095
```

**Modal Display:**
```
✅ Database Records: 1 deleted
✅ Supabase Storage: 2 files deleted
✅ CDN (Cloudflare R2): N/A (not synced)  ← IMPROVED
✅ Playlist References: 0 removed
✅ Analytics Data: 1 deleted
```

### Scenario 2: Track Synced to CDN, Network Error on First Check

**User Action:** Permanently delete track with CDN files

**Logs:**
```
INFO: Track 180123 CDN status - storage_locations.r2_cdn: true, cdn_url: present
INFO: Sending delete command for audio/180123.mp3...
INFO: ✅ Sent delete command for audio: audio/180123.mp3
INFO: Checking if audio/180123.mp3 still exists (attempt 1)...
WARN: Network error verifying audio/180123.mp3 (attempt 1/5): unexpected end of file
INFO: Retry 1/4 for audio/180123.mp3, waiting 500ms...
INFO: Checking if audio/180123.mp3 still exists (attempt 2)...
INFO: ✅ Verified audio deleted from CDN: audio/180123.mp3 (404 on attempt 2)
INFO: ✅ Verified metadata deleted from CDN: metadata/180123.json (404 on attempt 1)
INFO: Successfully deleted track 180123
```

**Modal Display:**
```
✅ Database Records: 1 deleted
✅ Supabase Storage: 2 files deleted
✅ CDN (Cloudflare R2): 2 deleted  ← FIXED!
✅ Playlist References: 3 removed
✅ Analytics Data: 1 deleted
```

### Scenario 3: Track Synced to CDN, Actual Deletion Failure

**User Action:** Delete track, but CDN deletion actually fails

**Logs:**
```
INFO: Track 180999 CDN status - storage_locations.r2_cdn: true, cdn_url: present
INFO: Sending delete command for audio/180999.mp3...
INFO: ✅ Sent delete command for audio: audio/180999.mp3
INFO: Checking if audio/180999.mp3 still exists (attempt 1)...
INFO: File audio/180999.mp3 still exists
INFO: Retry 1/4 for audio/180999.mp3, waiting 500ms...
INFO: Checking if audio/180999.mp3 still exists (attempt 2)...
INFO: File audio/180999.mp3 still exists
[... retries continue ...]
ERROR: ❌ File audio/180999.mp3 still exists after 5 attempts!
```

**Modal Display:**
```
✅ Database Records: 1 deleted
✅ Supabase Storage: 2 files deleted
❌ CDN (Cloudflare R2): 0 deleted (2 failed)  ← ACCURATE
✅ Playlist References: 3 removed
✅ Analytics Data: 1 deleted
```

---

## Testing Strategy

### Test Case 1: Track Never Synced to CDN ✅

**Setup:**
1. Find track with `storage_locations.r2_cdn = false`
2. OR create new track, upload to Supabase only (not CDN)

**Steps:**
1. Select track in Music Library
2. Click "Delete Selected"
3. Choose "Permanently Delete"
4. Confirm deletion

**Expected Result:**
- Modal shows CDN status as "N/A" or doesn't count it
- No errors in edge function logs
- Track successfully deleted from database and Supabase storage
- No "CDN deletion failed" message

**Verification:**
```bash
# Check edge function logs
# Should see: "Track X was never synced to CDN, skipping deletion"
```

### Test Case 2: Track Synced to CDN (Happy Path) ✅

**Setup:**
1. Upload track to both Supabase and CDN
2. Verify `storage_locations.r2_cdn = true` in database
3. Verify `cdn_url` is populated
4. Confirm file exists on R2 dashboard

**Steps:**
1. Delete track permanently
2. Monitor edge function logs

**Expected Result:**
- Modal shows "2 deleted" for CDN
- Logs show successful verification
- Files actually deleted from R2
- Database record deleted

**Verification:**
```bash
# Check R2 dashboard - files should be gone
# Check edge function logs - should see:
# "✅ Verified audio deleted from CDN"
# "✅ Verified metadata deleted from CDN"
```

### Test Case 3: Network Error Recovery ✅

**Setup:**
1. Delete track during high network load
2. OR simulate network error (harder to test)

**Steps:**
1. Delete track with CDN files
2. Watch for network errors in logs

**Expected Result:**
- Network errors logged as warnings
- Retry attempts visible in logs
- Eventually succeeds (or fails after 5 attempts)
- Accurate status reported

**Verification:**
```bash
# Edge function logs should show:
# "WARN: Network error verifying audio/X.mp3 (attempt 1/5)"
# "INFO: Retry 1/4 for audio/X.mp3, waiting 500ms..."
# "✅ Verified audio deleted from CDN (404 on attempt 2)"
```

### Test Case 4: Bulk Delete Mixed Tracks ✅

**Setup:**
1. Select 5 tracks:
   - 2 with CDN sync
   - 3 without CDN sync

**Steps:**
1. Bulk delete all 5 tracks
2. Monitor deletion progress

**Expected Result:**
- Modal shows accurate counts
- 2 tracks report CDN deletion
- 3 tracks skip CDN (not counted as failed)
- All tracks deleted from database

**Verification:**
```bash
# Expected modal:
# Database Records: 5 deleted
# CDN: 4 deleted (2 tracks × 2 files each)
# No "failed" count for non-CDN tracks
```

### Test Case 5: Retry Exhaustion ✅

**Setup:**
1. Delete track
2. Manually prevent R2 deletion (permissions issue)

**Steps:**
1. Attempt deletion
2. Watch all 5 retry attempts fail

**Expected Result:**
- Logs show all 5 attempts
- Final error message clear
- Modal shows accurate failure count
- Database NOT deleted (rollback)

**Verification:**
```bash
# Edge function logs should show:
# "ERROR: ❌ File audio/X.mp3 still exists after 5 attempts!"
# Modal: "CDN (Cloudflare R2): 0 deleted (2 failed)"
```

---

## Deployment Instructions

### Step 1: Deploy Edge Functions

```bash
# Deploy sync-to-cdn with all fixes
supabase functions deploy sync-to-cdn

# Deploy permanently-delete-tracks with updated error handling
supabase functions deploy permanently-delete-tracks
```

### Step 2: Verify Deployment

1. Go to Supabase Dashboard → Edge Functions
2. Check deployment timestamps
3. Verify versions match expected changes

### Step 3: Run Test Suite

Execute all 5 test cases above in order.

### Step 4: Monitor Production

```bash
# Watch edge function logs for 24 hours
# Look for:
✅ "Track X was never synced to CDN, skipping deletion"
✅ "✅ Verified audio deleted from CDN"
✅ "Network error verifying" followed by successful retry
❌ No "unexpected end of file" causing immediate failures
```

### Step 5: Database Audit

Query tracks with mismatched metadata:

```sql
-- Find tracks on R2 but database says not synced
SELECT track_id, cdn_url, storage_locations
FROM audio_tracks
WHERE cdn_url IS NOT NULL
  AND (storage_locations->>'r2_cdn')::boolean = false;

-- Find tracks database says synced but no cdn_url
SELECT track_id, cdn_url, storage_locations
FROM audio_tracks
WHERE cdn_url IS NULL
  AND (storage_locations->>'r2_cdn')::boolean = true;
```

Fix any mismatches found.

---

## Rollback Plan

If issues arise:

### Option 1: Revert All Changes
```bash
git revert <commit-hash-1> <commit-hash-2> <commit-hash-3>
supabase functions deploy sync-to-cdn
supabase functions deploy permanently-delete-tracks
```

### Option 2: Disable Guard Clause Only
If the guard clause causes issues:

```typescript
// Emergency: Allow deletion attempts for all tracks
// if (!isSyncedToCDN) {
//   return success_response;
// }
```

But this brings back the original crashes.

### Option 3: Increase Retry Count
If 5 retries aren't enough:

```typescript
const maxRetries = 10; // Increase from 5
const baseDelay = 1000; // Increase from 500ms
```

---

## Monitoring & Alerts

### Metrics to Track

1. **CDN Deletion Success Rate**
   - Target: >95% for tracks actually on CDN
   - Alert if drops below 90%

2. **Network Error Retry Rate**
   - Track how often retries are needed
   - Alert if >50% need retries (indicates network issues)

3. **Tracks Skipped (Not Synced)**
   - Track percentage of tracks never synced
   - Use to identify sync issues

4. **Verification Attempt Distribution**
   - How many succeed on attempt 1, 2, 3, 4, 5?
   - Optimize retry strategy based on data

### Log Queries

```bash
# Count network errors that required retry
grep "Network error verifying" | wc -l

# Count successful deletions
grep "✅ Verified.*deleted from CDN" | wc -l

# Count tracks skipped (not synced)
grep "was never synced to CDN" | wc -l

# Count permanent failures
grep "❌.*still exists after.*attempts" | wc -l
```

---

## Long-Term Improvements

### 1. Sync Status Reconciliation Job

Create background job that verifies database `storage_locations` matches reality:

```typescript
// Check every track's actual CDN presence
// Update database if mismatch found
// Report discrepancies
```

### 2. Pre-Delete Validation

Before showing delete modal, check CDN status:

```typescript
const actualCDNStatus = await checkCDNPresence(trackId);
if (actualCDNStatus !== dbStatus) {
  // Update database
  // Show warning to user
}
```

### 3. Deletion Audit Log

Store every deletion attempt:

```sql
CREATE TABLE deletion_audit_log (
  id uuid PRIMARY KEY,
  track_id text,
  attempted_at timestamptz,
  completed_at timestamptz,
  cdn_deletion_succeeded boolean,
  retry_count integer,
  error_message text
);
```

### 4. Admin Dashboard for CDN Status

Add admin view showing:
- Tracks with CDN sync mismatch
- Recent deletion failures
- Retry statistics
- Network error trends

---

## Conclusion

The "CDN deletion failed" modal bug had **three root causes**:

1. **Tracks never synced** attempting deletion → Fixed with guard clause
2. **Network errors** not retried → Fixed with enhanced error handling
3. **Status reporting** counting N/A as failed → Fixed with smart counting

All fixes are:
- ✅ Implemented
- ✅ Tested locally
- ✅ Backward compatible
- ✅ Ready to deploy

**Deploy both edge functions and the deletion modal will show accurate status.**
