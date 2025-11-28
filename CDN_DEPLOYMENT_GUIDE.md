# Cloudflare CDN Deployment & Enablement Guide

**Quick Start Guide for Deploying and Enabling CDN Audio Delivery**

---

## Prerequisites

- [x] Supabase CLI installed (`npm install -g supabase`)
- [x] Supabase project linked
- [x] Cloudflare R2 bucket created: `focus-music-audio`
- [x] R2 credentials available (already configured in code)

---

## Step 1: Deploy the Edge Function (5 minutes)

### Option A: Using Supabase CLI (Recommended)

```bash
# Login to Supabase (if not already logged in)
npx supabase login

# Link your project (if not already linked)
npx supabase link --project-ref xewajlyswijmjxuajhif

# Deploy the sync-to-cdn function
npx supabase functions deploy sync-to-cdn

# Verify deployment
npx supabase functions list
```

### Option B: Using Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/xewajlyswijmjxuajhif/functions
2. Click "Deploy new function"
3. Upload `supabase/functions/sync-to-cdn/index.ts`
4. Name it: `sync-to-cdn`
5. Click "Deploy"

### Verification

Test the function with curl:

```bash
curl -X POST \
  https://xewajlyswijmjxuajhif.supabase.co/functions/v1/sync-to-cdn \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"trackId":"test","operation":"upload"}'
```

Expected response: Either success or "Track not found" (which proves the function is deployed)

---

## Step 2: Test R2 Connectivity (2 minutes)

### Test R2 Public Access

```bash
# Test if R2 bucket is accessible
curl -I https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/

# Expected: 200 OK or 403 Forbidden (both mean bucket exists)
# If 404 Not Found: bucket may not be public
```

### Test Edge Function CDN Upload

```bash
# Run the automated test script
npm run test-cdn-sync
```

Expected output:
```
🧪 Testing CDN Sync Edge Function

1. Finding a test track with audio file...
✅ Found test track: [Track Name] (ID: [ID])

2. Calling CDN sync Edge Function...
✅ Edge Function response: {...}

3. Verifying database was updated...
✅ Database updated successfully

4. Verifying files are accessible on CDN...
✅ Audio file accessible
✅ Metadata file accessible

✅ CDN Sync test complete!
```

---

## Step 3: Enable CDN for Production (1 minute)

### Update Environment Variable

Edit `.env` file:

```bash
# Change from:
VITE_STORAGE_BACKEND=supabase

# To:
VITE_STORAGE_BACKEND=cloudfront
```

### Restart the Application

```bash
# If running dev server, restart it
npm run dev

# Or rebuild for production
npm run build
```

---

## Step 4: Verify CDN Playback (5 minutes)

### Browser Console Verification

1. Open your application
2. Open browser DevTools (F12)
3. Go to Console tab
4. Look for these logs:

```
[STORAGE ADAPTER] Creating adapter with config: {
  backend: 'cloudfront',
  cdnDomain: 'pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev'
}

[CDN ADAPTER] getAudioUrl called with filePath: [path]
[CDN ADAPTER] Generated CDN URL: https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/[trackId].mp3
```

### Network Tab Verification

1. Go to Network tab in DevTools
2. Filter by "media" or "mp3"
3. Play a track
4. Verify the audio request shows:
   - **Domain:** `pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev`
   - **Path:** `/audio/{trackId}.mp3`
   - **Status:** 200 OK

### Audio Playback Test

1. Login as admin
2. Select any channel
3. Click play
4. Audio should play smoothly
5. If audio fails, check console for errors

---

## Step 5: Sync Existing Tracks to CDN (Optional)

### Create Batch Sync Script

Save as `scripts/batch-sync-to-cdn.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function batchSyncToCDN() {
  console.log('🚀 Starting batch CDN sync...\n');

  // Get all tracks without CDN URLs
  const { data: tracks } = await supabase
    .from('audio_tracks')
    .select('track_id, track_name, file_path')
    .is('deleted_at', null)
    .is('cdn_url', null)
    .not('file_path', 'is', null)
    .limit(100); // Start with 100 tracks

  if (!tracks || tracks.length === 0) {
    console.log('✅ All tracks are already synced!');
    return;
  }

  console.log(`Found ${tracks.length} tracks to sync\n`);

  let successCount = 0;
  let failCount = 0;

  for (const track of tracks) {
    try {
      console.log(`Syncing: ${track.track_name} (${track.track_id})...`);

      const response = await fetch(
        `${supabaseUrl}/functions/v1/sync-to-cdn`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trackId: track.track_id,
            operation: 'upload',
          }),
        }
      );

      if (response.ok) {
        console.log(`  ✅ Success`);
        successCount++;
      } else {
        const error = await response.text();
        console.log(`  ❌ Failed: ${error}`);
        failCount++;
      }

      // Rate limiting: wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
      failCount++;
    }
  }

  console.log(`\n📊 Sync complete:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📈 Success rate: ${(successCount / tracks.length * 100).toFixed(1)}%`);
}

batchSyncToCDN().catch(error => {
  console.error('❌ Batch sync failed:', error);
  process.exit(1);
});
```

### Run Batch Sync

```bash
# Add script to package.json
npm pkg set scripts.batch-sync-cdn="tsx scripts/batch-sync-to-cdn.ts"

# Run the batch sync
npm run batch-sync-cdn
```

---

## Troubleshooting

### Issue: "Edge Function not found"

**Solution:**
```bash
# Check function deployment
npx supabase functions list

# Redeploy if needed
npx supabase functions deploy sync-to-cdn
```

### Issue: "CORS error loading audio"

**Solution 1 - Check R2 CORS Configuration:**
R2 bucket needs CORS headers. Configure in Cloudflare dashboard:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

**Solution 2 - Add CORS headers to uploads:**
Update Edge Function to include CORS headers in PutObjectCommand:

```typescript
const command = new PutObjectCommand({
  Bucket: R2_CONFIG.bucketName,
  Key: key,
  Body: buffer,
  ContentType: 'audio/mpeg',
  CacheControl: 'public, max-age=31536000',
  // Add CORS headers
  Metadata: {
    'Access-Control-Allow-Origin': '*'
  }
});
```

### Issue: "Audio plays but from Supabase, not CDN"

**Checklist:**
- [ ] VITE_STORAGE_BACKEND is set to 'cloudfront' in .env
- [ ] VITE_CDN_DOMAIN is set correctly
- [ ] Application was restarted after env change
- [ ] Browser cache was cleared
- [ ] Check browser console for storage adapter logs

### Issue: "Track not found in sync-to-cdn"

**Possible Causes:**
1. Track doesn't exist in database
2. Track has `deleted_at` set (soft deleted)
3. Track has no `file_path`

**Solution:**
```sql
-- Check track status
SELECT track_id, file_path, deleted_at, cdn_url
FROM audio_tracks
WHERE track_id = 'YOUR_TRACK_ID';
```

### Issue: "R2 credentials invalid"

**Symptoms:**
- Sync fails with 403 Forbidden
- "Access Denied" errors

**Solution:**
1. Verify credentials in Cloudflare dashboard
2. Generate new API token if expired
3. Update R2_CONFIG in Edge Function
4. Redeploy Edge Function

---

## Rollback Procedure

If CDN causes issues, you can instantly rollback:

### Disable CDN

```bash
# Edit .env
VITE_STORAGE_BACKEND=supabase

# Restart app
npm run dev
```

Audio will immediately play from Supabase storage again.

### Verify Rollback

Check console:
```
[STORAGE ADAPTER] Creating adapter with config: {
  backend: 'supabase'
}
```

---

## Monitoring & Maintenance

### Check Sync Status

```sql
-- How many tracks are synced to CDN?
SELECT
  COUNT(*) FILTER (WHERE cdn_url IS NOT NULL) as synced_tracks,
  COUNT(*) as total_tracks,
  COUNT(*) FILTER (WHERE cdn_url IS NOT NULL) * 100.0 / COUNT(*) as percent_synced
FROM audio_tracks
WHERE deleted_at IS NULL;
```

### View Recent Syncs

```sql
SELECT
  track_id,
  track_name,
  cdn_url,
  cdn_uploaded_at,
  storage_locations
FROM audio_tracks
WHERE cdn_url IS NOT NULL
ORDER BY cdn_uploaded_at DESC
LIMIT 10;
```

### Monitor Edge Function Logs

```bash
# View last 100 log entries
npx supabase functions logs sync-to-cdn --limit 100

# Stream logs in real-time
npx supabase functions logs sync-to-cdn --stream
```

### Check R2 Usage

1. Go to Cloudflare Dashboard
2. Navigate to R2 → focus-music-audio
3. View:
   - Total storage used
   - Number of objects
   - Bandwidth usage (should be mostly egress)
   - Request count

---

## Performance Benefits

After enabling CDN, you should see:

✅ **Faster Load Times:**
- Global CDN edge locations
- Reduced latency for international users
- Faster initial audio load

✅ **Cost Savings:**
- FREE egress bandwidth (vs Supabase charges)
- Reduced Supabase storage API calls
- Lower monthly costs at scale

✅ **Better Reliability:**
- Cloudflare's 99.9% uptime SLA
- Automatic failover to Supabase if CDN fails
- DDoS protection included

✅ **Improved Scalability:**
- Handle 10x more concurrent users
- No bandwidth throttling
- Global distribution

---

## Success Metrics

After 24 hours of CDN operation:

- [ ] 0 CDN-related errors in logs
- [ ] Audio playback success rate >99%
- [ ] Average load time <500ms
- [ ] R2 bandwidth usage visible in dashboard
- [ ] Supabase storage bandwidth reduced

---

## Next Steps

1. ✅ Deploy Edge Function
2. ✅ Test R2 connectivity
3. ✅ Enable CDN in production
4. ✅ Verify audio playback works
5. 📋 (Optional) Batch sync existing tracks
6. 📊 Monitor performance for 48 hours
7. 📈 Compare costs: Supabase vs R2
8. 🔄 Make CDN permanent or rollback

---

## Support & Documentation

- **Full Analysis Report:** `CDN_ANALYSIS_AND_FIX_REPORT.md`
- **Setup Documentation:** `CDN_SYNC_SETUP.md`
- **Edge Function Code:** `supabase/functions/sync-to-cdn/index.ts`
- **Storage Adapters:** `src/lib/storageAdapters.ts`

---

**Deployment Guide Version:** 1.0
**Last Updated:** 2025-11-19
**Status:** Ready for Production Deployment
