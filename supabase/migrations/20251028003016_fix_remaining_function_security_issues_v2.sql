/*
  # Fix Remaining Function Search Path Security Issues

  1. Problem
    - 6 more functions have mutable search_path
    - HTTP extension is in public schema (should be in extensions)

  2. Solution
    - Set search_path = public on all remaining functions
    - Move http extension to extensions schema

  3. Functions Fixed
    - backfill_track_metadata()
    - update_track_analytics_summary(p_track_id text)
    - get_top_tracks(p_limit integer, p_days integer)
    - get_top_skipped_tracks(p_limit integer, p_days integer)
    - update_single_track_metadata(track_uuid uuid, track_id_param text)
    - update_user_preferences_updated_at()
*/

-- Fix backfill_track_metadata function (no parameters)
ALTER FUNCTION public.backfill_track_metadata() SET search_path = public;

-- Fix update_track_analytics_summary function
ALTER FUNCTION public.update_track_analytics_summary(p_track_id text) SET search_path = public;

-- Fix get_top_tracks function
ALTER FUNCTION public.get_top_tracks(p_limit integer, p_days integer) SET search_path = public;

-- Fix get_top_skipped_tracks function
ALTER FUNCTION public.get_top_skipped_tracks(p_limit integer, p_days integer) SET search_path = public;

-- Fix update_single_track_metadata function
ALTER FUNCTION public.update_single_track_metadata(track_uuid uuid, track_id_param text) SET search_path = public;

-- Fix update_user_preferences_updated_at function
ALTER FUNCTION public.update_user_preferences_updated_at() SET search_path = public;

-- Move http extension to extensions schema
-- First create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Drop the extension from public and recreate in extensions schema
DROP EXTENSION IF EXISTS http CASCADE;
CREATE EXTENSION IF NOT EXISTS http SCHEMA extensions;
