# CSV Metadata Import Guide

## Overview

The CSV Metadata Importer tool allows you to bulk update track metadata from a CSV file. This is critical for ensuring all tracks have complete metadata, especially the `energy_set` field.

## Location

The importer is available in the Admin Dashboard under the "Dev Tools" tab at the top of the page.

## CSV File Format

### Required Columns

Your CSV file MUST include these columns in the header row (order doesn't matter):

- `track_id` - Integer: The Track ID from the original system (used for matching)
- `track_name` - Text: Name of the track
- `artist_name` - Text: Name of the artist
- `tempo` - Integer: BPM (beats per minute)
- `locked` - Boolean: 1 or 0 (whether track is locked)
- `speed` - Decimal: 0.0 to 1.0
- `intensity` - Decimal: 0.0 to 1.0
- `arousal` - Decimal: 0.0 to 1.0
- `valence` - Decimal: 0.0 to 1.0
- `brightness` - Decimal: 0.0 to 1.0
- `complexity` - Decimal: 0.0 to 1.0
- `energy_set` - Integer: 1 (low), 2 (medium), or 3 (high)

### Example CSV Format

```csv
track_id,track_name,artist_name,tempo,locked,speed,intensity,arousal,valence,brightness,complexity,energy_set
179334,Drunk Angels Pure Suburban,Artist Name,112,1,0.5,0.5,0,0,0.5,0.5,1
179335,Another Track,Another Artist,120,0,0.6,0.7,0.5,0.4,0.6,0.3,2
```

## How Matching Works

The importer matches CSV rows to database tracks using the `track_id` column:

1. The CSV's `track_id` value is matched against the `track_id` field in the `audio_tracks` table
2. This is an **exact match** - the track_id must exist in the database
3. If a track_id is not found, it's logged as "Not Found" but processing continues
4. If found, ALL metadata fields are updated

## Technical Implementation

The importer uses a Supabase Edge Function (`import-csv-metadata`) that runs with service role credentials. This bypasses Row Level Security (RLS) policies to ensure reliable updates even with strict database security.

Each batch is sent to the edge function which processes updates server-side for maximum reliability and security.

## Configuration Options

### Batch Size (1-200)
- Number of tracks to process in each batch
- Default: 50
- Smaller batches = more status updates but slightly slower
- Larger batches = faster but less granular feedback

### Delay Between Batches (0-5000ms)
- Milliseconds to wait between processing batches
- Default: 500ms
- Helps prevent overwhelming the database
- Set to 0 for maximum speed (use with caution)

## Import Process

1. **Select CSV File**: Click "Choose File" and select your CSV
2. **Verify Parse**: The tool will show how many rows were found
3. **Review Settings**: Adjust batch size and delay if needed
4. **Start Import**: Click "Start Import" button
5. **Monitor Progress**: Watch real-time updates showing:
   - Overall progress bar with percentage
   - Updated tracks (green)
   - Not found tracks (yellow)
   - Errors (red)
   - Current batch number
   - Live processing log

## Controls

- **Pause**: Stop processing after current batch completes
- **Resume**: Continue from where you paused
- **Reset**: Clear everything and start over with a new file

## Data Safety Features

1. **No Skipping**: Every row in the CSV is processed
2. **Exact Matching**: Only updates tracks with matching track_id
3. **Error Logging**: All errors are logged with details
4. **Batch Processing**: Prevents database overload
5. **Pause/Resume**: Can stop and restart at any time
6. **Progress Tracking**: Real-time visibility into what's happening

## What Gets Updated

For each matching track, these fields are updated:
- `tempo`
- `locked`
- `speed`
- `intensity`
- `arousal`
- `valence`
- `brightness`
- `complexity`
- `energy_set`
- `updated_at` (automatically set to current timestamp)

## Expected Results

- **Updated**: Track found and successfully updated
- **Not Found**: track_id exists in CSV but not in database
- **Errors**: Database errors during update (logged with details)

## Troubleshooting

### "Missing required headers" error
- Verify your CSV has all required column names in the first row
- Check spelling and capitalization (should match exactly)

### "Failed to parse CSV file" error
- Ensure file is valid CSV format
- Check for extra commas or malformed rows
- Verify all numeric fields have valid numbers

### High "Not Found" count
- Verify track_id values in CSV match database
- Run query: `SELECT COUNT(*) FROM audio_tracks WHERE track_id IS NOT NULL`
- Check that tracks were imported correctly

### High "Errors" count
- Check the processing log for specific error messages
- Verify database permissions
- Check for invalid data values (e.g., negative numbers, out of range)

## Best Practices

1. **Test First**: Start with a small CSV (10-20 rows) to verify format
2. **Backup**: Ensure you have a database backup before large imports
3. **Monitor**: Watch the log for any unexpected errors
4. **Validate**: After import, spot-check a few tracks to verify data
5. **One Time Use**: This tool is designed for one-time bulk updates

## Post-Import Verification

After import completes, verify the data:

```sql
-- Check energy_set distribution
SELECT energy_set, COUNT(*)
FROM audio_tracks
WHERE energy_set IS NOT NULL
GROUP BY energy_set;

-- Check tracks with complete metadata
SELECT COUNT(*)
FROM audio_tracks
WHERE speed IS NOT NULL
  AND intensity IS NOT NULL
  AND energy_set IS NOT NULL;

-- Sample updated tracks
SELECT id, title, tempo, speed, intensity, energy_set, updated_at
FROM audio_tracks
WHERE updated_at > NOW() - INTERVAL '1 hour'
LIMIT 10;
```
