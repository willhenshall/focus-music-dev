/*
  # Focus.Music Platform Schema - Foundation Tables
  
  Creates the core schema for the neuroscience-based productivity music platform.
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  brain_type text,
  ocean_openness integer DEFAULT 50,
  ocean_conscientiousness integer DEFAULT 50,
  ocean_extraversion integer DEFAULT 50,
  ocean_agreeableness integer DEFAULT 50,
  ocean_neuroticism integer DEFAULT 50,
  adhd_indicator integer DEFAULT 0,
  asd_indicator integer DEFAULT 0,
  prefers_music boolean DEFAULT true,
  energy_preference text DEFAULT 'medium',
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create audio_channels table
CREATE TABLE IF NOT EXISTS audio_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_number integer UNIQUE NOT NULL,
  channel_name text NOT NULL,
  description text,
  brain_type_affinity text[] DEFAULT '{}',
  neuroscience_tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create audio_tracks table (minimal for now)
CREATE TABLE IF NOT EXISTS audio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES audio_channels(id) ON DELETE CASCADE,
  energy_level text CHECK (energy_level IN ('low', 'medium', 'high')),
  file_path text NOT NULL,
  duration_seconds integer NOT NULL,
  metadata jsonb DEFAULT '{}',
  skip_rate decimal DEFAULT 0.0,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_audio_tracks_channel ON audio_tracks(channel_id);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_energy ON audio_tracks(energy_level);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_tracks ENABLE ROW LEVEL SECURITY;

-- Policies for user_profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can view own profile') THEN
    CREATE POLICY "Users can view own profile"
      ON user_profiles FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile"
      ON user_profiles FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile"
      ON user_profiles FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Policies for audio_channels
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audio_channels' AND policyname = 'Anyone can view channels') THEN
    CREATE POLICY "Anyone can view channels"
      ON audio_channels FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Policies for audio_tracks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audio_tracks' AND policyname = 'Anyone can view tracks') THEN
    CREATE POLICY "Anyone can view tracks"
      ON audio_tracks FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;