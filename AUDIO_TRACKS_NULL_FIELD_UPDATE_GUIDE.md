# Audio Tracks NULL Field Update Guide

## Overview

This guide provides a complete procedure for updating NULL fields in the `audio_tracks` table using JSON sidecar files as the source of truth, plus updating file paths from the old database URL to the new one.

**Target Records**: 11,233 audio tracks  
**Source Data**: JSON metadata files in Supabase Storage  
**Operations**:
1. Update NULL fields with data from JSON sidecars
2. Change file paths from old URL to new URL
3. Preserve all existing non-NULL data

---

## 1. Database Schema

### Current `audio_tracks` Table Structure

```sql
CREATE TABLE audio_tracks (
  -- Core fields
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  file_path text UNIQUE NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  energy_level text CHECK (energy_level IN ('low', 'medium', 'high')),
  
  -- Energy boolean flags
  energy_low boolean DEFAULT false,
  energy_medium boolean DEFAULT false,
  energy_high boolean DEFAULT false,
  
  -- Metadata columns (these are the NULL fields we need to populate)
  track_id integer,
  tempo numeric,
  catalog text,
  locked boolean DEFAULT false,
  track_user_genre_id integer,
  
  -- Audio quality metrics
  speed numeric(4,2),
  intensity numeric(4,2),
  arousal numeric(5,2),
  valence numeric(5,2),
  brightness numeric(4,2),
  complexity numeric(4,2),
  music_key_value text,
  energy_set text,
  
  -- Flexible metadata
  metadata jsonb DEFAULT '{}',
  skip_rate numeric DEFAULT 0.0,
  
  -- Preview system
  is_preview boolean DEFAULT false NOT NULL,
  preview_channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  
  -- Soft delete support
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

---

## 2. JSON File Structure

### Example JSON Sidecar Content

Based on the codebase analysis, JSON files contain the following structure:

```json
{
  "track_id": 179334,
  "title": "Drunk Angels Pure Suburban",
  "track_name": "Drunk Angels Pure Suburban",
  "artist": "Artist Name",
  "artist_name": "Artist Name",
  "album": "Album Name",
  "album_name": "Album Name",
  "duration": 243.5,
  "duration_seconds": 243,
  "bpm": 112,
  "tempo": 112,
  "key": "C Major",
  "music_key_value": "C Major",
  "genre": "Electronic",
  "genre_category": "Electronic",
  "speed": 0.5,
  "intensity": 0.5,
  "arousal": 0.0,
  "valence": 0.0,
  "brightness": 0.5,
  "complexity": 0.5,
  "energy_set": 1,
  "catalog": "ultimae",
  "locked": 1,
  "track_user_genre_id": 42,
  "file_size": 9876543,
  "file_length": 9876543
}
```

### JSON File Locations

JSON sidecars are stored in Supabase Storage in two possible locations:
- **Primary**: `audio-files` bucket - Files named `{track_id}.json`
- **Fallback**: `audio-sidecars` bucket - Files named `{track_id}.json`

---

## 3. Field Mapping

### JSON to Database Column Mapping

| Database Column | JSON Field(s) | Notes |
|----------------|---------------|-------|
| `duration_seconds` | `duration_seconds`, `duration` | Round to integer |
| `track_id` | `track_id` | Integer value |
| `tempo` | `tempo`, `bpm` | Use `tempo` first, fallback to `bpm` |
| `speed` | `speed` | Decimal 0.0-1.0 |
| `intensity` | `intensity` | Decimal 0.0-1.0 |
| `arousal` | `arousal` | Decimal -1.0 to 1.0 |
| `valence` | `valence` | Decimal -1.0 to 1.0 |
| `brightness` | `brightness` | Decimal 0.0-1.0 |
| `complexity` | `complexity` | Decimal 0.0-1.0 |
| `energy_set` | `energy_set` | String: "1", "2", or "3" |
| `catalog` | `catalog` | Text value |
| `locked` | `locked` | Boolean (convert 1/0 to true/false) |
| `track_user_genre_id` | `track_user_genre_id` | Integer |
| `music_key_value` | `music_key_value`, `key` | Use `music_key_value` first |
| `metadata` | All JSON fields | Store complete JSON as JSONB |

### URL Update Mapping

| Current URL | New URL |
|------------|---------|
| `https://eafyytltuwuxuuoevavo.supabase.co/storage/v1/object/public/audio-files/[filename].mp3` | `https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/[filename].mp3` |

---

## 4. Pre-Update Procedures

### Step 1: Create Backup Table

**IMPORTANT**: Always create a backup before running any bulk update operations.

```sql
-- Create timestamped backup table
CREATE TABLE audio_tracks_backup_20250119 AS 
SELECT * FROM audio_tracks;

-- Verify backup
SELECT COUNT(*) FROM audio_tracks_backup_20250119;
-- Expected result: 11,233 rows

-- Check sample data
SELECT id, file_path, track_id, tempo 
FROM audio_tracks_backup_20250119 
LIMIT 5;
```

### Step 2: Analyze Current NULL State

```sql
-- Count NULL values for each field
SELECT 
  COUNT(*) FILTER (WHERE duration_seconds IS NULL OR duration_seconds = 0) as null_duration,
  COUNT(*) FILTER (WHERE track_id IS NULL) as null_track_id,
  COUNT(*) FILTER (WHERE tempo IS NULL) as null_tempo,
  COUNT(*) FILTER (WHERE speed IS NULL) as null_speed,
  COUNT(*) FILTER (WHERE intensity IS NULL) as null_intensity,
  COUNT(*) FILTER (WHERE arousal IS NULL) as null_arousal,
  COUNT(*) FILTER (WHERE valence IS NULL) as null_valence,
  COUNT(*) FILTER (WHERE brightness IS NULL) as null_brightness,
  COUNT(*) FILTER (WHERE complexity IS NULL) as null_complexity,
  COUNT(*) FILTER (WHERE energy_set IS NULL) as null_energy_set,
  COUNT(*) FILTER (WHERE catalog IS NULL) as null_catalog,
  COUNT(*) FILTER (WHERE track_user_genre_id IS NULL) as null_genre_id,
  COUNT(*) FILTER (WHERE music_key_value IS NULL) as null_key
FROM audio_tracks;

-- Count old URL format
SELECT COUNT(*) as old_url_count
FROM audio_tracks 
WHERE file_path LIKE '%eafyytltuwuxuuoevavo%';
```

### Step 3: Verify JSON Files Availability

```sql
-- Check JSON files in storage
SELECT COUNT(*) as json_file_count
FROM storage.objects
WHERE bucket_id IN ('audio-files', 'audio-sidecars')
AND name LIKE '%.json';
-- Expected result: ~11,233 files
```

---

## 5. Update Execution

### Method 1: TypeScript Script (Recommended)

#### Prerequisites

Ensure you have the service role key in your `.env` file:

```bash
# Add to .env
VITE_SUPABASE_URL=https://xewajlyswijmjxuajhif.supabase.co
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

#### Run the Update Script

```bash
# From project root
npx tsx scripts/update-null-fields-from-json.ts
```

#### Expected Output

```
AUDIO TRACKS NULL FIELD UPDATE
Processing all records...

Processed: 100, Updated: 98
Processed: 200, Updated: 195
...
Processed: 11200, Updated: 11156
Processed: 11233, Updated: 11189

COMPLETE!
Total processed: 11233
Total updated: 11189
URLs updated: 11233
Errors: 44
```

### Method 2: SQL Function (Alternative)

Create and execute a PL/pgSQL function for server-side processing:

```sql
-- Create update function
CREATE OR REPLACE FUNCTION update_tracks_from_json_sidecars()
RETURNS TABLE(
  total_processed integer,
  total_updated integer,
  urls_updated integer,
  errors integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  track_record RECORD;
  json_content text;
  json_data jsonb;
  track_id_str text;
  update_count integer := 0;
  process_count integer := 0;
  url_count integer := 0;
  error_count integer := 0;
BEGIN
  FOR track_record IN 
    SELECT id, file_path, duration_seconds, track_id, tempo, speed, 
           intensity, arousal, valence, brightness, complexity, energy_set,
           catalog, locked, track_user_genre_id, music_key_value, metadata
    FROM audio_tracks
    ORDER BY id
  LOOP
    process_count := process_count + 1;
    
    BEGIN
      -- Extract track ID from file_path or metadata
      IF track_record.metadata ? 'track_id' THEN
        track_id_str := (track_record.metadata->>'track_id');
      ELSE
        track_id_str := substring(track_record.file_path from '(\d+)\.mp3$');
      END IF;
      
      IF track_id_str IS NULL THEN
        CONTINUE;
      END IF;
      
      -- Try to get JSON from storage (simulated - actual implementation would use storage API)
      -- This is placeholder logic - actual implementation requires edge function
      
      -- For now, just update URLs
      UPDATE audio_tracks
      SET 
        file_path = REPLACE(file_path, 
                          'https://eafyytltuwuxuuoevavo.supabase.co',
                          'https://xewajlyswijmjxuajhif.supabase.co'),
        updated_at = NOW()
      WHERE id = track_record.id
      AND file_path LIKE '%eafyytltuwuxuuoevavo%';
      
      IF FOUND THEN
        url_count := url_count + 1;
        update_count := update_count + 1;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      RAISE NOTICE 'Error processing track %: %', track_record.id, SQLERRM;
    END;
    
    IF process_count % 100 = 0 THEN
      RAISE NOTICE 'Progress: % processed, % updated', process_count, update_count;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT process_count, update_count, url_count, error_count;
END;
$$;

-- Execute the function
SELECT * FROM update_tracks_from_json_sidecars();

-- Clean up
DROP FUNCTION IF EXISTS update_tracks_from_json_sidecars();
```

**Note**: The SQL approach has limitations accessing storage objects directly. The TypeScript script is recommended.

---

## 6. Post-Update Verification

### Verify URL Updates

```sql
-- Check that old URLs are gone
SELECT COUNT(*) as remaining_old_urls
FROM audio_tracks
WHERE file_path LIKE '%eafyytltuwuxuuoevavo%';
-- Expected: 0

-- Check that new URLs are present
SELECT COUNT(*) as new_urls
FROM audio_tracks
WHERE file_path LIKE '%xewajlyswijmjxuajhif%';
-- Expected: 11,233
```

### Verify Field Population

```sql
-- Check NULL counts after update
SELECT 
  COUNT(*) FILTER (WHERE duration_seconds IS NULL OR duration_seconds = 0) as null_duration,
  COUNT(*) FILTER (WHERE track_id IS NULL) as null_track_id,
  COUNT(*) FILTER (WHERE tempo IS NULL) as null_tempo,
  COUNT(*) FILTER (WHERE speed IS NULL) as null_speed,
  COUNT(*) FILTER (WHERE intensity IS NULL) as null_intensity,
  COUNT(*) FILTER (WHERE arousal IS NULL) as null_arousal,
  COUNT(*) FILTER (WHERE valence IS NULL) as null_valence,
  COUNT(*) FILTER (WHERE brightness IS NULL) as null_brightness,
  COUNT(*) FILTER (WHERE complexity IS NULL) as null_complexity,
  COUNT(*) FILTER (WHERE energy_set IS NULL) as null_energy_set
FROM audio_tracks;
-- Expected: Significant reduction in NULL counts
```

### Sample Data Inspection

```sql
-- View sample updated records
SELECT 
  id,
  file_path,
  track_id,
  tempo,
  speed,
  intensity,
  energy_set,
  metadata->>'track_name' as track_name,
  metadata->>'artist_name' as artist_name,
  updated_at
FROM audio_tracks
WHERE updated_at > NOW() - INTERVAL '1 hour'
LIMIT 10;
```

### Compare with Backup

```sql
-- Compare record counts
SELECT 
  (SELECT COUNT(*) FROM audio_tracks) as current_count,
  (SELECT COUNT(*) FROM audio_tracks_backup_20250119) as backup_count;
-- Should be equal

-- Find records that were updated
SELECT COUNT(*) as updated_records
FROM audio_tracks a
JOIN audio_tracks_backup_20250119 b ON a.id = b.id
WHERE a.updated_at != b.updated_at;
```

---

## 7. Troubleshooting

### Issue: Script Cannot Find JSON Files

**Solution**: Check both storage buckets:

```typescript
// Try primary bucket first
let { data, error } = await supabase.storage
  .from('audio-files')
  .download(`${trackId}.json`);

// Fallback to secondary bucket
if (error) {
  ({ data, error } = await supabase.storage
    .from('audio-sidecars')
    .download(`${trackId}.json`));
}
```

### Issue: Service Role Key Not Found

```bash
# Check environment variables
echo $VITE_SUPABASE_SERVICE_ROLE_KEY

# If missing, add to .env file
VITE_SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key
```

### Issue: Rate Limiting

Add delays between batches:

```typescript
// Add after each batch
await new Promise(resolve => setTimeout(resolve, 500));
```

### Issue: Some Fields Still NULL After Update

Check if JSON files contain the data:

```sql
-- Check sample JSON content in metadata
SELECT 
  id,
  metadata
FROM audio_tracks
WHERE tempo IS NULL
LIMIT 5;
```

---

## 8. Rollback Procedure

If you need to rollback the changes:

```sql
-- Restore from backup
BEGIN;

-- Drop current table
DROP TABLE audio_tracks CASCADE;

-- Rename backup to original
ALTER TABLE audio_tracks_backup_20250119 RENAME TO audio_tracks;

-- Recreate indexes
CREATE INDEX idx_audio_tracks_channel ON audio_tracks(channel_id);
CREATE INDEX idx_audio_tracks_track_id ON audio_tracks(track_id);
-- ... (recreate all other indexes)

-- Recreate RLS policies
-- ... (recreate all policies from schema)

COMMIT;
```

---

## 9. Cleanup

After verifying the update was successful (wait at least 30 days):

```sql
-- Drop backup table
DROP TABLE IF EXISTS audio_tracks_backup_20250119;
```

---

## 10. Summary Checklist

- [ ] Created backup table
- [ ] Verified backup record count (11,233)
- [ ] Analyzed current NULL state
- [ ] Confirmed service role key is configured
- [ ] Ran update script
- [ ] Verified all old URLs updated to new URLs
- [ ] Checked NULL field counts reduced
- [ ] Inspected sample updated records
- [ ] Compared with backup table
- [ ] Documented any errors or issues
- [ ] Scheduled backup table deletion (30 days)

---

## Contact

If you encounter issues during this process, review the error logs and consult the Supabase documentation for storage and database operations.
