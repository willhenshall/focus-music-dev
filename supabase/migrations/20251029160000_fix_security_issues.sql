/*
  # Fix Security Issues

  1. Foreign Key Indexes
    - Add missing index on saved_slot_sequences.channel_id

  2. Remove Unused Indexes
    - Drop indexes that have not been used and are causing overhead

  3. Consolidate Multiple Permissive Policies
    - Replace multiple permissive SELECT policies with single optimized policies
    - Keep admin and user access patterns efficient

  4. Fix Function Security
    - Set search_path on functions to prevent SQL injection

  5. Notes
    - Leaked password protection must be enabled via Supabase Dashboard:
      Authentication > Settings > Enable "Leaked Password Protection"
*/

-- =====================================================
-- 1. ADD MISSING FOREIGN KEY INDEX
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_saved_sequences_channel_id
  ON public.saved_slot_sequences(channel_id);

-- =====================================================
-- 2. DROP UNUSED INDEXES
-- =====================================================

DROP INDEX IF EXISTS public.idx_track_play_events_was_skipped;
DROP INDEX IF EXISTS public.idx_track_play_events_session_id;
DROP INDEX IF EXISTS public.idx_track_analytics_summary_total_skips;
DROP INDEX IF EXISTS public.idx_track_analytics_summary_plays_7d;
DROP INDEX IF EXISTS public.idx_track_analytics_summary_plays_30d;
DROP INDEX IF EXISTS public.idx_track_analytics_summary_last_played;
DROP INDEX IF EXISTS public.idx_system_preferences_updated_by;
DROP INDEX IF EXISTS public.idx_user_channel_order_channel_id;
DROP INDEX IF EXISTS public.idx_user_image_preferences_slideshow_set_id;
DROP INDEX IF EXISTS public.idx_user_preferences_channel_energy;
DROP INDEX IF EXISTS public.idx_channel_recommendations_channel_id;
DROP INDEX IF EXISTS public.idx_listening_sessions_channel_id;
DROP INDEX IF EXISTS public.idx_playlists_channel_id;
DROP INDEX IF EXISTS public.idx_user_preferences_last_channel_id;
DROP INDEX IF EXISTS public.idx_audio_channels_intensity;
DROP INDEX IF EXISTS public.idx_image_set_images_channel;
DROP INDEX IF EXISTS public.idx_saved_sequences_created_by;
DROP INDEX IF EXISTS public.idx_saved_sequences_name;
DROP INDEX IF EXISTS public.idx_quiz_results_brain_type;

-- =====================================================
-- 3. CONSOLIDATE MULTIPLE PERMISSIVE POLICIES
-- =====================================================

-- audio_tracks: Consolidate 3 SELECT policies into 1
DROP POLICY IF EXISTS "Anyone can view tracks" ON public.audio_tracks;
DROP POLICY IF EXISTS "Users can view non-deleted tracks" ON public.audio_tracks;
DROP POLICY IF EXISTS "Admins can view deleted tracks" ON public.audio_tracks;

CREATE POLICY "Users can view audio tracks"
  ON public.audio_tracks
  FOR SELECT
  TO authenticated
  USING (
    -- Admins can see everything including deleted
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    -- Regular users can only see non-deleted tracks
    deleted_at IS NULL
  );

-- image_set_images: Consolidate 5 SELECT policies into 1
DROP POLICY IF EXISTS "Admins can manage system set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Admins can view all image set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Anyone can view images from active system sets" ON public.image_set_images;
DROP POLICY IF EXISTS "Users can manage their custom set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Users can view images from their own custom sets" ON public.image_set_images;

CREATE POLICY "View image set images"
  ON public.image_set_images
  FOR SELECT
  TO authenticated
  USING (
    -- Admins can see all
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    -- Users can see system sets that are active
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE is_system = true
        AND is_active = true
      )
    )
    OR
    -- Users can see their own custom sets
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  );

CREATE POLICY "Manage image set images"
  ON public.image_set_images
  FOR ALL
  TO authenticated
  USING (
    -- Admins can manage all
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    -- Users can manage their custom sets
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    -- Same conditions for insert/update
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  );

-- image_sets: Consolidate policies
DROP POLICY IF EXISTS "Admins can view all image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Anyone can view active system image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Users can view their own custom image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Admins can create system image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Users can create their own custom image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Admins can update system image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Users can update their own custom image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Admins can delete system image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Users can delete their own custom image sets" ON public.image_sets;

CREATE POLICY "View image sets"
  ON public.image_sets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    (is_system = true AND is_active = true)
    OR
    created_by = auth.uid()
  );

CREATE POLICY "Manage image sets"
  ON public.image_sets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    created_by = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    created_by = auth.uid()
  );

-- quiz_results: Consolidate 2 SELECT policies
DROP POLICY IF EXISTS "Admin users can view all quiz results" ON public.quiz_results;
DROP POLICY IF EXISTS "Users can view their own quiz results" ON public.quiz_results;

CREATE POLICY "View quiz results"
  ON public.quiz_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    user_id = auth.uid()
  );

-- slideshow_images: Consolidate policies
DROP POLICY IF EXISTS "Admins can manage system slideshow images" ON public.slideshow_images;
DROP POLICY IF EXISTS "Admins can view all slideshow images" ON public.slideshow_images;
DROP POLICY IF EXISTS "Anyone can view images from active system slideshow sets" ON public.slideshow_images;
DROP POLICY IF EXISTS "Users can manage their custom slideshow images" ON public.slideshow_images;
DROP POLICY IF EXISTS "Users can view images from their own custom slideshow sets" ON public.slideshow_images;

CREATE POLICY "View slideshow images"
  ON public.slideshow_images
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE is_system = true
        AND is_active = true
      )
    )
    OR
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  );

CREATE POLICY "Manage slideshow images"
  ON public.slideshow_images
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  );

-- slot_* tables: Consolidate admin/user view policies
DROP POLICY IF EXISTS "Admins can manage slot boosts" ON public.slot_boosts;
DROP POLICY IF EXISTS "Users can view slot boosts" ON public.slot_boosts;

CREATE POLICY "View slot boosts"
  ON public.slot_boosts
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage slot definitions" ON public.slot_definitions;
DROP POLICY IF EXISTS "Users can view slot definitions" ON public.slot_definitions;

CREATE POLICY "View slot definitions"
  ON public.slot_definitions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage slot rule groups" ON public.slot_rule_groups;
DROP POLICY IF EXISTS "Users can view slot rule groups" ON public.slot_rule_groups;

CREATE POLICY "View slot rule groups"
  ON public.slot_rule_groups
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage slot rules" ON public.slot_rules;
DROP POLICY IF EXISTS "Users can view slot rules" ON public.slot_rules;

CREATE POLICY "View slot rules"
  ON public.slot_rules
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage slot strategies" ON public.slot_strategies;
DROP POLICY IF EXISTS "Users can view slot strategies" ON public.slot_strategies;

CREATE POLICY "View slot strategies"
  ON public.slot_strategies
  FOR SELECT
  TO authenticated
  USING (true);

-- track_analytics_summary: Consolidate policies
DROP POLICY IF EXISTS "Admins can update analytics summary" ON public.track_analytics_summary;
DROP POLICY IF EXISTS "Admins can view analytics summary" ON public.track_analytics_summary;

CREATE POLICY "View analytics summary"
  ON public.track_analytics_summary
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- track_play_events: Consolidate policies
DROP POLICY IF EXISTS "Admins can view all play events" ON public.track_play_events;
DROP POLICY IF EXISTS "Users can view own play events" ON public.track_play_events;

CREATE POLICY "View play events"
  ON public.track_play_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    user_id = auth.uid()
  );

-- user_channel_order: Consolidate policies
DROP POLICY IF EXISTS "Admins can view all channel orders" ON public.user_channel_order;
DROP POLICY IF EXISTS "Users can read own channel order" ON public.user_channel_order;

CREATE POLICY "View channel order"
  ON public.user_channel_order
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    user_id = auth.uid()
  );

-- user_image_preferences: Consolidate policies
DROP POLICY IF EXISTS "Admins can view all image preferences" ON public.user_image_preferences;
DROP POLICY IF EXISTS "Users can view own image preferences" ON public.user_image_preferences;

CREATE POLICY "View image preferences"
  ON public.user_image_preferences
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    user_id = auth.uid()
  );

-- user_profiles: Consolidate policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

CREATE POLICY "View profiles"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_admin = true
    )
    OR
    id = auth.uid()
  );

CREATE POLICY "Update profiles"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_admin = true
    )
    OR
    id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_admin = true
    )
    OR
    id = auth.uid()
  );

-- =====================================================
-- 4. FIX FUNCTION SEARCH PATHS
-- =====================================================

-- Recreate is_admin function with secure search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$;

-- Recreate update_saved_sequences_updated_at with secure search_path
CREATE OR REPLACE FUNCTION public.update_saved_sequences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =====================================================
-- SECURITY NOTES
-- =====================================================

-- To enable Leaked Password Protection:
-- 1. Go to Supabase Dashboard
-- 2. Navigate to: Authentication > Settings
-- 3. Enable "Leaked Password Protection"
-- 4. This will check passwords against HaveIBeenPwned.org database
