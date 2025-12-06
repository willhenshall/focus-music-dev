#!/bin/bash
# =============================================================================
# CHECK HLS TRANSCODING PROGRESS
# =============================================================================
# Shows how many tracks have been transcoded vs total MP3s in R2.
#
# Usage: ./check-hls-progress.sh
# =============================================================================

set -euo pipefail

# Check required environment variables
for var in R2_ENDPOINT R2_BUCKET; do
    if [[ -z "${!var:-}" ]]; then
        echo "ERROR: Environment variable $var is not set" >&2
        exit 1
    fi
done

echo "Checking R2 for transcoding progress..."
echo ""

# Count MP3s in audio/
TOTAL_MP3=$(aws s3 ls "s3://$R2_BUCKET/audio/" \
    --endpoint-url "$R2_ENDPOINT" \
    2>/dev/null | grep -c '\.mp3$' || echo "0")

# Count HLS folders (tracks with master.m3u8)
TOTAL_HLS=$(aws s3 ls "s3://$R2_BUCKET/hls/" \
    --endpoint-url "$R2_ENDPOINT" \
    2>/dev/null | grep -c 'PRE' || echo "0")

# Calculate remaining
REMAINING=$((TOTAL_MP3 - TOTAL_HLS))
if [[ $TOTAL_MP3 -gt 0 ]]; then
    PERCENT=$((TOTAL_HLS * 100 / TOTAL_MP3))
else
    PERCENT=0
fi

echo "╔════════════════════════════════════════════╗"
echo "║        HLS TRANSCODING PROGRESS            ║"
echo "╠════════════════════════════════════════════╣"
printf "║  Total MP3s in R2:     %-18s  ║\n" "$TOTAL_MP3"
printf "║  HLS ladders created:  %-18s  ║\n" "$TOTAL_HLS"
printf "║  Remaining:            %-18s  ║\n" "$REMAINING"
printf "║  Progress:             %-18s  ║\n" "${PERCENT}%"
echo "╚════════════════════════════════════════════╝"
