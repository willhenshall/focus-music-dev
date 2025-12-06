#!/bin/bash
# =============================================================================
# HLS LADDER TRANSCODER - PARALLEL BATCH PROCESSOR (R2 to R2)
# =============================================================================
# Processes multiple tracks with parallel workers for maximum throughput.
#
# Usage: ./batch-transcode.sh [tracks-file] [num-workers]
#
# Defaults:
#   tracks-file: ./tracks.txt
#   num-workers: 4
#
# tracks.txt format (one track ID per line):
#   abc123
#   def456
#   ghi789
#
# The script finds MP3s in R2 at: audio/<track-id>.mp3
# And uploads HLS to: hls/<track-id>/
#
# Features:
#   - Parallel processing (configurable workers)
#   - Retries failed tracks up to 3 times
#   - Real-time progress display
#   - Skips already-processed tracks (checks R2)
#   - Comprehensive logging
# =============================================================================

set -uo pipefail

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SINGLE_TRACK_SCRIPT="$SCRIPT_DIR/transcode-single-track.sh"

TRACKS_FILE="${1:-$SCRIPT_DIR/tracks.txt}"
NUM_WORKERS="${2:-4}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/batch_${TIMESTAMP}.log"
FAILED_LOG="$LOG_DIR/failed_${TIMESTAMP}.txt"
SUCCESS_LOG="$LOG_DIR/success_${TIMESTAMP}.txt"
PROGRESS_FILE="$LOG_DIR/progress_${TIMESTAMP}.txt"

MAX_RETRIES=3
RETRY_DELAY=5

# -----------------------------------------------------------------------------
# VALIDATION
# -----------------------------------------------------------------------------
if [[ ! -f "$SINGLE_TRACK_SCRIPT" ]]; then
    echo "ERROR: Single track script not found: $SINGLE_TRACK_SCRIPT"
    exit 1
fi

if [[ ! -x "$SINGLE_TRACK_SCRIPT" ]]; then
    chmod +x "$SINGLE_TRACK_SCRIPT"
fi

if [[ ! -f "$TRACKS_FILE" ]]; then
    echo "ERROR: Tracks file not found: $TRACKS_FILE"
    echo ""
    echo "Create tracks.txt with one track ID per line, or generate it with:"
    echo "  ./list-r2-tracks.sh > tracks.txt"
    exit 1
fi

# Check required environment variables
for var in R2_ENDPOINT R2_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
    if [[ -z "${!var:-}" ]]; then
        echo "ERROR: Environment variable $var is not set"
        exit 1
    fi
done

# -----------------------------------------------------------------------------
# LOGGING
# -----------------------------------------------------------------------------
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" | tee -a "$LOG_FILE"
}

log_success() {
    log "✓ $1"
}

log_error() {
    log "✗ $1"
}

# -----------------------------------------------------------------------------
# PROGRESS TRACKING
# -----------------------------------------------------------------------------
update_progress() {
    local succeeded=$1
    local failed=$2
    local total=$3
    local current=$((succeeded + failed))
    local percent=$((current * 100 / total))
    
    echo "$succeeded $failed $total" > "$PROGRESS_FILE"
    echo -ne "\r[${percent}%] Processed: $current/$total | Success: $succeeded | Failed: $failed    "
}

# -----------------------------------------------------------------------------
# CHECK IF TRACK ALREADY PROCESSED
# -----------------------------------------------------------------------------
track_exists_in_r2() {
    local track_id="$1"
    aws s3 ls "s3://$R2_BUCKET/hls/$track_id/master.m3u8" \
        --endpoint-url "$R2_ENDPOINT" &>/dev/null
}

# -----------------------------------------------------------------------------
# PROCESS SINGLE TRACK WITH RETRIES
# -----------------------------------------------------------------------------
process_track() {
    local track_id="$1"
    local attempt=1
    
    while [[ $attempt -le $MAX_RETRIES ]]; do
        if "$SINGLE_TRACK_SCRIPT" "$track_id" >> "$LOG_FILE" 2>&1; then
            return 0
        fi
        
        if [[ $attempt -lt $MAX_RETRIES ]]; then
            sleep $RETRY_DELAY
        fi
        ((attempt++))
    done
    
    return 1
}

# -----------------------------------------------------------------------------
# WORKER FUNCTION
# -----------------------------------------------------------------------------
worker() {
    local worker_id=$1
    local track_id
    
    while true; do
        # Get next track from queue (thread-safe with flock)
        track_id=""
        {
            flock -x 200
            if [[ -s "$QUEUE_FILE" ]]; then
                track_id=$(head -1 "$QUEUE_FILE")
                tail -n +2 "$QUEUE_FILE" > "$QUEUE_FILE.tmp" && mv "$QUEUE_FILE.tmp" "$QUEUE_FILE"
            fi
        } 200>"$LOCK_FILE"
        
        # Exit if queue is empty
        [[ -z "$track_id" ]] && break
        
        # Skip if already exists in R2
        if track_exists_in_r2 "$track_id"; then
            {
                flock -x 200
                echo "$track_id" >> "$SUCCESS_LOG"
                local s=$(cat "$COUNT_DIR/succeeded")
                echo $((s + 1)) > "$COUNT_DIR/succeeded"
            } 200>"$LOCK_FILE"
            continue
        fi
        
        # Process the track
        if process_track "$track_id"; then
            {
                flock -x 200
                echo "$track_id" >> "$SUCCESS_LOG"
                local s=$(cat "$COUNT_DIR/succeeded")
                echo $((s + 1)) > "$COUNT_DIR/succeeded"
            } 200>"$LOCK_FILE"
        else
            {
                flock -x 200
                echo "$track_id" >> "$FAILED_LOG"
                local f=$(cat "$COUNT_DIR/failed")
                echo $((f + 1)) > "$COUNT_DIR/failed"
            } 200>"$LOCK_FILE"
        fi
        
        # Update progress display
        {
            flock -x 200
            local s=$(cat "$COUNT_DIR/succeeded")
            local f=$(cat "$COUNT_DIR/failed")
            local t=$(cat "$COUNT_DIR/total")
            update_progress "$s" "$f" "$t"
        } 200>"$LOCK_FILE"
    done
}

# -----------------------------------------------------------------------------
# MAIN
# -----------------------------------------------------------------------------
main() {
    echo "============================================="
    echo "  HLS LADDER BATCH TRANSCODER (R2 → R2)"
    echo "============================================="
    echo ""
    log "Starting batch transcoding..."
    log "Tracks file: $TRACKS_FILE"
    log "Workers: $NUM_WORKERS"
    log "Log file: $LOG_FILE"
    echo ""
    
    # Create temp directory for counters
    COUNT_DIR=$(mktemp -d)
    QUEUE_FILE="$COUNT_DIR/queue"
    LOCK_FILE="$COUNT_DIR/lock"
    
    echo "0" > "$COUNT_DIR/succeeded"
    echo "0" > "$COUNT_DIR/failed"
    
    # Build queue from tracks file (skip blanks and comments)
    grep -v '^[[:space:]]*$' "$TRACKS_FILE" | grep -v '^[[:space:]]*#' > "$QUEUE_FILE"
    
    # Count total tracks
    TOTAL_TRACKS=$(wc -l < "$QUEUE_FILE" | tr -d ' ')
    echo "$TOTAL_TRACKS" > "$COUNT_DIR/total"
    
    log "Found $TOTAL_TRACKS tracks to process"
    echo ""
    
    if [[ $TOTAL_TRACKS -eq 0 ]]; then
        log "No tracks to process"
        exit 0
    fi
    
    # Initialize output files
    > "$FAILED_LOG"
    > "$SUCCESS_LOG"
    
    # Start workers in background
    log "Starting $NUM_WORKERS workers..."
    echo ""
    
    for ((i=1; i<=NUM_WORKERS; i++)); do
        worker "$i" &
    done
    
    # Wait for all workers to complete
    wait
    
    echo ""
    echo ""
    
    # Read final counts
    SUCCEEDED=$(cat "$COUNT_DIR/succeeded")
    FAILED=$(cat "$COUNT_DIR/failed")
    
    # Cleanup temp directory
    rm -rf "$COUNT_DIR"
    
    # Final report
    echo "╔════════════════════════════════════════════╗"
    echo "║           BATCH COMPLETE                   ║"
    echo "╠════════════════════════════════════════════╣"
    printf "║  Total tracks:    %-22s  ║\n" "$TOTAL_TRACKS"
    printf "║  Succeeded:       %-22s  ║\n" "$SUCCEEDED"
    printf "║  Failed:          %-22s  ║\n" "$FAILED"
    echo "╚════════════════════════════════════════════╝"
    echo ""
    
    log "Batch complete: $SUCCEEDED succeeded, $FAILED failed"
    
    if [[ $FAILED -gt 0 ]]; then
        echo "Failed tracks saved to: $FAILED_LOG"
        echo "To retry failed tracks:"
        echo "  ./batch-transcode.sh $FAILED_LOG $NUM_WORKERS"
        echo ""
    fi
    
    echo "Full log: $LOG_FILE"
    echo "Success list: $SUCCESS_LOG"
}

# Run main
main
