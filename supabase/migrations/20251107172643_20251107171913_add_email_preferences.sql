/*
  # Add Email Preferences

  1. Changes
    - Add `email_marketing_enabled` column to `user_profiles` table
      - Boolean field with default value `true`
      - Allows users to opt out of marketing emails
    
  2. Security
    - No RLS changes needed (existing policies cover new column)
    - Users can update their own email preferences
*/

-- Add email marketing preference column to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS email_marketing_enabled boolean DEFAULT true NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.email_marketing_enabled IS 'Whether user has opted in to receive marketing emails. Defaults to true.';