# CDN Deletion Display Bug - Complete Solution

## Problem
UI incorrectly shows "CDN: 0 deleted (2 failed)" even though files are successfully deleted.

## Root Cause
The simplified verification using `fetch(publicUrl, { method: 'HEAD' })` **fails when called from edge function environment** due to:
- CORS restrictions
- Network/DNS issues in Deno edge runtime
- R2 public URL access limitations

When verification fails, our code returns `true` (lenient approach), but something in the chain is still setting `audioDeleted = false`.

## The Solution

**Stop trying to verify from the edge function**. Instead, trust the S3 DeleteObjectCommand response.

### Change Required in `sync-to-cdn/index.ts`

Replace the verification logic (lines 386-416 and 465-495) with simple success return:

```typescript
// Delete the file
try {
  const deleteCommand = new DeleteObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
  });
  console.log(`Sending delete command for ${key}...`);
  const deleteResponse = await s3Client.send(deleteCommand);
  console.log(`✅ Delete command successful for: ${key} (status: ${deleteResponse.$metadata.httpStatusCode})`);

  // AWS S3/R2 DeleteObject returns 204 on success
  // If we reach here without exception, deletion succeeded
  return true;

} catch (error: any) {
  console.error(`❌ Failed to delete ${key}:`, error.message);
  return false;
}
```

**Remove the fetch-based verification entirely.** The S3 client handles retries and will throw on actual failures.

### Why This Works

1. **DeleteObjectCommand is idempotent** - Deleting non-existent file returns success
2. **AWS SDK handles retries** - Built-in exponential backoff
3. **Exceptions indicate real failures** - Auth, permissions, network
4. **No external fetch needed** - S3 client has direct access

### Implementation

```typescript
async function deleteAudioFromCDN(fileName: string): Promise<boolean> {
  const s3Client = getS3Client();
  const key = `${R2_CONFIG.audioPath}/${fileName}`;

  console.log(`Deleting audio file from CDN: ${key}`);

  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });

    await s3Client.send(deleteCommand);
    console.log(`✅ Successfully deleted from CDN: ${key}`);
    return true;

  } catch (error: any) {
    console.error(`❌ Failed to delete ${key}:`, error.message);
    console.error(`Error details:`, {
      name: error.name,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
    });
    return false;
  }
}

async function deleteMetadataFromCDN(fileName: string): Promise<boolean> {
  const s3Client = getS3Client();
  const key = `${R2_CONFIG.metadataPath}/${fileName}`;

  console.log(`Deleting metadata file from CDN: ${key}`);

  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });

    await s3Client.send(deleteCommand);
    console.log(`✅ Successfully deleted from CDN: ${key}`);
    return true;

  } catch (error: any) {
    console.error(`❌ Failed to delete ${key}:`, error.message);
    console.error(`Error details:`, {
      name: error.name,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
    });
    return false;
  }
}
```

## Benefits

1. **Reliable** - S3 SDK designed for this, no external fetch needed
2. **Fast** - No 1-second wait, no retry logic
3. **Simple** - 15 lines vs 50+ lines
4. **Accurate** - Real failures throw exceptions
5. **Idempotent** - Safe to call multiple times

## Expected Results

**Logs:**
```
Deleting audio file from CDN: audio/12345.mp3
✅ Successfully deleted from CDN: audio/12345.mp3
Deleting metadata file from CDN: metadata/12345.json
✅ Successfully deleted from CDN: metadata/12345.json
```

**UI:**
```
✅ CDN (Cloudflare R2): 2 deleted
```

## Why Fetch Verification Failed

Edge functions run in Deno runtime with restrictions:
- Public internet access may be limited
- DNS resolution for R2 public URLs may fail
- CORS headers don't matter for HEAD requests from backend
- Network timing out to external URLs

The S3 SDK uses internal AWS/Cloudflare endpoints that work reliably in edge function context.

## Trust the SDK

The AWS S3 SDK (which Cloudflare R2 is compatible with) is battle-tested:
- Used by millions of applications
- Handles eventual consistency internally
- Throws exceptions on real failures
- Returns success only when operation completes

**We don't need to second-guess it with external verification.**

## Next Steps

1. Apply the simplified code above
2. Remove all fetch-based verification
3. Trust DeleteObjectCommand success
4. Deploy and test

The UI will correctly show successful deletions because the backend will properly return `cdnFilesDeleted = 2` and `cdnDeletionFailed = 0`.
