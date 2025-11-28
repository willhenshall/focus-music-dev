# How to Run the Metadata Backfill (Easy Way!)

## Overview

I've created a simple button interface that will execute all 23 batches automatically for you. No technical skills needed!

## Step-by-Step Instructions

### 1. Log in as Admin

Make sure you're logged into your Focus.Music app as an admin user.

### 2. Navigate to Dev Tools

1. Go to the **Admin Dashboard**
2. Click on the **"Dev Tools"** tab in the navigation

### 3. Run the Backfill

You'll see a new section at the top called **"Metadata Backfill Runner"**

1. Click the blue **"Start Metadata Backfill"** button
2. Watch as the progress bar updates
3. Each batch will show:
   - ✓ Green checkmark when complete
   - Spinner while running
   - Number of tracks updated

### 4. Wait for Completion

- Total time: ~2-5 minutes
- All 23 batches will run automatically
- You'll see a success message when done

## What It Does

✅ Populates missing metadata for ~11,285 tracks:
- tempo, speed, intensity, arousal, valence
- brightness, complexity, music_key_value, energy_set
- catalog, track_user_genre_id

❌ **Does NOT modify**:
- Artist names
- Track names
- Album names

## How It Works

The system:
1. Downloads the CSV data from Google Sheets
2. Processes 500 tracks per batch (batch 23 has 285)
3. Only updates NULL/missing fields
4. Uses COALESCE to never overwrite existing data
5. Tracks progress in the database

## Verification

After completion, you can check:

1. Go to **Music Library** tab
2. Click on any track to view details
3. You should now see all metadata fields populated

Or run this SQL query in Supabase Dashboard:

```sql
SELECT
  COUNT(*) as total_tracks,
  COUNT(tempo) as has_tempo,
  ROUND(COUNT(tempo)::NUMERIC / COUNT(*)::NUMERIC * 100, 1) as tempo_pct
FROM audio_tracks
WHERE deleted_at IS NULL;
```

Expected: tempo_pct should be close to 100%

## Troubleshooting

**"Error executing batch X"**
- The batch will show an error message
- You can refresh and click the button again
- It's safe to re-run - it won't duplicate data

**"Nothing happens when I click Start"**
- Check your browser console for errors
- Make sure you're logged in as an admin
- Try refreshing the page

**"Some tracks still missing metadata"**
- This is normal if those tracks don't exist in the CSV
- Or if they have different track_id values
- Check a few random tracks to verify most are updated

## Technical Details

**Edge Function**: `execute-metadata-backfill`
- Deployed to Supabase
- Uses service role key for database access
- Downloads CSV on each batch
- Updates tracks matching by metadata->>'track_id'

**Component**: `MetadataBackfillRunner.tsx`
- React component with progress tracking
- Calls the edge function 23 times sequentially
- Visual feedback for each batch status

## Need Help?

If you encounter any issues:
1. Check the browser console for error messages
2. Look at the Supabase Edge Function logs
3. The backfill is idempotent - safe to run multiple times
4. No data will be lost or overwritten

## After Completion

Once the backfill is complete:
- Your tracks will have rich metadata
- The playlist algorithm can use all the new data
- Better recommendations and sorting
- More accurate energy level matching

Enjoy your fully-populated music library!
