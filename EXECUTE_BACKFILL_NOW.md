# Execute Metadata Backfill - Quick Start

## Current Status

✅ All 23 SQL batch files are generated and ready at `/tmp/backfill_batch_01.sql` through `/tmp/backfill_batch_23.sql`

❌ The files are too large (140KB each) to execute through the Claude Code interface

## The Problem

The SQL files cannot be executed through the MCP tools due to size limitations. You need to execute them manually.

## The Solution - 3 Easy Options

### Option 1: Supabase Dashboard SQL Editor (EASIEST)

1. Open your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. For each batch:
   - On your server: `cat /tmp/backfill_batch_01.sql`
   - Copy the entire output
   - Paste into the SQL Editor
   - Click **Run**
   - Wait ~2-5 seconds for completion
   - Repeat for batches 02 through 23

**Time estimate**: 5-10 minutes total

### Option 2: Supabase CLI (FASTEST)

If you have Supabase CLI installed:

```bash
cd /tmp/cc-agent/58694584/project

# Execute all batches in sequence
for i in {01..23}; do
  echo "Executing batch $i..."
  supabase db execute < /tmp/backfill_batch_${i}.sql
  echo "✓ Batch $i complete"
done
```

**Time estimate**: 2-3 minutes total

### Option 3: Direct PostgreSQL Connection

If you have `psql` installed:

1. Get your database connection string from Supabase Dashboard:
   - Go to Settings > Database
   - Copy the "Connection string" (URI format)

2. Execute:

```bash
export DATABASE_URL="your-connection-string-here"

for i in {01..23}; do
  echo "Executing batch $i..."
  psql "$DATABASE_URL" -f /tmp/backfill_batch_${i}.sql
  echo "✓ Batch $i complete"
done
```

**Time estimate**: 2-3 minutes total

## What the SQL Does

Each batch file contains a single UPDATE statement that:

✅ Updates ~500 tracks (batch 23 has 285 tracks)
✅ Only fills in NULL/missing metadata fields
✅ Uses `COALESCE()` so existing data is NEVER overwritten
✅ **Does NOT modify**: artist_name, track_name, or album

## After Execution

Once all 23 batches are complete, verify with this SQL:

```sql
SELECT
  COUNT(*) as total_tracks,
  COUNT(tempo) as has_tempo,
  COUNT(speed) as has_speed,
  COUNT(intensity) as has_intensity,
  ROUND(COUNT(tempo)::NUMERIC / COUNT(*)::NUMERIC * 100, 1) as tempo_pct
FROM audio_tracks
WHERE deleted_at IS NULL;
```

**Expected results**:
- total_tracks: ~11,240
- has_tempo: ~11,240 (100%)
- has_speed: ~11,240 (100%)
- has_intensity: ~11,240 (100%)

## Files Location

All files are at:
- `/tmp/backfill_batch_01.sql` through `/tmp/backfill_batch_23.sql`
- Total size: ~3.2 MB
- Total records: 11,285 tracks

## Troubleshooting

**"File not found"**: The `/tmp/` files may have been cleaned up. Regenerate with:
```bash
cd /tmp/cc-agent/58694584/project
npx tsx scripts/backfill-via-mcp.ts
```

**"Permission denied"**: Make sure you're using:
- Service role key (not anon key)
- Or an admin account in the SQL Editor

**"No rows updated"**: This is normal if those tracks already have metadata. The SQL is idempotent and safe to run multiple times.

## Need Help?

The backfill is ready to go - you just need to copy/paste the SQL or run the commands above. The hardest part is done!

Once you execute the batches, let me know and I can verify the results.
