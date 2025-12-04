# HLS Transcoding Guide for Music Editors

This guide explains how to transcode MP3 files to HLS (HTTP Live Streaming) format for upload to the Focus Music admin dashboard.

## Why HLS?

HLS (HTTP Live Streaming) is an adaptive streaming protocol that:
- Solves iOS Safari buffer limitations with long audio files
- Enables faster seeking in long tracks
- Provides better streaming performance on mobile devices
- Allows for progressive loading of audio segments

## Quick Start

### Prerequisites

1. **FFmpeg** must be installed on your computer
   - macOS: `brew install ffmpeg`
   - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
   - Linux: `sudo apt install ffmpeg`

2. Verify installation: `ffmpeg -version`

## HLS Format Requirements

Our HLS files must match these exact specifications:

| Setting | Value | Notes |
|---------|-------|-------|
| Segment Duration | 10 seconds | Industry standard |
| Audio Codec | AAC | Required for iOS compatibility |
| Audio Bitrate | 256 kbps | High quality |
| Sample Rate | 44100 Hz | CD quality |
| Channels | 2 (stereo) | Standard |
| Playlist Format | HLS v3+ | `master.m3u8` |
| Segment Format | MPEG-TS | `segment_XXX.ts` |

## Transcoding Commands

### Single File

To transcode a single MP3 file:

```bash
# Create output directory (named same as MP3 file without extension)
mkdir "trackname"

# Transcode to HLS
ffmpeg -i "trackname.mp3" \
  -c:a aac \
  -b:a 256k \
  -ar 44100 \
  -ac 2 \
  -hls_time 10 \
  -hls_list_size 0 \
  -hls_segment_filename "trackname/segment_%03d.ts" \
  -hls_flags independent_segments \
  -y \
  "trackname/master.m3u8"
```

### Batch Processing (Multiple Files)

For processing multiple files at once, use this script:

```bash
#!/bin/bash
# batch-transcode.sh - Transcode all MP3s in current directory to HLS

for mp3file in *.mp3; do
    # Get filename without extension
    basename="${mp3file%.mp3}"
    
    # Create output directory
    mkdir -p "$basename"
    
    echo "Transcoding: $mp3file -> $basename/"
    
    ffmpeg -i "$mp3file" \
        -c:a aac \
        -b:a 256k \
        -ar 44100 \
        -ac 2 \
        -hls_time 10 \
        -hls_list_size 0 \
        -hls_segment_filename "$basename/segment_%03d.ts" \
        -hls_flags independent_segments \
        -y \
        "$basename/master.m3u8"
    
    echo "Done: $basename"
done

echo "All files transcoded!"
```

Save this as `batch-transcode.sh`, make it executable (`chmod +x batch-transcode.sh`), and run it in your MP3 folder.

## Expected Output Structure

After transcoding, you should have this structure:

```
mp3-folder/
├── track1.mp3
├── track2.mp3
└── track3.mp3

hls-folder/
├── track1/
│   ├── master.m3u8
│   ├── segment_000.ts
│   ├── segment_001.ts
│   └── ... (more segments)
├── track2/
│   ├── master.m3u8
│   ├── segment_000.ts
│   └── ...
└── track3/
    ├── master.m3u8
    └── ...
```

**Important:** The HLS folder name MUST match the MP3 filename (without `.mp3`).

## File Naming Convention

| MP3 File | HLS Folder Name | Example Playlist Path |
|----------|-----------------|----------------------|
| `My Song.mp3` | `My Song/` | `My Song/master.m3u8` |
| `track-001.mp3` | `track-001/` | `track-001/master.m3u8` |
| `ambient_forest_v2.mp3` | `ambient_forest_v2/` | `ambient_forest_v2/master.m3u8` |

## Uploading to Admin Dashboard

### Single Track Upload

1. Go to **Admin Dashboard** → **Music Library** → **Upload Track**
2. Select the MP3 file
3. Select the matching HLS folder using the "HLS Streaming Files" input
4. Fill in metadata (track name, artist, etc.)
5. Click **Upload Track**

### Bulk Upload

1. Go to **Admin Dashboard** → **Music Library** → **Bulk Upload**
2. Select all MP3 files from your MP3 folder
3. Select the parent HLS folder containing all HLS subfolders
4. The system will automatically match MP3s to HLS folders by name
5. Review any warnings about mismatched files
6. Click **Upload Tracks**

## Validation Checklist

Before uploading, verify:

- [ ] Each HLS folder contains `master.m3u8`
- [ ] Each HLS folder contains `.ts` segment files
- [ ] HLS folder names exactly match MP3 filenames (without extension)
- [ ] No special characters in filenames that could cause issues

## Troubleshooting

### "HLS folder is missing master.m3u8"

The FFmpeg command didn't complete successfully. Check:
- FFmpeg is installed correctly
- Input MP3 file is valid and not corrupted
- You have write permissions in the output directory

### "No matching HLS folder"

The folder name doesn't match the MP3 filename. Ensure:
- `song.mp3` has a folder named `song/` (not `song_hls/` or `Song/`)
- Case sensitivity matters on some systems

### "No .ts segment files"

The transcoding failed. Try:
- Running FFmpeg manually to see error messages
- Checking disk space
- Verifying the input MP3 is valid

### Large Files Taking Too Long

For very long tracks (30+ minutes):
- Consider using parallel processing on multiple cores
- Use SSD storage for faster I/O
- Expected time: ~10-30 seconds per track

## Technical Notes

### Segment Count Estimation

Number of segments = (Track duration in seconds) / 10

Examples:
- 3-minute track (180s) → 18 segments
- 10-minute track (600s) → 60 segments
- 30-minute track (1800s) → 180 segments

### File Size Estimation

HLS files are typically similar in total size to the source MP3:
- Source: 256 kbps MP3
- Output: 256 kbps AAC + minimal HLS overhead

A 10-minute track (~19 MB at 256 kbps) will produce HLS files totaling ~20 MB.

## Support

If you encounter issues:
1. Check this guide's troubleshooting section
2. Verify FFmpeg is properly installed
3. Contact the development team with:
   - The exact error message
   - The FFmpeg command you used
   - The source file details (duration, size)
