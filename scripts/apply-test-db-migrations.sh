#!/bin/bash

# Apply migrations to test database
# This script reads migrations from supabase/migrations/ and applies them to the test database

set -e

# Load test environment
export $(cat .env.test | grep -v '^#' | xargs)

echo ""
echo "🔧 Applying migrations to test database..."
echo "Database: $SUPABASE_URL"
echo ""

# Create a combined SQL file with all schema migrations
COMBINED_SQL="/tmp/combined_migrations.sql"
> "$COMBINED_SQL"  # Clear file

# Add migrations in order, skipping data population
for migration in supabase/migrations/*.sql; do
  filename=$(basename "$migration")

  # Skip data population and channel insert scripts
  if [[ $filename == *"populate"* ]] || \
     [[ $filename == *"insert_channels_part"* ]] || \
     [[ $filename == *"import_audio_channels"* ]] || \
     [[ $filename == *"bulk_insert"* ]] || \
     [[ $filename == *"backfill"* ]] || \
     [[ $filename == *"extract_version"* ]]; then
    echo "⏭️  Skipping: $filename (data script)"
    continue
  fi

  echo "📝 Adding: $filename"
  echo "-- Migration: $filename" >> "$COMBINED_SQL"
  cat "$migration" >> "$COMBINED_SQL"
  echo "" >> "$COMBINED_SQL"
done

echo ""
echo "📤 Uploading combined migrations to test database..."
echo ""

# Use psql or SQL editor approach
# For now, output instructions
cat << EOF

✅ Migrations have been combined into: $COMBINED_SQL

To apply them, choose one option:

Option 1: Use psql (if you have database password)
  psql -h db.phrgdesmixqtjwfanuao.supabase.co -p 5432 -U postgres -d postgres -f $COMBINED_SQL

Option 2: Use Supabase SQL Editor (recommended)
  1. Go to: https://supabase.com/dashboard/project/phrgdesmixqtjwfanuao/sql
  2. Copy the contents of: $COMBINED_SQL
  3. Paste and run in SQL Editor

Option 3: Run the Node.js script
  npm run setup-test-db-migrations

EOF

echo "Combined SQL file size: $(wc -l < $COMBINED_SQL) lines"
echo ""
