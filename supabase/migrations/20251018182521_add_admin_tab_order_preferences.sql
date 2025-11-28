/*
  # Add Admin Tab Order Preferences

  1. New Tables
    - `admin_tab_preferences`
      - `user_id` (uuid, primary key, foreign key to auth.users)
      - `tab_order` (jsonb) - Stores the ordered array of tab identifiers
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `admin_tab_preferences` table
    - Add policy for admin users to read their own preferences
    - Add policy for admin users to insert their own preferences
    - Add policy for admin users to update their own preferences
*/

CREATE TABLE IF NOT EXISTS admin_tab_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tab_order jsonb NOT NULL DEFAULT '["analytics", "channels", "library", "users", "channel-images", "quiz"]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE admin_tab_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can read own tab preferences"
  ON admin_tab_preferences
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can insert own tab preferences"
  ON admin_tab_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update own tab preferences"
  ON admin_tab_preferences
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_admin_tab_preferences_user_id ON admin_tab_preferences(user_id);
