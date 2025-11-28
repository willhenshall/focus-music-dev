# Complete Database Seed File - Instructions

## Overview

This document explains how to create a complete seed file for your database and rebuild it in a new environment.

## Current Status

The database seed export scripts have been created but require valid Supabase credentials to execute. Due to API key validation issues, you'll need to generate the seed file when the database connection is available.

## Files Created

1. **scripts/export-complete-database-seed.ts** - TypeScript script to export all data as JSON
2. **scripts/import-database-seed.ts** - TypeScript script to import data from JSON seed file
3. **scripts/generate-sql-seed.sh** - Bash script to generate SQL INSERT statements
4. **database-seed-complete.sql** - Template SQL seed file (needs to be populated)

## Method 1: JSON Export (Recommended)

### Step 1: Generate the Seed File

When you have valid database credentials, run:

```bash
npm run export-seed
```

Or directly:

```bash
npx tsx scripts/export-complete-database-seed.ts
```

This will create `database-seed-complete.json` containing all table data.

### Step 2: Add to Package.json

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "export-seed": "tsx scripts/export-complete-database-seed.ts",
    "import-seed": "tsx scripts/import-database-seed.ts"
  }
}
```

### Step 3: In New Environment

After forking and re-importing to Bolt:

1. Apply all migrations (they should already be in `supabase/migrations/`)
2. Run: `npm run import-seed`

## Method 2: SQL Export (Alternative)

### Using pg_dump

If you have PostgreSQL tools installed:

```bash
# Export entire database schema and data
pg_dump "postgresql://postgres:[password]@[host]:5432/postgres" \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-privileges \
  -t 'public.audio_channels' \
  -t 'public.audio_tracks' \
  -t 'public.user_profiles' \
  -t 'public.user_preferences' \
  -t 'public.system_preferences' \
  -t 'public.quiz_questions' \
  -t 'public.quiz_answers' \
  -t 'public.quiz_results' \
  -t 'public.channel_recommendations' \
  -t 'public.track_analytics' \
  -t 'public.user_playback_state' \
  -t 'public.image_sets' \
  -t 'public.image_set_images' \
  -t 'public.user_image_preferences' \
  -t 'public.slot_strategies' \
  -t 'public.saved_slot_sequences' \
  -t 'public.playwright_test_registry' \
  -t 'public.test_runs' \
  > database-seed-complete.sql
```

## Method 3: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. For each table, run:

```sql
COPY (SELECT * FROM audio_channels) TO STDOUT WITH CSV HEADER;
```

4. Export each table to CSV
5. Store CSVs in a `seed-data/` folder
6. Create import scripts to read CSVs and insert data

## Method 4: Manual Export via Supabase Studio

1. Open Supabase Studio (database UI)
2. Go to Table Editor
3. For each table:
   - Select all rows
   - Export as JSON or CSV
   - Save to `seed-data/[table-name].json`

## Tables to Export

The following tables contain your application data:

1. **audio_channels** - Channel configurations
2. **audio_tracks** - Audio file metadata and references
3. **user_profiles** - User profile information
4. **user_preferences** - User settings
5. **system_preferences** - System-wide settings
6. **quiz_questions** - Quiz questions
7. **quiz_answers** - Quiz answer options
8. **quiz_results** - User quiz results
9. **channel_recommendations** - Personalized recommendations
10. **track_analytics** - Playback analytics
11. **user_playback_state** - User playback tracking
12. **image_sets** - Image set definitions
13. **image_set_images** - Images in sets
14. **user_image_preferences** - User image preferences
15. **slot_strategies** - Playlist strategies
16. **saved_slot_sequences** - Saved sequences
17. **playwright_test_registry** - Test registry
18. **test_runs** - Test execution records

## Important Notes

### Data Dependencies

Some tables have foreign key relationships. Import order matters:

1. Independent tables first:
   - system_preferences
   - quiz_questions
   - audio_channels
   - image_sets

2. Then dependent tables:
   - quiz_answers (depends on quiz_questions)
   - audio_tracks (depends on audio_channels)
   - user_profiles (depends on auth.users)
   - user_preferences (depends on user_profiles)
   - channel_recommendations (depends on user_profiles, audio_channels)
   - image_set_images (depends on image_sets)
   - And so on...

### Auth Users

User profiles depend on `auth.users` which is managed by Supabase Auth. You may need to:

1. Recreate users in the new environment first
2. Or update user_profiles to reference new user IDs

### Storage Files

Don't forget to also export/import:

- Audio files in the `audio-files` bucket
- Channel images in the `channel-images` bucket
- User avatars in the `avatars` bucket
- Timer bell sounds in the `timer-bells` bucket
- Image sets in the `image-sets` bucket

## Rebuild Process in New Environment

1. **Apply Migrations**
   ```bash
   # Migrations are automatically applied when Supabase project is created
   # All files in supabase/migrations/ will be run in order
   ```

2. **Import Seed Data**
   ```bash
   # If using JSON method
   npm run import-seed

   # If using SQL method
   psql <connection-string> -f database-seed-complete.sql
   ```

3. **Verify Data**
   ```bash
   # Check row counts
   npm run check-seed
   ```

4. **Import Storage Files**
   - Use Supabase dashboard to upload files
   - Or use the storage API to bulk upload

## Troubleshooting

### Invalid API Key Errors

If you see "Invalid API key" errors:

1. Check `.env` file has valid credentials
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
3. Ensure Supabase project is active (not paused)

### Missing Tables

If tables don't exist:

1. Ensure all migrations have been applied
2. Check migration order
3. Look for errors in migration logs

### Foreign Key Violations

If imports fail due to foreign keys:

1. Import tables in correct order (see Data Dependencies above)
2. Or temporarily disable foreign key checks:
   ```sql
   SET session_replication_role = 'replica';
   -- Import data
   SET session_replication_role = 'default';
   ```

## Next Steps

Once you have a working database in your current environment:

1. Generate the seed file using Method 1 (JSON) or Method 2 (SQL)
2. Commit the seed file to your repository
3. Include it in your StackBlitz export
4. When you re-import to Bolt, you'll have the seed file ready to use

The seed file will allow you to completely reconstruct your database with all existing data intact.
