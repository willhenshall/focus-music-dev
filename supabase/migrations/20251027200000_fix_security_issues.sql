/*
  # Fix Security Issues

  1. Performance Issues
    - Add missing indexes on foreign key columns
    - Optimize RLS policies to use (select auth.uid()) pattern
    - Fix function search paths to be immutable

  2. Security Issues
    - Move http extension out of public schema
    - Remove unused indexes (documented but not removed to avoid breaking changes)

  3. Changes
    - Add 9 missing foreign key indexes
    - Update all RLS policies to cache auth.uid() calls
    - Set search_path security on all functions
    - Move http extension to extensions schema
*/

-- ============================================================================
-- PART 1: Add Missing Foreign Key Indexes
-- ============================================================================

-- Index for audio_tracks.deleted_by
CREATE INDEX IF NOT EXISTS idx_audio_tracks_deleted_by
  ON audio_tracks(deleted_by)
  WHERE deleted_by IS NOT NULL;

-- Index for channel_recommendations.channel_id
CREATE INDEX IF NOT EXISTS idx_channel_recommendations_channel_id
  ON channel_recommendations(channel_id);

-- Index for listening_sessions.channel_id
CREATE INDEX IF NOT EXISTS idx_listening_sessions_channel_id
  ON listening_sessions(channel_id);

-- Index for playlists.channel_id
CREATE INDEX IF NOT EXISTS idx_playlists_channel_id
  ON playlists(channel_id);

-- Index for system_preferences.updated_by
CREATE INDEX IF NOT EXISTS idx_system_preferences_updated_by
  ON system_preferences(updated_by)
  WHERE updated_by IS NOT NULL;

-- Index for user_channel_order.channel_id
CREATE INDEX IF NOT EXISTS idx_user_channel_order_channel_id
  ON user_channel_order(channel_id);

-- Index for user_image_preferences.selected_image_set_id
CREATE INDEX IF NOT EXISTS idx_user_image_preferences_image_set_id
  ON user_image_preferences(selected_image_set_id)
  WHERE selected_image_set_id IS NOT NULL;

-- Index for user_playback_state.channel_id
CREATE INDEX IF NOT EXISTS idx_user_playback_state_channel_id
  ON user_playback_state(channel_id)
  WHERE channel_id IS NOT NULL;

-- Index for user_preferences.last_channel_id
CREATE INDEX IF NOT EXISTS idx_user_preferences_last_channel_id
  ON user_preferences(last_channel_id)
  WHERE last_channel_id IS NOT NULL;

-- ============================================================================
-- PART 2: Fix RLS Policies - Use (select auth.uid()) Pattern
-- ============================================================================

-- Drop and recreate user_profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own profile during signup" ON user_profiles;
CREATE POLICY "Users can insert own profile during signup"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Fix playlists policies
DROP POLICY IF EXISTS "Users can view own playlists" ON playlists;
CREATE POLICY "Users can view own playlists"
  ON playlists FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own playlists" ON playlists;
CREATE POLICY "Users can create own playlists"
  ON playlists FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own playlists" ON playlists;
CREATE POLICY "Users can update own playlists"
  ON playlists FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own playlists" ON playlists;
CREATE POLICY "Users can delete own playlists"
  ON playlists FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Fix listening_sessions policies
DROP POLICY IF EXISTS "Users can view own sessions" ON listening_sessions;
CREATE POLICY "Users can view own sessions"
  ON listening_sessions FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own sessions" ON listening_sessions;
CREATE POLICY "Users can create own sessions"
  ON listening_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own sessions" ON listening_sessions;
CREATE POLICY "Users can update own sessions"
  ON listening_sessions FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Fix quiz_responses policies
DROP POLICY IF EXISTS "Users can view own quiz responses" ON quiz_responses;
CREATE POLICY "Users can view own quiz responses"
  ON quiz_responses FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own quiz responses" ON quiz_responses;
CREATE POLICY "Users can create own quiz responses"
  ON quiz_responses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Fix channel_recommendations policies
DROP POLICY IF EXISTS "Users can view own recommendations" ON channel_recommendations;
CREATE POLICY "Users can view own recommendations"
  ON channel_recommendations FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own recommendations" ON channel_recommendations;
CREATE POLICY "Users can create own recommendations"
  ON channel_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own recommendations" ON channel_recommendations;
CREATE POLICY "Users can update own recommendations"
  ON channel_recommendations FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Fix audio_channels admin policies
DROP POLICY IF EXISTS "Admins can insert channels" ON audio_channels;
CREATE POLICY "Admins can insert channels"
  ON audio_channels FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can update channels" ON audio_channels;
CREATE POLICY "Admins can update channels"
  ON audio_channels FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can delete channels" ON audio_channels;
CREATE POLICY "Admins can delete channels"
  ON audio_channels FOR DELETE
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix user_preferences policies
DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
CREATE POLICY "Users can read own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Fix quiz_questions admin policies
DROP POLICY IF EXISTS "Admin users can insert quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can insert quiz questions"
  ON quiz_questions FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin users can update quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can update quiz questions"
  ON quiz_questions FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin users can delete quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can delete quiz questions"
  ON quiz_questions FOR DELETE
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix quiz_config admin policies
DROP POLICY IF EXISTS "Admin users can insert quiz config" ON quiz_config;
CREATE POLICY "Admin users can insert quiz config"
  ON quiz_config FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin users can update quiz config" ON quiz_config;
CREATE POLICY "Admin users can update quiz config"
  ON quiz_config FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

-- Fix quiz_results policies
DROP POLICY IF EXISTS "Users can view their own quiz results" ON quiz_results;
CREATE POLICY "Users can view their own quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own quiz results" ON quiz_results;
CREATE POLICY "Users can insert their own quiz results"
  ON quiz_results FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admin users can view all quiz results" ON quiz_results;
CREATE POLICY "Admin users can view all quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix music_library_column_preferences policies
DROP POLICY IF EXISTS "Users can read own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can read own column preferences"
  ON music_library_column_preferences FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can insert own column preferences"
  ON music_library_column_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can update own column preferences"
  ON music_library_column_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Fix admin_tab_preferences policies
DROP POLICY IF EXISTS "Admin users can read own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can read own tab preferences"
  ON admin_tab_preferences FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()) AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin users can insert own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can insert own tab preferences"
  ON admin_tab_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()) AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin users can update own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can update own tab preferences"
  ON admin_tab_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()) AND is_admin((select auth.uid())))
  WITH CHECK (user_id = (select auth.uid()) AND is_admin((select auth.uid())));

-- Fix track_play_events policies
DROP POLICY IF EXISTS "Users can view own play events" ON track_play_events;
CREATE POLICY "Users can view own play events"
  ON track_play_events FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all play events" ON track_play_events;
CREATE POLICY "Admins can view all play events"
  ON track_play_events FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix audio_tracks admin policies
DROP POLICY IF EXISTS "Admins can view deleted tracks" ON audio_tracks;
CREATE POLICY "Admins can view deleted tracks"
  ON audio_tracks FOR SELECT
  TO authenticated
  USING (deleted_at IS NOT NULL AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can soft delete tracks" ON audio_tracks;
CREATE POLICY "Admins can soft delete tracks"
  ON audio_tracks FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can permanently delete old tracks" ON audio_tracks;
CREATE POLICY "Admins can permanently delete old tracks"
  ON audio_tracks FOR DELETE
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix track_analytics_summary policies
DROP POLICY IF EXISTS "Admins can view analytics summary" ON track_analytics_summary;
CREATE POLICY "Admins can view analytics summary"
  ON track_analytics_summary FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can update analytics summary" ON track_analytics_summary;
CREATE POLICY "Admins can update analytics summary"
  ON track_analytics_summary FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

-- Fix system_preferences policies
DROP POLICY IF EXISTS "Admins can update system preferences" ON system_preferences;
CREATE POLICY "Admins can update system preferences"
  ON system_preferences FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can insert system preferences" ON system_preferences;
CREATE POLICY "Admins can insert system preferences"
  ON system_preferences FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

-- Fix user_channel_order policies
DROP POLICY IF EXISTS "Users can read own channel order" ON user_channel_order;
CREATE POLICY "Users can read own channel order"
  ON user_channel_order FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own channel order" ON user_channel_order;
CREATE POLICY "Users can insert own channel order"
  ON user_channel_order FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own channel order" ON user_channel_order;
CREATE POLICY "Users can update own channel order"
  ON user_channel_order FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own channel order" ON user_channel_order;
CREATE POLICY "Users can delete own channel order"
  ON user_channel_order FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all channel orders" ON user_channel_order;
CREATE POLICY "Admins can view all channel orders"
  ON user_channel_order FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix image_sets policies
DROP POLICY IF EXISTS "Users can view their own custom image sets" ON image_sets;
CREATE POLICY "Users can view their own custom image sets"
  ON image_sets FOR SELECT
  TO authenticated
  USING (is_custom = true AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all image sets" ON image_sets;
CREATE POLICY "Admins can view all image sets"
  ON image_sets FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can create system image sets" ON image_sets;
CREATE POLICY "Admins can create system image sets"
  ON image_sets FOR INSERT
  TO authenticated
  WITH CHECK (is_custom = false AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can create their own custom image sets" ON image_sets;
CREATE POLICY "Users can create their own custom image sets"
  ON image_sets FOR INSERT
  TO authenticated
  WITH CHECK (is_custom = true AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can update system image sets" ON image_sets;
CREATE POLICY "Admins can update system image sets"
  ON image_sets FOR UPDATE
  TO authenticated
  USING (is_custom = false AND is_admin((select auth.uid())))
  WITH CHECK (is_custom = false AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can update their own custom image sets" ON image_sets;
CREATE POLICY "Users can update their own custom image sets"
  ON image_sets FOR UPDATE
  TO authenticated
  USING (is_custom = true AND created_by = (select auth.uid()))
  WITH CHECK (is_custom = true AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can delete system image sets" ON image_sets;
CREATE POLICY "Admins can delete system image sets"
  ON image_sets FOR DELETE
  TO authenticated
  USING (is_custom = false AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can delete their own custom image sets" ON image_sets;
CREATE POLICY "Users can delete their own custom image sets"
  ON image_sets FOR DELETE
  TO authenticated
  USING (is_custom = true AND created_by = (select auth.uid()));

-- Fix image_set_images policies
DROP POLICY IF EXISTS "Users can view images from their own custom sets" ON image_set_images;
CREATE POLICY "Users can view images from their own custom sets"
  ON image_set_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can view all image set images" ON image_set_images;
CREATE POLICY "Admins can view all image set images"
  ON image_set_images FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage system set images" ON image_set_images;
CREATE POLICY "Admins can manage system set images"
  ON image_set_images FOR ALL
  TO authenticated
  USING (
    is_admin((select auth.uid())) AND
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_custom = false
    )
  )
  WITH CHECK (
    is_admin((select auth.uid())) AND
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_custom = false
    )
  );

DROP POLICY IF EXISTS "Users can manage their custom set images" ON image_set_images;
CREATE POLICY "Users can manage their custom set images"
  ON image_set_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  );

-- Fix user_image_preferences policies
DROP POLICY IF EXISTS "Users can view own image preferences" ON user_image_preferences;
CREATE POLICY "Users can view own image preferences"
  ON user_image_preferences FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own image preferences" ON user_image_preferences;
CREATE POLICY "Users can insert own image preferences"
  ON user_image_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own image preferences" ON user_image_preferences;
CREATE POLICY "Users can update own image preferences"
  ON user_image_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all image preferences" ON user_image_preferences;
CREATE POLICY "Admins can view all image preferences"
  ON user_image_preferences FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix slideshow_images policies
DROP POLICY IF EXISTS "Users can view images from their own custom slideshow sets" ON slideshow_images;
CREATE POLICY "Users can view images from their own custom slideshow sets"
  ON slideshow_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can view all slideshow images" ON slideshow_images;
CREATE POLICY "Admins can view all slideshow images"
  ON slideshow_images FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage system slideshow images" ON slideshow_images;
CREATE POLICY "Admins can manage system slideshow images"
  ON slideshow_images FOR ALL
  TO authenticated
  USING (
    is_admin((select auth.uid())) AND
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_custom = false
    )
  )
  WITH CHECK (
    is_admin((select auth.uid())) AND
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_custom = false
    )
  );

DROP POLICY IF EXISTS "Users can manage their custom slideshow images" ON slideshow_images;
CREATE POLICY "Users can manage their custom slideshow images"
  ON slideshow_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  );

-- Fix user_playback_state policies
DROP POLICY IF EXISTS "Users can read own playback state" ON user_playback_state;
CREATE POLICY "Users can read own playback state"
  ON user_playback_state FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own playback state" ON user_playback_state;
CREATE POLICY "Users can insert own playback state"
  ON user_playback_state FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own playback state" ON user_playback_state;
CREATE POLICY "Users can update own playback state"
  ON user_playback_state FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own playback state" ON user_playback_state;
CREATE POLICY "Users can delete own playback state"
  ON user_playback_state FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- PART 3: Fix Function Security - Set search_path
-- ============================================================================

-- Fix is_admin function
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE user_profiles.user_id = is_admin.user_id
      AND user_profiles.is_admin = true
  );
END;
$$;

-- Fix get_tracks_by_ids function
CREATE OR REPLACE FUNCTION get_tracks_by_ids(track_ids uuid[])
RETURNS SETOF audio_tracks
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM audio_tracks
  WHERE id = ANY(track_ids)
    AND deleted_at IS NULL;
$$;

-- Fix update_user_channel_order_updated_at trigger function
CREATE OR REPLACE FUNCTION update_user_channel_order_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix update_user_preferences_updated_at trigger function
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix update_track_analytics_summary function
CREATE OR REPLACE FUNCTION update_track_analytics_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert or update summary for the track
  INSERT INTO track_analytics_summary (
    track_id,
    total_plays,
    unique_users,
    total_listen_time_seconds,
    total_skips,
    plays_last_7_days,
    plays_last_30_days,
    last_played_at
  )
  SELECT
    NEW.track_id,
    COUNT(*) as total_plays,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(listen_duration_seconds) as total_listen_time,
    SUM(CASE WHEN was_skipped THEN 1 ELSE 0 END) as total_skips,
    COUNT(CASE WHEN played_at >= NOW() - INTERVAL '7 days' THEN 1 END) as plays_7d,
    COUNT(CASE WHEN played_at >= NOW() - INTERVAL '30 days' THEN 1 END) as plays_30d,
    MAX(played_at) as last_played
  FROM track_play_events
  WHERE track_id = NEW.track_id
  ON CONFLICT (track_id)
  DO UPDATE SET
    total_plays = EXCLUDED.total_plays,
    unique_users = EXCLUDED.unique_users,
    total_listen_time_seconds = EXCLUDED.total_listen_time_seconds,
    total_skips = EXCLUDED.total_skips,
    plays_last_7_days = EXCLUDED.plays_last_7_days,
    plays_last_30_days = EXCLUDED.plays_last_30_days,
    last_played_at = EXCLUDED.last_played_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Fix get_top_tracks function
CREATE OR REPLACE FUNCTION get_top_tracks(
  days_back integer DEFAULT 30,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  track_id uuid,
  play_count bigint,
  unique_listeners bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    track_id,
    COUNT(*) as play_count,
    COUNT(DISTINCT user_id) as unique_listeners
  FROM track_play_events
  WHERE played_at >= NOW() - (days_back || ' days')::interval
  GROUP BY track_id
  ORDER BY play_count DESC
  LIMIT limit_count;
$$;

-- Fix get_top_skipped_tracks function
CREATE OR REPLACE FUNCTION get_top_skipped_tracks(
  days_back integer DEFAULT 30,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  track_id uuid,
  skip_count bigint,
  total_plays bigint,
  skip_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    track_id,
    SUM(CASE WHEN was_skipped THEN 1 ELSE 0 END) as skip_count,
    COUNT(*) as total_plays,
    ROUND(
      SUM(CASE WHEN was_skipped THEN 1 ELSE 0 END)::numeric /
      NULLIF(COUNT(*), 0) * 100,
      2
    ) as skip_rate
  FROM track_play_events
  WHERE played_at >= NOW() - (days_back || ' days')::interval
  GROUP BY track_id
  HAVING SUM(CASE WHEN was_skipped THEN 1 ELSE 0 END) > 0
  ORDER BY skip_count DESC
  LIMIT limit_count;
$$;

-- ============================================================================
-- PART 4: Move HTTP Extension Out of Public Schema
-- ============================================================================

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move http extension to extensions schema
DO $$
BEGIN
  -- Check if http extension exists in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension
    WHERE extname = 'http'
    AND extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    -- Drop from public and recreate in extensions schema
    DROP EXTENSION IF EXISTS http CASCADE;
    CREATE EXTENSION IF NOT EXISTS http SCHEMA extensions;
  ELSE
    -- Just ensure it exists in extensions schema
    CREATE EXTENSION IF NOT EXISTS http SCHEMA extensions;
  END IF;
END $$;

-- Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
