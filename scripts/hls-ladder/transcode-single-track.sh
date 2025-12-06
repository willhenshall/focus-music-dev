#!/bin/bash
# =============================================================================
# HLS LADDER TRANSCODER - SINGLE TRACK (R2 to R2)
# =============================================================================
# Creates a 4-bitrate HLS ladder from an MP3 file stored in Cloudflare R2
# Downloads from R2, transcodes locally, uploads back to R2.
#
# Usage: ./transcode-single-track.sh <TRACK_ID>
#
# Example:
#   ./transcode-single-track.sh abc123
#
# The script will automatically find the MP3 in R2 at:
#   s3://focus-music-audio/audio/<TRACK_ID>.mp3
#
# Requirements:
#   - ffmpeg installed
#   - aws CLI configured with R2 credentials
#   - Environment variables set (see below)
#
# Environment Variables Required:
#   R2_ENDPOINT        - Cloudflare R2 endpoint URL
#   R2_BUCKET          - R2 bucket name
#   AWS_ACCESS_KEY_ID  - R2 access key
#   AWS_SECRET_ACCESS_KEY - R2 secret key
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
WORK_DIR="${WORK_DIR:-/tmp/hls-transcode}"
LOG_FILE="${LOG_FILE:-/tmp/hls-transcode.log}"

# HLS Settings
HLS_TIME=6
HLS_PLAYLIST_TYPE="vod"

# Bitrate ladder (kbps)
BITRATE_LOW=32
BITRATE_MEDIUM=64
BITRATE_HIGH=96
BITRATE_PREMIUM=128

# Audio settings
AUDIO_CHANNELS=2
AUDIO_SAMPLE_RATE=44100

# R2 paths
AUDIO_PATH="audio"
HLS_PATH="hls"

# -----------------------------------------------------------------------------
# ARGUMENT VALIDATION
# -----------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
    echo "ERROR: Missing arguments"
    echo "Usage: $0 <TRACK_ID>"
    echo ""
    echo "Example:"
    echo "  $0 abc123"
    echo ""
    echo "The MP3 will be fetched from: s3://\$R2_BUCKET/audio/<TRACK_ID>.mp3"
    exit 1
fi

TRACK_ID="$1"

# Validate TRACK_ID (alphanumeric, dash, underscore only)
if [[ ! "$TRACK_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "ERROR: Invalid TRACK_ID. Use only alphanumeric characters, dashes, and underscores."
    exit 1
fi

# -----------------------------------------------------------------------------
# ENVIRONMENT CHECK
# -----------------------------------------------------------------------------
check_env_var() {
    if [[ -z "${!1:-}" ]]; then
        echo "ERROR: Environment variable $1 is not set"
        exit 1
    fi
}

check_env_var "R2_ENDPOINT"
check_env_var "R2_BUCKET"
check_env_var "AWS_ACCESS_KEY_ID"
check_env_var "AWS_SECRET_ACCESS_KEY"

# Check for required tools
if ! command -v ffmpeg &> /dev/null; then
    echo "ERROR: ffmpeg is not installed"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo "ERROR: aws CLI is not installed"
    exit 1
fi

# Build the MP3 URL from R2
MP3_S3_URL="s3://$R2_BUCKET/$AUDIO_PATH/$TRACK_ID.mp3"

# -----------------------------------------------------------------------------
# LOGGING FUNCTIONS
# -----------------------------------------------------------------------------
log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

log_success() {
    log "✓ $1"
}

log_error() {
    log "✗ ERROR: $1"
}

# -----------------------------------------------------------------------------
# MAIN PROCESSING
# -----------------------------------------------------------------------------
main() {
    log "=========================================="
    log "Starting HLS transcode for: $TRACK_ID"
    log "Source: $MP3_S3_URL"
    log "=========================================="

    # Create working directory
    TRACK_WORK_DIR="$WORK_DIR/$TRACK_ID"
    OUTPUT_DIR="$TRACK_WORK_DIR/output"
    
    # Clean up any existing work for this track
    if [[ -d "$TRACK_WORK_DIR" ]]; then
        log "Cleaning existing work directory..."
        rm -rf "$TRACK_WORK_DIR"
    fi
    
    mkdir -p "$OUTPUT_DIR/low"
    mkdir -p "$OUTPUT_DIR/medium"
    mkdir -p "$OUTPUT_DIR/high"
    mkdir -p "$OUTPUT_DIR/premium"
    
    log_success "Created output directories"

    # ---------------------------------------------------------------------
    # STEP 1: Download MP3 from R2
    # ---------------------------------------------------------------------
    log "Downloading MP3 from R2..."
    
    MP3_FILE="$TRACK_WORK_DIR/source.mp3"
    
    if ! aws s3 cp "$MP3_S3_URL" "$MP3_FILE" \
        --endpoint-url "$R2_ENDPOINT" \
        2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to download MP3 from R2"
        exit 1
    fi
    
    # Verify download
    if [[ ! -f "$MP3_FILE" ]] || [[ ! -s "$MP3_FILE" ]]; then
        log_error "Downloaded file is missing or empty"
        exit 1
    fi
    
    FILE_SIZE=$(du -h "$MP3_FILE" | cut -f1)
    log_success "Downloaded MP3 ($FILE_SIZE)"

    # ---------------------------------------------------------------------
    # STEP 2: Transcode to 4 HLS variants
    # ---------------------------------------------------------------------
    log "Starting HLS transcoding..."

    # LOW (32 kbps)
    log "  Encoding LOW (32 kbps)..."
    if ! ffmpeg -i "$MP3_FILE" \
        -c:a aac \
        -b:a ${BITRATE_LOW}k \
        -ac $AUDIO_CHANNELS \
        -ar $AUDIO_SAMPLE_RATE \
        -f hls \
        -hls_time $HLS_TIME \
        -hls_playlist_type $HLS_PLAYLIST_TYPE \
        -hls_segment_filename "$OUTPUT_DIR/low/segment_%03d.ts" \
        "$OUTPUT_DIR/low/index.m3u8" \
        -y -loglevel warning 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to encode LOW variant"
        exit 1
    fi
    log_success "  LOW variant complete"

    # MEDIUM (64 kbps)
    log "  Encoding MEDIUM (64 kbps)..."
    if ! ffmpeg -i "$MP3_FILE" \
        -c:a aac \
        -b:a ${BITRATE_MEDIUM}k \
        -ac $AUDIO_CHANNELS \
        -ar $AUDIO_SAMPLE_RATE \
        -f hls \
        -hls_time $HLS_TIME \
        -hls_playlist_type $HLS_PLAYLIST_TYPE \
        -hls_segment_filename "$OUTPUT_DIR/medium/segment_%03d.ts" \
        "$OUTPUT_DIR/medium/index.m3u8" \
        -y -loglevel warning 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to encode MEDIUM variant"
        exit 1
    fi
    log_success "  MEDIUM variant complete"

    # HIGH (96 kbps)
    log "  Encoding HIGH (96 kbps)..."
    if ! ffmpeg -i "$MP3_FILE" \
        -c:a aac \
        -b:a ${BITRATE_HIGH}k \
        -ac $AUDIO_CHANNELS \
        -ar $AUDIO_SAMPLE_RATE \
        -f hls \
        -hls_time $HLS_TIME \
        -hls_playlist_type $HLS_PLAYLIST_TYPE \
        -hls_segment_filename "$OUTPUT_DIR/high/segment_%03d.ts" \
        "$OUTPUT_DIR/high/index.m3u8" \
        -y -loglevel warning 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to encode HIGH variant"
        exit 1
    fi
    log_success "  HIGH variant complete"

    # PREMIUM (128 kbps)
    log "  Encoding PREMIUM (128 kbps)..."
    if ! ffmpeg -i "$MP3_FILE" \
        -c:a aac \
        -b:a ${BITRATE_PREMIUM}k \
        -ac $AUDIO_CHANNELS \
        -ar $AUDIO_SAMPLE_RATE \
        -f hls \
        -hls_time $HLS_TIME \
        -hls_playlist_type $HLS_PLAYLIST_TYPE \
        -hls_segment_filename "$OUTPUT_DIR/premium/segment_%03d.ts" \
        "$OUTPUT_DIR/premium/index.m3u8" \
        -y -loglevel warning 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to encode PREMIUM variant"
        exit 1
    fi
    log_success "  PREMIUM variant complete"

    log_success "All HLS variants encoded"

    # ---------------------------------------------------------------------
    # STEP 3: Generate master.m3u8
    # ---------------------------------------------------------------------
    log "Generating master playlist..."

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

    log_success "Master playlist created"

    # ---------------------------------------------------------------------
    # STEP 4: Upload to R2
    # ---------------------------------------------------------------------
    log "Uploading HLS files to R2..."
    
    R2_DEST="s3://$R2_BUCKET/$HLS_PATH/$TRACK_ID/"
    
    # Upload all files with aws s3 sync (handles all file types)
    if ! aws s3 sync "$OUTPUT_DIR/" "$R2_DEST" \
        --endpoint-url "$R2_ENDPOINT" \
        2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to upload HLS files"
        exit 1
    fi

    log_success "Upload complete"

    # ---------------------------------------------------------------------
    # STEP 5: Verify upload
    # ---------------------------------------------------------------------
    log "Verifying upload..."
    
    # Check that master.m3u8 exists
    if ! aws s3 ls "$R2_DEST" \
        --endpoint-url "$R2_ENDPOINT" \
        2>&1 | grep -q "master.m3u8"; then
        log_error "Verification failed: master.m3u8 not found in R2"
        exit 1
    fi
    
    # Count uploaded files
    UPLOADED_COUNT=$(aws s3 ls "$R2_DEST" --recursive \
        --endpoint-url "$R2_ENDPOINT" 2>/dev/null | wc -l | tr -d ' ')
    
    log_success "Verified: $UPLOADED_COUNT files uploaded to $R2_DEST"

    # ---------------------------------------------------------------------
    # STEP 6: Cleanup
    # ---------------------------------------------------------------------
    log "Cleaning up temporary files..."
    rm -rf "$TRACK_WORK_DIR"
    log_success "Cleanup complete"

    # ---------------------------------------------------------------------
    # SUCCESS
    # ---------------------------------------------------------------------
    log "=========================================="
    log "SUCCESS: HLS ladder created for $TRACK_ID"
    log "Location: $R2_DEST"
    log "Master playlist: ${R2_DEST}master.m3u8"
    log "=========================================="
    
    echo ""
    echo "✓ TRACK $TRACK_ID COMPLETE"
    echo "  HLS URL: https://your-cdn-domain.com/hls/$TRACK_ID/master.m3u8"
    echo ""
}

# Run main function
main
