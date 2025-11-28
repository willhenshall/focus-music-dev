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
