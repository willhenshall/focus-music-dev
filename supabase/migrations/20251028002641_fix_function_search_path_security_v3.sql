/*
  # Fix Function Search Path Security

  1. Problem
    - Several functions have mutable search_path which is a security vulnerability
    - Functions: is_admin, update_user_channel_order_updated_at, get_tracks_by_ids,
      update_track_metadata_from_json, update_track_metadata_from_sidecars

  2. Solution
    - Use ALTER FUNCTION to set search_path = public on existing functions
    - This prevents schema-based injection attacks without breaking dependencies

  3. Security Impact
    - Prevents malicious schemas from intercepting function calls
    - Ensures functions only access objects in the public schema
*/

-- Fix is_admin function (no parameters version)
ALTER FUNCTION public.is_admin() SET search_path = public;

-- Fix is_admin function (with user_id parameter)
ALTER FUNCTION public.is_admin(uuid) SET search_path = public;

-- Fix update_user_channel_order_updated_at trigger function
ALTER FUNCTION public.update_user_channel_order_updated_at() SET search_path = public;

-- Fix get_tracks_by_ids function
ALTER FUNCTION public.get_tracks_by_ids(text[]) SET search_path = public;

-- Fix update_track_metadata_from_json function
ALTER FUNCTION public.update_track_metadata_from_json(uuid) SET search_path = public;

-- Fix update_track_metadata_from_sidecars function (batch version)
ALTER FUNCTION public.update_track_metadata_from_sidecars(integer, integer) SET search_path = public;

-- Fix update_track_metadata_from_sidecars function (no parameters version)
ALTER FUNCTION public.update_track_metadata_from_sidecars() SET search_path = public;
