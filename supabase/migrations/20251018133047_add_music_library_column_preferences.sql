/*
  # Add Music Library Column Preferences

  1. New Tables
    - `music_library_column_preferences`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `visible_columns` (jsonb array of column identifiers)
      - `column_widths` (jsonb object mapping column keys to widths)
      - `sort_field` (text, current sort field)
      - `sort_direction` (text, 'asc' or 'desc')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `music_library_column_preferences` table
    - Add policy for users to read their own preferences
    - Add policy for users to insert their own preferences
    - Add policy for users to update their own preferences
*/

CREATE TABLE IF NOT EXISTS music_library_column_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visible_columns jsonb NOT NULL DEFAULT '["track_id", "track_name", "artist_name", "energy_level", "file_size", "channels"]'::jsonb,
  column_widths jsonb NOT NULL DEFAULT '{
    "checkbox": 48,
    "track_id": 180,
    "track_name": 250,
    "artist_name": 200,
    "energy_level": 120,
    "file_size": 120,
    "channels": 140
  }'::jsonb,
  sort_field text DEFAULT 'track_id',
  sort_direction text DEFAULT 'asc',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE music_library_column_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own column preferences"
  ON music_library_column_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own column preferences"
  ON music_library_column_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own column preferences"
  ON music_library_column_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
