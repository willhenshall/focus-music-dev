# CDN Deletion Verification Fix

## Problem

When deleting tracks, the system reported CDN deletion as "successful" even though files remained on Cloudflare R2. The S3 `DeleteObjectCommand` API returns success regardless of whether the file exists, making it impossible to verify actual deletion.

## Root Cause

The AWS S3/Cloudflare R2 API behavior:
- `DeleteObjectCommand` returns HTTP 204 (success) even if the file doesn't exist
- No error is thrown if deletion fails or file is already gone
- This is intentional API design (idempotent deletes)

This meant the system incorrectly reported CDN deletion as successful when files were still present.

## Solution

Implemented **post-deletion verification** using the S3 `HeadObjectCommand`:

1. **Send delete command** - Attempt to delete the file
2. **Verify with HEAD** - Try to access the file metadata
3. **Check response**:
   - If HEAD returns 404/NotFound → File is deleted ✅
   - If HEAD returns 200/OK → File still exists ❌
   - If HEAD throws error → Deletion failed ❌

## Changes Made

### 1. sync-to-cdn Edge Function

**Updated imports:**
```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "npm:@aws-sdk/client-s3@3";
```

**Updated deleteAudioFromCDN():**
- Returns `Promise<boolean>` instead of `Promise<void>`
- Sends delete command
- Verifies deletion with HEAD request
- Returns `true` only if file is confirmed deleted (404)
- Returns `false` if file still exists
- Throws error for other failures

**Updated deleteMetadataFromCDN():**
- Same verification logic as audio deletion
- Returns boolean success status

**Updated delete operation response:**
```typescript
{
  success: boolean,        // true only if BOTH files verified deleted
  message: string,
  verified: true,          // indicates verification was performed
  details: {
    audioFile: {
      name: string,
      deleted: boolean,     // verified deletion status
      error: string | null
    },
    metadataFile: {
      name: string,
      deleted: boolean,     // verified deletion status
      error: string | null
    }
  }
}
```

### 2. permanently-delete-tracks Edge Function

**Updated CDN deletion handling:**
- Parses verified deletion results from sync-to-cdn
- Separately tracks audio and metadata deletion
- Only increments `cdnFilesDeleted` for verified deletions
- Increments `cdnDeletionFailed` for files that still exist
- Adds specific error messages for each failed deletion

**Result tracking:**
```typescript
if (cdnResult.success && cdnResult.verified) {
  if (cdnResult.details.audioFile.deleted && cdnResult.details.metadataFile.deleted) {
    deletionResults.cdnFilesDeleted += 2; // both verified
  } else {
    // Track partial failures individually
    if (cdnResult.details.audioFile.deleted) {
      deletionResults.cdnFilesDeleted++;
    } else {
      deletionResults.cdnDeletionFailed++;
      deletionResults.errors.push(`CDN audio for ${trackId}: Still exists`);
    }
    // ... same for metadata
  }
}
```

### 3. Frontend Display

No changes needed - the modal already displays:
- ✅ CDN files successfully deleted (verified)
- ❌ CDN files failed to delete (with error messages)

## Verification Process

For each track deletion:

1. **Attempt deletion** on R2
2. **Verify by HEAD request**
3. **Report actual status**:
   - "2 deleted" = Both audio + metadata verified gone
   - "1 deleted (1 failed)" = Partial deletion
   - "0 deleted (2 failed)" = Files still exist

## Benefits

1. **Accuracy** - Only reports success when files are actually deleted
2. **Debugging** - Identifies which specific files failed to delete
3. **Reliability** - Admin knows the true state of CDN storage
4. **Transparency** - No false positives in deletion status

## Example Scenarios

### Scenario 1: Successful Deletion
```
CDN (Cloudflare R2): ✅ 2 deleted
```
- Both audio and metadata verified as deleted
- Files return 404 when checked

### Scenario 2: Partial Failure
```
CDN (Cloudflare R2): ❌ 1 deleted (1 failed)
Errors:
- CDN audio file for 179095: Still exists
```
- Metadata deleted, audio file remains
- Admin knows exactly what failed

### Scenario 3: Complete Failure
```
CDN (Cloudflare R2): ❌ 0 deleted (2 failed)
Errors:
- CDN audio file for 179095: Still exists
- CDN metadata file for 179095: Still exists
```
- Both files remain on CDN
- No false success reported

## Technical Details

### HEAD Request Logic

```typescript
async function deleteAudioFromCDN(fileName: string): Promise<boolean> {
  const s3Client = getS3Client();
  const key = `${R2_CONFIG.audioPath}/${fileName}`;

  // Step 1: Delete
  await s3Client.send(new DeleteObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
  }));

  // Step 2: Verify
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    }));
    // File still exists!
    return false;
  } catch (error: any) {
    // 404 = success
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return true;
    }
    throw error;
  }
}
```

## Deployment

The edge functions need to be deployed for changes to take effect:

```bash
# Deploy sync-to-cdn with verification
supabase functions deploy sync-to-cdn

# Deploy permanently-delete-tracks with updated result parsing
supabase functions deploy permanently-delete-tracks
```

## Testing

To test the fix:

1. **Select a track** with known CDN URL
2. **Click "Permanently Delete"**
3. **Observe the modal**:
   - Pre-deletion: "CDN: 2 files"
   - During: Shows verification status
   - After: Shows verified deletion count
4. **Check the CDN URL** directly - should return 404
5. **If file still exists** - modal will show "0 deleted (2 failed)"

## Impact

This fix ensures that:
- Admins see **actual** CDN deletion status
- Failed deletions are **immediately visible**
- CDN storage costs are **accurately tracked**
- No orphaned files reported as "deleted"
- Issues with R2 credentials/permissions are **caught**
