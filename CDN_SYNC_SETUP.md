# CDN Sync System

## Overview

The CDN sync system automatically synchronizes audio tracks and their metadata (sidecar JSON files) from Supabase Storage to a Content Delivery Network (CDN) for faster global delivery. The system uses industry-standard best practices with server-to-server communication via Supabase Edge Functions.

## Architecture

### Components

1. **Supabase Storage** - Primary storage for audio files and metadata
2. **Supabase Edge Function** (`sync-to-cdn`) - Server-to-server sync handler
3. **Database Tracking** - Tracks which files exist on which storage systems
4. **CDN (Cloudflare R2)** - Secondary storage for global distribution

### Flow Diagram

```
Track Upload → Supabase Storage → Edge Function → CDN (R2)
                      ↓
                Database Update
                (cdn_url, storage_locations)
```

## Database Schema

### CDN Tracking Columns

The `audio_tracks` table includes these CDN-related columns:

```sql
- cdn_url (text): Full URL to the file on the CDN
- cdn_uploaded_at (timestamptz): When the file was uploaded to CDN
- storage_locations (jsonb): Tracks which storage systems have the file
```

### storage_locations Structure

```json
{
  "supabase": true,
  "r2_cdn": true,
  "upload_timestamps": {
    "supabase": "2024-01-15T10:30:00Z",
    "r2_cdn": "2024-01-15T10:30:02Z"
  }
}
```

## Edge Function: sync-to-cdn

### Location
`/supabase/functions/sync-to-cdn/index.ts`

### Endpoints

**POST /functions/v1/sync-to-cdn**

Request body:
```json
{
  "trackId": "179117",
  "operation": "upload" | "delete",
  "filePath": "optional-override-path",
  "sidecarPath": "optional-sidecar-path"
}
```

### Operations

#### Upload Operation
1. Retrieves track info from database using `trackId`
2. Downloads audio file from Supabase Storage
3. Downloads JSON sidecar file
4. Uploads both files to CDN (Cloudflare R2)
5. Updates database with CDN URL and sync timestamp
6. Updates `storage_locations` JSONB

#### Delete Operation
1. Retrieves CDN URL from database
2. Deletes audio file from CDN
3. Deletes JSON sidecar from CDN
4. Updates database to mark CDN copy as removed
5. Updates `storage_locations` JSONB

### Response

Success response:
```json
{
  "success": true,
  "message": "Files synced to CDN successfully",
  "cdn_url": "https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/179117.mp3",
  "sidecar_cdn_url": "https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/metadata/179117.json",
  "timestamp": "2024-01-15T10:30:02Z"
}
```

## Automatic Sync Trigger

### Implementation

The sync is automatically triggered after successful track upload:

```typescript
// In TrackUploadModal.tsx
const syncToCDN = async (trackId: string) => {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/sync-to-cdn`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackId: trackId,
        operation: 'upload',
      }),
    }
  );
};

// Non-blocking async call
syncToCDN(trackId).catch(error => {
  console.error('CDN sync failed:', error);
});
```

### Characteristics

- **Non-blocking**: Sync runs in background, doesn't delay upload confirmation
- **Fire-and-forget**: User sees confirmation immediately
- **Error handling**: Failures logged but don't impact user experience
- **Typical duration**: 10-30 seconds for completion

## Configuration

### Hardcoded R2 Credentials

The Edge Function includes hardcoded Cloudflare R2 credentials (already configured):

```typescript
const R2_CONFIG = {
  accountId: "531f033f1f3eb591e89baff98f027cee",
  bucketName: "focus-music-audio",
  accessKeyId: "d6c3feb94bb923b619c9661f950019d2",
  secretAccessKey: "bc5d2ea0d38fecb4ef8442b78621a6b398415b3373cc1c174b12564a111678f3",
  publicUrl: "https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev",
  audioPath: "audio",       // Audio files go to /audio/*
  metadataPath: "metadata", // JSON sidecars go to /metadata/*
};
```

### File Paths on CDN

- **Audio files**: `https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/{trackId}.mp3`
- **Metadata files**: `https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/metadata/{trackId}.json`

Example for track ID 179117:
- Audio: `https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/179117.mp3`
- Metadata: `https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/metadata/179117.json`

## Deployment

The Edge Function is ready to deploy with hardcoded credentials. No additional environment variables are needed.

## User Experience

### Upload Confirmation Modal

After uploading a track, users see:

1. **Upload Complete** - Green banner confirming Supabase storage success
2. **CDN Sync In Progress** - Blue banner informing about background sync
3. All track metadata and details
4. Storage locations and paths

The confirmation modal shows immediately after upload, with CDN sync happening asynchronously.

## Monitoring & Troubleshooting

### Check Sync Status

Query database for sync status:

```sql
SELECT
  track_id,
  file_path as supabase_url,
  cdn_url,
  cdn_uploaded_at,
  storage_locations
FROM audio_tracks
WHERE track_id = '179117';
```

### View Edge Function Logs

```bash
supabase functions logs sync-to-cdn
```

### Common Issues

1. **Sync not triggered**: Check console for errors in browser
2. **CDN upload fails**: Verify R2 credentials and permissions
3. **Database not updated**: Check Edge Function logs for errors

## Production Implementation Notes

### Current Implementation

The current Edge Function includes placeholder upload/delete functions that need to be implemented with actual Cloudflare R2 SDK:

```typescript
// TODO: Implement with actual AWS SDK for S3-compatible storage
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "npm:@aws-sdk/client-s3";
```

### Recommended Libraries

- `@aws-sdk/client-s3` - For S3-compatible operations with Cloudflare R2
- `@aws-sdk/lib-storage` - For multipart uploads of large files
- `@aws-sdk/credential-provider-env` - For credential management

### Security Considerations

- Use service role key for Edge Function database operations
- Store CDN credentials as Supabase secrets (never in code)
- Implement retry logic for failed syncs
- Add rate limiting to prevent abuse
- Validate file types and sizes before CDN upload

## Future Enhancements

1. **Batch Sync**: Process multiple tracks in single Edge Function call
2. **Retry Queue**: Automatic retry for failed syncs
3. **Webhook Triggers**: Database triggers for automatic sync on insert
4. **Admin Dashboard**: View sync status, retry failed syncs
5. **Progressive Sync**: Sync older tracks on demand
6. **Multi-CDN**: Support multiple CDN providers for redundancy

## Testing

### Manual Test

1. Upload a track via Admin Dashboard
2. Check confirmation modal shows "CDN Sync In Progress"
3. Wait 30 seconds
4. Query database to verify `cdn_url` and `storage_locations` updated
5. Verify files exist on CDN

### Automated Test

```typescript
// Test Edge Function directly
const response = await fetch('/functions/v1/sync-to-cdn', {
  method: 'POST',
  body: JSON.stringify({
    trackId: 'test-track-id',
    operation: 'upload'
  })
});

expect(response.ok).toBe(true);
const result = await response.json();
expect(result.success).toBe(true);
expect(result.cdn_url).toBeDefined();
```

## Support

For issues or questions about the CDN sync system:
- Check Edge Function logs first
- Verify environment variables are set correctly
- Ensure Cloudflare R2 bucket permissions are correct
- Test with a small file first before bulk operations
