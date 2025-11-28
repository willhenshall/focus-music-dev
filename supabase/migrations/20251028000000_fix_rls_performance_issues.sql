/*
  # Fix RLS Performance Issues

  1. Problem
    - Multiple RLS policies are calling auth.<function>() directly
    - This causes the function to be re-evaluated for each row, leading to poor performance at scale

  2. Solution
    - Replace all `auth.<function>()` calls with `(select auth.<function>())`
    - This ensures the function is evaluated once and the result is reused

  3. Tables Updated
    - metadata_backfill_progress
    - user_profiles
    - audio_channels
    - playlists
    - listening_sessions
    - quiz_responses
    - channel_recommendations
    - music_library_column_preferences
    - track_analytics_summary
    - quiz_questions
    - quiz_config
    - admin_tab_preferences
    - audio_tracks
    - user_preferences
    - track_play_events
    - system_preferences
    - user_channel_order
    - image_set_images
    - user_image_preferences
    - image_sets
    - slideshow_images
    - user_playback_state
    - quiz_results
*/

-- metadata_backfill_progress
DROP POLICY IF EXISTS "Allow admins to manage backfill progress" ON metadata_backfill_progress;
CREATE POLICY "Allow admins to manage backfill progress" ON metadata_backfill_progress
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- user_profiles
DROP POLICY IF EXISTS "Users can insert own profile during signup" ON user_profiles;
CREATE POLICY "Users can insert own profile during signup" ON user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

-- audio_channels
DROP POLICY IF EXISTS "Admins can delete channels" ON audio_channels;
CREATE POLICY "Admins can delete channels" ON audio_channels
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert channels" ON audio_channels;
CREATE POLICY "Admins can insert channels" ON audio_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update channels" ON audio_channels;
CREATE POLICY "Admins can update channels" ON audio_channels
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- playlists
DROP POLICY IF EXISTS "Users can create own playlists" ON playlists;
CREATE POLICY "Users can create own playlists" ON playlists
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own playlists" ON playlists;
CREATE POLICY "Users can delete own playlists" ON playlists
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own playlists" ON playlists;
CREATE POLICY "Users can update own playlists" ON playlists
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own playlists" ON playlists;
CREATE POLICY "Users can view own playlists" ON playlists
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- listening_sessions
DROP POLICY IF EXISTS "Users can create own sessions" ON listening_sessions;
CREATE POLICY "Users can create own sessions" ON listening_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own sessions" ON listening_sessions;
CREATE POLICY "Users can update own sessions" ON listening_sessions
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own sessions" ON listening_sessions;
CREATE POLICY "Users can view own sessions" ON listening_sessions
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- quiz_responses
DROP POLICY IF EXISTS "Users can create own quiz responses" ON quiz_responses;
CREATE POLICY "Users can create own quiz responses" ON quiz_responses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own quiz responses" ON quiz_responses;
CREATE POLICY "Users can view own quiz responses" ON quiz_responses
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- channel_recommendations
DROP POLICY IF EXISTS "Users can create own recommendations" ON channel_recommendations;
CREATE POLICY "Users can create own recommendations" ON channel_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own recommendations" ON channel_recommendations;
CREATE POLICY "Users can update own recommendations" ON channel_recommendations
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own recommendations" ON channel_recommendations;
CREATE POLICY "Users can view own recommendations" ON channel_recommendations
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- music_library_column_preferences
DROP POLICY IF EXISTS "Users can insert own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can insert own column preferences" ON music_library_column_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can read own column preferences" ON music_library_column_preferences
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can update own column preferences" ON music_library_column_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- track_analytics_summary
DROP POLICY IF EXISTS "Admins can update analytics summary" ON track_analytics_summary;
CREATE POLICY "Admins can update analytics summary" ON track_analytics_summary
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view analytics summary" ON track_analytics_summary;
CREATE POLICY "Admins can view analytics summary" ON track_analytics_summary
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- quiz_questions
DROP POLICY IF EXISTS "Admin users can delete quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can delete quiz questions" ON quiz_questions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can insert quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can insert quiz questions" ON quiz_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can update quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can update quiz questions" ON quiz_questions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- quiz_config
DROP POLICY IF EXISTS "Admin users can insert quiz config" ON quiz_config;
CREATE POLICY "Admin users can insert quiz config" ON quiz_config
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can update quiz config" ON quiz_config;
CREATE POLICY "Admin users can update quiz config" ON quiz_config
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- admin_tab_preferences
DROP POLICY IF EXISTS "Admin users can insert own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can insert own tab preferences" ON admin_tab_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can read own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can read own tab preferences" ON admin_tab_preferences
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can update own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can update own tab preferences" ON admin_tab_preferences
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- audio_tracks
DROP POLICY IF EXISTS "Admins can permanently delete old tracks" ON audio_tracks;
CREATE POLICY "Admins can permanently delete old tracks" ON audio_tracks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can soft delete tracks" ON audio_tracks;
CREATE POLICY "Admins can soft delete tracks" ON audio_tracks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view deleted tracks" ON audio_tracks;
CREATE POLICY "Admins can view deleted tracks" ON audio_tracks
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- user_preferences
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
CREATE POLICY "Users can read own preferences" ON user_preferences
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- track_play_events
DROP POLICY IF EXISTS "Admins can view all play events" ON track_play_events;
CREATE POLICY "Admins can view all play events" ON track_play_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can view own play events" ON track_play_events;
CREATE POLICY "Users can view own play events" ON track_play_events
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- system_preferences
DROP POLICY IF EXISTS "Admins can insert system preferences" ON system_preferences;
CREATE POLICY "Admins can insert system preferences" ON system_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update system preferences" ON system_preferences;
CREATE POLICY "Admins can update system preferences" ON system_preferences
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- user_channel_order
DROP POLICY IF EXISTS "Admins can view all channel orders" ON user_channel_order;
CREATE POLICY "Admins can view all channel orders" ON user_channel_order
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can delete own channel order" ON user_channel_order;
CREATE POLICY "Users can delete own channel order" ON user_channel_order
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own channel order" ON user_channel_order;
CREATE POLICY "Users can insert own channel order" ON user_channel_order
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own channel order" ON user_channel_order;
CREATE POLICY "Users can read own channel order" ON user_channel_order
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own channel order" ON user_channel_order;
CREATE POLICY "Users can update own channel order" ON user_channel_order
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- image_set_images
DROP POLICY IF EXISTS "Admins can manage system set images" ON image_set_images;
CREATE POLICY "Admins can manage system set images" ON image_set_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all image set images" ON image_set_images;
CREATE POLICY "Admins can view all image set images" ON image_set_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can manage their custom set images" ON image_set_images;
CREATE POLICY "Users can manage their custom set images" ON image_set_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

DROP POLICY IF EXISTS "Users can view images from their own custom sets" ON image_set_images;
CREATE POLICY "Users can view images from their own custom sets" ON image_set_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

-- user_image_preferences
DROP POLICY IF EXISTS "Admins can view all image preferences" ON user_image_preferences;
CREATE POLICY "Admins can view all image preferences" ON user_image_preferences
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can insert own image preferences" ON user_image_preferences;
CREATE POLICY "Users can insert own image preferences" ON user_image_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own image preferences" ON user_image_preferences;
CREATE POLICY "Users can update own image preferences" ON user_image_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own image preferences" ON user_image_preferences;
CREATE POLICY "Users can view own image preferences" ON user_image_preferences
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- image_sets
DROP POLICY IF EXISTS "Admins can create system image sets" ON image_sets;
CREATE POLICY "Admins can create system image sets" ON image_sets
  FOR INSERT TO authenticated
  WITH CHECK (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can delete system image sets" ON image_sets;
CREATE POLICY "Admins can delete system image sets" ON image_sets
  FOR DELETE TO authenticated
  USING (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update system image sets" ON image_sets;
CREATE POLICY "Admins can update system image sets" ON image_sets
  FOR UPDATE TO authenticated
  USING (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all image sets" ON image_sets;
CREATE POLICY "Admins can view all image sets" ON image_sets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can create their own custom image sets" ON image_sets;
CREATE POLICY "Users can create their own custom image sets" ON image_sets
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid()) AND
    is_system = false
  );

DROP POLICY IF EXISTS "Users can delete their own custom image sets" ON image_sets;
CREATE POLICY "Users can delete their own custom image sets" ON image_sets
  FOR DELETE TO authenticated
  USING (
    created_by = (select auth.uid()) AND
    is_system = false
  );

DROP POLICY IF EXISTS "Users can update their own custom image sets" ON image_sets;
CREATE POLICY "Users can update their own custom image sets" ON image_sets
  FOR UPDATE TO authenticated
  USING (
    created_by = (select auth.uid()) AND
    is_system = false
  )
  WITH CHECK (
    created_by = (select auth.uid()) AND
    is_system = false
  );

DROP POLICY IF EXISTS "Users can view their own custom image sets" ON image_sets;
CREATE POLICY "Users can view their own custom image sets" ON image_sets
  FOR SELECT TO authenticated
  USING (
    created_by = (select auth.uid()) AND
    is_system = false
  );

-- slideshow_images
DROP POLICY IF EXISTS "Admins can manage system slideshow images" ON slideshow_images;
CREATE POLICY "Admins can manage system slideshow images" ON slideshow_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all slideshow images" ON slideshow_images;
CREATE POLICY "Admins can view all slideshow images" ON slideshow_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can manage their custom slideshow images" ON slideshow_images;
CREATE POLICY "Users can manage their custom slideshow images" ON slideshow_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

DROP POLICY IF EXISTS "Users can view images from their own custom slideshow sets" ON slideshow_images;
CREATE POLICY "Users can view images from their own custom slideshow sets" ON slideshow_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

-- user_playback_state
DROP POLICY IF EXISTS "Users can delete own playback state" ON user_playback_state;
CREATE POLICY "Users can delete own playback state" ON user_playback_state
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own playback state" ON user_playback_state;
CREATE POLICY "Users can insert own playback state" ON user_playback_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own playback state" ON user_playback_state;
CREATE POLICY "Users can read own playback state" ON user_playback_state
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own playback state" ON user_playback_state;
CREATE POLICY "Users can update own playback state" ON user_playback_state
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- quiz_results
DROP POLICY IF EXISTS "Admin users can view all quiz results" ON quiz_results;
CREATE POLICY "Admin users can view all quiz results" ON quiz_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can insert their own quiz results" ON quiz_results;
CREATE POLICY "Users can insert their own quiz results" ON quiz_results
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view their own quiz results" ON quiz_results;
CREATE POLICY "Users can view their own quiz results" ON quiz_results
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
