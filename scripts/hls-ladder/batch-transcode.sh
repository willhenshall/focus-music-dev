#!/bin/bash
# =============================================================================
# HLS LADDER TRANSCODER - BATCH PROCESSOR
# =============================================================================
# Processes multiple tracks from a tracks.txt file
#
# Usage: ./batch-transcode.sh [tracks-file]
#
# If no tracks file is specified, defaults to ./tracks.txt
#
# tracks.txt format (one track per line):
#   <track-id> <s3-mp3-url>
#
# Example tracks.txt:
#   abc123 s3://focus-music-audio/audio/abc123.mp3
#   def456 s3://focus-music-audio/audio/def456.mp3
#
# Features:
#   - Retries failed tracks up to 3 times
#   - Logs progress to hls-batch.log
#   - Generates summary report at end
#   - Skips blank lines and comments (lines starting with #)
# =============================================================================

set -uo pipefail

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SINGLE_TRACK_SCRIPT="$SCRIPT_DIR/transcode-single-track.sh"

TRACKS_FILE="${1:-$SCRIPT_DIR/tracks.txt}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/hls-batch.log}"
FAILED_LOG="$SCRIPT_DIR/failed-tracks.log"

MAX_RETRIES=3
RETRY_DELAY=5

# Counters
TOTAL_TRACKS=0
SUCCEEDED=0
FAILED=0
SKIPPED=0

# Arrays to track results
declare -a FAILED_TRACKS=()
declare -a SUCCESS_TRACKS=()

# -----------------------------------------------------------------------------
# LOGGING FUNCTIONS
# -----------------------------------------------------------------------------
log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

log_header() {
    echo "" | tee -a "$LOG_FILE"
    echo "=============================================" | tee -a "$LOG_FILE"
    log "$1"
    echo "=============================================" | tee -a "$LOG_FILE"
}

log_success() {
    log "✓ $1"
}

log_error() {
    log "✗ ERROR: $1"
}

log_warning() {
    log "⚠ WARNING: $1"
}

# -----------------------------------------------------------------------------
# VALIDATION
# -----------------------------------------------------------------------------
if [[ ! -f "$SINGLE_TRACK_SCRIPT" ]]; then
    log_error "Single track script not found: $SINGLE_TRACK_SCRIPT"
    exit 1
fi

if [[ ! -x "$SINGLE_TRACK_SCRIPT" ]]; then
    log_warning "Making single track script executable..."
    chmod +x "$SINGLE_TRACK_SCRIPT"
fi

if [[ ! -f "$TRACKS_FILE" ]]; then
    log_error "Tracks file not found: $TRACKS_FILE"
    echo ""
    echo "Create a tracks.txt file with format:"
    echo "  <track-id> <s3-mp3-url>"
    echo ""
    echo "Example:"
    echo "  abc123 s3://focus-music-audio/audio/abc123.mp3"
    exit 1
fi

# -----------------------------------------------------------------------------
# PROCESS SINGLE TRACK WITH RETRIES
# -----------------------------------------------------------------------------
process_track() {
    local track_id="$1"
    local mp3_url="$2"
    local attempt=1
    
    while [[ $attempt -le $MAX_RETRIES ]]; do
        log "Processing $track_id (attempt $attempt/$MAX_RETRIES)..."
        
        if "$SINGLE_TRACK_SCRIPT" "$track_id" "$mp3_url"; then
            return 0
        fi
        
        if [[ $attempt -lt $MAX_RETRIES ]]; then
            log_warning "Attempt $attempt failed, retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi
        
        ((attempt++))
    done
    
    return 1
}

# -----------------------------------------------------------------------------
# MAIN BATCH PROCESSING
# -----------------------------------------------------------------------------
main() {
    log_header "HLS BATCH TRANSCODER STARTED"
    log "Tracks file: $TRACKS_FILE"
    log "Log file: $LOG_FILE"
    log ""
    
    # Clear failed log
    > "$FAILED_LOG"
    
    # Count total valid lines first
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip empty lines
        [[ -z "${line// }" ]] && continue
        
        # Skip comments
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        
        ((TOTAL_TRACKS++))
    done < "$TRACKS_FILE"
    
    log "Found $TOTAL_TRACKS tracks to process"
    log ""
    
    # Reset counter for actual processing
    local current=0
    
    # Process each line
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip empty lines
        if [[ -z "${line// }" ]]; then
            continue
        fi
        
        # Skip comments
        if [[ "$line" =~ ^[[:space:]]*# ]]; then
            continue
        fi
        
        # Parse line
        read -r track_id mp3_url <<< "$line"
        
        # Validate parsed values
        if [[ -z "$track_id" ]] || [[ -z "$mp3_url" ]]; then
            log_warning "Skipping malformed line: $line"
            ((SKIPPED++))
            continue
        fi
        
        ((current++))
        
        log_header "TRACK $current/$TOTAL_TRACKS: $track_id"
        
        if process_track "$track_id" "$mp3_url"; then
            log_success "Track $track_id completed successfully"
            ((SUCCEEDED++))
            SUCCESS_TRACKS+=("$track_id")
        else
            log_error "Track $track_id failed after $MAX_RETRIES attempts"
            ((FAILED++))
            FAILED_TRACKS+=("$track_id")
            echo "$track_id $mp3_url" >> "$FAILED_LOG"
        fi
        
        # Progress update
        log ""
        log "Progress: $current/$TOTAL_TRACKS | Success: $SUCCEEDED | Failed: $FAILED"
        log ""
        
    done < "$TRACKS_FILE"
    
    # ---------------------------------------------------------------------
    # FINAL REPORT
    # ---------------------------------------------------------------------
    log_header "BATCH PROCESSING COMPLETE"
    
    echo "" | tee -a "$LOG_FILE"
    echo "╔════════════════════════════════════════════╗" | tee -a "$LOG_FILE"
    echo "║           FINAL SUMMARY REPORT             ║" | tee -a "$LOG_FILE"
    echo "╠════════════════════════════════════════════╣" | tee -a "$LOG_FILE"
    printf "║  Total tracks processed:  %-15s  ║\n" "$TOTAL_TRACKS" | tee -a "$LOG_FILE"
    printf "║  Succeeded:               %-15s  ║\n" "$SUCCEEDED" | tee -a "$LOG_FILE"
    printf "║  Failed:                  %-15s  ║\n" "$FAILED" | tee -a "$LOG_FILE"
    printf "║  Skipped (malformed):     %-15s  ║\n" "$SKIPPED" | tee -a "$LOG_FILE"
    echo "╚════════════════════════════════════════════╝" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    
    if [[ $FAILED -gt 0 ]]; then
        echo "FAILED TRACKS:" | tee -a "$LOG_FILE"
        for track in "${FAILED_TRACKS[@]}"; do
            echo "  - $track" | tee -a "$LOG_FILE"
        done
        echo "" | tee -a "$LOG_FILE"
        echo "Failed tracks saved to: $FAILED_LOG" | tee -a "$LOG_FILE"
        echo "To retry failed tracks, run:" | tee -a "$LOG_FILE"
        echo "  ./batch-transcode.sh $FAILED_LOG" | tee -a "$LOG_FILE"
    fi
    
    if [[ $SUCCEEDED -eq $TOTAL_TRACKS ]] && [[ $TOTAL_TRACKS -gt 0 ]]; then
        echo "" | tee -a "$LOG_FILE"
        echo "🎉 ALL TRACKS PROCESSED SUCCESSFULLY! 🎉" | tee -a "$LOG_FILE"
    fi
    
    echo "" | tee -a "$LOG_FILE"
    log "Batch log saved to: $LOG_FILE"
    
    # Exit with error code if any failed
    if [[ $FAILED -gt 0 ]]; then
        exit 1
    fi
}

# Run main function
main
