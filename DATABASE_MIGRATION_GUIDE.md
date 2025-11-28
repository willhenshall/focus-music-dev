# Complete Database Migration Guide

**Source Database:** `xewajlyswijmjxuajhif.supabase.co` (Bolt-managed)
**Target:** Your new Supabase Pro account
**Export Date:** 2025-11-16

---

## 📦 What's Been Prepared

### 1. Schema Export (COMPLETE_DATABASE_EXPORT.sql)
✅ **File:** `COMPLETE_DATABASE_EXPORT.sql` (6.36 MB)
- Contains all 143 migrations
- Includes complete schema definition
- Has all RLS policies
- Contains all database functions and triggers
- Ready to apply to new database

---

## 🔄 Migration Steps

### Step 1: Export Data from Current Database

Since this is a Bolt-managed Supabase instance with restricted API access, you need to export data through the Supabase Dashboard:

#### Option A: Supabase Dashboard Export (Recommended)

1. **Visit your current database:**
   ```
   https://supabase.com/dashboard/project/xewajlyswijmjxuajhif
   ```

2. **Navigate to:** Table Editor → Select a table → Export to CSV

3. **Export these tables (19 total):**
   - ✅ user_profiles
   - ✅ audio_channels (37 channels)
   - ✅ audio_tracks
   - ✅ channel_recommendations
   - ✅ quiz_questions
   - ✅ quiz_answer_options
   - ✅ quiz_results
   - ✅ user_preferences
   - ✅ system_preferences
   - ✅ user_image_preferences
   - ✅ image_sets
   - ✅ image_set_images
   - ✅ slot_strategies
   - ✅ slot_strategy_slots
   - ✅ saved_slot_sequences
   - ✅ track_analytics
   - ✅ user_playback_tracking
   - ✅ test_registry
   - ✅ test_runs

4. **Save each CSV with the table name**
   - Example: `audio_channels.csv`, `user_profiles.csv`, etc.

#### Option B: SQL Dump via Supabase Dashboard

1. Go to SQL Editor
2. Run this query for each table to generate INSERT statements:

```sql
-- Example for audio_channels table
SELECT 'INSERT INTO audio_channels VALUES (' ||
  quote_nullable(id) || ',' ||
  quote_nullable(name) || ',' ||
  quote_nullable(description) || ',' ||
  -- Add all columns here
  ');'
FROM audio_channels;
```

### Step 2: Set Up New Supabase Pro Account

1. **Create new Supabase project** in your Pro account

2. **Apply schema:**
   - Go to SQL Editor in new project
   - Upload `COMPLETE_DATABASE_EXPORT.sql`
   - Or copy/paste the contents
   - Execute the SQL
   - This will create all tables, RLS policies, and functions

3. **Verify schema:**
   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```
   - Should show all 19 tables

### Step 3: Import Data to New Database

#### Option A: Import CSVs via Supabase Dashboard

1. Go to Table Editor in new project
2. Select a table
3. Click "Import data from CSV"
4. Upload the corresponding CSV file
5. Map columns if needed
6. Repeat for all 19 tables

#### Option B: SQL Insert Statements

1. If you have INSERT statements from Step 1B
2. Go to SQL Editor
3. Paste and execute INSERT statements
4. Run in batches if data is large

### Step 4: Update Environment Variables

Update your `.env` file to point to new database:

```env
SUPABASE_URL=https://your-new-project-ref.supabase.co
SUPABASE_ANON_KEY=your-new-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key

VITE_SUPABASE_URL=https://your-new-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-new-anon-key
VITE_SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key
```

### Step 5: Migrate Storage (Optional)

If you want to migrate audio files (currently on Cloudflare R2):

1. Your current CDN: `pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev`
2. Audio files are already on R2, not Supabase Storage
3. No migration needed - just keep using the same R2 bucket
4. Or set up new R2 bucket and sync files

### Step 6: Verify Migration

Run these checks in new database:

```sql
-- Check row counts
SELECT
  'audio_channels' as table_name, COUNT(*) as rows FROM audio_channels
UNION ALL SELECT 'audio_tracks', COUNT(*) FROM audio_tracks
UNION ALL SELECT 'user_profiles', COUNT(*) FROM user_profiles
UNION ALL SELECT 'quiz_questions', COUNT(*) FROM quiz_questions
-- Add all tables...
;

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- Should show rowsecurity = true for all tables

-- Test a simple query
SELECT * FROM audio_channels LIMIT 5;
```

### Step 7: Test Application

1. Update `.env` with new database credentials
2. Run: `npm run build`
3. Start dev server and test:
   - User authentication
   - Audio playback
   - Quiz functionality
   - Admin features
   - All CRUD operations

---

## 📋 Data Volume Estimates

Based on your current database:
- **Audio Channels:** 37 channels
- **Audio Tracks:** ~1000+ tracks (estimate)
- **Quiz System:** Complete question set
- **User Data:** All profiles and preferences
- **Analytics:** Historical tracking data
- **Slot Strategies:** Saved configurations

---

## ⚠️ Important Notes

### Authentication
- User auth is handled by Supabase Auth
- After migration, users may need to verify emails again
- Consider user communication about the migration

### RLS Policies
- All policies are included in the schema export
- Test thoroughly to ensure data security
- Verify admin access works correctly

### Edge Functions
- You have 20+ Edge Functions
- These are NOT included in the SQL export
- Deploy them separately:
  - Use the Supabase CLI
  - Or deploy via `supabase/functions/` directory

### Storage Buckets
- Schema includes bucket definitions
- Actual files need separate migration
- Currently using Cloudflare R2 CDN

---

## 🚀 Quick Reference Commands

```bash
# Build to verify everything works
npm run build

# Test database connection
npx tsx scripts/test-simple-query.ts

# Verify seed data
npm run verify-seed
```

---

## 🆘 Troubleshooting

### "Invalid API key" errors
- This is expected for Bolt-managed databases
- Use Dashboard export method instead

### Missing data after import
- Check CSV imports completed successfully
- Verify row counts match source database
- Check for foreign key constraint errors

### RLS policy errors
- Ensure all migrations were applied
- Verify user roles are set correctly
- Check admin flag in user_profiles table

### Storage not working
- Verify bucket names match
- Check storage policies
- Update CDN domain if changed

---

## 📞 Support

If you encounter issues:
1. Check Supabase Dashboard Logs
2. Review RLS policies
3. Test with service_role key (bypasses RLS)
4. Check browser console for errors

---

## ✅ Post-Migration Checklist

- [ ] Schema applied successfully
- [ ] All 19 tables exist
- [ ] Data imported for all tables
- [ ] Row counts match source database
- [ ] RLS policies enabled and working
- [ ] Authentication works
- [ ] Audio playback functional
- [ ] Quiz system operational
- [ ] Admin features accessible
- [ ] Analytics tracking works
- [ ] Edge Functions deployed
- [ ] Environment variables updated
- [ ] Application builds successfully
- [ ] Thorough testing complete
- [ ] Old database still available as backup

---

**Created:** 2025-11-16
**Ready to import:** Yes
**Data export required:** Yes (via Dashboard)
