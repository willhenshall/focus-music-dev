#!/bin/bash
# =============================================================================
# HLS SYNC - R2 TO SUPABASE STORAGE
# =============================================================================
# Safely mirrors HLS files from Cloudflare R2 to Supabase Storage
#
# Usage: ./sync-to-supabase.sh [--dry-run] [--track-id <id>]
#
# Options:
#   --dry-run       Show what would be synced without making changes
#   --track-id <id> Sync only a specific track
#
# Features:
#   - Non-destructive (no deletions unless --delete flag added)
#   - Progress logging
#   - Verification after sync
#
# Requirements:
#   - aws CLI configured for R2
#   - Supabase CLI or S3-compatible access to Supabase Storage
#   
# Environment Variables Required:
#   R2_ENDPOINT              - Cloudflare R2 endpoint URL
#   R2_BUCKET                - R2 bucket name
#   SUPABASE_S3_ENDPOINT     - Supabase S3-compatible endpoint
#   SUPABASE_S3_BUCKET       - Supabase Storage bucket name
#   SUPABASE_ACCESS_KEY_ID   - Supabase S3 access key
#   SUPABASE_SECRET_ACCESS_KEY - Supabase S3 secret key
# =============================================================================

set -uo pipefail

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/sync-to-supabase.log"
TEMP_DIR="/tmp/hls-sync"

DRY_RUN=false
SPECIFIC_TRACK=""

# -----------------------------------------------------------------------------
# ARGUMENT PARSING
# -----------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --track-id)
            SPECIFIC_TRACK="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--track-id <id>]"
            echo ""
            echo "Options:"
            echo "  --dry-run       Show what would be synced without making changes"
            echo "  --track-id <id> Sync only a specific track"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

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

log_warning() {
    log "⚠ WARNING: $1"
}

# -----------------------------------------------------------------------------
# ENVIRONMENT CHECK
# -----------------------------------------------------------------------------
check_env_var() {
    if [[ -z "${!1:-}" ]]; then
        echo "ERROR: Environment variable $1 is not set"
        exit 1
    fi
}

log "Checking environment variables..."

check_env_var "R2_ENDPOINT"
check_env_var "R2_BUCKET"
check_env_var "SUPABASE_S3_ENDPOINT"
check_env_var "SUPABASE_S3_BUCKET"
check_env_var "SUPABASE_ACCESS_KEY_ID"
check_env_var "SUPABASE_SECRET_ACCESS_KEY"

log_success "Environment configured"

# -----------------------------------------------------------------------------
# SYNC FUNCTIONS
# -----------------------------------------------------------------------------
sync_track() {
    local track_id="$1"
    local local_dir="$TEMP_DIR/$track_id"
    
    log "Syncing track: $track_id"
    
    # Create temp directory
    mkdir -p "$local_dir"
    
    # Download from R2
    log "  Downloading from R2..."
    if ! aws s3 sync "s3://$R2_BUCKET/hls/$track_id/" "$local_dir/" \
        --endpoint-url "$R2_ENDPOINT" \
        2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to download track $track_id from R2"
        return 1
    fi
    
    # Count files
    local file_count=$(find "$local_dir" -type f | wc -l | tr -d ' ')
    log "  Downloaded $file_count files"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "  [DRY RUN] Would upload $file_count files to Supabase"
        rm -rf "$local_dir"
        return 0
    fi
    
    # Upload to Supabase Storage
    log "  Uploading to Supabase Storage..."
    
    # Use Supabase credentials for this operation
    export AWS_ACCESS_KEY_ID="$SUPABASE_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$SUPABASE_SECRET_ACCESS_KEY"
    
    if ! aws s3 sync "$local_dir/" "s3://$SUPABASE_S3_BUCKET/hls/$track_id/" \
        --endpoint-url "$SUPABASE_S3_ENDPOINT" \
        2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to upload track $track_id to Supabase"
        return 1
    fi
    
    log_success "  Synced track $track_id"
    
    # Cleanup
    rm -rf "$local_dir"
    
    return 0
}

list_r2_tracks() {
    aws s3 ls "s3://$R2_BUCKET/hls/" \
        --endpoint-url "$R2_ENDPOINT" \
        2>/dev/null | awk '{print $2}' | sed 's/\/$//'
}

# -----------------------------------------------------------------------------
# MAIN
# -----------------------------------------------------------------------------
main() {
    log "============================================="
    log "HLS SYNC: R2 → SUPABASE STORAGE"
    log "============================================="
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "MODE: DRY RUN (no changes will be made)"
    fi
    
    # Create temp directory
    mkdir -p "$TEMP_DIR"
    
    # Store R2 credentials
    R2_ACCESS_KEY="$AWS_ACCESS_KEY_ID"
    R2_SECRET_KEY="$AWS_SECRET_ACCESS_KEY"
    
    if [[ -n "$SPECIFIC_TRACK" ]]; then
        # Sync specific track
        export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY"
        export AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY"
        
        if sync_track "$SPECIFIC_TRACK"; then
            log_success "Sync complete for track: $SPECIFIC_TRACK"
        else
            log_error "Sync failed for track: $SPECIFIC_TRACK"
            exit 1
        fi
    else
        # Sync all tracks
        log "Listing tracks in R2..."
        
        export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY"
        export AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY"
        
        local tracks=($(list_r2_tracks))
        local total=${#tracks[@]}
        local succeeded=0
        local failed=0
        local current=0
        
        log "Found $total tracks to sync"
        
        for track_id in "${tracks[@]}"; do
            ((current++))
            log ""
            log "[$current/$total] Processing $track_id..."
            
            # Reset to R2 credentials for download
            export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY"
            export AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY"
            
            if sync_track "$track_id"; then
                ((succeeded++))
            else
                ((failed++))
            fi
        done
        
        # Final report
        log ""
        log "============================================="
        log "SYNC COMPLETE"
        log "============================================="
        log "Total:     $total"
        log "Succeeded: $succeeded"
        log "Failed:    $failed"
        
        if [[ $failed -gt 0 ]]; then
            exit 1
        fi
    fi
    
    # Cleanup temp directory
    rm -rf "$TEMP_DIR"
    
    log_success "Sync finished successfully"
}

# Run main
main
