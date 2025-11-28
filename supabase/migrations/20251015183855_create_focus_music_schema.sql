/*
  # Focus.Music Platform Schema

  ## Overview
  Complete database schema for neuroscience-based productivity music platform
  
  ## New Tables
  
  ### 1. user_profiles
  - `id` (uuid, FK to auth.users) - Primary key
  - `brain_type` (text) - Calculated from OCEAN scores
  - `ocean_openness` (integer) - Openness personality trait score (0-100)
  - `ocean_conscientiousness` (integer) - Conscientiousness score (0-100)
  - `ocean_extraversion` (integer) - Extraversion score (0-100)
  - `ocean_agreeableness` (integer) - Agreeableness score (0-100)
  - `ocean_neuroticism` (integer) - Neuroticism score (0-100)
  - `adhd_indicator` (integer) - ADHD tendency score (0-100)
  - `asd_indicator` (integer) - ASD tendency score (0-100)
  - `prefers_music` (boolean) - Whether user responds positively to music
  - `energy_preference` (text) - Preferred energy level (low/medium/high)
  - `onboarding_completed` (boolean) - Quiz completion status
  - `created_at` (timestamptz) - Profile creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. audio_channels
  - `id` (uuid) - Primary key
  - `channel_number` (integer) - Channel identifier (1-37)
  - `channel_name` (text) - Human-readable channel name
  - `description` (text) - Channel description
  - `brain_type_affinity` (text[]) - Best suited brain types
  - `neuroscience_tags` (text[]) - Focus/creativity/calm indicators
  - `created_at` (timestamptz) - Record creation timestamp

  ### 3. audio_tracks
  - `id` (uuid) - Primary key
  - `channel_id` (uuid, FK) - Reference to audio_channels
  - `energy_level` (text) - low/medium/high
  - `file_path` (text) - Supabase storage path
  - `duration_seconds` (integer) - Track duration
  - `metadata` (jsonb) - JSON sidecar data (BPM, key, instruments, etc)
  - `skip_rate` (decimal) - Aggregate skip rate from analytics
  - `created_at` (timestamptz) - Record creation timestamp

  ### 4. playlists
  - `id` (uuid) - Primary key
  - `user_id` (uuid, FK) - Reference to auth.users
  - `channel_id` (uuid, FK) - Reference to audio_channels
  - `energy_level` (text) - Playlist energy level
  - `track_sequence` (jsonb) - Ordered array of track IDs with sequencing logic
  - `generated_at` (timestamptz) - Playlist generation timestamp
  - `algorithm_version` (text) - Version of playlist algorithm used

  ### 5. listening_sessions
  - `id` (uuid) - Primary key
  - `user_id` (uuid, FK) - Reference to auth.users
  - `channel_id` (uuid, FK) - Reference to audio_channels
  - `energy_level` (text) - Session energy level
  - `started_at` (timestamptz) - Session start time
  - `ended_at` (timestamptz) - Session end time
  - `total_duration_seconds` (integer) - Session duration
  - `tracks_played` (jsonb) - Array of track IDs played
  - `tracks_skipped` (jsonb) - Array of track IDs skipped
  - `productivity_rating` (integer) - Optional user rating (1-5)

  ### 6. quiz_responses
  - `id` (uuid) - Primary key
  - `user_id` (uuid, FK) - Reference to auth.users
  - `question_number` (integer) - Question identifier (1-21)
  - `response_value` (integer) - User's response
  - `response_time_ms` (integer) - Time taken to respond
  - `created_at` (timestamptz) - Response timestamp

  ### 7. channel_recommendations
  - `id` (uuid) - Primary key
  - `user_id` (uuid, FK) - Reference to auth.users
  - `channel_id` (uuid, FK) - Reference to audio_channels
  - `confidence_score` (decimal) - Recommendation confidence (0-1)
  - `reasoning` (text) - Why this channel was recommended
  - `is_active` (boolean) - Whether recommendation is current
  - `created_at` (timestamptz) - Recommendation timestamp

  ## Security
  - Enable RLS on all tables
  - Users can read/write their own data
  - Admin role can access all data
  - Public read access for audio_channels and audio_tracks
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

-- Create audio_tracks table
CREATE TABLE IF NOT EXISTS audio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES audio_channels(id) ON DELETE CASCADE,
  energy_level text NOT NULL CHECK (energy_level IN ('low', 'medium', 'high')),
  file_path text NOT NULL,
  duration_seconds integer NOT NULL,
  metadata jsonb DEFAULT '{}',
  skip_rate decimal DEFAULT 0.0,
  created_at timestamptz DEFAULT now()
);

-- Create playlists table
CREATE TABLE IF NOT EXISTS playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE CASCADE,
  energy_level text NOT NULL,
  track_sequence jsonb NOT NULL DEFAULT '[]',
  generated_at timestamptz DEFAULT now(),
  algorithm_version text DEFAULT 'v1.0'
);

-- Create listening_sessions table
CREATE TABLE IF NOT EXISTS listening_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  energy_level text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  total_duration_seconds integer DEFAULT 0,
  tracks_played jsonb DEFAULT '[]',
  tracks_skipped jsonb DEFAULT '[]',
  productivity_rating integer CHECK (productivity_rating BETWEEN 1 AND 5)
);

-- Create quiz_responses table
CREATE TABLE IF NOT EXISTS quiz_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  question_number integer NOT NULL CHECK (question_number BETWEEN 1 AND 21),
  response_value integer NOT NULL,
  response_time_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Create channel_recommendations table
CREATE TABLE IF NOT EXISTS channel_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE CASCADE,
  confidence_score decimal NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  reasoning text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audio_tracks_channel ON audio_tracks(channel_id);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_energy ON audio_tracks(energy_level);
CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_listening_sessions_user ON listening_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_user ON quiz_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_user ON channel_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_active ON channel_recommendations(is_active) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_recommendations ENABLE ROW LEVEL SECURITY;

-- Policies for user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policies for audio_channels (public read)
CREATE POLICY "Anyone can view channels"
  ON audio_channels FOR SELECT
  TO authenticated
  USING (true);

-- Policies for audio_tracks (public read)
CREATE POLICY "Anyone can view tracks"
  ON audio_tracks FOR SELECT
  TO authenticated
  USING (true);

-- Policies for playlists
CREATE POLICY "Users can view own playlists"
  ON playlists FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own playlists"
  ON playlists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playlists"
  ON playlists FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists"
  ON playlists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for listening_sessions
CREATE POLICY "Users can view own sessions"
  ON listening_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions"
  ON listening_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON listening_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies for quiz_responses
CREATE POLICY "Users can view own quiz responses"
  ON quiz_responses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own quiz responses"
  ON quiz_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policies for channel_recommendations
CREATE POLICY "Users can view own recommendations"
  ON channel_recommendations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own recommendations"
  ON channel_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recommendations"
  ON channel_recommendations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);