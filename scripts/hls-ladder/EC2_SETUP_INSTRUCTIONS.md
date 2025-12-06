# HLS Ladder Transcoder - EC2 Setup (R2 → R2)

Server-to-server transcoding: Pull MP3s from R2, create 4-bitrate HLS ladder, upload back to R2.

---

## Quick Start (Copy-Paste Ready)

### Step 1: SSH into EC2

```bash
ssh -i your-key.pem ec2-user@your-ec2-ip
```

### Step 2: Install Dependencies (if needed)

```bash
# Amazon Linux 2
sudo yum update -y
sudo yum install -y ffmpeg awscli

# Or Ubuntu
sudo apt update && sudo apt install -y ffmpeg awscli
```

### Step 3: Set R2 Credentials

```bash
# Paste this block (replace nothing - these are Focus Music's R2 credentials)
export R2_ENDPOINT="https://531f033f1f3eb591e89baff98f027cee.r2.cloudflarestorage.com"
export R2_BUCKET="focus-music-audio"
export AWS_ACCESS_KEY_ID="d6c3feb94bb923b619c9661f950019d2"
export AWS_SECRET_ACCESS_KEY="bc5d2ea0d38fecb4ef8442b78621a6b398415b3373cc1c174b12564a111678f3"
```

### Step 4: Test R2 Connection

```bash
aws s3 ls "s3://$R2_BUCKET/audio/" --endpoint-url "$R2_ENDPOINT" | head -5
```

You should see MP3 files listed.

### Step 5: Create Working Directory & Scripts

```bash
mkdir -p ~/hls-ladder/logs
cd ~/hls-ladder
```

### Step 6: Create the Single-Track Script

```bash
cat > ~/hls-ladder/transcode-single-track.sh << 'SCRIPT_EOF'
#!/bin/bash
set -euo pipefail

TRACK_ID="$1"
WORK_DIR="/tmp/hls-transcode/$TRACK_ID"
OUTPUT_DIR="$WORK_DIR/output"

rm -rf "$WORK_DIR" 2>/dev/null || true
mkdir -p "$OUTPUT_DIR/low" "$OUTPUT_DIR/medium" "$OUTPUT_DIR/high" "$OUTPUT_DIR/premium"

echo "[$(date '+%H:%M:%S')] Processing: $TRACK_ID"

# Download from R2
echo "  Downloading..."
aws s3 cp "s3://$R2_BUCKET/audio/$TRACK_ID.mp3" "$WORK_DIR/source.mp3" \
    --endpoint-url "$R2_ENDPOINT" --quiet

# Transcode 4 bitrates
echo "  Encoding LOW (32k)..."
ffmpeg -i "$WORK_DIR/source.mp3" -c:a aac -b:a 32k -ac 2 -ar 44100 \
    -f hls -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/low/segment_%03d.ts" \
    "$OUTPUT_DIR/low/index.m3u8" -y -loglevel warning

echo "  Encoding MEDIUM (64k)..."
ffmpeg -i "$WORK_DIR/source.mp3" -c:a aac -b:a 64k -ac 2 -ar 44100 \
    -f hls -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/medium/segment_%03d.ts" \
    "$OUTPUT_DIR/medium/index.m3u8" -y -loglevel warning

echo "  Encoding HIGH (96k)..."
ffmpeg -i "$WORK_DIR/source.mp3" -c:a aac -b:a 96k -ac 2 -ar 44100 \
    -f hls -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/high/segment_%03d.ts" \
    "$OUTPUT_DIR/high/index.m3u8" -y -loglevel warning

echo "  Encoding PREMIUM (128k)..."
ffmpeg -i "$WORK_DIR/source.mp3" -c:a aac -b:a 128k -ac 2 -ar 44100 \
    -f hls -hls_time 6 -hls_playlist_type vod \
    -hls_segment_filename "$OUTPUT_DIR/premium/segment_%03d.ts" \
    "$OUTPUT_DIR/premium/index.m3u8" -y -loglevel warning

# Create master playlist
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

# Upload to R2
echo "  Uploading to R2..."
aws s3 sync "$OUTPUT_DIR/" "s3://$R2_BUCKET/hls/$TRACK_ID/" \
    --endpoint-url "$R2_ENDPOINT" --quiet

# Cleanup
rm -rf "$WORK_DIR"

echo "  ✓ Complete: $TRACK_ID"
SCRIPT_EOF

chmod +x ~/hls-ladder/transcode-single-track.sh
```

### Step 7: Create the Batch Script (Parallel Workers)

```bash
cat > ~/hls-ladder/batch-transcode.sh << 'SCRIPT_EOF'
#!/bin/bash
set -uo pipefail

TRACKS_FILE="${1:-tracks.txt}"
NUM_WORKERS="${2:-8}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================="
echo "  HLS BATCH TRANSCODER ($NUM_WORKERS workers)"
echo "============================================="

# Count tracks
TOTAL=$(grep -v '^[[:space:]]*$' "$TRACKS_FILE" | grep -v '^#' | wc -l | tr -d ' ')
echo "Tracks to process: $TOTAL"
echo ""

# Create temp files for tracking
QUEUE_FILE=$(mktemp)
DONE_FILE=$(mktemp)
FAIL_FILE=$(mktemp)

grep -v '^[[:space:]]*$' "$TRACKS_FILE" | grep -v '^#' > "$QUEUE_FILE"

process_track() {
    local track_id="$1"
    
    # Check if already exists
    if aws s3 ls "s3://$R2_BUCKET/hls/$track_id/master.m3u8" \
        --endpoint-url "$R2_ENDPOINT" &>/dev/null; then
        echo "$track_id" >> "$DONE_FILE"
        return 0
    fi
    
    # Process with retries
    for attempt in 1 2 3; do
        if "$SCRIPT_DIR/transcode-single-track.sh" "$track_id" 2>/dev/null; then
            echo "$track_id" >> "$DONE_FILE"
            return 0
        fi
        sleep 2
    done
    
    echo "$track_id" >> "$FAIL_FILE"
    return 1
}

export -f process_track
export SCRIPT_DIR R2_ENDPOINT R2_BUCKET DONE_FILE FAIL_FILE

# Run with parallel workers
cat "$QUEUE_FILE" | xargs -P "$NUM_WORKERS" -I {} bash -c 'process_track "$@"' _ {}

# Summary
SUCCEEDED=$(wc -l < "$DONE_FILE" 2>/dev/null | tr -d ' ' || echo 0)
FAILED=$(wc -l < "$FAIL_FILE" 2>/dev/null | tr -d ' ' || echo 0)

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║              BATCH COMPLETE                ║"
echo "╠════════════════════════════════════════════╣"
printf "║  Total:     %-28s  ║\n" "$TOTAL"
printf "║  Succeeded: %-28s  ║\n" "$SUCCEEDED"
printf "║  Failed:    %-28s  ║\n" "$FAILED"
echo "╚════════════════════════════════════════════╝"

if [[ -s "$FAIL_FILE" ]]; then
    cp "$FAIL_FILE" failed-tracks.txt
    echo ""
    echo "Failed tracks saved to: failed-tracks.txt"
    echo "Retry with: ./batch-transcode.sh failed-tracks.txt $NUM_WORKERS"
fi

rm -f "$QUEUE_FILE" "$DONE_FILE" "$FAIL_FILE"
SCRIPT_EOF

chmod +x ~/hls-ladder/batch-transcode.sh
```

### Step 8: Generate Track List from R2

```bash
# List all MP3s in R2 and create tracks.txt
aws s3 ls "s3://$R2_BUCKET/audio/" --endpoint-url "$R2_ENDPOINT" | \
    awk '{print $4}' | grep '\.mp3$' | sed 's/\.mp3$//' > ~/hls-ladder/tracks.txt

# Check how many tracks
wc -l ~/hls-ladder/tracks.txt
```

---

## Running the Transcoder

### Test with ONE track first

```bash
cd ~/hls-ladder

# Pick the first track to test
head -1 tracks.txt
# Example output: abc123

# Run single track test
./transcode-single-track.sh abc123

# Verify it worked
aws s3 ls "s3://$R2_BUCKET/hls/abc123/" --endpoint-url "$R2_ENDPOINT"
```

### Run Full Batch (Recommended: 8-16 workers)

```bash
cd ~/hls-ladder

# Start batch with 8 workers (adjust based on EC2 instance size)
./batch-transcode.sh tracks.txt 8

# For larger instances (c5.xlarge+), use more workers:
./batch-transcode.sh tracks.txt 16
```

### Check Progress

```bash
# Count completed HLS folders
aws s3 ls "s3://$R2_BUCKET/hls/" --endpoint-url "$R2_ENDPOINT" | grep -c 'PRE'

# Count total MP3s
aws s3 ls "s3://$R2_BUCKET/audio/" --endpoint-url "$R2_ENDPOINT" | grep -c '\.mp3$'
```

### Retry Failed Tracks

```bash
./batch-transcode.sh failed-tracks.txt 8
```

---

## Running in Background (Recommended for Large Batches)

Use `screen` or `nohup` to keep the job running if you disconnect:

```bash
# Option 1: Using screen
screen -S hls
cd ~/hls-ladder
./batch-transcode.sh tracks.txt 12
# Press Ctrl+A then D to detach
# Reconnect with: screen -r hls

# Option 2: Using nohup
cd ~/hls-ladder
nohup ./batch-transcode.sh tracks.txt 12 > batch.log 2>&1 &
tail -f batch.log
```

---

## Output Structure

Each track creates this structure in R2:

```
hls/<track-id>/
├── master.m3u8          # Main playlist (points to variants)
├── low/
│   ├── index.m3u8       # 32 kbps playlist
│   └── segment_*.ts     # 32 kbps segments
├── medium/
│   ├── index.m3u8       # 64 kbps playlist
│   └── segment_*.ts     # 64 kbps segments
├── high/
│   ├── index.m3u8       # 96 kbps playlist
│   └── segment_*.ts     # 96 kbps segments
└── premium/
    ├── index.m3u8       # 128 kbps playlist
    └── segment_*.ts     # 128 kbps segments
```

CDN URL format:
```
https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/hls/<track-id>/master.m3u8
```

---

## Recommended EC2 Instance Sizes

| Instance | vCPUs | Workers | Estimated Speed |
|----------|-------|---------|-----------------|
| t3.medium | 2 | 4 | ~2 tracks/min |
| c5.large | 2 | 6 | ~3 tracks/min |
| c5.xlarge | 4 | 12 | ~6 tracks/min |
| c5.2xlarge | 8 | 24 | ~12 tracks/min |

For 200+ tracks, a c5.xlarge or larger is recommended.

---

## Troubleshooting

### "command not found: ffmpeg"
```bash
sudo yum install -y ffmpeg  # Amazon Linux
sudo apt install -y ffmpeg  # Ubuntu
```

### "Access Denied" from R2
Check your credentials are set:
```bash
echo $R2_ENDPOINT
echo $R2_BUCKET
echo $AWS_ACCESS_KEY_ID
```

### Track fails repeatedly
Check if the MP3 exists:
```bash
aws s3 ls "s3://$R2_BUCKET/audio/TRACK_ID.mp3" --endpoint-url "$R2_ENDPOINT"
```

### Out of disk space
Clean temp files:
```bash
rm -rf /tmp/hls-transcode/*
```
