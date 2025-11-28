/*
  # Create System Preferences Table

  1. New Tables
    - `system_preferences`
      - `id` (integer, primary key) - Always 1 (singleton pattern)
      - `show_audio_diagnostics` (boolean, default false) - Show Web Audio API diagnostics for all users
      - `show_queue` (boolean, default true) - Show music player queue for all users
      - `updated_at` (timestamptz) - Last update timestamp
      - `updated_by` (uuid) - Admin who last updated the settings

  2. Purpose
    - Store global system-wide preferences that affect all users
    - Admins can control audio interface visibility for the entire application
    - Singleton table (only one row with id=1)

  3. Security
    - Enable RLS on system_preferences table
    - Anyone can read system preferences
    - Only admins can update system preferences

  4. Notes
    - Uses singleton pattern (single row with id=1)
    - Preferences apply globally to all users
    - Replaces per-user audio preferences with system-wide settings
*/

-- Create system_preferences table
CREATE TABLE IF NOT EXISTS system_preferences (
  id integer PRIMARY KEY DEFAULT 1,
  show_audio_diagnostics boolean DEFAULT false,
  show_queue boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default row
INSERT INTO system_preferences (id, show_audio_diagnostics, show_queue)
VALUES (1, false, true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE system_preferences ENABLE ROW LEVEL SECURITY;

-- Policy for anyone to read system preferences
CREATE POLICY "Anyone can view system preferences"
  ON system_preferences FOR SELECT
  TO authenticated, anon
  USING (true);

-- Policy for admins to update system preferences
CREATE POLICY "Admins can update system preferences"
  ON system_preferences FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));