/*
  # Comprehensive Security Fixes

  ## 1. Add Missing Foreign Key Indexes
  - Add indexes for all unindexed foreign keys to improve query performance
  - Tables affected: channel_recommendations, image_set_images, listening_sessions, 
    playlists, saved_slot_sequences, system_preferences, user_channel_order, 
    user_image_preferences, user_preferences

  ## 2. Optimize RLS Policies (Auth Function Initialization)
  - Replace `auth.uid()` with `(select auth.uid())` in all RLS policies
  - This prevents re-evaluation for each row and improves performance at scale
  - Tables affected: track_analytics_summary, track_play_events, user_channel_order,
    image_set_images, user_image_preferences, image_sets, slideshow_images

  ## 3. Remove Unused Index
  - Drop unused index `idx_slot_strategies_saved_sequence`

  ## 4. Consolidate Duplicate Permissive Policies
  - Merge multiple permissive policies into single policies per action
  - Tables affected: image_set_images, image_sets, slideshow_images

  ## 5. Enable RLS on Tables with Policies
  - Enable RLS on tables that have policies but RLS is disabled
  - Tables affected: audio_channels, audio_tracks, quiz_questions, quiz_results, user_profiles

  ## Security Notes
  - All changes improve performance and security posture
  - No data loss or breaking changes
  - Foreign key indexes improve join performance
  - RLS policy optimization reduces CPU usage at scale
*/

-- =====================================================
-- 1. ADD MISSING FOREIGN KEY INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_channel_recommendations_channel_id 
  ON public.channel_recommendations(channel_id);

CREATE INDEX IF NOT EXISTS idx_image_set_images_channel_id 
  ON public.image_set_images(channel_id) WHERE channel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listening_sessions_channel_id 
  ON public.listening_sessions(channel_id);

CREATE INDEX IF NOT EXISTS idx_playlists_channel_id 
  ON public.playlists(channel_id);

CREATE INDEX IF NOT EXISTS idx_saved_slot_sequences_created_by 
  ON public.saved_slot_sequences(created_by);

CREATE INDEX IF NOT EXISTS idx_system_preferences_updated_by 
  ON public.system_preferences(updated_by) WHERE updated_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_channel_order_channel_id 
  ON public.user_channel_order(channel_id);

CREATE INDEX IF NOT EXISTS idx_user_image_preferences_selected_slideshow_set_id 
  ON public.user_image_preferences(selected_slideshow_set_id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_last_channel_id 
  ON public.user_preferences(last_channel_id) WHERE last_channel_id IS NOT NULL;

-- =====================================================
-- 2. REMOVE UNUSED INDEX
-- =====================================================

DROP INDEX IF EXISTS public.idx_slot_strategies_saved_sequence;

-- =====================================================
-- 3. ENABLE RLS ON TABLES WITH POLICIES
-- =====================================================

ALTER TABLE public.audio_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. OPTIMIZE RLS POLICIES - track_analytics_summary
-- =====================================================

DROP POLICY IF EXISTS "View analytics summary" ON public.track_analytics_summary;

CREATE POLICY "View analytics summary" ON public.track_analytics_summary
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = (select auth.uid())
        AND user_profiles.is_admin = true
    )
  );

-- =====================================================
-- 5. OPTIMIZE RLS POLICIES - track_play_events
-- =====================================================

DROP POLICY IF EXISTS "View play events" ON public.track_play_events;

CREATE POLICY "View play events" ON public.track_play_events
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid()) 
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = (select auth.uid())
        AND user_profiles.is_admin = true
    )
  );

-- =====================================================
-- 6. OPTIMIZE RLS POLICIES - user_channel_order
-- =====================================================

DROP POLICY IF EXISTS "View channel order" ON public.user_channel_order;

CREATE POLICY "View channel order" ON public.user_channel_order
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- =====================================================
-- 7. CONSOLIDATE & OPTIMIZE RLS POLICIES - image_set_images
-- =====================================================

DROP POLICY IF EXISTS "Admins can delete system set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Admins can insert system set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Admins can update system set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Manage image set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Users can delete their custom set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Users can insert their custom set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Users can update their custom set images" ON public.image_set_images;
DROP POLICY IF EXISTS "View image set images" ON public.image_set_images;

CREATE POLICY "View all image set images" ON public.image_set_images
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Insert image set images" ON public.image_set_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = (select auth.uid())
        AND user_profiles.is_admin = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_system = false
        AND image_sets.created_by = (select auth.uid())
    )
  );

CREATE POLICY "Update image set images" ON public.image_set_images
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = (select auth.uid())
        AND user_profiles.is_admin = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_system = false
        AND image_sets.created_by = (select auth.uid())
    )
  );

CREATE POLICY "Delete image set images" ON public.image_set_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = (select auth.uid())
        AND user_profiles.is_admin = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_system = false
        AND image_sets.created_by = (select auth.uid())
    )
  );

-- =====================================================
-- 8. OPTIMIZE RLS POLICIES - user_image_preferences
-- =====================================================

DROP POLICY IF EXISTS "View image preferences" ON public.user_image_preferences;

CREATE POLICY "View image preferences" ON public.user_image_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- =====================================================
-- 9. CONSOLIDATE & OPTIMIZE RLS POLICIES - image_sets
-- =====================================================

DROP POLICY IF EXISTS "Manage image sets" ON public.image_sets;
DROP POLICY IF EXISTS "View image sets" ON public.image_sets;

CREATE POLICY "View all image sets" ON public.image_sets
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Manage image sets" ON public.image_sets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = (select auth.uid())
        AND user_profiles.is_admin = true
    )
    OR
    (is_system = false AND created_by = (select auth.uid()))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = (select auth.uid())
        AND user_profiles.is_admin = true
    )
    OR
    (is_system = false AND created_by = (select auth.uid()))
  );

-- =====================================================
-- 10. CONSOLIDATE & OPTIMIZE RLS POLICIES - slideshow_images
-- =====================================================

DROP POLICY IF EXISTS "Manage slideshow images" ON public.slideshow_images;
DROP POLICY IF EXISTS "View slideshow images" ON public.slideshow_images;

CREATE POLICY "View all slideshow images" ON public.slideshow_images
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Manage slideshow images" ON public.slideshow_images
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = (select auth.uid())
        AND user_profiles.is_admin = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_system = false
        AND image_sets.created_by = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = (select auth.uid())
        AND user_profiles.is_admin = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_system = false
        AND image_sets.created_by = (select auth.uid())
    )
  );
