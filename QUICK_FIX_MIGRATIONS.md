# Quick Fix: Apply Migrations in Parts

## Problem
The combined SQL file has duplicate policy definitions that cause PostgreSQL to stop execution with error:
```
ERROR: 42710: policy "Users can read own preferences" already exists
```

## Solution
Apply migrations in 2 parts, skipping the duplicate line.

## Steps (5 minutes)

### Part 1: Apply First Set of Migrations

1. **Go to SQL Editor**
   - https://supabase.com/dashboard/project/phrgdesmixqtjwfanuao/sql

2. **Copy Part 1**
   ```bash
   cat migrations_part1.sql | pbcopy  # macOS
   # or just open migrations_part1.sql and copy all (928 lines)
   ```

3. **Paste and Run**
   - Click "Run"
   - Should complete successfully

### Part 2: Apply Remaining Migrations

1. **Clear the SQL Editor** (or open new query)

2. **Copy Part 2**
   ```bash
   cat migrations_part2.sql | pbcopy  # macOS
   # or just open migrations_part2.sql and copy all (7,207 lines)
   ```

3. **Paste and Run**
   - Click "Run"
   - May see more "already exists" warnings - this is OK
   - What matters is that core tables get created

### Verify Schema

```bash
npm run check-test-db
```

Expected output:
```
✓ audio_channels: Exists
✓ audio_tracks: Exists
✓ user_profiles: Exists
✓ track_analytics: Exists
✓ quiz_questions: Exists
✓ slot_strategies: Exists
```

## Alternative: Ignore Policy Errors

PostgreSQL stops on errors by default. You can also:

1. Go back to SQL Editor
2. Run Part 2 only (migrations_part2.sql)
3. Ignore "already exists" errors
4. Verify schema with `npm run check-test-db`

Most likely the core tables were created in Part 1, and Part 2 will fill in the rest.

## What These Files Contain

**migrations_part1.sql** (928 lines):
- Core schema creation
- user_profiles, audio_channels, audio_tracks
- User preferences table
- Initial RLS policies
- Complete migrations through 2025-10-17

**migrations_part2.sql** (7,207 lines):
- All remaining migrations (starts cleanly at migration boundary)
- Soft delete support, analytics system
- Quiz system, slot strategies
- Image sets, storage buckets
- All remaining policies and functions

## After Migrations Complete

1. **Verify**: `npm run check-test-db`
2. **Seed**: `npm run seed-test-db`
3. **Test**: `npm run test:single`

---

**TL;DR**: Apply `migrations_part1.sql` first, then `migrations_part2.sql` in SQL Editor
