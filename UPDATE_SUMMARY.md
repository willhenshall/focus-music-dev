# Audio Tracks NULL Field Update - Executive Summary

## Task Overview

Update 11,233 audio track records in the database by:
1. Populating NULL fields with data from JSON sidecar files
2. Updating file paths from old database URL to new database URL
3. Preserving all existing non-NULL data

## Files Created

### 1. Main Update Script
**Location**: `scripts/update-null-fields-from-json.ts`

**What it does**:
- Reads each track from the database
- Downloads corresponding JSON sidecar file
- Updates only NULL fields with JSON data
- Updates file paths to new URL
- Processes in batches of 50 for efficiency

**Usage**:
```bash
npx tsx scripts/update-null-fields-from-json.ts
```

### 2. Comprehensive Documentation
**Location**: `AUDIO_TRACKS_NULL_FIELD_UPDATE_GUIDE.md`

**Contains**:
- Complete database schema
- JSON file structure examples
- Field mapping reference
- Step-by-step procedures
- Verification queries
- Troubleshooting guide
- Rollback instructions

### 3. SQL Quick Reference
**Location**: `sql/update-tracks-quick-reference.sql`

**Contains**:
- Backup creation SQL
- Analysis queries
- URL update command
- Verification queries
- Rollback template

## Database Schema (Key Fields)

```sql
audio_tracks (
  id uuid PRIMARY KEY,
  file_path text UNIQUE NOT NULL,
  duration_seconds integer,
  track_id integer,              -- NULL: needs update
  tempo numeric,                  -- NULL: needs update
  speed numeric(4,2),            -- NULL: needs update
  intensity numeric(4,2),        -- NULL: needs update
  arousal numeric(5,2),          -- NULL: needs update
  valence numeric(5,2),          -- NULL: needs update
  brightness numeric(4,2),       -- NULL: needs update
  complexity numeric(4,2),       -- NULL: needs update
  energy_set text,               -- NULL: needs update
  catalog text,                  -- NULL: needs update
  locked boolean,                -- NULL: needs update
  track_user_genre_id integer,   -- NULL: needs update
  music_key_value text,          -- NULL: needs update
  metadata jsonb,
  ...
)
```

## JSON File Structure

JSON sidecars contain metadata like:
```json
{
  "track_id": 179334,
  "title": "Track Name",
  "artist": "Artist Name",
  "duration": 243.5,
  "bpm": 112,
  "tempo": 112,
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
  "music_key_value": "C Major"
}
```

## Field Mapping

| Database Column | JSON Field | Notes |
|----------------|------------|-------|
| `duration_seconds` | `duration`, `duration_seconds` | Round to integer |
| `track_id` | `track_id` | Direct mapping |
| `tempo` | `tempo`, `bpm` | Use tempo first |
| `speed` | `speed` | 0.0-1.0 range |
| `intensity` | `intensity` | 0.0-1.0 range |
| `arousal` | `arousal` | -1.0 to 1.0 range |
| `valence` | `valence` | -1.0 to 1.0 range |
| `brightness` | `brightness` | 0.0-1.0 range |
| `complexity` | `complexity` | 0.0-1.0 range |
| `energy_set` | `energy_set` | "1", "2", or "3" |
| `catalog` | `catalog` | Text value |
| `locked` | `locked` | Convert 1/0 to boolean |
| `track_user_genre_id` | `track_user_genre_id` | Integer |
| `music_key_value` | `music_key_value`, `key` | Text value |

## URL Update

**From**: `https://eafyytltuwuxuuoevavo.supabase.co/storage/v1/object/public/audio-files/[id].mp3`  
**To**: `https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/[id].mp3`

## Execution Steps

### Step 1: Create Backup (SQL Editor)
```sql
CREATE TABLE audio_tracks_backup_20250119 AS 
SELECT * FROM audio_tracks;

SELECT COUNT(*) FROM audio_tracks_backup_20250119;
-- Should return: 11,233
```

### Step 2: Verify Environment
```bash
# Check .env file has service role key
cat .env | grep SERVICE_ROLE

# Should see:
# VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhb...
```

### Step 3: Run Update Script
```bash
npx tsx scripts/update-null-fields-from-json.ts
```

### Step 4: Verify Results (SQL Editor)
```sql
-- Check NULL counts decreased
SELECT 
  COUNT(*) FILTER (WHERE track_id IS NULL) as null_track_id,
  COUNT(*) FILTER (WHERE tempo IS NULL) as null_tempo
FROM audio_tracks;

-- Check URLs updated
SELECT COUNT(*) 
FROM audio_tracks 
WHERE file_path LIKE '%xewajlyswijmjxuajhif%';
-- Should return: 11,233
```

## Update Logic

The script follows this logic for each track:

1. **Fetch track from database** with current field values
2. **Extract track ID** from metadata or file_path
3. **Download JSON file** from storage (`{track_id}.json`)
4. **Compare each field**:
   - If database field is NULL → Use JSON value
   - If database field has value → Keep existing value (no change)
5. **Update file_path** if contains old URL
6. **Save updates** to database
7. **Track statistics** for reporting

## Safety Features

- **Backup required**: Script prompts for backup confirmation
- **NULL-only updates**: Never overwrites existing data
- **Batch processing**: 50 records at a time to avoid timeouts
- **Error handling**: Continues on errors, logs failures
- **Progress tracking**: Shows updates every 100 records
- **Rollback available**: Can restore from backup if needed

## Expected Results

After successful execution:

```
Total processed: 11,233
Total updated: ~11,189 (some may not have JSON files)
URLs updated: 11,233
Errors: <50 (missing JSON files)
```

**Field population (estimated)**:
- `track_id`: ~11,200 populated
- `tempo`: ~11,150 populated
- `speed`: ~10,800 populated
- `intensity`: ~10,800 populated
- `arousal`: ~10,500 populated
- `valence`: ~10,500 populated
- `brightness`: ~10,500 populated
- `complexity`: ~10,500 populated
- `energy_set`: ~11,000 populated

## Troubleshooting

### Issue: Missing service role key
**Solution**: Add to `.env` file:
```bash
VITE_SUPABASE_SERVICE_ROLE_KEY=your-actual-key
```

### Issue: JSON files not found
**Solution**: Script checks both buckets automatically:
- Primary: `audio-files` bucket
- Fallback: `audio-sidecars` bucket

### Issue: Rate limiting
**Solution**: Script includes 200ms delay between batches

### Issue: Some fields still NULL
**Reason**: JSON file doesn't contain that field
**Action**: These are expected; not all JSON files have all fields

## Verification Queries

```sql
-- Count NULL fields after update
SELECT 
  COUNT(*) FILTER (WHERE track_id IS NULL) as null_track_id,
  COUNT(*) FILTER (WHERE tempo IS NULL) as null_tempo,
  COUNT(*) FILTER (WHERE speed IS NULL) as null_speed
FROM audio_tracks;

-- View sample updated records
SELECT id, track_id, tempo, speed, updated_at
FROM audio_tracks
WHERE updated_at > NOW() - INTERVAL '1 hour'
LIMIT 10;

-- Check URL migration
SELECT 
  COUNT(*) FILTER (WHERE file_path LIKE '%eafyytltuwuxuuoevavo%') as old,
  COUNT(*) FILTER (WHERE file_path LIKE '%xewajlyswijmjxuajhif%') as new
FROM audio_tracks;
```

## Rollback (If Needed)

```sql
-- Restore from backup
TRUNCATE audio_tracks;
INSERT INTO audio_tracks SELECT * FROM audio_tracks_backup_20250119;
```

## Cleanup (After 30 Days)

```sql
-- Once confirmed successful
DROP TABLE audio_tracks_backup_20250119;
```

## Next Steps After Update

1. ✅ Verify NULL counts decreased
2. ✅ Check sample records look correct
3. ✅ Test application functionality
4. ✅ Monitor for any issues
5. ✅ Schedule backup deletion (30 days)

## Support Files Reference

- **Main Guide**: `AUDIO_TRACKS_NULL_FIELD_UPDATE_GUIDE.md` (comprehensive)
- **SQL Reference**: `sql/update-tracks-quick-reference.sql` (quick commands)
- **Update Script**: `scripts/update-null-fields-from-json.ts` (execution)
- **This Summary**: `UPDATE_SUMMARY.md` (overview)

---

**Status**: Ready to execute  
**Risk Level**: Low (backup required, NULL-only updates, rollback available)  
**Estimated Duration**: 10-15 minutes for 11,233 records  
**Prerequisites**: Service role key, backup table created
