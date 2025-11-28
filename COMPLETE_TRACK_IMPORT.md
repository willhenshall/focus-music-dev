# Complete Audio Track Import Instructions

## Current Status
- **Sidecar files migrated**: 7,699 JSON metadata files in `audio-sidecars` bucket
- **Audio files migrated**: 281 MP3 files in `audio-files` bucket
- **Tracks in database**: 277 records in `audio_tracks` table

## Issue
The audio file migration only processed one batch (100 files) instead of all files. However, we have all the metadata in sidecar files.

## Solution
Import ALL tracks using the sidecar metadata files. Each sidecar JSON file represents one track.

### Option 1: Run SQL Migration Directly (RECOMMENDED)

1. Open your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Create a new query and paste this SQL:

```sql
-- Clear existing tracks
TRUNCATE TABLE audio_tracks;

-- Bulk insert ALL tracks from sidecar files
INSERT INTO audio_tracks (
  id,
  file_path,
  energy_level,
  duration_seconds,
  metadata,
  created_at
)
SELECT
  gen_random_uuid() as id,
  'https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/' || REPLACE(o.name, '.json', '') || '.mp3' as file_path,
  'medium' as energy_level,
  0 as duration_seconds,
  jsonb_build_object(
    'track_id', REPLACE(o.name, '.json', ''),
    'track_name', REPLACE(o.name, '.json', ''),
    'artist_name', 'Focus.Music',
    'file_size', (o.metadata->>'size')::bigint,
    'mimetype', 'audio/mpeg'
  ) as metadata,
  o.created_at
FROM storage.objects o
WHERE o.bucket_id = 'audio-sidecars'
  AND o.name LIKE '%.json';

-- Verify results
SELECT COUNT(*) as total_tracks FROM audio_tracks;
```

4. Click **Run** or press `Cmd/Ctrl + Enter`
5. You should see a result showing 7,699+ tracks inserted

### Expected Result
After running this SQL, you will have **7,699 tracks** in the `audio_tracks` table, each with:
- Unique ID (UUID)
- File path pointing to audio file in storage
- Track metadata (track_id, track_name, artist_name, file_size)
- Energy level (default: medium)
- Created timestamp

### Verification

After running the SQL, verify the import:

```sql
-- Check total count
SELECT COUNT(*) FROM audio_tracks;

-- View sample tracks
SELECT
  metadata->>'track_id' as track_id,
  metadata->>'track_name' as track_name,
  energy_level,
  created_at
FROM audio_tracks
LIMIT 10;

-- Check tracks with channel assignments
SELECT
  COUNT(*) as assigned_tracks
FROM audio_tracks t
WHERE EXISTS (
  SELECT 1 FROM audio_channels c
  WHERE c.playlist_data::text LIKE '%' || (t.metadata->>'track_id') || '%'
);
```

## Music Library Features

Once tracks are imported, the Music Library admin panel will show:
- **All 7,699+ tracks** with pagination (50 per page)
- Track name and artist from metadata
- Track ID for reference
- Energy level badges
- File size information
- **Channel assignments** (which channels each track is used in)
- **Detailed view modal** with complete metadata and audio preview

## Next Steps

After import:
1. Visit Admin Dashboard > Music Library
2. Browse all tracks with pagination
3. Click any track to view full details
4. Search by track name, artist, or track ID
5. See which channels use each track

## Architecture Notes

- **Track IDs**: Extracted from sidecar filename (e.g., `10021.json` → track_id: `10021`)
- **File paths**: Constructed as `https://[supabase-url]/storage/v1/object/public/audio-files/[track_id].mp3`
- **Channel assignments**: Determined by matching track_id against channel `playlist_data` JSON
- **Pagination**: Efficient loading with 50 tracks per page
- **Search**: PostgreSQL full-text search on track names, artists, and IDs
