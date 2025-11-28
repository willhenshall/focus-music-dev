# How to Complete the Metadata Backfill

## Current Status

✅ **Everything is ready!** All 23 SQL batch files have been generated and are waiting at:
- `/tmp/backfill_batch_01.sql` through `/tmp/backfill_batch_23.sql`

⚠️ **Note**: These files are too large to execute through the chat interface, so you'll need to run them manually.

## Important Reminders

🔒 **Artist names, track names, and album names will NOT be modified**
- The SQL explicitly excludes these fields
- All existing display names are preserved
- Only missing/NULL metadata fields are filled

## Option 1: Using Supabase Dashboard (Easiest)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. For each batch (01 through 23):
   ```bash
   # On your local machine, copy the SQL
   cat /tmp/backfill_batch_01.sql | pbcopy  # macOS
   # or
   cat /tmp/backfill_batch_01.sql  # then manually copy
   ```
5. Paste into SQL Editor and click **Run**
6. Wait for completion (should take 1-5 seconds per batch)
7. Repeat for batches 02 through 23

**Progress tracking**: Keep a checklist of completed batches

## Option 2: Using Supabase CLI (Fastest)

If you have the Supabase CLI installed:

```bash
# Execute all batches in sequence
for i in {01..23}; do
  echo "Executing batch $i..."
  supabase db execute < /tmp/backfill_batch_${i}.sql
  echo "Batch $i complete"
  sleep 1
done
```

## Option 3: Using psql Directly

If you have PostgreSQL client installed:

```bash
# Get your connection string from Supabase Dashboard > Settings > Database
# Then run:
for i in {01..23}; do
  echo "Executing batch $i..."
  psql "your-connection-string-here" -f /tmp/backfill_batch_${i}.sql
  echo "Batch $i complete"
done
```

## Option 4: Using the Helper Script

A bash script has been created:

```bash
# Set your DATABASE_URL environment variable first
export DATABASE_URL="your-supabase-connection-string"

# Run the script
./scripts/run-all-backfill-batches.sh
```

## Verification

After completing all batches, verify the results:

### Check via SQL Editor:

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

### Expected Results:

- **Before backfill**: Most fields will show only 3-10 tracks
- **After backfill**: Most fields should show ~11,240 tracks (100%)

### Check a Sample Track:

```sql
SELECT
  id,
  track_id,
  tempo,
  catalog,
  speed,
  intensity,
  arousal,
  valence,
  brightness,
  complexity,
  music_key_value,
  energy_set,
  metadata->>'track_name' as track_name,
  metadata->>'artist_name' as artist_name
FROM audio_tracks
WHERE metadata->>'track_id' = '179094'
LIMIT 1;
```

This should show all fields populated with values from the CSV.

## Troubleshooting

### "No rows updated"
- This is normal if those tracks already have the metadata
- The SQL uses COALESCE which only updates NULL fields

### "Track not found"
- The track doesn't exist in your database
- Or the metadata doesn't have a track_id field
- These are automatically skipped

### "Timeout error"
- Some batches might take longer than expected
- Try running that batch again
- Or split the problematic batch into smaller chunks

### "Permission denied"
- Make sure you're using an admin account or service role key
- Check that RLS policies allow the update

## Files Location

All files are in `/tmp/` on the server where this code is running:
- `/tmp/backfill_batch_01.sql` through `/tmp/backfill_batch_23.sql` (23 files)
- `/tmp/metadata_backfill.csv` (source data)

**Note**: If you need to regenerate these files:
```bash
cd /tmp/cc-agent/58694584/project
npx tsx scripts/backfill-via-mcp.ts
```

## What Gets Updated

### Fields Updated (only if NULL):
- ✅ track_id
- ✅ tempo
- ✅ catalog
- ✅ locked
- ✅ track_user_genre_id
- ✅ speed
- ✅ intensity
- ✅ arousal
- ✅ valence
- ✅ brightness
- ✅ complexity
- ✅ music_key_value
- ✅ energy_set

### Fields NOT Updated (preserved):
- ❌ artist_name
- ❌ track_name
- ❌ album

## After Completion

Once all 23 batches are executed:

1. ✅ Verify the results using the SQL queries above
2. ✅ Check a few tracks in the Music Library UI
3. ✅ View the Track Details modal to see the populated metadata
4. ✅ Optionally delete the temporary files from `/tmp/`

## Need Help?

If you encounter any issues:
1. Check which batch failed
2. Look at the error message
3. You can re-run individual batches without affecting already-updated tracks
4. The operation is safe and idempotent

## Summary

- **Total batches**: 23
- **Total tracks**: ~11,285
- **Execution time**: ~2-5 minutes for all batches
- **Data safety**: Existing values are never overwritten
- **Display names**: Artist and track names remain unchanged
