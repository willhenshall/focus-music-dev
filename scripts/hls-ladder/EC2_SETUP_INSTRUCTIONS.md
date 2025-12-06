# HLS Ladder Transcoder - EC2 Setup Instructions

Complete guide to running the multi-bitrate HLS ladder transcoder on your EC2 instance.

---

## Overview

This pipeline creates a 4-bitrate HLS ladder for each audio track:
- **LOW**: 32 kbps AAC
- **MEDIUM**: 64 kbps AAC
- **HIGH**: 96 kbps AAC
- **PREMIUM**: 128 kbps AAC

Output structure in R2:
```
hls/<track-id>/
├── master.m3u8
├── low/
│   ├── index.m3u8
│   └── segment_000.ts, segment_001.ts, ...
├── medium/
│   ├── index.m3u8
│   └── segment_000.ts, segment_001.ts, ...
├── high/
│   ├── index.m3u8
│   └── segment_000.ts, segment_001.ts, ...
└── premium/
    ├── index.m3u8
    └── segment_000.ts, segment_001.ts, ...
```

---

## Part 1: EC2 Server Setup

### Step 1.1: Connect to Your EC2 Instance

```bash
ssh -i your-key.pem ec2-user@your-ec2-ip
```

### Step 1.2: Install Required Software

```bash
# Update packages
sudo yum update -y

# Install ffmpeg
sudo yum install -y ffmpeg

# Verify ffmpeg installation
ffmpeg -version

# Install AWS CLI (if not already installed)
sudo yum install -y awscli

# Verify AWS CLI
aws --version
```

### Step 1.3: Create Working Directory

```bash
mkdir -p ~/hls-ladder
cd ~/hls-ladder
```

---

## Part 2: Create the Scripts

### Step 2.1: Create the Single-Track Transcoder

Copy and paste this entire command to create the script:

```bash
cat > ~/hls-ladder/transcode-single-track.sh << 'SCRIPT_EOF'
#!/bin/bash
set -euo pipefail

WORK_DIR="${WORK_DIR:-/tmp/hls-transcode}"
LOG_FILE="${LOG_FILE:-/tmp/hls-transcode.log}"
HLS_TIME=6
HLS_PLAYLIST_TYPE="vod"

if [[ $# -lt 2 ]]; then
    echo "ERROR: Missing arguments"
    echo "Usage: $0 <TRACK_ID> <MP3_S3_URL>"
    exit 1
fi

TRACK_ID="$1"
MP3_S3_URL="$2"

log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "Starting HLS transcode for: $TRACK_ID"
log "Source: $MP3_S3_URL"
log "=========================================="

TRACK_WORK_DIR="$WORK_DIR/$TRACK_ID"
OUTPUT_DIR="$TRACK_WORK_DIR/output"

rm -rf "$TRACK_WORK_DIR" 2>/dev/null || true
mkdir -p "$OUTPUT_DIR/low" "$OUTPUT_DIR/medium" "$OUTPUT_DIR/high" "$OUTPUT_DIR/premium"

log "Downloading MP3 from R2..."
MP3_FILE="$TRACK_WORK_DIR/source.mp3"
aws s3 cp "$MP3_S3_URL" "$MP3_FILE" --endpoint-url "$R2_ENDPOINT"

log "Encoding LOW (32 kbps)..."
ffmpeg -i "$MP3_FILE" -c:a aac -b:a 32k -ac 2 -ar 44100 -f hls -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/low/segment_%03d.ts" "$OUTPUT_DIR/low/index.m3u8" -y -loglevel warning

log "Encoding MEDIUM (64 kbps)..."
ffmpeg -i "$MP3_FILE" -c:a aac -b:a 64k -ac 2 -ar 44100 -f hls -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/medium/segment_%03d.ts" "$OUTPUT_DIR/medium/index.m3u8" -y -loglevel warning

log "Encoding HIGH (96 kbps)..."
ffmpeg -i "$MP3_FILE" -c:a aac -b:a 96k -ac 2 -ar 44100 -f hls -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/high/segment_%03d.ts" "$OUTPUT_DIR/high/index.m3u8" -y -loglevel warning

log "Encoding PREMIUM (128 kbps)..."
ffmpeg -i "$MP3_FILE" -c:a aac -b:a 128k -ac 2 -ar 44100 -f hls -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/premium/segment_%03d.ts" "$OUTPUT_DIR/premium/index.m3u8" -y -loglevel warning

log "Creating master playlist..."
cat > "$OUTPUT_DIR/master.m3u8" << 'MASTER_EOF'
#EXTM3U
#EXT-X-VERSION:3

# 32 kbps LOW
#EXT-X-STREAM-INF:BANDWIDTH=48000,CODECS="mp4a.40.2"
low/index.m3u8

# 64 kbps MEDIUM
#EXT-X-STREAM-INF:BANDWIDTH=96000,CODECS="mp4a.40.2"
medium/index.m3u8

# 96 kbps HIGH
#EXT-X-STREAM-INF:BANDWIDTH=144000,CODECS="mp4a.40.2"
high/index.m3u8

# 128 kbps PREMIUM
#EXT-X-STREAM-INF:BANDWIDTH=192000,CODECS="mp4a.40.2"
premium/index.m3u8
MASTER_EOF

log "Uploading to R2..."
R2_DEST="s3://$R2_BUCKET/hls/$TRACK_ID/"
aws s3 sync "$OUTPUT_DIR/" "$R2_DEST" --endpoint-url "$R2_ENDPOINT" --content-type "application/vnd.apple.mpegurl" --exclude "*" --include "*.m3u8"
aws s3 sync "$OUTPUT_DIR/" "$R2_DEST" --endpoint-url "$R2_ENDPOINT" --content-type "video/MP2T" --exclude "*" --include "*.ts"

log "Verifying upload..."
aws s3 ls "$R2_DEST" --recursive --endpoint-url "$R2_ENDPOINT" | head -5

rm -rf "$TRACK_WORK_DIR"

log "=========================================="
log "SUCCESS: HLS ladder created for $TRACK_ID"
log "=========================================="
SCRIPT_EOF

chmod +x ~/hls-ladder/transcode-single-track.sh
echo "✓ Single-track script created"
```

### Step 2.2: Create the Batch Transcoder

Copy and paste this entire command:

```bash
cat > ~/hls-ladder/batch-transcode.sh << 'SCRIPT_EOF'
#!/bin/bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SINGLE_TRACK_SCRIPT="$SCRIPT_DIR/transcode-single-track.sh"
TRACKS_FILE="${1:-$SCRIPT_DIR/tracks.txt}"
LOG_FILE="$SCRIPT_DIR/hls-batch.log"
FAILED_LOG="$SCRIPT_DIR/failed-tracks.log"
MAX_RETRIES=3

TOTAL=0 SUCCEEDED=0 FAILED=0

log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

process_track() {
    local track_id="$1"
    local mp3_url="$2"
    local attempt=1
    
    while [[ $attempt -le $MAX_RETRIES ]]; do
        log "Processing $track_id (attempt $attempt/$MAX_RETRIES)..."
        if "$SINGLE_TRACK_SCRIPT" "$track_id" "$mp3_url"; then
            return 0
        fi
        ((attempt++))
        sleep 5
    done
    return 1
}

echo "=============================================" | tee "$LOG_FILE"
log "HLS BATCH TRANSCODER STARTED"
log "Tracks file: $TRACKS_FILE"
echo "=============================================" | tee -a "$LOG_FILE"

> "$FAILED_LOG"

while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "${line// }" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    
    read -r track_id mp3_url <<< "$line"
    [[ -z "$track_id" || -z "$mp3_url" ]] && continue
    
    ((TOTAL++))
    
    if process_track "$track_id" "$mp3_url"; then
        log "✓ Track $track_id completed"
        ((SUCCEEDED++))
    else
        log "✗ Track $track_id FAILED"
        ((FAILED++))
        echo "$track_id $mp3_url" >> "$FAILED_LOG"
    fi
    
    log "Progress: Success=$SUCCEEDED Failed=$FAILED Total=$TOTAL"
    
done < "$TRACKS_FILE"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║           FINAL SUMMARY REPORT             ║"
echo "╠════════════════════════════════════════════╣"
printf "║  Total:     %-28s  ║\n" "$TOTAL"
printf "║  Succeeded: %-28s  ║\n" "$SUCCEEDED"
printf "║  Failed:    %-28s  ║\n" "$FAILED"
echo "╚════════════════════════════════════════════╝"

[[ $FAILED -gt 0 ]] && echo "Failed tracks saved to: $FAILED_LOG"
SCRIPT_EOF

chmod +x ~/hls-ladder/batch-transcode.sh
echo "✓ Batch script created"
```

---

## Part 3: Configure R2 Credentials

### Step 3.1: Set Environment Variables

Replace the placeholder values with your actual R2 credentials:

```bash
# Set R2 credentials (replace with your values)
export R2_ENDPOINT="https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com"
export R2_BUCKET="focus-music-audio"
export AWS_ACCESS_KEY_ID="your-r2-access-key"
export AWS_SECRET_ACCESS_KEY="your-r2-secret-key"
```

### Step 3.2: Verify R2 Connection

Test that you can access R2:

```bash
aws s3 ls "s3://$R2_BUCKET/" --endpoint-url "$R2_ENDPOINT" | head -5
```

You should see a list of files/folders in your bucket.

---

## Part 4: Test with ONE Track

### Step 4.1: Find a Test Track

List your audio files to find a test track:

```bash
aws s3 ls "s3://$R2_BUCKET/audio/" --endpoint-url "$R2_ENDPOINT" | head -10
```

### Step 4.2: Run Single Track Test

Replace `YOUR_TRACK_ID` and `YOUR_TRACK_FILENAME` with actual values:

```bash
cd ~/hls-ladder

./transcode-single-track.sh "YOUR_TRACK_ID" "s3://$R2_BUCKET/audio/YOUR_TRACK_FILENAME.mp3"
```

### Step 4.3: Verify the Output

Check that the HLS files were uploaded:

```bash
aws s3 ls "s3://$R2_BUCKET/hls/YOUR_TRACK_ID/" --recursive --endpoint-url "$R2_ENDPOINT"
```

You should see:
- `master.m3u8`
- `low/index.m3u8` + segment files
- `medium/index.m3u8` + segment files
- `high/index.m3u8` + segment files
- `premium/index.m3u8` + segment files

### Step 4.4: Test Playback (Optional)

If your R2 bucket has public access or CDN configured, test the master playlist URL:
```
https://your-cdn-domain.com/hls/YOUR_TRACK_ID/master.m3u8
```

---

## Part 5: Run Full Library

### Step 5.1: Create tracks.txt

Create a file with all your tracks:

```bash
# Option A: Create manually
nano ~/hls-ladder/tracks.txt

# Add lines in format:
# track-id s3://bucket/path/to/file.mp3
```

Or generate from your audio folder:

```bash
# Option B: Generate from R2 listing
aws s3 ls "s3://$R2_BUCKET/audio/" --endpoint-url "$R2_ENDPOINT" | \
    awk '{print $4}' | \
    grep '\.mp3$' | \
    while read filename; do
        track_id=$(basename "$filename" .mp3)
        echo "$track_id s3://$R2_BUCKET/audio/$filename"
    done > ~/hls-ladder/tracks.txt

# Review the file
head -20 ~/hls-ladder/tracks.txt
wc -l ~/hls-ladder/tracks.txt
```

### Step 5.2: Run Batch Processing

```bash
cd ~/hls-ladder

# Start the batch process (can take hours for large libraries)
./batch-transcode.sh tracks.txt
```

### Step 5.3: Monitor Progress

In another terminal:

```bash
# Watch the log file
tail -f ~/hls-ladder/hls-batch.log
```

### Step 5.4: Handle Failures

If any tracks fail, they're saved to `failed-tracks.log`. Retry them:

```bash
./batch-transcode.sh failed-tracks.log
```

---

## Part 6: Sync to Supabase (Optional)

If you want to mirror HLS files to Supabase Storage:

### Step 6.1: Set Supabase Credentials

```bash
export SUPABASE_S3_ENDPOINT="https://YOUR_PROJECT_REF.supabase.co/storage/v1/s3"
export SUPABASE_S3_BUCKET="audio"
export SUPABASE_ACCESS_KEY_ID="your-supabase-key"
export SUPABASE_SECRET_ACCESS_KEY="your-supabase-secret"
```

### Step 6.2: Create Sync Script

```bash
cat > ~/hls-ladder/sync-to-supabase.sh << 'SCRIPT_EOF'
#!/bin/bash
set -uo pipefail

R2_KEY="$AWS_ACCESS_KEY_ID"
R2_SECRET="$AWS_SECRET_ACCESS_KEY"
TEMP_DIR="/tmp/hls-sync"
mkdir -p "$TEMP_DIR"

sync_track() {
    local track_id="$1"
    echo "Syncing $track_id..."
    
    mkdir -p "$TEMP_DIR/$track_id"
    
    export AWS_ACCESS_KEY_ID="$R2_KEY"
    export AWS_SECRET_ACCESS_KEY="$R2_SECRET"
    aws s3 sync "s3://$R2_BUCKET/hls/$track_id/" "$TEMP_DIR/$track_id/" --endpoint-url "$R2_ENDPOINT"
    
    export AWS_ACCESS_KEY_ID="$SUPABASE_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$SUPABASE_SECRET_ACCESS_KEY"
    aws s3 sync "$TEMP_DIR/$track_id/" "s3://$SUPABASE_S3_BUCKET/hls/$track_id/" --endpoint-url "$SUPABASE_S3_ENDPOINT"
    
    rm -rf "$TEMP_DIR/$track_id"
    echo "✓ Synced $track_id"
}

# Reset to R2 credentials
export AWS_ACCESS_KEY_ID="$R2_KEY"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET"

# List and sync all tracks
aws s3 ls "s3://$R2_BUCKET/hls/" --endpoint-url "$R2_ENDPOINT" | awk '{print $2}' | sed 's/\/$//' | while read track_id; do
    sync_track "$track_id"
done

rm -rf "$TEMP_DIR"
echo "Sync complete!"
SCRIPT_EOF

chmod +x ~/hls-ladder/sync-to-supabase.sh
```

### Step 6.3: Run Sync

```bash
./sync-to-supabase.sh
```

---

## Troubleshooting

### "ffmpeg not found"
```bash
sudo yum install -y ffmpeg
# or on Ubuntu:
sudo apt-get install -y ffmpeg
```

### "Access Denied" from R2
- Verify your R2 API token has read/write permissions
- Check the bucket name is correct
- Ensure the endpoint URL matches your account

### Transcode fails with memory error
For very long audio files, you may need more memory:
```bash
# Use a larger EC2 instance (t3.medium or larger)
```

### Track fails repeatedly
Check the source MP3:
```bash
# Download and inspect
aws s3 cp "s3://$R2_BUCKET/audio/problem-file.mp3" /tmp/test.mp3 --endpoint-url "$R2_ENDPOINT"
ffprobe /tmp/test.mp3
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `./transcode-single-track.sh <id> <url>` | Transcode one track |
| `./batch-transcode.sh tracks.txt` | Process all tracks in file |
| `./batch-transcode.sh failed-tracks.log` | Retry failed tracks |
| `tail -f hls-batch.log` | Monitor progress |

---

## Files Created

| File | Purpose |
|------|---------|
| `transcode-single-track.sh` | Transcodes one MP3 to 4-bitrate HLS |
| `batch-transcode.sh` | Processes multiple tracks from list |
| `sync-to-supabase.sh` | Mirrors R2 HLS to Supabase Storage |
| `tracks.txt` | Your list of tracks to process |
| `hls-batch.log` | Batch processing log |
| `failed-tracks.log` | Tracks that failed (for retry) |
