# Complete Audio System Reset & Fresh Import

## Problem Statement

The current audio system has corrupted data:
1. **7,700 audio files** in storage but channels reference **8,164+ unique tracks** (464+ missing)
2. **Channel JSON files** contain incorrect data from a flawed export
3. System is non-functional because channels cannot access all referenced tracks

## Solution: Complete Reset

Replace all data with verified, clean dataset:
- **11,295 verified audio files** (complete set covering all use cases)
- **Fresh channel JSON files** (corrected data)

---

## Step-by-Step Reset Process

### STEP 1: Complete Cleanup (Delete All Existing Data)

This will delete:
- All audio files from `audio-files` storage bucket
- All sidecar files from `audio-sidecars` storage bucket
- All records from `audio_tracks` database table

```bash
npx tsx scripts/complete-cleanup.ts
```

**Expected output:**
```
🧹 COMPLETE AUDIO SYSTEM CLEANUP
=================================
⚠️  WARNING: This is IRREVERSIBLE!
⏳ Starting in 5 seconds...

STEP 1: Delete Audio Files from Storage
   Deleted 1000 files (total: 1000)
   ...
✅ Deleted 7700 audio files

STEP 2: Delete Sidecar Files from Storage
✅ Deleted 7699 sidecar files

STEP 3: Clear audio_tracks Table
   Current records: 7700
✅ Cleared all database records

CLEANUP COMPLETE
📊 Summary:
   - Audio files deleted: 7700
   - Sidecar files deleted: 7699
   - Database records cleared: 7700

✅ System is now ready for fresh import
```

**Alternative: Run individual cleanup scripts**

If you need more control:

```bash
# Delete audio files only
npx tsx scripts/delete-all-audio-storage.ts

# Delete sidecar files only
npx tsx scripts/delete-all-audio-sidecars.ts

# Clear database table only
npx tsx scripts/clear-audio-tracks-db.ts
```

---

### STEP 2: Import Fresh Audio Files (11,295 files)

Place your verified audio files in a directory, then import:

```bash
npx tsx scripts/bulk-import-fresh-audio.ts /path/to/your/audio/files
```

**What this script does:**
1. Scans directory for all `.mp3` files
2. Uploads each file to `audio-files` storage bucket
3. Creates corresponding `audio_tracks` database record with metadata
4. Shows real-time progress with ETA
5. Generates report of any failed uploads

**Expected output:**
```
📦 BULK AUDIO IMPORT
====================
📂 Source directory: /path/to/audio/files
📊 Found 11295 MP3 files

⚠️  This will upload all files to Supabase storage
⏳ Starting in 5 seconds...

🚀 Starting upload...

   Progress: 11295/11295 (100.0%) | Failed: 0 | ETA: 0s

IMPORT COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Summary:
   - Total files: 11295
   - Successfully imported: 11295
   - Failed: 0
   - Duration: 1847s
   - Average rate: 6.1 files/sec

✅ Ready to import corrected channel JSON files
```

**Features:**
- Progress bar with ETA
- Automatic retry logic
- Failed uploads saved to `failed-uploads.txt`
- Handles large file uploads
- Rate limiting to avoid overwhelming Supabase

---

### STEP 3: Import Corrected Channel JSON Files

After audio import completes, import your corrected channel configurations.

**Option A: Upload via edge function (recommended for bulk)**

```bash
# Upload channel JSONs to update playlist_data
curl -X POST \
  "${VITE_SUPABASE_URL}/functions/v1/upload-channel-json" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d @corrected-channel-data.json
```

**Option B: Process CSV exports**

If you have CSV exports of playlists:

```bash
npm run export-playlists
npx tsx scripts/process-playlist-files.ts
```

---

## Verification Steps

### 1. Verify Audio File Count

```sql
-- Check storage files
SELECT COUNT(*) as storage_files
FROM storage.objects
WHERE bucket_id = 'audio-files';

-- Check database records
SELECT COUNT(*) as db_records
FROM audio_tracks
WHERE deleted_at IS NULL;
```

Expected: **11,295** for both

### 2. Verify Channel Integrity

```sql
-- Get all unique track IDs referenced by channels
WITH channel_tracks AS (
  SELECT DISTINCT
    jsonb_array_elements(playlist_data->'low'->'tracks')->>'track_id' as track_id
  FROM audio_channels
  UNION
  SELECT DISTINCT
    jsonb_array_elements(playlist_data->'medium'->'tracks')->>'track_id' as track_id
  FROM audio_channels
  UNION
  SELECT DISTINCT
    jsonb_array_elements(playlist_data->'high'->'tracks')->>'track_id' as track_id
  FROM audio_channels
)
SELECT
  COUNT(DISTINCT ct.track_id) as referenced_tracks,
  COUNT(DISTINCT at.id) as available_tracks
FROM channel_tracks ct
LEFT JOIN audio_tracks at ON at.metadata->>'track_id' = ct.track_id
WHERE ct.track_id IS NOT NULL;
```

Expected: **referenced_tracks = available_tracks** (100% coverage)

### 3. Test Sample Channel

```sql
-- Test "The Grid" channel
SELECT
  channel_name,
  jsonb_array_length(playlist_data->'low'->'tracks') as low_count,
  jsonb_array_length(playlist_data->'medium'->'tracks') as medium_count,
  jsonb_array_length(playlist_data->'high'->'tracks') as high_count
FROM audio_channels
WHERE channel_name = 'The Grid';
```

---

## Troubleshooting

### Upload Failures

If uploads fail:

1. Check `failed-uploads.txt` for list of failed files
2. Re-run import script (it will skip already uploaded files)
3. Check Supabase storage quota

### Database Mismatches

If track counts don't match:

```sql
-- Find tracks in storage but not in DB
SELECT name
FROM storage.objects
WHERE bucket_id = 'audio-files'
  AND NOT EXISTS (
    SELECT 1 FROM audio_tracks
    WHERE file_path LIKE '%' || name
  );

-- Find tracks in DB but not in storage
SELECT metadata->>'track_id'
FROM audio_tracks
WHERE NOT EXISTS (
  SELECT 1 FROM storage.objects
  WHERE bucket_id = 'audio-files'
    AND name = (audio_tracks.metadata->>'track_id') || '.mp3'
);
```

### Channel References Missing Tracks

```sql
-- Find missing tracks by channel
SELECT
  c.channel_name,
  ct.track_id
FROM audio_channels c
CROSS JOIN LATERAL (
  SELECT jsonb_array_elements(playlist_data->'low'->'tracks')->>'track_id' as track_id
  UNION
  SELECT jsonb_array_elements(playlist_data->'medium'->'tracks')->>'track_id'
  UNION
  SELECT jsonb_array_elements(playlist_data->'high'->'tracks')->>'track_id'
) ct
LEFT JOIN audio_tracks at ON at.metadata->>'track_id' = ct.track_id
WHERE at.id IS NULL
ORDER BY c.channel_name, ct.track_id;
```

---

## Post-Import Checklist

- [ ] All 11,295 audio files uploaded to storage
- [ ] All 11,295 records created in `audio_tracks` table
- [ ] Channel JSON files imported
- [ ] Channel track references verified (100% coverage)
- [ ] Sample channel tested in UI
- [ ] Preview tracks assigned (if applicable)
- [ ] All channel images uploaded
- [ ] System tested end-to-end

---

## Timeline Estimate

Based on 6 files/second upload rate:

- **Cleanup:** ~2 minutes
- **Upload 11,295 files:** ~30-35 minutes
- **Channel import:** ~1-2 minutes
- **Verification:** ~5 minutes

**Total:** ~40-45 minutes for complete reset

---

## Notes

- Keep backup of your 11,295 verified audio files
- Save corrected channel JSON files separately
- Document any custom metadata or configurations
- Consider setting up automated backups post-import
