#!/bin/bash
# This script applies all 23 backfill batches to the database
# Usage: ./run-all-backfill-batches.sh

echo "=========================================="
echo "Metadata Backfill Execution"
echo "=========================================="
echo ""
echo "This will execute 23 SQL batches to backfill metadata for ~11,285 tracks"
echo "Artist names, track names, and album names will NOT be modified"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Aborted"
    exit 1
fi

success=0
failed=0

for i in $(seq -f "%02g" 1 23); do
    echo ""
    echo "=========================================="
    echo "Executing Batch $i/23"
    echo "=========================================="
    
    sql_file="/tmp/backfill_batch_${i}.sql"
    
    if [ ! -f "$sql_file" ]; then
        echo "ERROR: File $sql_file not found!"
        ((failed++))
        continue
    fi
    
    # Execute via psql (requires DATABASE_URL environment variable)
    if psql "$DATABASE_URL" -f "$sql_file" > /tmp/batch_${i}_output.log 2>&1; then
        echo "✓ Batch $i completed successfully"
        ((success++))
    else
        echo "✗ Batch $i failed - see /tmp/batch_${i}_output.log"
        ((failed++))
    fi
done

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo "Successful batches: $success"
echo "Failed batches: $failed"
echo ""

if [ $failed -eq 0 ]; then
    echo "✓ All batches completed successfully!"
    echo ""
    echo "Verifying results..."
    psql "$DATABASE_URL" -c "SELECT COUNT(*) as total_tracks, COUNT(track_id) as has_track_id, COUNT(tempo) as has_tempo, COUNT(catalog) as has_catalog, COUNT(speed) as has_speed, COUNT(intensity) as has_intensity, COUNT(arousal) as has_arousal, COUNT(valence) as has_valence FROM audio_tracks WHERE deleted_at IS NULL;"
else
    echo "⚠ Some batches failed - please review the log files in /tmp/"
fi
