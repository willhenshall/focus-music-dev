# Music Library Metadata Backfill Guide

## Overview

This guide explains the metadata backfill system that has been set up to populate missing metadata fields in your music library from a Google Sheets CSV export.

## What Was Done

### 1. Database Migration Created

A migration was created that adds a function to perform metadata backfill:

- **File**: `supabase/migrations/20251027222000_backfill_metadata_from_csv.sql`
- **Function**: `backfill_track_metadata()`
- **Purpose**: Updates NULL metadata fields with values from a staging table

### 2. Metadata Fields Backfilled

The following fields are populated from the CSV for tracks that have NULL values:

#### Dedicated Columns
- `track_id` - Primary identifier
- `tempo` - BPM (beats per minute)
- `catalog` - Catalog name
- `locked` - Boolean flag
- `track_user_genre_id` - Genre identifier
- `speed` - Speed rating (0-1)
- `intensity` - Intensity rating (0-1)
- `arousal` - Arousal rating (0-1)
- `valence` - Valence rating (0-1)
- `brightness` - Brightness rating (0-1)
- `complexity` - Complexity rating (0-1)
- `music_key_value` - Musical key
- `energy_set` - Energy set identifier

#### Metadata JSONB Fields

**⚠️ IMPORTANT: Display Names Are NOT Modified**

- `artist_name`, `album`, and `track_name` in the metadata JSONB are **NOT** updated by this backfill
- All existing display names are preserved exactly as-is
- This ensures the music library continues to show the same artist and track names you've already set
- Only the dedicated metadata columns listed above are backfilled

### 3. CSV Data Source

The CSV data is from:
- **URL**: https://docs.google.com/spreadsheets/d/1MDQ6thhSJ1xeLAozGsP0qwqR-O37kuNgagQ0KHDi3WM
- **Records**: 11,285 tracks
- **Downloaded to**: `/tmp/metadata_backfill.csv`

### 4. SQL Batch Files Generated

To handle the large dataset, the backfill SQL has been split into 23 batch files:

- **Location**: `/tmp/backfill_batch_01.sql` through `/tmp/backfill_batch_23.sql`
- **Batch Size**: 500 records per batch (except last batch with 285)
- **Total Size**: ~3.2 MB of SQL (smaller because we're not updating artist/track names)

## Current Status

### ✅ Completed
- Migration created and applied
- CSV data downloaded and parsed
- SQL batch files generated
- Database schema verified (all columns exist)
- Test update successful (verified on track_id 179094)

### ⚠️ Pending
- Execute all 23 SQL batch files to complete the backfill

## How to Complete the Backfill

You have two options:

### Option 1: Manual Execution via Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Execute each batch file one at a time:
   ```bash
   # Read and copy the content of each file
   cat /tmp/backfill_batch_01.sql
   ```
4. Paste into SQL Editor and run
5. Repeat for batches 02-23

### Option 2: Programmatic Execution

Create a simple admin tool or use the Supabase CLI to execute the batches:

```bash
# Using Supabase CLI (if installed)
for i in {01..23}; do
  supabase db execute < /tmp/backfill_batch_${i}.sql
  echo "Batch ${i} complete"
  sleep 1
done
```

### Option 3: Using the MCP Execute SQL Tool

Since we have MCP tools available, you can execute each batch using the `mcp__supabase__execute_sql` tool directly in Claude Code.

Example for first batch:
```
Execute the SQL in /tmp/backfill_batch_01.sql
```

Then repeat for all 23 batches.

## Verification

After all batches are executed, verify the backfill with:

```sql
SELECT
  COUNT(*) as total_tracks,
  COUNT(track_id) as has_track_id,
  COUNT(tempo) as has_tempo,
  COUNT(catalog) as has_catalog,
  COUNT(speed) as has_speed,
  COUNT(intensity) as has_intensity,
  COUNT(arousal) as has_arousal,
  COUNT(valence) as has_valence,
  COUNT(brightness) as has_brightness,
  COUNT(complexity) as has_complexity,
  COUNT(music_key_value) as has_music_key_value,
  COUNT(energy_set) as has_energy_set
FROM audio_tracks
WHERE deleted_at IS NULL;
```

Expected result after backfill:
- All ~11,240 tracks should have metadata populated
- Percentage should be ~100% for most fields

## Important Notes

1. **Data Safety**: The SQL uses `COALESCE()` which means:
   - Existing non-NULL values are NEVER overwritten
   - Only NULL/missing fields are filled in
   - This is a safe, idempotent operation

2. **Matching Logic**: Tracks are matched using:
   - `(metadata->>'track_id')::INTEGER` from the database
   - Matched against `track_id` from the CSV

3. **Performance**: Each batch updates ~500 records and should complete in 1-5 seconds

4. **Track Details Modal**: All these fields are already displayed in the Track Details modal under:
   - Overview tab: Basic info (artist, album, tempo)
   - Technical tab: Musical properties (speed, intensity, arousal, etc.)
   - Metadata tab: All JSONB fields

## Scripts Available

Several helper scripts have been created:

### Generate Batch Files
```bash
npx tsx scripts/backfill-via-mcp.ts
```

### Check Current Status
```bash
npm run backfill-metadata-sql
```

## Troubleshooting

### Issue: "track_id not found"
- The track doesn't exist in the database
- The metadata JSONB doesn't have a track_id field
- Solution: These tracks are skipped automatically

### Issue: "No rows updated"
- All target fields already have values
- Solution: This is normal and safe

### Issue: "Permission denied"
- Need admin/service role access
- Solution: Use service role key or admin account

## Next Steps

1. Execute all 23 SQL batch files (see "How to Complete the Backfill" above)
2. Verify the results with the verification query
3. Check a few tracks in the Music Library to see the populated metadata
4. Delete the temporary batch files from `/tmp/` if desired

## Files Created

- `supabase/migrations/20251027222000_backfill_metadata_from_csv.sql`
- `scripts/backfill-metadata-from-csv.ts`
- `scripts/backfill-metadata-sql.ts`
- `scripts/backfill-via-mcp.ts`
- `/tmp/backfill_batch_01.sql` through `/tmp/backfill_batch_23.sql`
- `/tmp/metadata_backfill.csv`
- This guide: `METADATA_BACKFILL_GUIDE.md`
