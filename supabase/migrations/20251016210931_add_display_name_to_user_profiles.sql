/*
  # Add display_name to user_profiles

  1. Changes
    - Add `display_name` column to `user_profiles` table
    - Set default value to empty string
    - Allow users to update their own display name via RLS policy

  2. Security
    - Users can update their own display_name through existing RLS policies
*/

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS display_name text DEFAULT '';
