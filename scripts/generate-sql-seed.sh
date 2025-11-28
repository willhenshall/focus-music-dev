#!/bin/bash

# ============================================================
# SQL Seed Generator Script
# ============================================================
# This script uses pg_dump to export all table data as INSERT statements
# Usage: ./scripts/generate-sql-seed.sh
# ============================================================

set -e

# Load environment variables
source .env

# Construct connection string
DB_URL="postgresql://postgres:${POSTGRES_PASSWORD}@${DB_HOST:-db.xewajlyswijmjxuajhif.supabase.co}:5432/postgres"

# Output file
OUTPUT_FILE="database-seed-complete.sql"

echo "============================================================"
echo "Generating Complete Database Seed File"
echo "============================================================"
echo ""

# List of tables to export
TABLES=(
  "audio_channels"
  "audio_tracks"
  "user_profiles"
  "user_preferences"
  "system_preferences"
  "quiz_questions"
  "quiz_answers"
  "quiz_results"
  "channel_recommendations"
  "track_analytics"
  "user_playback_state"
  "image_sets"
  "image_set_images"
  "user_image_preferences"
  "slot_strategies"
  "saved_slot_sequences"
  "playwright_test_registry"
  "test_runs"
)

# Create header
cat > "$OUTPUT_FILE" << 'EOF'
-- ============================================================
-- COMPLETE DATABASE SEED FILE
-- Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
-- Purpose: Full database reconstruction for focus music platform
-- ============================================================

BEGIN;

-- Temporarily disable triggers for faster import
SET session_replication_role = 'replica';

EOF

# Export each table
for table in "${TABLES[@]}"; do
  echo "Exporting table: $table"

  echo "" >> "$OUTPUT_FILE"
  echo "-- ============================================================" >> "$OUTPUT_FILE"
  echo "-- TABLE: $table" >> "$OUTPUT_FILE"
  echo "-- ============================================================" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"

  # Use pg_dump to generate INSERT statements for this table
  pg_dump "$DB_URL" \
    --table="public.$table" \
    --data-only \
    --column-inserts \
    --no-owner \
    --no-privileges >> "$OUTPUT_FILE" 2>/dev/null || echo "-- No data in $table or table does not exist" >> "$OUTPUT_FILE"
done

# Add footer
cat >> "$OUTPUT_FILE" << 'EOF'

-- ============================================================
-- FINALIZATION
-- ============================================================

-- Re-enable triggers
SET session_replication_role = 'default';

-- Update sequences to prevent ID conflicts
DO $$
BEGIN
  PERFORM setval('audio_channels_id_seq', (SELECT COALESCE(MAX(id), 0) FROM audio_channels) + 1, false);
  PERFORM setval('audio_tracks_id_seq', (SELECT COALESCE(MAX(id), 0) FROM audio_tracks) + 1, false);
  PERFORM setval('quiz_questions_id_seq', (SELECT COALESCE(MAX(id), 0) FROM quiz_questions) + 1, false);
  PERFORM setval('quiz_answers_id_seq', (SELECT COALESCE(MAX(id), 0) FROM quiz_answers) + 1, false);
  PERFORM setval('image_sets_id_seq', (SELECT COALESCE(MAX(id), 0) FROM image_sets) + 1, false);
  PERFORM setval('image_set_images_id_seq', (SELECT COALESCE(MAX(id), 0) FROM image_set_images) + 1, false);
  PERFORM setval('slot_strategies_id_seq', (SELECT COALESCE(MAX(id), 0) FROM slot_strategies) + 1, false);
  PERFORM setval('saved_slot_sequences_id_seq', (SELECT COALESCE(MAX(id), 0) FROM saved_slot_sequences) + 1, false);
END $$;

COMMIT;

-- ============================================================
-- SEED FILE COMPLETE
-- ============================================================
EOF

echo ""
echo "============================================================"
echo "Seed file generated: $OUTPUT_FILE"
echo "============================================================"
echo ""
echo "To import this seed file in a new environment:"
echo "1. Apply all migrations first"
echo "2. Run: psql <connection-string> -f $OUTPUT_FILE"
echo ""
