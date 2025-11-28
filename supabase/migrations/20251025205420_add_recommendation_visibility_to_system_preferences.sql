/*
  # Add Recommendation Visibility Setting to System Preferences

  1. Changes
    - Add `recommendation_visibility_sessions` column to `system_preferences` table
      - Type: integer
      - Default: 5
      - Purpose: Controls how many sessions new users see the personalized recommendation highlight

  2. Purpose
    - Allows admins to control how many times a new user sees the personalized channel recommendations frame
    - Each admin can set their own preference value (stored per-admin in their system_preferences view)
    - When users sign in, the system checks their session count against this value

  3. Security
    - No RLS changes needed (already covered by existing policies)
*/

-- Add recommendation visibility sessions column to system_preferences
ALTER TABLE system_preferences
ADD COLUMN IF NOT EXISTS recommendation_visibility_sessions integer DEFAULT 5;

-- Update the default value in the existing row
UPDATE system_preferences
SET recommendation_visibility_sessions = 5
WHERE id = 1;
