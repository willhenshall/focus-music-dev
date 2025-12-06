#!/bin/bash
# =============================================================================
# LIST ALL MP3 TRACK IDs FROM R2
# =============================================================================
# Lists all MP3 files in R2 and outputs their track IDs (one per line).
# Use this to generate a tracks.txt file for batch processing.
#
# Usage:
#   ./list-r2-tracks.sh > tracks.txt
#
# Requirements:
#   - AWS CLI configured with R2 credentials
#   - R2_ENDPOINT and R2_BUCKET environment variables
# =============================================================================

set -euo pipefail

# Check required environment variables
for var in R2_ENDPOINT R2_BUCKET; do
    if [[ -z "${!var:-}" ]]; then
        echo "ERROR: Environment variable $var is not set" >&2
        exit 1
    fi
done

# List all MP3 files and extract track IDs
aws s3 ls "s3://$R2_BUCKET/audio/" \
    --endpoint-url "$R2_ENDPOINT" \
    2>/dev/null | \
    awk '{print $4}' | \
    grep -E '\.mp3$' | \
    sed 's/\.mp3$//'
