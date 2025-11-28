-- ============================================================================
-- TIMER BELL MANAGEMENT SYSTEM - COMPLETE MIGRATION
-- Copy everything below this line and paste into Supabase SQL Editor
-- ============================================================================

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_timer_bell_sounds_visible ON timer_bell_sounds(is_visible, sort_order);
CREATE INDEX IF NOT EXISTS idx_timer_bell_sounds_default ON timer_bell_sounds(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_user_bell_preferences_user_id ON user_bell_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bell_preferences_bell_sound_id ON user_bell_preferences(bell_sound_id);

-- Enable RLS
ALTER TABLE timer_bell_sounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bell_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for timer_bell_sounds
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

CREATE POLICY "Users can view visible timer bell sounds"
  ON timer_bell_sounds FOR SELECT
  TO authenticated
  USING (is_visible = true);

-- RLS Policies for user_bell_preferences
CREATE POLICY "Users can view own bell preferences"
  ON user_bell_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own bell preferences"
  ON user_bell_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own bell preferences"
  ON user_bell_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own bell preferences"
  ON user_bell_preferences FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

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

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE user_bell_preferences;

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('timer-bell', 'timer-bell', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Anyone can view timer bell audio'
  ) THEN
    CREATE POLICY "Anyone can view timer bell audio"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'timer-bell');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Admins can upload timer bell audio'
  ) THEN
    CREATE POLICY "Admins can upload timer bell audio"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'timer-bell'
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Admins can update timer bell audio'
  ) THEN
    CREATE POLICY "Admins can update timer bell audio"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'timer-bell'
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Admins can delete timer bell audio'
  ) THEN
    CREATE POLICY "Admins can delete timer bell audio"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'timer-bell'
        AND EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.is_admin = true
        )
      );
  END IF;
END $$;

-- Add timer_bell_url to system_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'system_preferences'
    AND column_name = 'timer_bell_url'
  ) THEN
    ALTER TABLE system_preferences ADD COLUMN timer_bell_url text;
  END IF;
END $$;

-- Migrate existing timer_bell_url if it exists
DO $$
DECLARE
  existing_bell_url text;
  migrated_bell_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_preferences'
    AND column_name = 'timer_bell_url'
  ) THEN
    SELECT timer_bell_url INTO existing_bell_url
    FROM system_preferences
    WHERE id = 1
    AND timer_bell_url IS NOT NULL
    LIMIT 1;

    IF existing_bell_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM timer_bell_sounds WHERE public_url = existing_bell_url) THEN
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
    END IF;
  END IF;
END $$;

-- Create default built-in bell
INSERT INTO timer_bell_sounds (
  name,
  storage_path,
  public_url,
  is_visible,
  sort_order,
  is_default,
  format
)
SELECT
  'Built-in Bell (Default)',
  NULL,
  NULL,
  true,
  999,
  NOT EXISTS (SELECT 1 FROM timer_bell_sounds WHERE is_default = true),
  'programmatic'
WHERE NOT EXISTS (
  SELECT 1 FROM timer_bell_sounds WHERE name = 'Built-in Bell (Default)'
);

-- ============================================================================
-- MIGRATION COMPLETE
-- After running this, verify with: SELECT count(*) FROM timer_bell_sounds;
-- You should see at least 1 row (the Built-in Bell)
-- ============================================================================
