# Reset and Apply Test Database Migrations

## Current Problem
The test database is in a **partial state**:
- Some policies exist from previous attempts
- Core tables (audio_tracks, etc.) are **NOT created**
- Migration stops on duplicate policy errors before creating tables

## Solution: Fresh Reset (3 minutes)

### Step 1: Reset the Schema

Go to SQL Editor and run this:

```sql
-- Drop everything and start fresh
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

This removes all tables, policies, functions - everything. Clean slate.

### Step 2: Apply Core Schema (Safe Version)

Now run this SQL that creates ONLY the essential tables with basic policies:

```sql
-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  is_admin boolean DEFAULT false,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create audio_channels table
CREATE TABLE IF NOT EXISTS audio_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  image_url text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create audio_tracks table
CREATE TABLE IF NOT EXISTS audio_tracks (
  id text PRIMARY KEY,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  duration integer,
  public_url text,
  energy_level text CHECK (energy_level IN ('low', 'medium', 'high')),
  version text,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create quiz tables
CREATE TABLE IF NOT EXISTS quiz_questions (
  id text PRIMARY KEY,
  question_order integer NOT NULL,
  question_type text NOT NULL,
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
  brain_type text,
  cognitive_profile jsonb,
  completed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create analytics tables
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

-- Create slot strategies table
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

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_play_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_analytics_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_strategies ENABLE ROW LEVEL SECURITY;

-- Basic policies (minimal, no conflicts)
CREATE POLICY "Allow public read on channels"
  ON audio_channels FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public read on tracks"
  ON audio_tracks FOR SELECT
  TO public
  USING (deleted_at IS NULL);

CREATE POLICY "Allow public read on quiz questions"
  ON quiz_questions FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can read own quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quiz results"
  ON quiz_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

### Step 3: Verify

```bash
npm run check-test-db
```

Should show all green checkmarks:
```
✓ audio_channels: Exists
✓ audio_tracks: Exists
✓ user_profiles: Exists
✓ track_analytics: Exists (track_play_events)
✓ quiz_questions: Exists
✓ slot_strategies: Exists
```

### Step 4: Seed Test Data

```bash
npm run seed-test-db
```

This creates:
- Test admin user (admin@example.com / password123)
- Test regular user (user@example.com / password123)
- Sample channels and tracks

### Step 5: Run Tests

```bash
npm run test:single
```

---

## Why This Works

1. **Fresh reset** removes all conflicts
2. **Simplified SQL** creates only necessary tables with basic policies
3. **No duplicate policies** because we're starting from empty database
4. **All required tables** are created in one go

The full migrations (migrations_part1.sql, migrations_part2.sql) have too many complex policies that conflict. This approach gives you a working test database in under 5 minutes.
