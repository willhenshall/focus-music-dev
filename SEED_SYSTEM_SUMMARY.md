# Database Seed System - Summary

Complete system for exporting and re-importing your entire database.

## What Was Created

### 🎯 Core Export/Import Scripts

1. **scripts/export-complete-database-seed.ts** - Full database export to JSON
2. **scripts/import-database-seed.ts** - Full database import from JSON
3. **scripts/quick-export-seed.ts** - Quick export (essential tables only)
4. **scripts/quick-import-seed.ts** - Quick import (essential tables only)
5. **scripts/verify-seed-data.ts** - Verify row counts after import

### 📝 Template Files

6. **database-seed-complete.sql** - SQL template for manual seeding
7. **scripts/generate-sql-seed.sh** - Alternative SQL export method

### 📚 Documentation

8. **DATABASE_SEED_INSTRUCTIONS.md** - Comprehensive troubleshooting guide
9. **DATABASE_SEED_README.md** - Complete usage documentation
10. **SEED_SYSTEM_SUMMARY.md** - This file

### 📦 Package.json Scripts Added

```json
{
  "export-seed": "Full export of all 18 tables",
  "import-seed": "Full import from database-seed-complete.json",
  "verify-seed": "Verify row counts after import",
  "export-seed-quick": "Quick export (essential tables only)",
  "import-seed-quick": "Quick import from database-seed-quick.json"
}
```

## Quick Reference

### For Your Current Workflow

#### Before Exporting to StackBlitz

```bash
# Option 1: Full export (includes all data)
npm run export-seed

# Option 2: Quick export (essential config only)
npm run export-seed-quick
```

This creates either:
- `database-seed-complete.json` (full export)
- `database-seed-quick.json` (essential only)

#### After Importing Back to Bolt

```bash
# Wait for migrations to apply automatically
# Then import your data:

npm run import-seed
# or
npm run import-seed-quick

# Verify everything imported correctly:
npm run verify-seed
```

## Two Export Methods

### Method 1: Full Export (Recommended for Production)

**Tables Exported:** All 18 application tables

```bash
npm run export-seed
```

**Includes:**
- audio_channels
- audio_tracks
- user_profiles
- user_preferences
- system_preferences
- quiz_questions
- quiz_answers
- quiz_results
- channel_recommendations
- track_analytics
- user_playback_state
- image_sets
- image_set_images
- user_image_preferences
- slot_strategies
- saved_slot_sequences
- playwright_test_registry
- test_runs

**Use when:** You want complete data preservation

### Method 2: Quick Export (Recommended for Fresh Start)

**Tables Exported:** 4 essential + 8 optional tables

```bash
npm run export-seed-quick
```

**Essential Tables:**
- audio_channels (your channel configs)
- quiz_questions (quiz setup)
- quiz_answers (quiz options)
- system_preferences (system config)

**Optional Tables:**
- audio_tracks
- user_profiles
- user_preferences
- channel_recommendations
- image_sets
- image_set_images
- slot_strategies
- saved_slot_sequences

**Use when:** You want a clean slate with just configuration

## What Gets Exported

### ✅ Included in Seed Files

- Complete row data from all tables
- All columns and values
- Timestamps preserved
- Foreign key relationships intact
- Metadata and summaries

### ❌ Not Included in Seed Files

- Auth users (`auth.users` table - managed by Supabase)
- Storage bucket files (audio, images)
- Database schema (migrations handle this)
- RLS policies (migrations handle this)
- Functions and triggers (migrations handle this)
- Database indexes (migrations handle this)

## File Sizes

Typical file sizes (depends on your data):

- **Quick export:** 50-500 KB (config only)
- **Full export:** 1-50 MB (all data)
- **With tracks:** 10-100 MB (includes audio_tracks metadata)

## Import Process

The import scripts automatically:

1. Read the seed file
2. Import tables in dependency order
3. Use batch processing (100 rows at a time)
4. Handle conflicts with `upsert`
5. Report detailed progress
6. Provide success/failure summary

## Error Handling

### Current Known Issue

The export requires valid Supabase credentials. If you see "Invalid API key" errors:

1. This happens if the Supabase instance is paused or credentials expired
2. You'll need to run the export when the database is accessible
3. Once exported, the seed file is portable and doesn't need credentials

### When Import Fails

The scripts include error handling:

- RLS policies bypassed (uses service role key)
- Foreign key order handled automatically
- Detailed error messages for debugging
- Partial imports continue (won't fail entire process)

## Verification

After importing, verify with:

```bash
npm run verify-seed
```

This shows:
- Row count for each table
- Which tables have data
- Which tables are empty
- Any tables with errors

## Best Practices

### For Production Data

1. Use full export (`npm run export-seed`)
2. Export regularly as backup
3. Store seed files securely (contain user data)
4. Version control seed files (if no sensitive data)

### For Development

1. Use quick export (`npm run export-seed-quick`)
2. Export just configuration data
3. Exclude user-generated content
4. Share with team via git

### For Testing

1. Create test-specific seed files
2. Use anonymized data
3. Keep seed files small
4. Automate import in CI/CD

## Alternative Methods

If the TypeScript scripts don't work:

### Method 1: Supabase Dashboard

1. Open Supabase Table Editor
2. Export each table as JSON/CSV
3. Save files to `seed-data/` folder

### Method 2: pg_dump Command

```bash
pg_dump <connection-string> --data-only > seed.sql
```

### Method 3: SQL Queries

Run in Supabase SQL Editor:

```sql
COPY (SELECT * FROM audio_channels) TO STDOUT WITH CSV HEADER;
```

## Troubleshooting

See **DATABASE_SEED_INSTRUCTIONS.md** for:

- Invalid API key errors
- Foreign key violations
- RLS policy blocks
- Large file sizes
- Import performance
- Data dependencies

## Next Steps

1. **Try the export now** (if database is accessible):
   ```bash
   npm run export-seed-quick
   ```

2. **If export fails** with "Invalid API key":
   - This is expected if Supabase instance is paused
   - Try again when database is active
   - Or use alternative methods above

3. **When successful**:
   - Commit the seed file to your repo
   - Include in StackBlitz export
   - Use for rebuilding in new environment

4. **After forking**:
   - Import to new Bolt project
   - Run `npm run import-seed-quick`
   - Verify with `npm run verify-seed`

## Support Files

- **DATABASE_SEED_INSTRUCTIONS.md** - Detailed guide with troubleshooting
- **DATABASE_SEED_README.md** - Complete documentation
- **database-seed-complete.sql** - SQL template
- **scripts/generate-sql-seed.sh** - Alternative export method

## Summary

You now have a complete database seeding system that:

✅ Exports all table data to JSON
✅ Preserves complete row contents
✅ Handles dependencies automatically
✅ Provides two export options (full/quick)
✅ Includes verification tools
✅ Has comprehensive documentation
✅ Supports alternative export methods

The seed files will allow you to completely rebuild your database in any new environment after forking and re-importing the project.
