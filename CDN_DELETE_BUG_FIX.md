# CDN Delete Bug Fix - Deployment Required

## Problem Summary

The `sync-to-cdn` edge function currently deployed is **outdated** and does not properly delete files from Cloudflare R2 CDN.

### Evidence
- File `179097.mp3` remains in CDN after hard delete: https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/179097.mp3
- Current deployed function returns message: "Files removed from CDN successfully"
- Correct function should return: "CDN deletion completed"
- The deployed version is from `/public/deploy-cdn-function.html` (old code)
- The correct version is in `/supabase/functions/sync-to-cdn/index.ts` (current code)

## Root Cause

The edge function was deployed with an older version that:
1. Does NOT have the proper S3 DeleteObjectCommand implementation
2. Does NOT have the correct error handling
3. Returns a false success message

## Solution

**Redeploy the sync-to-cdn edge function** with the current code from:
`/supabase/functions/sync-to-cdn/index.ts`

### Deployment Options

#### Option 1: Via Supabase Dashboard (Recommended)
1. Go to https://supabase.com/dashboard/project/xewajlyswijmjxuajhif/functions
2. Find the `sync-to-cdn` function
3. Click "Edit Function"
4. Copy the entire contents of `/supabase/functions/sync-to-cdn/index.ts`
5. Paste into the editor
6. Click "Deploy"

#### Option 2: Via Supabase CLI
```bash
npx supabase login
npx supabase link --project-ref xewajlyswijmjxuajhif
npx supabase functions deploy sync-to-cdn
```

#### Option 3: Via Management API (requires token)
Not available in this environment.

## Verification Steps

After deployment, run this test:

```bash
npx tsx test-cdn-delete.ts
```

Expected output:
```
Response body: {
  "success": true,
  "message": "CDN deletion completed",  # <-- Note the different message
  "details": {
    "audioFile": "179097.mp3",
    "metadataFile": "179097.json"
  }
}

File exists in CDN: ❌ NO (Fixed!)  # <-- Should be NO
```

## Technical Details

The correct implementation:
- Uses AWS SDK's `DeleteObjectCommand` with proper R2 credentials
- Has detailed logging for debugging
- Returns structured details about deleted files
- Properly handles cases where cdn_url is missing

Key code section (lines 294-318):
```typescript
async function deleteAudioFromCDN(fileName: string): Promise<void> {
  const s3Client = getS3Client();
  const key = `${R2_CONFIG.audioPath}/${fileName}`;

  const command = new DeleteObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
  });

  await s3Client.send(command);
  console.log(`Deleted audio from CDN: ${key}`);
}
```

## Files Modified
- ✅ `/supabase/functions/sync-to-cdn/index.ts` (correct version exists)
- ❌ Deployed function (needs redeployment)

## Related Files
- `/supabase/functions/permanently-delete-tracks/index.ts` (calls sync-to-cdn)
- `/src/components/MusicLibrary.tsx` (triggers permanent delete)
- `/public/deploy-cdn-function.html` (old deployment tool - should be updated or removed)
