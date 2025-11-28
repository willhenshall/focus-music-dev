# Simplified: Apply Missing Test DB Migrations

## The Situation
Your test database **already has** the core schema (audio_channels, audio_tracks, user_profiles) but is missing:
- ✅ quiz_questions and related tables
- ❌ track_analytics and related tables  
- ❌ slot_strategies and related tables

**The error you're seeing** means some policies already exist from previous migration attempts.

## The Simplest Solution

Just ignore the "already exists" errors - they're harmless! The important tables will still be created.

### Step 1: Run Part 1 (skip if you already did)
If you haven't run Part 1 yet, paste `migrations_part1.sql` in SQL Editor and click Run.

When you see `policy "Users can view own profile" already exists`, **that's OK**! 

The migration will stop there, but the core tables are likely already created from a previous attempt.

### Step 2: Run Part 2
Paste `migrations_part2.sql` in SQL Editor and click Run.

You may see more "already exists" warnings. **Ignore them!** The new tables (quiz, analytics, slot_strategies) will be created.

### Step 3: Verify
```bash
npm run check-test-db
```

Should show:
```
✓ audio_channels: Exists
✓ audio_tracks: Exists
✓ user_profiles: Exists
✓ track_analytics: Exists
✓ quiz_questions: Exists
✓ slot_strategies: Exists
```

## If That Doesn't Work

The test database might need a fresh start. Two options:

### Option A: Reset Test Database (Nuclear Option)
1. Go to https://supabase.com/dashboard/project/phrgdesmixqtjwfanuao/settings/general
2. Scroll to "Reset Project Password" or use SQL Editor to drop all tables:
   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   GRANT ALL ON SCHEMA public TO postgres;
   GRANT ALL ON SCHEMA public TO public;
   ```
3. Then run Part 1 + Part 2 fresh

### Option B: Just Add Missing Tables Manually

Run this SQL directly (copy from below):

```sql
-- Only create missing quiz tables
CREATE TABLE IF NOT EXISTS quiz_questions (
  id text PRIMARY KEY,
  question_order integer NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('single_select', 'likert_1_5', 'likert_1_7')),
  question_text text NOT NULL,
  options jsonb DEFAULT '[]'::jsonb,
  reverse_scored boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_version text NOT NULL,
  responses jsonb NOT NULL,
  ocean_scores jsonb NOT NULL,
  recommended_channels jsonb NOT NULL,
  completed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Only create missing analytics tables  
CREATE TABLE IF NOT EXISTS track_play_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_played integer,
  total_duration integer NOT NULL,
  completion_percentage numeric(5,2),
  was_skipped boolean DEFAULT false,
  skip_position integer,
  session_id text,
  device_type text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS track_analytics_summary (
  track_id text PRIMARY KEY,
  total_plays integer DEFAULT 0,
  total_completions integer DEFAULT 0,
  total_skips integer DEFAULT 0,
  unique_listeners integer DEFAULT 0,
  average_completion_rate numeric(5,2),
  last_played_at timestamptz,
  plays_last_7_days integer DEFAULT 0,
  plays_last_30_days integer DEFAULT 0,
  skips_last_7_days integer DEFAULT 0,
  skips_last_30_days integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Only create missing slot strategies tables
CREATE TABLE IF NOT EXISTS slot_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES audio_channels(id) ON DELETE CASCADE,
  energy_level text NOT NULL CHECK (energy_level IN ('low', 'medium', 'high')),
  slot_count integer NOT NULL DEFAULT 8,
  slot_duration integer NOT NULL DEFAULT 300,
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, energy_level)
);

-- Enable RLS on all new tables
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_play_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_analytics_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_strategies ENABLE ROW LEVEL SECURITY;
```

Then verify: `npm run check-test-db`

---

**TL;DR**: Try Part 2 migrations anyway, ignore errors. If still missing tables, use Option B SQL above.
