# Database Seed System

Complete system for exporting and importing all database data to enable full project reconstruction.

## Quick Start

### Export Current Database

```bash
npm run export-seed
```

This creates `database-seed-complete.json` with all your data.

### Import in New Environment

After forking and re-importing the project:

```bash
npm run import-seed
```

### Verify Import

```bash
npm run verify-seed
```

## Files Overview

### Scripts

- **scripts/export-complete-database-seed.ts** - Exports all tables to JSON
- **scripts/import-database-seed.ts** - Imports data from JSON file
- **scripts/verify-seed-data.ts** - Verifies row counts after import
- **scripts/generate-sql-seed.sh** - Alternative: generates SQL INSERT statements

### Data Files

- **database-seed-complete.json** - Main seed file (created by export-seed)
- **database-seed-complete.sql** - SQL template for manual seeding

### Documentation

- **DATABASE_SEED_INSTRUCTIONS.md** - Detailed instructions and troubleshooting

## Export Process

The export script:

1. Connects to your Supabase database using service role credentials
2. Queries all 18 application tables
3. Exports complete row data as JSON
4. Creates a timestamped seed file with metadata

### Tables Exported

The script exports these tables in order:

1. audio_channels
2. audio_tracks
3. user_profiles
4. user_preferences
5. system_preferences
6. quiz_questions
7. quiz_answers
8. quiz_results
9. channel_recommendations
10. track_analytics
11. user_playback_state
12. image_sets
13. image_set_images
14. user_image_preferences
15. slot_strategies
16. saved_slot_sequences
17. playwright_test_registry
18. test_runs

## Import Process

The import script:

1. Reads `database-seed-complete.json`
2. Imports data table by table
3. Uses batch processing (100 rows at a time)
4. Uses `upsert` to handle existing data gracefully
5. Reports progress and results

### Import Order

Data is imported in dependency order to respect foreign key constraints.

## Seed File Format

```json
{
  "exportedAt": "2025-11-15T00:00:00.000Z",
  "version": "1.0",
  "description": "Complete database seed file for focus music platform",
  "tables": [
    {
      "table": "audio_channels",
      "rowCount": 37,
      "data": [
        { "id": 1, "name": "Channel 1", ... }
      ]
    }
  ],
  "summary": {
    "totalTables": 18,
    "totalRows": 1523,
    "tableBreakdown": [...]
  }
}
```

## Usage Workflow

### Before Exporting to StackBlitz

1. Run export:
   ```bash
   npm run export-seed
   ```

2. Verify the file was created:
   ```bash
   ls -lh database-seed-complete.json
   ```

3. Check the summary in console output

4. Commit the seed file to your repo

### After Importing to New Bolt Project

1. Wait for migrations to apply automatically

2. Import the seed data:
   ```bash
   npm run import-seed
   ```

3. Verify everything imported correctly:
   ```bash
   npm run verify-seed
   ```

4. Check the application works as expected

## Important Notes

### What's Included

✓ All table data (complete rows)
✓ Timestamps preserved
✓ Foreign key relationships maintained
✓ JSON metadata

### What's NOT Included

✗ Auth users (auth.users table)
✗ Storage bucket files (audio, images)
✗ Database schema (use migrations for this)
✗ RLS policies (use migrations for this)
✗ Functions and triggers (use migrations for this)

### Handling Auth Users

User profiles reference `auth.users`. Options:

1. **Recreate test users** in new environment first
2. **Update user_profiles** with new user IDs
3. **Skip user-specific data** if just testing

### Handling Storage Files

Audio and image files are separate from database:

1. **Manual download/upload** via Supabase dashboard
2. **Use storage API** to bulk transfer
3. **Re-upload files** if you have originals

## Troubleshooting

### Export Fails with "Invalid API key"

**Problem:** Supabase credentials are invalid or expired

**Solutions:**
- Check `.env` file has correct values
- Verify Supabase project is active (not paused)
- Regenerate service role key if needed

### Import Fails with Foreign Key Violations

**Problem:** Data imported out of order

**Solutions:**
- The script handles order automatically
- If issues persist, temporarily disable constraints:
  ```sql
  SET session_replication_role = 'replica';
  ```

### Import Shows "0 rows inserted"

**Problem:** RLS policies blocking inserts

**Solutions:**
- Script uses service role key (bypasses RLS)
- Verify `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- Check migrations applied correctly

### Large File Size

**Problem:** Seed file is very large (>50MB)

**Solutions:**
- Exclude analytics tables (track_analytics)
- Exclude test data (playwright_test_registry, test_runs)
- Use SQL export instead (more efficient)

## Advanced Usage

### Exclude Specific Tables

Edit `scripts/export-complete-database-seed.ts`:

```typescript
const tables = [
  'audio_channels',
  'audio_tracks',
  // Remove tables you don't need:
  // 'track_analytics',
  // 'test_runs',
];
```

### Export Only Specific Tables

```bash
npx tsx scripts/export-complete-database-seed.ts --tables audio_channels,audio_tracks
```

(Note: would need to implement this flag)

### Custom Export Format

The scripts can be modified to export as:
- CSV (easier to read, edit)
- SQL INSERT statements (more portable)
- YAML (human-friendly)

## Security Considerations

### Service Role Key

The seed file itself doesn't contain credentials, but the export process requires the service role key.

**Important:**
- Never commit `.env` file
- Keep service role key secure
- Regenerate keys if exposed

### Sensitive Data

The seed file contains all your data, including:
- User profiles (emails, names)
- Quiz results
- Analytics data

**Recommendations:**
- Don't commit seed files with real user data
- Create separate seed for development
- Use anonymized data for public repos

## Performance

### Export Performance

- ~100-500ms per table
- Total time: 5-10 seconds for typical database
- Scales with row count

### Import Performance

- Batch size: 100 rows per request
- ~200-500ms per batch
- Total time: varies by data volume
  - 1,000 rows: ~30 seconds
  - 10,000 rows: ~5 minutes
  - 100,000 rows: ~30 minutes

### Optimization Tips

1. **Increase batch size** for faster imports (in import script)
2. **Use SQL method** for very large datasets
3. **Disable RLS temporarily** during import (already done)
4. **Run on server** if local network is slow

## Alternatives

### 1. Supabase CLI

```bash
supabase db dump --data-only > seed.sql
supabase db reset
supabase db load seed.sql
```

### 2. pg_dump / pg_restore

```bash
pg_dump <connection> --data-only > seed.sql
pg_restore <connection> seed.sql
```

### 3. Supabase Dashboard

Manual export/import via Table Editor (good for small datasets)

## Future Enhancements

Potential improvements:

- [ ] Incremental exports (only changed data)
- [ ] Compression (gzip seed files)
- [ ] Storage file export/import
- [ ] Anonymization options
- [ ] Selective table export via CLI flags
- [ ] Diff between environments
- [ ] Automated daily exports

## Support

For issues or questions:

1. Check `DATABASE_SEED_INSTRUCTIONS.md` for detailed troubleshooting
2. Review console output for specific error messages
3. Verify environment variables are set correctly
4. Ensure migrations are applied before importing

## Related Documentation

- **DATABASE_SEED_INSTRUCTIONS.md** - Comprehensive guide
- **supabase/migrations/** - Database schema migrations
- **TESTING_STANDARDS.md** - Testing procedures
- **README.md** - Main project documentation
