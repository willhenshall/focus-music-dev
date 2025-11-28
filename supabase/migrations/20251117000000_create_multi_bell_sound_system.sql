/*
  # Create Multi-Bell Sound Management System

  1. New Tables
    - `timer_bell_sounds` - Stores multiple bell sound options that admins can upload
      - `id` (uuid, primary key)
      - `name` (text) - Display name for the bell sound
      - `storage_path` (text) - Path in Supabase storage
      - `public_url` (text) - Public URL for audio playback
      - `file_size` (integer) - File size in bytes
      - `format` (text) - Audio format (mp3, wav, ogg, webm)
      - `duration` (numeric) - Audio duration in seconds
      - `is_visible` (boolean) - Whether visible to users (default true)
      - `sort_order` (integer) - Display order for admin/user selection
      - `is_default` (boolean) - Whether this is the default bell
      - `uploaded_by` (uuid) - Admin user who uploaded
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `user_bell_preferences` - Stores individual user bell sound preferences
      - `id` (uuid, primary key)
      - `user_id` (uuid) - References auth.users
      - `bell_sound_id` (uuid) - References timer_bell_sounds, nullable for default
      - `volume` (integer) - Volume level 0-100
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Admins can manage all bell sounds
    - Users can read visible bell sounds
    - Users can manage their own preferences
    - Authenticated users can read their own preferences

  3. Migration Strategy
    - Migrate existing timer_bell_url from system_preferences if exists
    - Create default "Built-in Bell" entry for programmatic fallback
*/

-- Create timer_bell_sounds table
CREATE TABLE IF NOT EXISTS timer_bell_sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  storage_path text,
  public_url text,
  file_size integer,
  format text,
  duration numeric(6,2),
  is_visible boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  is_default boolean DEFAULT false,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_bell_preferences table
CREATE TABLE IF NOT EXISTS user_bell_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  bell_sound_id uuid REFERENCES timer_bell_sounds(id) ON DELETE SET NULL,
  volume integer DEFAULT 80 CHECK (volume >= 0 AND volume <= 100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_timer_bell_sounds_visible ON timer_bell_sounds(is_visible, sort_order);
CREATE INDEX IF NOT EXISTS idx_timer_bell_sounds_default ON timer_bell_sounds(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_user_bell_preferences_user_id ON user_bell_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bell_preferences_bell_sound_id ON user_bell_preferences(bell_sound_id);

-- Enable Row Level Security
ALTER TABLE timer_bell_sounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bell_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for timer_bell_sounds

-- Admins can do everything with bell sounds
CREATE POLICY "Admins can view all timer bell sounds"
  ON timer_bell_sounds FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert timer bell sounds"
  ON timer_bell_sounds FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update timer bell sounds"
  ON timer_bell_sounds FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete timer bell sounds"
  ON timer_bell_sounds FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Users can view visible bell sounds
CREATE POLICY "Users can view visible timer bell sounds"
  ON timer_bell_sounds FOR SELECT
  TO authenticated
  USING (is_visible = true);

-- RLS Policies for user_bell_preferences

-- Users can view their own preferences
CREATE POLICY "Users can view own bell preferences"
  ON user_bell_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own preferences
CREATE POLICY "Users can insert own bell preferences"
  ON user_bell_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own preferences
CREATE POLICY "Users can update own bell preferences"
  ON user_bell_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own preferences
CREATE POLICY "Users can delete own bell preferences"
  ON user_bell_preferences FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all user preferences
CREATE POLICY "Admins can view all bell preferences"
  ON user_bell_preferences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Enable realtime for user_bell_preferences
ALTER PUBLICATION supabase_realtime ADD TABLE user_bell_preferences;

-- Migrate existing timer_bell_url from system_preferences if it exists
DO $$
DECLARE
  existing_bell_url text;
  migrated_bell_id uuid;
BEGIN
  -- Check if system_preferences table exists and has timer_bell_url
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_preferences'
    AND column_name = 'timer_bell_url'
  ) THEN
    -- Get existing bell URL
    SELECT timer_bell_url INTO existing_bell_url
    FROM system_preferences
    WHERE id = 1
    AND timer_bell_url IS NOT NULL
    LIMIT 1;

    -- If there's an existing bell, migrate it
    IF existing_bell_url IS NOT NULL THEN
      -- Extract filename from URL for name
      INSERT INTO timer_bell_sounds (
        name,
        public_url,
        storage_path,
        is_visible,
        sort_order,
        is_default,
        format
      ) VALUES (
        'Migrated Custom Bell',
        existing_bell_url,
        split_part(existing_bell_url, '/timer-bell/', 2),
        true,
        0,
        true,
        CASE
          WHEN existing_bell_url LIKE '%.mp3' THEN 'mp3'
          WHEN existing_bell_url LIKE '%.wav' THEN 'wav'
          WHEN existing_bell_url LIKE '%.ogg' THEN 'ogg'
          WHEN existing_bell_url LIKE '%.webm' THEN 'webm'
          ELSE 'unknown'
        END
      )
      RETURNING id INTO migrated_bell_id;

      RAISE NOTICE 'Migrated existing bell sound with ID: %', migrated_bell_id;
    END IF;
  END IF;
END $$;

-- Create default built-in bell entry (represents programmatic bell)
INSERT INTO timer_bell_sounds (
  name,
  storage_path,
  public_url,
  is_visible,
  sort_order,
  is_default,
  format
) VALUES (
  'Built-in Bell (Default)',
  NULL,
  NULL,
  true,
  999,
  CASE WHEN NOT EXISTS (SELECT 1 FROM timer_bell_sounds WHERE is_default = true) THEN true ELSE false END,
  'programmatic'
)
ON CONFLICT DO NOTHING;

-- Add helpful comments
COMMENT ON TABLE timer_bell_sounds IS 'Stores multiple timer bell sound options uploaded by admins';
COMMENT ON TABLE user_bell_preferences IS 'Stores individual user preferences for timer bell sound and volume';
COMMENT ON COLUMN timer_bell_sounds.is_default IS 'Indicates the default bell sound when user has no preference';
COMMENT ON COLUMN timer_bell_sounds.is_visible IS 'Controls whether the bell sound appears in user selection';
COMMENT ON COLUMN user_bell_preferences.bell_sound_id IS 'References selected bell sound; NULL means use default';
COMMENT ON COLUMN user_bell_preferences.volume IS 'Volume level from 0-100';
