-- Missing Migrations for Test Database
-- Only includes migrations for tables that don't exist yet:
-- - quiz_questions and related
-- - track_analytics and related  
-- - slot_strategies and related

-- Note: Uses DROP POLICY IF EXISTS to avoid conflicts with existing policies

-- Migration: 20251017191855_create_quiz_tables.sql
/*
  # Quiz Management System

  1. New Tables
    - `quiz_questions`
      - Stores all quiz questions with their configuration
      - Includes question text, type, options, and scoring rules
    
    - `quiz_results`
      - Stores user quiz responses and calculated results
      - Links to user_profiles
      - Contains OCEAN scores and recommended channels
    
    - `quiz_config`
      - Stores the current quiz configuration (scoring logic, channel mappings)
      - Versioned for tracking changes over time

  2. Security
    - Enable RLS on all tables
    - Admin users can manage quiz questions and config
    - All authenticated users can view quiz questions
    - Users can only view their own quiz results
    - Admin users can view all quiz results
*/

-- Quiz questions table
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

-- Quiz configuration table
CREATE TABLE IF NOT EXISTS quiz_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  scoring_logic jsonb NOT NULL,
  channel_mapping jsonb NOT NULL,
  energy_levels jsonb DEFAULT '["Low", "Medium", "High"]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Quiz results table
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

-- Enable RLS
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;

-- Quiz questions policies
CREATE POLICY "All authenticated users can view quiz questions"
  ON quiz_questions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin users can insert quiz questions"
  ON quiz_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update quiz questions"
  ON quiz_questions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can delete quiz questions"
  ON quiz_questions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Quiz config policies
CREATE POLICY "All authenticated users can view active quiz config"
  ON quiz_config FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admin users can insert quiz config"
  ON quiz_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update quiz config"
  ON quiz_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Quiz results policies
CREATE POLICY "Users can view their own quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin users can view all quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can insert their own quiz results"
  ON quiz_results FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_questions_order ON quiz_questions(question_order);
CREATE INDEX IF NOT EXISTS idx_quiz_config_active ON quiz_config(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_completed_at ON quiz_results(completed_at DESC);
-- Migration: 20251017210933_20251017210000_update_quiz_questions_exact.sql
/*
  # Update Quiz Questions to Exact Specifications
  
  1. Overview
    - Updates all 21 quiz questions to match the exact wording provided
    - Maintains proper question order and types
    - Updates answer options to match specifications
    
  2. Changes
    - Question 1 (avatar_1): Sound preference question with 4 options
    - Question 2 (avatar_2): Stimulant intake with 4 levels
    - Questions 3-12 (tipi_1 to tipi_10): TIPI personality questions (7-point scale)
    - Questions 13-14: Melody/voice preference (5-point scale)
    - Questions 15-21: Context questions (age, work setting, focus duration, etc.)
*/

-- Clear existing questions
DELETE FROM quiz_questions;

-- Question 1: Sound preference
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('avatar_1', 1, 'single_select', 'When you''re trying to focus, which kind of sound works best for you?', 
 '[{"value": "rhythmic_low_emotion", "label": "Rhythmic, steady beats with very little emotional expression"}, 
   {"value": "melodic_emotional", "label": "Melodic or emotional music that changes mood and feeling"}, 
   {"value": "ambient_nature", "label": "Ambient soundscapes or nature sounds"}, 
   {"value": "no_preference", "label": "No preference / it depends"}]', false);

-- Question 2: Stimulant intake
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('avatar_2', 2, 'single_select', 'What''s your coffee or stimulant intake like?', 
 '[{"value": "none", "label": "None"}, 
   {"value": "little", "label": "A little"}, 
   {"value": "medium", "label": "Medium"}, 
   {"value": "lot", "label": "A lot"}]', false);

-- Questions 3-12: TIPI personality questions (7-point Likert scale)
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('tipi_1', 3, 'likert_1_7', 'I see myself as… Extraverted, enthusiastic.', '[]', false),
('tipi_2', 4, 'likert_1_7', 'I see myself as… Critical, quarrelsome.', '[]', true),
('tipi_3', 5, 'likert_1_7', 'I see myself as… Dependable, self-disciplined.', '[]', false),
('tipi_4', 6, 'likert_1_7', 'I see myself as… Anxious, easily upset.', '[]', false),
('tipi_5', 7, 'likert_1_7', 'I see myself as… Open to new experiences, complex.', '[]', false),
('tipi_6', 8, 'likert_1_7', 'I see myself as… Reserved, quiet.', '[]', true),
('tipi_7', 9, 'likert_1_7', 'I see myself as… Sympathetic, warm.', '[]', false),
('tipi_8', 10, 'likert_1_7', 'I see myself as… Disorganized, careless.', '[]', true),
('tipi_9', 11, 'likert_1_7', 'I see myself as… Calm, emotionally stable.', '[]', true),
('tipi_10', 12, 'likert_1_7', 'I see myself as… Conventional, uncreative.', '[]', true);

-- Questions 13-14: Preference questions (5-point Likert scale)
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('no_melody_pref', 13, 'likert_1_5', 'While working, I prefer sounds without melody or lyrics (e.g., drums, machine hum, noise).', '[]', false),
('voices_distract', 14, 'likert_1_5', 'Voices or emotive melodies distract me when I''m concentrating.', '[]', false);

-- Question 15: Age band
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('context_1', 15, 'single_select', 'Age band', 
 '[{"value": "under_20", "label": "Under 20"}, 
   {"value": "20s", "label": "20s"}, 
   {"value": "30s", "label": "30s"}, 
   {"value": "40s", "label": "40s"}, 
   {"value": "50_plus", "label": "50 and older"}]', false);

-- Question 16: Work setting
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('context_2', 16, 'single_select', 'Typical work setting', 
 '[{"value": "quiet_office", "label": "Quiet office"}, 
   {"value": "busy_office", "label": "Busy office"}, 
   {"value": "home_chatter", "label": "Home with some background chatter"}, 
   {"value": "cafes_public", "label": "Cafés or public spaces"}, 
   {"value": "headphones_always", "label": "Headphones always"}]', false);

-- Question 17: Focus duration
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('focus_duration', 17, 'single_select', 'How long can you usually focus for without taking a break?', 
 '[{"value": "15_min", "label": "15 minutes or less"}, 
   {"value": "30_min", "label": "30 minutes"}, 
   {"value": "45_min", "label": "45 minutes"}, 
   {"value": "1_hour", "label": "1 hour"}, 
   {"value": "1_5_hours", "label": "1.5 hours"}, 
   {"value": "2_plus_hours", "label": "2+ hours"}]', false);

-- Question 18: Current activity
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('current_activity', 18, 'single_select', 'What best describes how you spend most of your day?', 
 '[{"value": "creative_content", "label": "Creating content/designing/writing"}, 
   {"value": "analytical", "label": "Coding, analyzing, teaching"}, 
   {"value": "management", "label": "Managing teams/projects"}, 
   {"value": "studying", "label": "Studying or early career"}, 
   {"value": "other", "label": "None of the above"}]', false);

-- Question 19: Best focus time
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('best_focus_time', 19, 'single_select', 'What time of day do you focus best?', 
 '[{"value": "early_morning", "label": "Early morning (5-8am)"}, 
   {"value": "morning", "label": "Morning (8-12pm)"}, 
   {"value": "afternoon", "label": "Afternoon (12-5pm)"}, 
   {"value": "evening", "label": "Evening (5-9pm)"}, 
   {"value": "night", "label": "Night (9pm+)"}]', false);

-- Question 20: Music frequency
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('music_frequency', 20, 'single_select', 'How often do you use focus music?', 
 '[{"value": "every_day", "label": "Every day"}, 
   {"value": "several_week", "label": "Several times a week"}, 
   {"value": "occasionally", "label": "Occasionally"}, 
   {"value": "rarely", "label": "Rarely"}, 
   {"value": "first_time", "label": "This is my first time"}]', false);

-- Question 21: Focus preference
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('focus_preference', 21, 'single_select', 'What helps you focus most?', 
 '[{"value": "background_music", "label": "Background music"}, 
   {"value": "complete_silence", "label": "Complete silence"}, 
   {"value": "nature_sounds", "label": "Nature sounds"}, 
   {"value": "ambient_noise", "label": "Ambient noise"}, 
   {"value": "varies", "label": "It varies"}]', false);
-- Migration: 20251018033315_add_playlist_strategy_config.sql
/*
  # Add Playlist Strategy Configuration

  1. Changes
    - Add `playlist_strategy` jsonb column to `audio_channels` table
    - This stores the playback strategy for each energy level (low, medium, high)
    - Default strategy is 'track_id_order' which plays tracks in order by their track_id
  
  2. Structure
    - Each energy level has its own strategy configuration:
      {
        "low": { "strategy": "track_id_order" },
        "medium": { "strategy": "track_id_order" },
        "high": { "strategy": "track_id_order" }
      }
    - Available strategies: 'track_id_order', 'weighted', 'filename', 'upload_date', 'random'
*/

-- Add playlist_strategy column with default configuration
ALTER TABLE audio_channels 
ADD COLUMN IF NOT EXISTS playlist_strategy jsonb DEFAULT '{"low": {"strategy": "track_id_order"}, "medium": {"strategy": "track_id_order"}, "high": {"strategy": "track_id_order"}}'::jsonb;

-- Update existing channels to have the default strategy
UPDATE audio_channels 
SET playlist_strategy = '{"low": {"strategy": "track_id_order"}, "medium": {"strategy": "track_id_order"}, "high": {"strategy": "track_id_order"}}'::jsonb
WHERE playlist_strategy IS NULL;

-- Migration: 20251018041113_add_display_order_to_channels.sql
/*
  # Add Display Order to Audio Channels

  1. Changes
    - Add `display_order` column to `audio_channels` table
      - Integer field to control the order channels appear to end users
      - Lower numbers appear first
      - Defaults to channel_number for backward compatibility
    
  2. Notes
    - The top 3 channels will be overridden by quiz recommendations
    - This order affects remaining channels shown to users
    - Admins can maintain a separate custom view order in the UI
*/

-- Add display_order column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE audio_channels ADD COLUMN display_order INTEGER;
  END IF;
END $$;

-- Initialize display_order with channel_number for existing records
UPDATE audio_channels
SET display_order = channel_number
WHERE display_order IS NULL;

-- Make display_order NOT NULL after initialization
ALTER TABLE audio_channels ALTER COLUMN display_order SET NOT NULL;

-- Add default for new records
ALTER TABLE audio_channels ALTER COLUMN display_order SET DEFAULT 999;
-- Migration: 20251018042157_enable_realtime_for_audio_channels.sql
/*
  # Enable Realtime for Audio Channels

  1. Changes
    - Enable realtime publication for the audio_channels table
    - This allows clients to subscribe to real-time updates when channel data changes
    - Specifically needed for live updates of display_order changes
  
  2. Notes
    - Users will automatically see channel order updates without manual refresh
    - No action required from users - updates happen silently in the background
*/

-- Enable realtime for audio_channels table
ALTER PUBLICATION supabase_realtime ADD TABLE audio_channels;
-- Migration: 20251018133047_add_music_library_column_preferences.sql
/*
  # Add Music Library Column Preferences

  1. New Tables
    - `music_library_column_preferences`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `visible_columns` (jsonb array of column identifiers)
      - `column_widths` (jsonb object mapping column keys to widths)
      - `sort_field` (text, current sort field)
      - `sort_direction` (text, 'asc' or 'desc')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `music_library_column_preferences` table
    - Add policy for users to read their own preferences
    - Add policy for users to insert their own preferences
    - Add policy for users to update their own preferences
*/

CREATE TABLE IF NOT EXISTS music_library_column_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visible_columns jsonb NOT NULL DEFAULT '["track_id", "track_name", "artist_name", "energy_level", "file_size", "channels"]'::jsonb,
  column_widths jsonb NOT NULL DEFAULT '{
    "checkbox": 48,
    "track_id": 180,
    "track_name": 250,
    "artist_name": 200,
    "energy_level": 120,
    "file_size": 120,
    "channels": 140
  }'::jsonb,
  sort_field text DEFAULT 'track_id',
  sort_direction text DEFAULT 'asc',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE music_library_column_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own column preferences"
  ON music_library_column_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own column preferences"
  ON music_library_column_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own column preferences"
  ON music_library_column_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Migration: 20251018160549_allow_anonymous_quiz_access.sql
/*
  # Allow Anonymous Access to Quiz Data

  1. Changes
    - Drop existing restrictive SELECT policies on quiz_questions and quiz_config
    - Add new SELECT policies that allow anonymous users (anon role) to view quiz data
    - This enables the anonymous quiz flow where users can take the assessment before signing up

  2. Security
    - Only SELECT (read) access is granted to anonymous users
    - INSERT, UPDATE, DELETE remain restricted to admin users only
    - Maintains data integrity while allowing public quiz access
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "All authenticated users can view quiz questions" ON quiz_questions;
DROP POLICY IF EXISTS "All authenticated users can view active quiz config" ON quiz_config;

-- Allow anyone (including anonymous users) to view quiz questions
CREATE POLICY "Anyone can view quiz questions"
  ON quiz_questions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anyone (including anonymous users) to view active quiz config
CREATE POLICY "Anyone can view active quiz config"
  ON quiz_config
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Migration: 20251018180843_allow_anonymous_channel_access.sql
/*
  # Allow Anonymous Access to Audio Channels
  
  1. Changes
    - Add RLS policy to allow anonymous (anon) users to view audio channels
    - This enables the quiz to load channel data for anonymous users
  
  2. Security
    - Read-only access for anonymous users
    - Maintains existing authenticated and admin policies
*/

CREATE POLICY "Anonymous users can view channels"
  ON audio_channels
  FOR SELECT
  TO anon
  USING (true);

-- Migration: 20251018182521_add_admin_tab_order_preferences.sql
/*
  # Add Admin Tab Order Preferences

  1. New Tables
    - `admin_tab_preferences`
      - `user_id` (uuid, primary key, foreign key to auth.users)
      - `tab_order` (jsonb) - Stores the ordered array of tab identifiers
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `admin_tab_preferences` table
    - Add policy for admin users to read their own preferences
    - Add policy for admin users to insert their own preferences
    - Add policy for admin users to update their own preferences
*/

CREATE TABLE IF NOT EXISTS admin_tab_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tab_order jsonb NOT NULL DEFAULT '["analytics", "channels", "library", "users", "channel-images", "quiz"]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE admin_tab_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can read own tab preferences"
  ON admin_tab_preferences
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can insert own tab preferences"
  ON admin_tab_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update own tab preferences"
  ON admin_tab_preferences
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_admin_tab_preferences_user_id ON admin_tab_preferences(user_id);

-- Added quiz migrations (lines 1214-1763)
-- Migration: 20251018232951_create_track_analytics_system.sql
/*
  # Create Track Analytics System

  ## Overview
  This migration creates a comprehensive tracking system for music playback analytics,
  enabling detailed insights into user listening behavior and track performance.

  ## New Tables

  ### 1. `track_play_events`
  Tracks every play event with detailed context:
  - `id` (uuid, primary key) - Unique event identifier
  - `track_id` (text, not null) - Reference to audio track
  - `user_id` (uuid, nullable) - User who played the track (null for anonymous)
  - `channel_id` (uuid, nullable) - Channel context if applicable
  - `started_at` (timestamptz, not null) - When playback started
  - `completed_at` (timestamptz, nullable) - When playback completed (if finished)
  - `duration_played` (integer, nullable) - Seconds actually played
  - `total_duration` (integer, not null) - Total track duration in seconds
  - `completion_percentage` (numeric, nullable) - Percentage of track played
  - `was_skipped` (boolean, default false) - Whether track was skipped
  - `skip_position` (integer, nullable) - Position in seconds where skip occurred
  - `session_id` (text, nullable) - Session identifier for grouping plays
  - `device_type` (text, nullable) - Device category (desktop, mobile, tablet)
  - `created_at` (timestamptz, default now()) - Record creation time

  ### 2. `track_analytics_summary`
  Materialized aggregated statistics for fast queries:
  - `track_id` (text, primary key) - Track identifier
  - `total_plays` (integer, default 0) - All-time play count
  - `total_completions` (integer, default 0) - Times played to completion
  - `total_skips` (integer, default 0) - Times skipped
  - `unique_listeners` (integer, default 0) - Distinct users who played
  - `average_completion_rate` (numeric, nullable) - Average completion percentage
  - `last_played_at` (timestamptz, nullable) - Most recent play timestamp
  - `plays_last_7_days` (integer, default 0) - Plays in last week
  - `plays_last_30_days` (integer, default 0) - Plays in last month
  - `skips_last_7_days` (integer, default 0) - Skips in last week
  - `skips_last_30_days` (integer, default 0) - Skips in last month
  - `updated_at` (timestamptz, default now()) - Last summary update

  ## Indexes
  - Fast lookups by track_id, user_id, and time ranges
  - Optimized for analytics queries and reporting
  - Support for top tracks and skip rate calculations

  ## Functions
  - `update_track_analytics_summary()` - Recalculates aggregated statistics
  - `get_top_tracks()` - Returns most played tracks in time range
  - `get_top_skipped_tracks()` - Returns most skipped tracks in time range

  ## Security
  - RLS enabled on all tables
  - Admins can view all analytics data
  - Users can view their own play history
  - Anonymous plays are tracked but not user-identifiable

  ## Performance Notes
  - Indexes optimized for time-range queries
  - Summary table reduces load for common analytics queries
  - Periodic refresh of summary table recommended (e.g., hourly)
*/

-- Create track play events table
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

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_track_play_events_track_id ON track_play_events(track_id);
CREATE INDEX IF NOT EXISTS idx_track_play_events_user_id ON track_play_events(user_id);
CREATE INDEX IF NOT EXISTS idx_track_play_events_started_at ON track_play_events(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_play_events_was_skipped ON track_play_events(was_skipped);
CREATE INDEX IF NOT EXISTS idx_track_play_events_channel_id ON track_play_events(channel_id);
CREATE INDEX IF NOT EXISTS idx_track_play_events_session_id ON track_play_events(session_id);

-- Create analytics summary table
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

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_track_analytics_summary_total_plays ON track_analytics_summary(total_plays DESC);
CREATE INDEX IF NOT EXISTS idx_track_analytics_summary_total_skips ON track_analytics_summary(total_skips DESC);
CREATE INDEX IF NOT EXISTS idx_track_analytics_summary_plays_7d ON track_analytics_summary(plays_last_7_days DESC);
CREATE INDEX IF NOT EXISTS idx_track_analytics_summary_plays_30d ON track_analytics_summary(plays_last_30_days DESC);
CREATE INDEX IF NOT EXISTS idx_track_analytics_summary_last_played ON track_analytics_summary(last_played_at DESC);

-- Function to update analytics summary for a specific track
CREATE OR REPLACE FUNCTION update_track_analytics_summary(p_track_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO track_analytics_summary (
    track_id,
    total_plays,
    total_completions,
    total_skips,
    unique_listeners,
    average_completion_rate,
    last_played_at,
    plays_last_7_days,
    plays_last_30_days,
    skips_last_7_days,
    skips_last_30_days,
    updated_at
  )
  SELECT
    p_track_id,
    COUNT(*) as total_plays,
    COUNT(*) FILTER (WHERE completion_percentage >= 95) as total_completions,
    COUNT(*) FILTER (WHERE was_skipped = true) as total_skips,
    COUNT(DISTINCT user_id) as unique_listeners,
    AVG(completion_percentage) as average_completion_rate,
    MAX(started_at) as last_played_at,
    COUNT(*) FILTER (WHERE started_at >= now() - interval '7 days') as plays_last_7_days,
    COUNT(*) FILTER (WHERE started_at >= now() - interval '30 days') as plays_last_30_days,
    COUNT(*) FILTER (WHERE was_skipped = true AND started_at >= now() - interval '7 days') as skips_last_7_days,
    COUNT(*) FILTER (WHERE was_skipped = true AND started_at >= now() - interval '30 days') as skips_last_30_days,
    now() as updated_at
  FROM track_play_events
  WHERE track_id = p_track_id
  ON CONFLICT (track_id)
  DO UPDATE SET
    total_plays = EXCLUDED.total_plays,
    total_completions = EXCLUDED.total_completions,
    total_skips = EXCLUDED.total_skips,
    unique_listeners = EXCLUDED.unique_listeners,
    average_completion_rate = EXCLUDED.average_completion_rate,
    last_played_at = EXCLUDED.last_played_at,
    plays_last_7_days = EXCLUDED.plays_last_7_days,
    plays_last_30_days = EXCLUDED.plays_last_30_days,
    skips_last_7_days = EXCLUDED.skips_last_7_days,
    skips_last_30_days = EXCLUDED.skips_last_30_days,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Function to get top played tracks
CREATE OR REPLACE FUNCTION get_top_tracks(
  p_limit integer DEFAULT 10,
  p_days integer DEFAULT NULL
)
RETURNS TABLE (
  track_id text,
  play_count bigint,
  skip_count bigint,
  completion_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_days IS NULL THEN
    RETURN QUERY
    SELECT
      tpe.track_id,
      COUNT(*) as play_count,
      COUNT(*) FILTER (WHERE tpe.was_skipped = true) as skip_count,
      AVG(tpe.completion_percentage) as completion_rate
    FROM track_play_events tpe
    GROUP BY tpe.track_id
    ORDER BY play_count DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      tpe.track_id,
      COUNT(*) as play_count,
      COUNT(*) FILTER (WHERE tpe.was_skipped = true) as skip_count,
      AVG(tpe.completion_percentage) as completion_rate
    FROM track_play_events tpe
    WHERE tpe.started_at >= now() - (p_days || ' days')::interval
    GROUP BY tpe.track_id
    ORDER BY play_count DESC
    LIMIT p_limit;
  END IF;
END;
$$;

-- Function to get top skipped tracks
CREATE OR REPLACE FUNCTION get_top_skipped_tracks(
  p_limit integer DEFAULT 10,
  p_days integer DEFAULT NULL
)
RETURNS TABLE (
  track_id text,
  skip_count bigint,
  play_count bigint,
  skip_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_days IS NULL THEN
    RETURN QUERY
    SELECT
      tpe.track_id,
      COUNT(*) FILTER (WHERE tpe.was_skipped = true) as skip_count,
      COUNT(*) as play_count,
      ROUND((COUNT(*) FILTER (WHERE tpe.was_skipped = true)::numeric / NULLIF(COUNT(*), 0) * 100), 2) as skip_rate
    FROM track_play_events tpe
    GROUP BY tpe.track_id
    HAVING COUNT(*) FILTER (WHERE tpe.was_skipped = true) > 0
    ORDER BY skip_count DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      tpe.track_id,
      COUNT(*) FILTER (WHERE tpe.was_skipped = true) as skip_count,
      COUNT(*) as play_count,
      ROUND((COUNT(*) FILTER (WHERE tpe.was_skipped = true)::numeric / NULLIF(COUNT(*), 0) * 100), 2) as skip_rate
    FROM track_play_events tpe
    WHERE tpe.started_at >= now() - (p_days || ' days')::interval
    GROUP BY tpe.track_id
    HAVING COUNT(*) FILTER (WHERE tpe.was_skipped = true) > 0
    ORDER BY skip_count DESC
    LIMIT p_limit;
  END IF;
END;
$$;

-- Enable RLS on track_play_events
ALTER TABLE track_play_events ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all play events
CREATE POLICY "Admins can view all play events"
  ON track_play_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Policy: Users can view their own play events
CREATE POLICY "Users can view own play events"
  ON track_play_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Anyone can insert play events (for tracking)
CREATE POLICY "Anyone can insert play events"
  ON track_play_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Anonymous users can insert play events
CREATE POLICY "Anonymous can insert play events"
  ON track_play_events FOR INSERT
  TO anon
  WITH CHECK (true);

-- Enable RLS on track_analytics_summary
ALTER TABLE track_analytics_summary ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view analytics summary
CREATE POLICY "Admins can view analytics summary"
  ON track_analytics_summary FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Policy: Admins can update analytics summary
CREATE POLICY "Admins can update analytics summary"
  ON track_analytics_summary FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Migration: 20251019011018_add_admin_policies_for_user_profiles.sql
/*
  # Add Admin Policies for User Profiles

  1. Changes
    - Add policy allowing admins to view all user profiles
    - Add policy allowing admins to update all user profiles (including is_admin flag)
  
  2. Security
    - Policies check that the current user has is_admin = true
    - Non-admin users can still only access their own profiles via existing policies
    - Admins get full read/write access to manage users
*/

-- Policy for admins to view all user profiles
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Policy for admins to update any user profile
CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Migration: 20251019013105_fix_admin_policies_circular_dependency.sql
/*
  # Fix Admin Policies Circular Dependency
  
  1. Problem
    - Current admin policies have circular dependency: they query user_profiles to check is_admin
    - But those queries themselves must pass through RLS policies on user_profiles
    - This causes policy errors and blocks legitimate admin updates
  
  2. Solution
    - Create a SECURITY DEFINER function that bypasses RLS to check admin status
    - Update admin policies to use this function instead of direct subqueries
    - This breaks the circular dependency while maintaining security
  
  3. Security
    - Function uses SECURITY DEFINER to bypass RLS (necessary to break cycle)
    - Function only returns boolean, no data leakage possible
    - Admin status check is still secure and accurate
    - Non-admins still cannot access other users' data
*/

-- Drop existing admin policies that have circular dependency
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;

-- Create a SECURITY DEFINER function to check admin status
-- This bypasses RLS to break the circular dependency
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate admin policies using the function instead of subqueries
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Migration: 20251019141330_add_channel_energy_preferences.sql
/*
  # Add Channel Energy Level Preferences

  ## Summary
  Adds the ability to save and restore each user's preferred energy level per channel.
  This ensures that when users select "Low", "Medium", or "High" energy for a channel,
  that preference persists across sessions.

  ## Changes
  
  ### Modified Tables
  - `user_preferences`
    - Add `channel_energy_levels` (jsonb) - Stores energy preferences per channel
      Format: { "channel_id": "low"|"medium"|"high" }
    - Add `last_energy_level` (text) - Most recently used energy level globally
  
  ## Example Data
  ```json
  {
    "channel_energy_levels": {
      "d9f3b6df-27e3-4175-89ec-2108153c0bed": "low",
      "a1b2c3d4-5678-90ab-cdef-123456789abc": "high"
    },
    "last_energy_level": "low"
  }
  ```
*/
-- Added analytics migrations
