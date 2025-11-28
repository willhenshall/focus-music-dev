# Playlist Upload Guide

This guide explains how to upload your 108 channel playlist JSON files to populate the database.

## File Naming Convention

Your playlist files should follow this naming pattern:
```
{ChannelName}__{ENERGY}.json
```

Examples:
- `The Grid__LOW.json`
- `The Grid__MEDIUM.json`
- `The Grid__HIGH.json`
- `Tranquility__HIGH.json`
- `Naturebeat__LOW.json`

## File Format

Each JSON file should contain:
```json
{
  "channel": "The Grid",
  "energy": "MEDIUM",
  "k": 100,
  "tracks": [
    {
      "track_id": 148474,
      "weight": 1.0
    },
    ...
  ],
  "model_version": "v1"
}
```

## Upload Methods

### Option 1: Bulk Upload via File System (Recommended)

1. **Place all 108 JSON files** in the `supabase/data/` directory

2. **Run the processing script**:
   ```bash
   npx tsx scripts/process-playlist-files.ts
   ```

   This script will:
   - Read all `*__*.json` files from `supabase/data/`
   - Group them by channel name
   - Extract track IDs in order
   - Update the `playlist_data` column for each channel

### Option 2: Manual Upload via Chat

You can upload files in batches by dragging and dropping them into the chat:
- Upload 10-20 files at a time
- I'll process them and update the database

## What Happens After Upload

Once the playlist files are processed:

1. Each channel's `playlist_data` column is updated with:
   ```json
   {
     "low": ["148474", "148484", ...],
     "medium": ["147934", "147894", ...],
     "high": ["82243", "81473", ...]
   }
   ```

2. When a user selects a channel and energy level:
   - The system fetches the playlist from `playlist_data`
   - Tracks are played in the exact order defined in your JSON
   - No custom algorithm - just sequential playback

## Verification

After upload, you can verify by:

1. Checking a specific channel:
   ```sql
   SELECT channel_name, playlist_data
   FROM audio_channels
   WHERE channel_name = 'The Grid';
   ```

2. Counting tracks per energy level:
   ```sql
   SELECT
     channel_name,
     jsonb_array_length(playlist_data->'low') as low_tracks,
     jsonb_array_length(playlist_data->'medium') as medium_tracks,
     jsonb_array_length(playlist_data->'high') as high_tracks
   FROM audio_channels;
   ```

## Next Steps

After playlists are uploaded:
1. Import audio files using the import edge function
2. Test playback for a sample channel
3. Verify track ordering matches your playlists
