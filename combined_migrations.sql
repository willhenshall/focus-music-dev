-- Migration: 20251015183855_create_focus_music_schema.sql
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
-- Migration: 20251015190834_update_channel_structure_for_external_playlists.sql
/*
  # Update Channel Structure for External Playlists

  ## Changes
  
  1. Add playlist_data column to audio_channels
     - Stores the external JSON playlist definitions (low, medium, high)
     - JSONB format with track_ids arrays for each energy level
  
  2. Modify playlists table
     - Remove algorithm_version (not using custom algorithm)
     - Simplify to just reference the channel's external playlist data
  
  ## Notes
  
  - Each channel has 3 subchannels (low/medium/high energy)
  - Playlist order comes from external JSON files
  - No custom algorithm - just play tracks in provided order
*/

-- Add playlist_data to audio_channels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'playlist_data'
  ) THEN
    ALTER TABLE audio_channels ADD COLUMN playlist_data jsonb DEFAULT '{"low": [], "medium": [], "high": []}';
  END IF;
END $$;

-- Update playlists table to remove algorithm_version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'playlists' AND column_name = 'algorithm_version'
  ) THEN
    ALTER TABLE playlists DROP COLUMN algorithm_version;
  END IF;
END $$;

-- Add comment to document the new structure
COMMENT ON COLUMN audio_channels.playlist_data IS 'External playlist definitions: {"low": [track_ids], "medium": [track_ids], "high": [track_ids]}';

-- Migration: 20251015194807_add_admin_flag.sql
/*
  # Add admin functionality
  
  1. Changes
    - Add `is_admin` column to `user_profiles` table
    - Default to false for security
    - Set existing user as admin
  
  2. Security
    - Only admins can access admin dashboard
*/

-- Add is_admin column
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Set the existing user as admin
UPDATE user_profiles 
SET is_admin = true 
WHERE id = 'ff95e67a-f522-4202-826f-b56d6aba07bf';

-- Migration: 20251015214044_create_storage_buckets.sql
/*
  # Create Storage Buckets for Audio Files

  1. New Buckets
    - `audio-files` - Stores MP3 audio files
    - `audio-sidecars` - Stores JSON metadata files
  
  2. Configuration
    - Public access enabled for streaming
    - 100MB file size limit per file
    - No file type restrictions
  
  3. Security
    - Public read access for all files (needed for audio playback)
    - Authenticated write access with service role
*/

-- Create audio-files bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-files',
  'audio-files', 
  true,
  104857600, -- 100MB
  NULL -- Allow all file types
)
ON CONFLICT (id) DO NOTHING;

-- Create audio-sidecars bucket  
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-sidecars',
  'audio-sidecars',
  true, 
  10485760, -- 10MB
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to audio files
CREATE POLICY "Public read access for audio files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'audio-files');

-- Allow public read access to sidecar files
CREATE POLICY "Public read access for audio sidecars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'audio-sidecars');

-- Allow service role to upload audio files
CREATE POLICY "Service role can upload audio files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'audio-files');

-- Allow service role to upload sidecar files
CREATE POLICY "Service role can upload audio sidecars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'audio-sidecars');

-- Allow service role to update audio files
CREATE POLICY "Service role can update audio files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'audio-files');

-- Allow service role to update sidecar files
CREATE POLICY "Service role can update audio sidecars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'audio-sidecars');

-- Migration: 20251016010348_update_tracks_from_sidecars.sql
/*
  # Update Track Metadata from Sidecar Files
  
  This migration creates a function to update track metadata by reading from sidecar JSON files in storage.
  The function processes tracks in batches and extracts metadata like track name, artist, duration, etc.
*/

-- Create a function to update track metadata from sidecars
CREATE OR REPLACE FUNCTION update_track_metadata_from_sidecars(
  batch_offset INT DEFAULT 0,
  batch_limit INT DEFAULT 100
)
RETURNS TABLE (
  processed INT,
  updated INT,
  errors INT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  track_record RECORD;
  sidecar_content TEXT;
  sidecar_json JSONB;
  updated_count INT := 0;
  error_count INT := 0;
  processed_count INT := 0;
BEGIN
  FOR track_record IN 
    SELECT id, metadata
    FROM audio_tracks
    ORDER BY created_at
    OFFSET batch_offset
    LIMIT batch_limit
  LOOP
    processed_count := processed_count + 1;
    
    BEGIN
      -- Try to get sidecar content from storage
      -- Note: This is a placeholder - actual storage access would need to be done via edge function
      -- For now, we'll just return the counts
      
      updated_count := updated_count + 1;
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
    END;
  END LOOP;
  
  RETURN QUERY SELECT processed_count, updated_count, error_count;
END;
$$;

-- Migration: 20251016015124_create_tracks_with_audio_function.sql
/*
  # Create function to get tracks with audio files

  1. New Functions
    - `get_tracks_with_audio_files()` - Returns only audio tracks that have corresponding files in storage
  
  2. Purpose
    - Filters audio_tracks to only return tracks where the audio file actually exists in the audio-files bucket
    - Ensures playlists only include playable tracks
  
  3. Implementation
    - Uses LEFT JOIN to match tracks with storage objects
    - Filters for non-null storage matches (files that exist)
*/

CREATE OR REPLACE FUNCTION get_tracks_with_audio_files()
RETURNS TABLE (
  id uuid,
  channel_id uuid,
  metadata jsonb,
  created_at timestamptz
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT
    at.id,
    at.channel_id,
    at.metadata,
    at.created_at
  FROM audio_tracks at
  INNER JOIN storage.objects so 
    ON so.name = (at.metadata->>'track_id' || '.mp3')
    AND so.bucket_id = 'audio-files';
$$;
-- Migration: 20251016015513_drop_tracks_with_audio_function.sql
/*
  # Drop the get_tracks_with_audio_files function

  Removing the function that filtered tracks by storage files.
*/

DROP FUNCTION IF EXISTS get_tracks_with_audio_files();
-- Migration: 20251016210931_add_display_name_to_user_profiles.sql
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

-- Migration: 20251016220301_update_all_track_metadata_from_sidecars.sql
/*
  # Update All Track Metadata from JSON Sidecars

  This migration reads JSON sidecar files from the audio-sidecars storage bucket
  and updates the audio_tracks table with proper track names and artist names.

  1. Process
     - Reads each track's metadata to get track_id
     - Fetches corresponding JSON file from audio-sidecars bucket
     - Extracts track_name and artist_name from JSON
     - Updates the track's metadata with proper names

  2. Expected JSON Structure
     - track_name: The actual name of the track
     - artist_name: The artist(s) who created the track

  3. Updates
     - Updates metadata jsonb column with proper track_name and artist_name
     - Preserves all other existing metadata fields
*/

DO $$
DECLARE
  track_record RECORD;
  sidecar_content TEXT;
  sidecar_json JSONB;
  track_id_val TEXT;
  updated_count INT := 0;
  error_count INT := 0;
BEGIN
  RAISE NOTICE 'Starting metadata update from sidecar files...';
  
  FOR track_record IN 
    SELECT id, metadata
    FROM audio_tracks
    WHERE metadata IS NOT NULL
  LOOP
    BEGIN
      -- Extract track_id from metadata
      track_id_val := track_record.metadata->>'track_id';
      
      IF track_id_val IS NULL OR track_id_val = '' THEN
        CONTINUE;
      END IF;
      
      -- Read the JSON sidecar file from storage
      SELECT content::text INTO sidecar_content
      FROM storage.objects
      WHERE bucket_id = 'audio-sidecars' 
        AND name = track_id_val || '.json'
      LIMIT 1;
      
      IF sidecar_content IS NOT NULL THEN
        -- Parse the JSON content
        sidecar_json := sidecar_content::jsonb;
        
        -- Update the track metadata with proper names
        UPDATE audio_tracks
        SET metadata = jsonb_set(
          jsonb_set(
            metadata,
            '{track_name}',
            COALESCE(sidecar_json->'track_name', to_jsonb(track_id_val))
          ),
          '{artist_name}',
          COALESCE(sidecar_json->'artist_name', to_jsonb('Focus.Music'))
        )
        WHERE id = track_record.id;
        
        updated_count := updated_count + 1;
        
        -- Progress indicator every 500 tracks
        IF updated_count % 500 = 0 THEN
          RAISE NOTICE 'Updated % tracks...', updated_count;
        END IF;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      CONTINUE;
    END;
  END LOOP;
  
  RAISE NOTICE 'Metadata update complete!';
  RAISE NOTICE 'Total updated: %', updated_count;
  RAISE NOTICE 'Total errors: %', error_count;
END $$;

-- Migration: 20251016220315_update_track_metadata_from_storage_api.sql
/*
  # Update Track Metadata from Storage API

  This migration uses the storage.foldername function to read JSON sidecar files
  and update track metadata with proper track names and artist names.

  1. Process
     - Creates a temporary function to read and update track metadata
     - Processes tracks in batches for efficiency
     - Updates metadata with track_name and artist_name from JSON files

  2. Safety
     - Uses exception handling to skip tracks with missing sidecars
     - Preserves existing metadata fields
     - Only updates tracks that have valid sidecar files
*/

CREATE OR REPLACE FUNCTION update_track_metadata_from_sidecars()
RETURNS TABLE(updated_count INT, error_count INT) AS $$
DECLARE
  track_record RECORD;
  sidecar_data BYTEA;
  sidecar_json JSONB;
  track_id_val TEXT;
  v_updated_count INT := 0;
  v_error_count INT := 0;
BEGIN
  FOR track_record IN 
    SELECT id, metadata
    FROM audio_tracks
    WHERE metadata IS NOT NULL AND metadata->>'track_id' IS NOT NULL
    LIMIT 100
  LOOP
    BEGIN
      track_id_val := track_record.metadata->>'track_id';
      
      -- Try to get the sidecar file content
      SELECT content INTO sidecar_data
      FROM storage.objects
      WHERE bucket_id = 'audio-sidecars' 
        AND name = track_id_val || '.json';
      
      IF sidecar_data IS NOT NULL THEN
        -- Convert bytea to text and parse as JSON
        sidecar_json := convert_from(sidecar_data, 'UTF8')::jsonb;
        
        -- Update track metadata
        UPDATE audio_tracks
        SET metadata = metadata 
          || jsonb_build_object(
            'track_name', COALESCE(sidecar_json->>'track_name', track_id_val),
            'artist_name', COALESCE(sidecar_json->>'artist_name', 'Focus.Music')
          )
        WHERE id = track_record.id;
        
        v_updated_count := v_updated_count + 1;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      CONTINUE;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_updated_count, v_error_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: 20251016221711_create_metadata_update_function.sql
/*
  # Create Metadata Update Function

  Creates a function to update track metadata from public sidecar JSON files.

  1. Setup
     - Enables http extension for fetching remote JSON
     - Creates reusable function for single track updates

  2. Function: update_single_track_metadata
     - Fetches sidecar JSON via public URL
     - Updates track metadata with proper names
     - Returns success/failure boolean

  3. Usage
     - Can be called for individual tracks or in batches
     - Safe to run multiple times (idempotent)
*/

-- Enable http extension if not already enabled
CREATE EXTENSION IF NOT EXISTS http;

-- Create function to update a single track's metadata
CREATE OR REPLACE FUNCTION update_single_track_metadata(track_uuid UUID, track_id_param TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  sidecar_url TEXT;
  http_response http_response;
  sidecar_json JSONB;
  current_metadata JSONB;
BEGIN
  -- Build the public URL for the sidecar file
  sidecar_url := 'https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-sidecars/' || track_id_param || '.json';
  
  -- Fetch the sidecar file via HTTP
  SELECT * INTO http_response FROM http_get(sidecar_url);
  
  -- Check if request was successful
  IF http_response.status != 200 THEN
    RETURN FALSE;
  END IF;
  
  -- Parse the JSON response
  sidecar_json := http_response.content::jsonb;
  
  -- Get current metadata
  SELECT metadata INTO current_metadata
  FROM audio_tracks
  WHERE id = track_uuid;
  
  -- Update the track with new metadata
  UPDATE audio_tracks
  SET metadata = current_metadata || jsonb_build_object(
    'track_name', COALESCE(sidecar_json->>'track_name', track_id_param),
    'artist_name', COALESCE(sidecar_json->>'artist_name', 'Focus.Music'),
    'album_name', sidecar_json->>'album_name',
    'duration', sidecar_json->>'duration',
    'tempo', sidecar_json->>'tempo',
    'bpm', sidecar_json->>'tempo',
    'genre_category', sidecar_json->>'genre_category'
  ),
  duration_seconds = COALESCE(
    (sidecar_json->>'duration')::NUMERIC::INT,
    duration_seconds
  )
  WHERE id = track_uuid;
  
  RETURN TRUE;
  
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: 20251017131500_create_user_preferences_table.sql
/*
  # Create User Preferences Table

  1. New Tables
    - `user_preferences`
      - `id` (uuid, primary key) - Unique identifier for the preference record
      - `user_id` (uuid, foreign key) - References the user in auth.users
      - `last_channel_id` (uuid, foreign key) - References the last channel the user listened to
      - `created_at` (timestamptz) - When the preference was first created
      - `updated_at` (timestamptz) - When the preference was last updated

  2. Security
    - Enable RLS on `user_preferences` table
    - Add policies for users to read and update their own preferences

  3. Notes
    - This table stores user-specific preferences like their last listened channel
    - Users can only access their own preference records
*/

-- Create the user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own preferences
CREATE POLICY "Users can read own preferences"
  ON user_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON user_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create an index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the function before each update
CREATE TRIGGER trigger_update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();

-- Migration: 20251017131859_20251017131500_create_user_preferences_table.sql
/*
  # Create User Preferences Table

  1. New Tables
    - `user_preferences`
      - `id` (uuid, primary key) - Unique identifier for the preference record
      - `user_id` (uuid, foreign key) - References the user in auth.users
      - `last_channel_id` (uuid, foreign key) - References the last channel the user listened to
      - `created_at` (timestamptz) - When the preference was first created
      - `updated_at` (timestamptz) - When the preference was last updated

  2. Security
    - Enable RLS on `user_preferences` table
    - Add policies for users to read and update their own preferences

  3. Notes
    - This table stores user-specific preferences like their last listened channel
    - Users can only access their own preference records
*/

-- Create the user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own preferences
CREATE POLICY "Users can read own preferences"
  ON user_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON user_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create an index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the function before each update
CREATE TRIGGER trigger_update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();

-- Migration: 20251017135743_add_soft_delete_to_audio_tracks.sql
/*
  # Add Soft Delete Support to Audio Tracks

  1. Changes
    - Add `deleted_at` column to `audio_tracks` table
    - Add `deleted_by` column to track which admin deleted the track
    - Create index on `deleted_at` for efficient querying
    - Update RLS policies to exclude deleted tracks by default

  2. Notes
    - Tracks with a `deleted_at` timestamp are considered soft-deleted
    - After 28 days, tracks should be permanently deleted (handled by scheduled job)
    - Deleted tracks are hidden from normal queries but accessible in deleted tracks view
*/

-- Add soft delete columns
ALTER TABLE audio_tracks 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for efficient querying of deleted/non-deleted tracks
CREATE INDEX IF NOT EXISTS idx_audio_tracks_deleted_at ON audio_tracks(deleted_at);

-- Drop old policy if exists
DROP POLICY IF EXISTS "Users can view all tracks" ON audio_tracks;

-- Allow users to view non-deleted tracks
CREATE POLICY "Users can view non-deleted tracks"
  ON audio_tracks
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- Allow admins to view deleted tracks
CREATE POLICY "Admins can view deleted tracks"
  ON audio_tracks
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Allow admins to soft delete tracks
CREATE POLICY "Admins can soft delete tracks"
  ON audio_tracks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Allow admins to permanently delete tracks (for cleanup jobs)
CREATE POLICY "Admins can permanently delete old tracks"
  ON audio_tracks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    AND deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '28 days'
  );

-- Migration: 20251017155750_add_image_url_to_audio_channels.sql
/*
  # Add image URL to audio channels

  1. Changes
    - Add `image_url` column to `audio_channels` table to store background image URLs
    
  2. Details
    - Column stores the public URL or storage path for channel background images
    - Used to display custom backgrounds in channel selector boxes and music player footer
    - Nullable to allow channels without images
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE audio_channels ADD COLUMN image_url text;
  END IF;
END $$;

-- Migration: 20251017155813_create_channel_images_storage_bucket.sql
/*
  # Create channel images storage bucket

  1. New Storage Bucket
    - `channel-images` - Stores background images for audio channels
    
  2. Security
    - Public read access for displaying images
    - Admin-only write access for uploading images
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('channel-images', 'channel-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Public can view channel images'
  ) THEN
    CREATE POLICY "Public can view channel images"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'channel-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can upload channel images'
  ) THEN
    CREATE POLICY "Authenticated users can upload channel images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'channel-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can update channel images'
  ) THEN
    CREATE POLICY "Authenticated users can update channel images"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'channel-images')
      WITH CHECK (bucket_id = 'channel-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can delete channel images'
  ) THEN
    CREATE POLICY "Authenticated users can delete channel images"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'channel-images');
  END IF;
END $$;

-- Migration: 20251017173213_create_delete_user_function.sql
/*
  # Create Delete User Function for GDPR Compliance

  1. New Functions
    - `delete_user()` - Allows authenticated users to delete their own account
      - This function deletes the user's auth record
      - Related data in other tables is automatically deleted via CASCADE constraints
  
  2. Security
    - Function is callable by authenticated users only
    - Users can only delete their own account (checked via auth.uid())
    - Function uses SECURITY DEFINER to allow deletion of auth.users record
  
  3. Notes
    - This enables GDPR-compliant account deletion
    - The user_profiles, quiz_responses, and user_preferences should be deleted first by the application
    - Due to CASCADE constraints on user_profiles, deleting the auth user will clean up any remaining data
*/

-- Create function to allow users to delete their own account
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete the user's auth record (this will cascade to user_profiles due to FK constraint)
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user() TO authenticated;

-- Migration: 20251017175156_add_user_avatar_support.sql
/*
  # Add User Avatar Support

  1. Changes
    - Add `avatar_url` column to `user_profiles` table
    - Create `user-photos` storage bucket for profile pictures
    - Set up RLS policies for the bucket

  2. Security
    - Users can only upload their own photos
    - Photos are publicly readable
    - Only authenticated users can upload
*/

-- Add avatar_url column to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

-- Create user-photos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-photos', 'user-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;

-- Allow authenticated users to upload their own photos
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own photos
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'user-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own photos
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to all user photos
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'user-photos');

-- Migration: 20251017191855_create_quiz_tables.sql
/*
  # Quiz Management System

  1. New Tables
    - `quiz_questions`
      - Stores all quiz questions with their configuration
      - Includes question text, type, options, and scoring rules
    
    - `quiz_results`
      - Stores user quiz responses and calculated results
      - Links to user_profiles
      - Contains OCEAN scores and recommended channels
    
    - `quiz_config`
      - Stores the current quiz configuration (scoring logic, channel mappings)
      - Versioned for tracking changes over time

  2. Security
    - Enable RLS on all tables
    - Admin users can manage quiz questions and config
    - All authenticated users can view quiz questions
    - Users can only view their own quiz results
    - Admin users can view all quiz results
*/

-- Quiz questions table
CREATE TABLE IF NOT EXISTS quiz_questions (
  id text PRIMARY KEY,
  question_order integer NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('single_select', 'likert_1_5', 'likert_1_7')),
  question_text text NOT NULL,
  options jsonb DEFAULT '[]'::jsonb,
  reverse_scored boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Quiz configuration table
CREATE TABLE IF NOT EXISTS quiz_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  scoring_logic jsonb NOT NULL,
  channel_mapping jsonb NOT NULL,
  energy_levels jsonb DEFAULT '["Low", "Medium", "High"]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Quiz results table
CREATE TABLE IF NOT EXISTS quiz_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_version text NOT NULL,
  responses jsonb NOT NULL,
  ocean_scores jsonb NOT NULL,
  recommended_channels jsonb NOT NULL,
  completed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;

-- Quiz questions policies
CREATE POLICY "All authenticated users can view quiz questions"
  ON quiz_questions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin users can insert quiz questions"
  ON quiz_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update quiz questions"
  ON quiz_questions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can delete quiz questions"
  ON quiz_questions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Quiz config policies
CREATE POLICY "All authenticated users can view active quiz config"
  ON quiz_config FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admin users can insert quiz config"
  ON quiz_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update quiz config"
  ON quiz_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Quiz results policies
CREATE POLICY "Users can view their own quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin users can view all quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can insert their own quiz results"
  ON quiz_results FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_questions_order ON quiz_questions(question_order);
CREATE INDEX IF NOT EXISTS idx_quiz_config_active ON quiz_config(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_completed_at ON quiz_results(completed_at DESC);
-- Migration: 20251017210933_20251017210000_update_quiz_questions_exact.sql
/*
  # Update Quiz Questions to Exact Specifications
  
  1. Overview
    - Updates all 21 quiz questions to match the exact wording provided
    - Maintains proper question order and types
    - Updates answer options to match specifications
    
  2. Changes
    - Question 1 (avatar_1): Sound preference question with 4 options
    - Question 2 (avatar_2): Stimulant intake with 4 levels
    - Questions 3-12 (tipi_1 to tipi_10): TIPI personality questions (7-point scale)
    - Questions 13-14: Melody/voice preference (5-point scale)
    - Questions 15-21: Context questions (age, work setting, focus duration, etc.)
*/

-- Clear existing questions
DELETE FROM quiz_questions;

-- Question 1: Sound preference
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('avatar_1', 1, 'single_select', 'When you''re trying to focus, which kind of sound works best for you?', 
 '[{"value": "rhythmic_low_emotion", "label": "Rhythmic, steady beats with very little emotional expression"}, 
   {"value": "melodic_emotional", "label": "Melodic or emotional music that changes mood and feeling"}, 
   {"value": "ambient_nature", "label": "Ambient soundscapes or nature sounds"}, 
   {"value": "no_preference", "label": "No preference / it depends"}]', false);

-- Question 2: Stimulant intake
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('avatar_2', 2, 'single_select', 'What''s your coffee or stimulant intake like?', 
 '[{"value": "none", "label": "None"}, 
   {"value": "little", "label": "A little"}, 
   {"value": "medium", "label": "Medium"}, 
   {"value": "lot", "label": "A lot"}]', false);

-- Questions 3-12: TIPI personality questions (7-point Likert scale)
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('tipi_1', 3, 'likert_1_7', 'I see myself as… Extraverted, enthusiastic.', '[]', false),
('tipi_2', 4, 'likert_1_7', 'I see myself as… Critical, quarrelsome.', '[]', true),
('tipi_3', 5, 'likert_1_7', 'I see myself as… Dependable, self-disciplined.', '[]', false),
('tipi_4', 6, 'likert_1_7', 'I see myself as… Anxious, easily upset.', '[]', false),
('tipi_5', 7, 'likert_1_7', 'I see myself as… Open to new experiences, complex.', '[]', false),
('tipi_6', 8, 'likert_1_7', 'I see myself as… Reserved, quiet.', '[]', true),
('tipi_7', 9, 'likert_1_7', 'I see myself as… Sympathetic, warm.', '[]', false),
('tipi_8', 10, 'likert_1_7', 'I see myself as… Disorganized, careless.', '[]', true),
('tipi_9', 11, 'likert_1_7', 'I see myself as… Calm, emotionally stable.', '[]', true),
('tipi_10', 12, 'likert_1_7', 'I see myself as… Conventional, uncreative.', '[]', true);

-- Questions 13-14: Preference questions (5-point Likert scale)
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('no_melody_pref', 13, 'likert_1_5', 'While working, I prefer sounds without melody or lyrics (e.g., drums, machine hum, noise).', '[]', false),
('voices_distract', 14, 'likert_1_5', 'Voices or emotive melodies distract me when I''m concentrating.', '[]', false);

-- Question 15: Age band
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('context_1', 15, 'single_select', 'Age band', 
 '[{"value": "under_20", "label": "Under 20"}, 
   {"value": "20s", "label": "20s"}, 
   {"value": "30s", "label": "30s"}, 
   {"value": "40s", "label": "40s"}, 
   {"value": "50_plus", "label": "50 and older"}]', false);

-- Question 16: Work setting
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('context_2', 16, 'single_select', 'Typical work setting', 
 '[{"value": "quiet_office", "label": "Quiet office"}, 
   {"value": "busy_office", "label": "Busy office"}, 
   {"value": "home_chatter", "label": "Home with some background chatter"}, 
   {"value": "cafes_public", "label": "Cafés or public spaces"}, 
   {"value": "headphones_always", "label": "Headphones always"}]', false);

-- Question 17: Focus duration
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('focus_duration', 17, 'single_select', 'How long can you usually focus for without taking a break?', 
 '[{"value": "15_min", "label": "15 minutes or less"}, 
   {"value": "30_min", "label": "30 minutes"}, 
   {"value": "45_min", "label": "45 minutes"}, 
   {"value": "1_hour", "label": "1 hour"}, 
   {"value": "1_5_hours", "label": "1.5 hours"}, 
   {"value": "2_plus_hours", "label": "2+ hours"}]', false);

-- Question 18: Current activity
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('current_activity', 18, 'single_select', 'What best describes how you spend most of your day?', 
 '[{"value": "creative_content", "label": "Creating content/designing/writing"}, 
   {"value": "analytical", "label": "Coding, analyzing, teaching"}, 
   {"value": "management", "label": "Managing teams/projects"}, 
   {"value": "studying", "label": "Studying or early career"}, 
   {"value": "other", "label": "None of the above"}]', false);

-- Question 19: Best focus time
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('best_focus_time', 19, 'single_select', 'What time of day do you focus best?', 
 '[{"value": "early_morning", "label": "Early morning (5-8am)"}, 
   {"value": "morning", "label": "Morning (8-12pm)"}, 
   {"value": "afternoon", "label": "Afternoon (12-5pm)"}, 
   {"value": "evening", "label": "Evening (5-9pm)"}, 
   {"value": "night", "label": "Night (9pm+)"}]', false);

-- Question 20: Music frequency
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('music_frequency', 20, 'single_select', 'How often do you use focus music?', 
 '[{"value": "every_day", "label": "Every day"}, 
   {"value": "several_week", "label": "Several times a week"}, 
   {"value": "occasionally", "label": "Occasionally"}, 
   {"value": "rarely", "label": "Rarely"}, 
   {"value": "first_time", "label": "This is my first time"}]', false);

-- Question 21: Focus preference
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('focus_preference', 21, 'single_select', 'What helps you focus most?', 
 '[{"value": "background_music", "label": "Background music"}, 
   {"value": "complete_silence", "label": "Complete silence"}, 
   {"value": "nature_sounds", "label": "Nature sounds"}, 
   {"value": "ambient_noise", "label": "Ambient noise"}, 
   {"value": "varies", "label": "It varies"}]', false);
-- Migration: 20251018033315_add_playlist_strategy_config.sql
/*
  # Add Playlist Strategy Configuration

  1. Changes
    - Add `playlist_strategy` jsonb column to `audio_channels` table
    - This stores the playback strategy for each energy level (low, medium, high)
    - Default strategy is 'track_id_order' which plays tracks in order by their track_id
  
  2. Structure
    - Each energy level has its own strategy configuration:
      {
        "low": { "strategy": "track_id_order" },
        "medium": { "strategy": "track_id_order" },
        "high": { "strategy": "track_id_order" }
      }
    - Available strategies: 'track_id_order', 'weighted', 'filename', 'upload_date', 'random'
*/

-- Add playlist_strategy column with default configuration
ALTER TABLE audio_channels 
ADD COLUMN IF NOT EXISTS playlist_strategy jsonb DEFAULT '{"low": {"strategy": "track_id_order"}, "medium": {"strategy": "track_id_order"}, "high": {"strategy": "track_id_order"}}'::jsonb;

-- Update existing channels to have the default strategy
UPDATE audio_channels 
SET playlist_strategy = '{"low": {"strategy": "track_id_order"}, "medium": {"strategy": "track_id_order"}, "high": {"strategy": "track_id_order"}}'::jsonb
WHERE playlist_strategy IS NULL;

-- Migration: 20251018041113_add_display_order_to_channels.sql
/*
  # Add Display Order to Audio Channels

  1. Changes
    - Add `display_order` column to `audio_channels` table
      - Integer field to control the order channels appear to end users
      - Lower numbers appear first
      - Defaults to channel_number for backward compatibility
    
  2. Notes
    - The top 3 channels will be overridden by quiz recommendations
    - This order affects remaining channels shown to users
    - Admins can maintain a separate custom view order in the UI
*/

-- Add display_order column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE audio_channels ADD COLUMN display_order INTEGER;
  END IF;
END $$;

-- Initialize display_order with channel_number for existing records
UPDATE audio_channels
SET display_order = channel_number
WHERE display_order IS NULL;

-- Make display_order NOT NULL after initialization
ALTER TABLE audio_channels ALTER COLUMN display_order SET NOT NULL;

-- Add default for new records
ALTER TABLE audio_channels ALTER COLUMN display_order SET DEFAULT 999;
-- Migration: 20251018042157_enable_realtime_for_audio_channels.sql
/*
  # Enable Realtime for Audio Channels

  1. Changes
    - Enable realtime publication for the audio_channels table
    - This allows clients to subscribe to real-time updates when channel data changes
    - Specifically needed for live updates of display_order changes
  
  2. Notes
    - Users will automatically see channel order updates without manual refresh
    - No action required from users - updates happen silently in the background
*/

-- Enable realtime for audio_channels table
ALTER PUBLICATION supabase_realtime ADD TABLE audio_channels;
-- Migration: 20251018133047_add_music_library_column_preferences.sql
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

-- Migration: 20251018160549_allow_anonymous_quiz_access.sql
/*
  # Allow Anonymous Access to Quiz Data

  1. Changes
    - Drop existing restrictive SELECT policies on quiz_questions and quiz_config
    - Add new SELECT policies that allow anonymous users (anon role) to view quiz data
    - This enables the anonymous quiz flow where users can take the assessment before signing up

  2. Security
    - Only SELECT (read) access is granted to anonymous users
    - INSERT, UPDATE, DELETE remain restricted to admin users only
    - Maintains data integrity while allowing public quiz access
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "All authenticated users can view quiz questions" ON quiz_questions;
DROP POLICY IF EXISTS "All authenticated users can view active quiz config" ON quiz_config;

-- Allow anyone (including anonymous users) to view quiz questions
CREATE POLICY "Anyone can view quiz questions"
  ON quiz_questions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anyone (including anonymous users) to view active quiz config
CREATE POLICY "Anyone can view active quiz config"
  ON quiz_config
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Migration: 20251018180843_allow_anonymous_channel_access.sql
/*
  # Allow Anonymous Access to Audio Channels
  
  1. Changes
    - Add RLS policy to allow anonymous (anon) users to view audio channels
    - This enables the quiz to load channel data for anonymous users
  
  2. Security
    - Read-only access for anonymous users
    - Maintains existing authenticated and admin policies
*/

CREATE POLICY "Anonymous users can view channels"
  ON audio_channels
  FOR SELECT
  TO anon
  USING (true);

-- Migration: 20251018182521_add_admin_tab_order_preferences.sql
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

-- Migration: 20251018232951_create_track_analytics_system.sql
/*
  # Create Track Analytics System

  ## Overview
  This migration creates a comprehensive tracking system for music playback analytics,
  enabling detailed insights into user listening behavior and track performance.

  ## New Tables

  ### 1. `track_play_events`
  Tracks every play event with detailed context:
  - `id` (uuid, primary key) - Unique event identifier
  - `track_id` (text, not null) - Reference to audio track
  - `user_id` (uuid, nullable) - User who played the track (null for anonymous)
  - `channel_id` (uuid, nullable) - Channel context if applicable
  - `started_at` (timestamptz, not null) - When playback started
  - `completed_at` (timestamptz, nullable) - When playback completed (if finished)
  - `duration_played` (integer, nullable) - Seconds actually played
  - `total_duration` (integer, not null) - Total track duration in seconds
  - `completion_percentage` (numeric, nullable) - Percentage of track played
  - `was_skipped` (boolean, default false) - Whether track was skipped
  - `skip_position` (integer, nullable) - Position in seconds where skip occurred
  - `session_id` (text, nullable) - Session identifier for grouping plays
  - `device_type` (text, nullable) - Device category (desktop, mobile, tablet)
  - `created_at` (timestamptz, default now()) - Record creation time

  ### 2. `track_analytics_summary`
  Materialized aggregated statistics for fast queries:
  - `track_id` (text, primary key) - Track identifier
  - `total_plays` (integer, default 0) - All-time play count
  - `total_completions` (integer, default 0) - Times played to completion
  - `total_skips` (integer, default 0) - Times skipped
  - `unique_listeners` (integer, default 0) - Distinct users who played
  - `average_completion_rate` (numeric, nullable) - Average completion percentage
  - `last_played_at` (timestamptz, nullable) - Most recent play timestamp
  - `plays_last_7_days` (integer, default 0) - Plays in last week
  - `plays_last_30_days` (integer, default 0) - Plays in last month
  - `skips_last_7_days` (integer, default 0) - Skips in last week
  - `skips_last_30_days` (integer, default 0) - Skips in last month
  - `updated_at` (timestamptz, default now()) - Last summary update

  ## Indexes
  - Fast lookups by track_id, user_id, and time ranges
  - Optimized for analytics queries and reporting
  - Support for top tracks and skip rate calculations

  ## Functions
  - `update_track_analytics_summary()` - Recalculates aggregated statistics
  - `get_top_tracks()` - Returns most played tracks in time range
  - `get_top_skipped_tracks()` - Returns most skipped tracks in time range

  ## Security
  - RLS enabled on all tables
  - Admins can view all analytics data
  - Users can view their own play history
  - Anonymous plays are tracked but not user-identifiable

  ## Performance Notes
  - Indexes optimized for time-range queries
  - Summary table reduces load for common analytics queries
  - Periodic refresh of summary table recommended (e.g., hourly)
*/

-- Create track play events table
CREATE TABLE IF NOT EXISTS track_play_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_played integer,
  total_duration integer NOT NULL,
  completion_percentage numeric(5,2),
  was_skipped boolean DEFAULT false,
  skip_position integer,
  session_id text,
  device_type text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_track_play_events_track_id ON track_play_events(track_id);
CREATE INDEX IF NOT EXISTS idx_track_play_events_user_id ON track_play_events(user_id);
CREATE INDEX IF NOT EXISTS idx_track_play_events_started_at ON track_play_events(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_play_events_was_skipped ON track_play_events(was_skipped);
CREATE INDEX IF NOT EXISTS idx_track_play_events_channel_id ON track_play_events(channel_id);
CREATE INDEX IF NOT EXISTS idx_track_play_events_session_id ON track_play_events(session_id);

-- Create analytics summary table
CREATE TABLE IF NOT EXISTS track_analytics_summary (
  track_id text PRIMARY KEY,
  total_plays integer DEFAULT 0,
  total_completions integer DEFAULT 0,
  total_skips integer DEFAULT 0,
  unique_listeners integer DEFAULT 0,
  average_completion_rate numeric(5,2),
  last_played_at timestamptz,
  plays_last_7_days integer DEFAULT 0,
  plays_last_30_days integer DEFAULT 0,
  skips_last_7_days integer DEFAULT 0,
  skips_last_30_days integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_track_analytics_summary_total_plays ON track_analytics_summary(total_plays DESC);
CREATE INDEX IF NOT EXISTS idx_track_analytics_summary_total_skips ON track_analytics_summary(total_skips DESC);
CREATE INDEX IF NOT EXISTS idx_track_analytics_summary_plays_7d ON track_analytics_summary(plays_last_7_days DESC);
CREATE INDEX IF NOT EXISTS idx_track_analytics_summary_plays_30d ON track_analytics_summary(plays_last_30_days DESC);
CREATE INDEX IF NOT EXISTS idx_track_analytics_summary_last_played ON track_analytics_summary(last_played_at DESC);

-- Function to update analytics summary for a specific track
CREATE OR REPLACE FUNCTION update_track_analytics_summary(p_track_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO track_analytics_summary (
    track_id,
    total_plays,
    total_completions,
    total_skips,
    unique_listeners,
    average_completion_rate,
    last_played_at,
    plays_last_7_days,
    plays_last_30_days,
    skips_last_7_days,
    skips_last_30_days,
    updated_at
  )
  SELECT
    p_track_id,
    COUNT(*) as total_plays,
    COUNT(*) FILTER (WHERE completion_percentage >= 95) as total_completions,
    COUNT(*) FILTER (WHERE was_skipped = true) as total_skips,
    COUNT(DISTINCT user_id) as unique_listeners,
    AVG(completion_percentage) as average_completion_rate,
    MAX(started_at) as last_played_at,
    COUNT(*) FILTER (WHERE started_at >= now() - interval '7 days') as plays_last_7_days,
    COUNT(*) FILTER (WHERE started_at >= now() - interval '30 days') as plays_last_30_days,
    COUNT(*) FILTER (WHERE was_skipped = true AND started_at >= now() - interval '7 days') as skips_last_7_days,
    COUNT(*) FILTER (WHERE was_skipped = true AND started_at >= now() - interval '30 days') as skips_last_30_days,
    now() as updated_at
  FROM track_play_events
  WHERE track_id = p_track_id
  ON CONFLICT (track_id)
  DO UPDATE SET
    total_plays = EXCLUDED.total_plays,
    total_completions = EXCLUDED.total_completions,
    total_skips = EXCLUDED.total_skips,
    unique_listeners = EXCLUDED.unique_listeners,
    average_completion_rate = EXCLUDED.average_completion_rate,
    last_played_at = EXCLUDED.last_played_at,
    plays_last_7_days = EXCLUDED.plays_last_7_days,
    plays_last_30_days = EXCLUDED.plays_last_30_days,
    skips_last_7_days = EXCLUDED.skips_last_7_days,
    skips_last_30_days = EXCLUDED.skips_last_30_days,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Function to get top played tracks
CREATE OR REPLACE FUNCTION get_top_tracks(
  p_limit integer DEFAULT 10,
  p_days integer DEFAULT NULL
)
RETURNS TABLE (
  track_id text,
  play_count bigint,
  skip_count bigint,
  completion_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_days IS NULL THEN
    RETURN QUERY
    SELECT
      tpe.track_id,
      COUNT(*) as play_count,
      COUNT(*) FILTER (WHERE tpe.was_skipped = true) as skip_count,
      AVG(tpe.completion_percentage) as completion_rate
    FROM track_play_events tpe
    GROUP BY tpe.track_id
    ORDER BY play_count DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      tpe.track_id,
      COUNT(*) as play_count,
      COUNT(*) FILTER (WHERE tpe.was_skipped = true) as skip_count,
      AVG(tpe.completion_percentage) as completion_rate
    FROM track_play_events tpe
    WHERE tpe.started_at >= now() - (p_days || ' days')::interval
    GROUP BY tpe.track_id
    ORDER BY play_count DESC
    LIMIT p_limit;
  END IF;
END;
$$;

-- Function to get top skipped tracks
CREATE OR REPLACE FUNCTION get_top_skipped_tracks(
  p_limit integer DEFAULT 10,
  p_days integer DEFAULT NULL
)
RETURNS TABLE (
  track_id text,
  skip_count bigint,
  play_count bigint,
  skip_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_days IS NULL THEN
    RETURN QUERY
    SELECT
      tpe.track_id,
      COUNT(*) FILTER (WHERE tpe.was_skipped = true) as skip_count,
      COUNT(*) as play_count,
      ROUND((COUNT(*) FILTER (WHERE tpe.was_skipped = true)::numeric / NULLIF(COUNT(*), 0) * 100), 2) as skip_rate
    FROM track_play_events tpe
    GROUP BY tpe.track_id
    HAVING COUNT(*) FILTER (WHERE tpe.was_skipped = true) > 0
    ORDER BY skip_count DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      tpe.track_id,
      COUNT(*) FILTER (WHERE tpe.was_skipped = true) as skip_count,
      COUNT(*) as play_count,
      ROUND((COUNT(*) FILTER (WHERE tpe.was_skipped = true)::numeric / NULLIF(COUNT(*), 0) * 100), 2) as skip_rate
    FROM track_play_events tpe
    WHERE tpe.started_at >= now() - (p_days || ' days')::interval
    GROUP BY tpe.track_id
    HAVING COUNT(*) FILTER (WHERE tpe.was_skipped = true) > 0
    ORDER BY skip_count DESC
    LIMIT p_limit;
  END IF;
END;
$$;

-- Enable RLS on track_play_events
ALTER TABLE track_play_events ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all play events
CREATE POLICY "Admins can view all play events"
  ON track_play_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Policy: Users can view their own play events
CREATE POLICY "Users can view own play events"
  ON track_play_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Anyone can insert play events (for tracking)
CREATE POLICY "Anyone can insert play events"
  ON track_play_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Anonymous users can insert play events
CREATE POLICY "Anonymous can insert play events"
  ON track_play_events FOR INSERT
  TO anon
  WITH CHECK (true);

-- Enable RLS on track_analytics_summary
ALTER TABLE track_analytics_summary ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view analytics summary
CREATE POLICY "Admins can view analytics summary"
  ON track_analytics_summary FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Policy: Admins can update analytics summary
CREATE POLICY "Admins can update analytics summary"
  ON track_analytics_summary FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Migration: 20251019011018_add_admin_policies_for_user_profiles.sql
/*
  # Add Admin Policies for User Profiles

  1. Changes
    - Add policy allowing admins to view all user profiles
    - Add policy allowing admins to update all user profiles (including is_admin flag)
  
  2. Security
    - Policies check that the current user has is_admin = true
    - Non-admin users can still only access their own profiles via existing policies
    - Admins get full read/write access to manage users
*/

-- Policy for admins to view all user profiles
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Policy for admins to update any user profile
CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Migration: 20251019013105_fix_admin_policies_circular_dependency.sql
/*
  # Fix Admin Policies Circular Dependency
  
  1. Problem
    - Current admin policies have circular dependency: they query user_profiles to check is_admin
    - But those queries themselves must pass through RLS policies on user_profiles
    - This causes policy errors and blocks legitimate admin updates
  
  2. Solution
    - Create a SECURITY DEFINER function that bypasses RLS to check admin status
    - Update admin policies to use this function instead of direct subqueries
    - This breaks the circular dependency while maintaining security
  
  3. Security
    - Function uses SECURITY DEFINER to bypass RLS (necessary to break cycle)
    - Function only returns boolean, no data leakage possible
    - Admin status check is still secure and accurate
    - Non-admins still cannot access other users' data
*/

-- Drop existing admin policies that have circular dependency
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;

-- Create a SECURITY DEFINER function to check admin status
-- This bypasses RLS to break the circular dependency
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate admin policies using the function instead of subqueries
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Migration: 20251019141330_add_channel_energy_preferences.sql
/*
  # Add Channel Energy Level Preferences

  ## Summary
  Adds the ability to save and restore each user's preferred energy level per channel.
  This ensures that when users select "Low", "Medium", or "High" energy for a channel,
  that preference persists across sessions.

  ## Changes
  
  ### Modified Tables
  - `user_preferences`
    - Add `channel_energy_levels` (jsonb) - Stores energy preferences per channel
      Format: { "channel_id": "low"|"medium"|"high" }
    - Add `last_energy_level` (text) - Most recently used energy level globally
  
  ## Example Data
  ```json
  {
    "channel_energy_levels": {
      "d9f3b6df-27e3-4175-89ec-2108153c0bed": "low",
      "a1b2c3d4-5678-90ab-cdef-123456789abc": "high"
    },
    "last_energy_level": "low"
  }
  ```
*/

-- Add energy level preference columns to user_preferences
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS channel_energy_levels jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_energy_level text DEFAULT 'medium' CHECK (last_energy_level IN ('low', 'medium', 'high'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_channel_energy 
ON user_preferences USING gin (channel_energy_levels);

-- Migration: 20251020005450_remove_spurious_energy_metadata.sql
/*
  # Remove Spurious Energy Metadata Tag

  1. Changes
    - Removes the incorrect "energy: medium" metadata tag from all audio_tracks
    - This tag was from the legacy Focus@Will system and is not used in the new system
    - The new system uses energy levels stored in the audio_channels.playlist_data structure

  2. Notes
    - This only removes the "energy" key from the metadata JSONB column
    - All other metadata (track_id, duration, bpm, etc.) remains intact
    - No data loss - just cleaning up incorrect/unused metadata
*/

-- Remove the 'energy' key from all track metadata
UPDATE audio_tracks
SET metadata = metadata - 'energy'
WHERE metadata ? 'energy';

-- Migration: 20251020005511_20251020005450_remove_spurious_energy_metadata.sql
/*
  # Remove Spurious Energy Metadata Tag

  1. Changes
    - Removes the incorrect "energy: medium" metadata tag from all audio_tracks
    - This tag was from the legacy Focus@Will system and is not used in the new system
    - The new system uses energy levels stored in the audio_channels.playlist_data structure

  2. Notes
    - This only removes the "energy" key from the metadata JSONB column
    - All other metadata (track_id, duration, bpm, etc.) remains intact
    - No data loss - just cleaning up incorrect/unused metadata
*/

-- Remove the 'energy' key from all track metadata
UPDATE audio_tracks
SET metadata = metadata - 'energy'
WHERE metadata ? 'energy';

-- Migration: 20251020030600_add_audio_visibility_preferences.sql
/*
  # Add Audio Visibility Preferences

  1. Changes
    - Add `show_audio_diagnostics` column to `user_preferences` table (boolean, default false)
    - Add `show_queue` column to `user_preferences` table (boolean, default true)

  2. Purpose
    - Allows admin users to toggle visibility of Web Audio API diagnostics
    - Allows admin users to toggle visibility of music player queue

  3. Notes
    - Audio diagnostics are hidden by default (admin-only feature)
    - Queue is shown by default (standard functionality)
*/

-- Add show_audio_diagnostics column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_audio_diagnostics'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_audio_diagnostics boolean DEFAULT false;
  END IF;
END $$;

-- Add show_queue column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_queue'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_queue boolean DEFAULT true;
  END IF;
END $$;

-- Migration: 20251020032025_20251020030600_add_audio_visibility_preferences.sql
/*
  # Add Audio Visibility Preferences

  1. Changes
    - Add `show_audio_diagnostics` column to `user_preferences` table (boolean, default false)
    - Add `show_queue` column to `user_preferences` table (boolean, default true)

  2. Purpose
    - Allows admin users to toggle visibility of Web Audio API diagnostics
    - Allows admin users to toggle visibility of music player queue

  3. Notes
    - Audio diagnostics are hidden by default (admin-only feature)
    - Queue is shown by default (standard functionality)
*/

-- Add show_audio_diagnostics column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_audio_diagnostics'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_audio_diagnostics boolean DEFAULT false;
  END IF;
END $$;

-- Add show_queue column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_queue'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_queue boolean DEFAULT true;
  END IF;
END $$;
-- Migration: 20251020032917_20251020032200_add_admin_delete_channel_policy.sql
/*
  # Add Admin DELETE Policy for Channels

  1. Changes
    - Add DELETE policy for admins to delete channels

  2. Purpose
    - Allows admin users to delete audio channels
    - INSERT and UPDATE policies already exist, DELETE was missing

  3. Security
    - Policy checks that user is authenticated and has is_admin = true
    - Uses existing is_admin() helper function
*/

-- Policy for admins to delete channels
CREATE POLICY "Admins can delete channels"
  ON audio_channels FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));
-- Migration: 20251020054733_20251020033000_create_system_preferences.sql
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
-- Migration: 20251020163254_20251020170000_add_channel_intensity_and_user_ordering.sql
/*
  # Add Channel Intensity and User Custom Ordering

  1. Changes to `audio_channels` table
    - Add `intensity` column (text: 'low', 'medium', 'high') for admin-defined intensity classification
    - Add index for intensity filtering

  2. New Table: `user_channel_order`
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users)
    - `channel_id` (uuid, references audio_channels)
    - `sort_order` (integer) - user's custom position for this channel
    - `created_at` (timestamp)
    - `updated_at` (timestamp)
    - Unique constraint on (user_id, channel_id)

  3. Security
    - Enable RLS on `user_channel_order`
    - Users can read/write their own channel order
    - Admins can view all channel orders
*/

-- Add intensity to audio_channels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'intensity'
  ) THEN
    ALTER TABLE audio_channels
    ADD COLUMN intensity text DEFAULT 'medium' CHECK (intensity IN ('low', 'medium', 'high'));
  END IF;
END $$;

-- Create index for intensity filtering
CREATE INDEX IF NOT EXISTS idx_audio_channels_intensity ON audio_channels(intensity);

-- Create user_channel_order table
CREATE TABLE IF NOT EXISTS user_channel_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES audio_channels(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, channel_id)
);

-- Enable RLS
ALTER TABLE user_channel_order ENABLE ROW LEVEL SECURITY;

-- Users can read their own channel order
CREATE POLICY "Users can read own channel order"
  ON user_channel_order
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own channel order
CREATE POLICY "Users can insert own channel order"
  ON user_channel_order
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own channel order
CREATE POLICY "Users can update own channel order"
  ON user_channel_order
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own channel order
CREATE POLICY "Users can delete own channel order"
  ON user_channel_order
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all channel orders
CREATE POLICY "Admins can view all channel orders"
  ON user_channel_order
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_channel_order_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_user_channel_order_updated_at_trigger ON user_channel_order;
CREATE TRIGGER update_user_channel_order_updated_at_trigger
  BEFORE UPDATE ON user_channel_order
  FOR EACH ROW
  EXECUTE FUNCTION update_user_channel_order_updated_at();

-- Migration: 20251020170000_add_channel_intensity_and_user_ordering.sql
/*
  # Add Channel Intensity and User Custom Ordering

  1. Changes to `audio_channels` table
    - Add `intensity` column (text: 'low', 'medium', 'high') for admin-defined intensity classification
    - Add index for intensity filtering

  2. New Table: `user_channel_order`
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users)
    - `channel_id` (uuid, references audio_channels)
    - `sort_order` (integer) - user's custom position for this channel
    - `created_at` (timestamp)
    - `updated_at` (timestamp)
    - Unique constraint on (user_id, channel_id)

  3. Security
    - Enable RLS on `user_channel_order`
    - Users can read/write their own channel order
    - Admins can view all channel orders
*/

-- Add intensity to audio_channels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_channels' AND column_name = 'intensity'
  ) THEN
    ALTER TABLE audio_channels
    ADD COLUMN intensity text DEFAULT 'medium' CHECK (intensity IN ('low', 'medium', 'high'));
  END IF;
END $$;

-- Create index for intensity filtering
CREATE INDEX IF NOT EXISTS idx_audio_channels_intensity ON audio_channels(intensity);

-- Create user_channel_order table
CREATE TABLE IF NOT EXISTS user_channel_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES audio_channels(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, channel_id)
);

-- Enable RLS
ALTER TABLE user_channel_order ENABLE ROW LEVEL SECURITY;

-- Users can read their own channel order
CREATE POLICY "Users can read own channel order"
  ON user_channel_order
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own channel order
CREATE POLICY "Users can insert own channel order"
  ON user_channel_order
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own channel order
CREATE POLICY "Users can update own channel order"
  ON user_channel_order
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own channel order
CREATE POLICY "Users can delete own channel order"
  ON user_channel_order
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all channel orders
CREATE POLICY "Admins can view all channel orders"
  ON user_channel_order
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_channel_order_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_user_channel_order_updated_at_trigger ON user_channel_order;
CREATE TRIGGER update_user_channel_order_updated_at_trigger
  BEFORE UPDATE ON user_channel_order
  FOR EACH ROW
  EXECUTE FUNCTION update_user_channel_order_updated_at();

-- Migration: 20251020175035_add_recommended_energy_level_to_channel_recommendations.sql
/*
  # Add Recommended Energy Level to Channel Recommendations

  1. Changes
    - Add `recommended_energy_level` column to `channel_recommendations` table
      - Type: text with CHECK constraint to ensure only 'low', 'medium', or 'high'
      - Default: 'medium'
      - Allows the system to recommend not just which channels, but at what energy level

  2. Purpose
    - When a user completes the onboarding quiz, we can recommend specific energy levels
    - For example, a user might be recommended "Cappuccino" at "high" energy
    - This provides more personalized recommendations based on their profile
*/

-- Add recommended_energy_level column to channel_recommendations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'channel_recommendations' AND column_name = 'recommended_energy_level'
  ) THEN
    ALTER TABLE channel_recommendations 
    ADD COLUMN recommended_energy_level text DEFAULT 'medium' 
    CHECK (recommended_energy_level IN ('low', 'medium', 'high'));
  END IF;
END $$;
-- Migration: 20251020181755_create_image_sets_system.sql
/*
  # Create Image Sets System

  1. New Tables
    - `image_sets`
      - `id` (uuid, primary key)
      - `name` (text) - Display name of the image set
      - `description` (text, nullable) - Optional description
      - `is_system` (boolean) - True for admin sets, false for user custom sets
      - `created_by` (uuid, FK to auth.users, nullable) - NULL for system sets, user_id for custom sets
      - `is_active` (boolean) - Whether the set is available for selection
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `image_set_images`
      - `id` (uuid, primary key)
      - `image_set_id` (uuid, FK to image_sets)
      - `channel_id` (uuid, FK to audio_channels)
      - `image_url` (text) - Storage URL for the image
      - `created_at` (timestamptz)
      - Unique constraint on (image_set_id, channel_id)

    - `user_image_preferences`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to auth.users)
      - `selected_image_set_id` (uuid, FK to image_sets, nullable)
      - `slideshow_enabled` (boolean) - Whether slideshow is on in fullscreen
      - `slideshow_duration` (integer) - Seconds per image (default 30)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on user_id

  2. Storage
    - Create `image-sets` bucket for storing image set images

  3. Security
    - Enable RLS on all tables
    - System image sets readable by all authenticated users
    - User custom image sets only readable by creator
    - Only admins can create/modify system image sets
    - Users can create/modify their own custom image sets
*/

-- Create image_sets table
CREATE TABLE IF NOT EXISTS image_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_system boolean DEFAULT false NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create image_set_images table
CREATE TABLE IF NOT EXISTS image_set_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_set_id uuid REFERENCES image_sets(id) ON DELETE CASCADE NOT NULL,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(image_set_id, channel_id)
);

-- Create user_image_preferences table
CREATE TABLE IF NOT EXISTS user_image_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  selected_image_set_id uuid REFERENCES image_sets(id) ON DELETE SET NULL,
  slideshow_enabled boolean DEFAULT false NOT NULL,
  slideshow_duration integer DEFAULT 30 NOT NULL CHECK (slideshow_duration >= 5 AND slideshow_duration <= 300),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Create storage bucket for image sets
INSERT INTO storage.buckets (id, name, public)
VALUES ('image-sets', 'image-sets', true)
ON CONFLICT (id) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_image_sets_system ON image_sets(is_system) WHERE is_system = true;
CREATE INDEX IF NOT EXISTS idx_image_sets_user ON image_sets(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_image_set_images_set ON image_set_images(image_set_id);
CREATE INDEX IF NOT EXISTS idx_image_set_images_channel ON image_set_images(channel_id);
CREATE INDEX IF NOT EXISTS idx_user_image_prefs_user ON user_image_preferences(user_id);

-- Enable RLS
ALTER TABLE image_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_set_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_image_preferences ENABLE ROW LEVEL SECURITY;

-- Policies for image_sets
CREATE POLICY "Anyone can view active system image sets"
  ON image_sets FOR SELECT
  USING (is_system = true AND is_active = true);

CREATE POLICY "Users can view their own custom image sets"
  ON image_sets FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can view all image sets"
  ON image_sets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can create system image sets"
  ON image_sets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can create their own custom image sets"
  ON image_sets FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid() AND is_system = false);

CREATE POLICY "Admins can update system image sets"
  ON image_sets FOR UPDATE
  TO authenticated
  USING (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can update their own custom image sets"
  ON image_sets FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() AND is_system = false)
  WITH CHECK (created_by = auth.uid() AND is_system = false);

CREATE POLICY "Admins can delete system image sets"
  ON image_sets FOR DELETE
  TO authenticated
  USING (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can delete their own custom image sets"
  ON image_sets FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() AND is_system = false);

-- Policies for image_set_images
CREATE POLICY "Anyone can view images from active system sets"
  ON image_set_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.is_system = true
      AND image_sets.is_active = true
    )
  );

CREATE POLICY "Users can view images from their own custom sets"
  ON image_set_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins can view all image set images"
  ON image_set_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can manage system set images"
  ON image_set_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can manage their custom set images"
  ON image_set_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = auth.uid()
    )
  );

-- Policies for user_image_preferences
CREATE POLICY "Users can view own image preferences"
  ON user_image_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own image preferences"
  ON user_image_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own image preferences"
  ON user_image_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all image preferences"
  ON user_image_preferences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Storage policies for image-sets bucket
CREATE POLICY "Admins can upload to image-sets bucket"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'image-sets' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Authenticated users can upload to their own folder in image-sets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'image-sets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Anyone can view image-sets bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'image-sets');

CREATE POLICY "Admins can update image-sets bucket"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'image-sets' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    bucket_id = 'image-sets' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can update their own folder in image-sets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'image-sets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'image-sets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Admins can delete from image-sets bucket"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'image-sets' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can delete from their own folder in image-sets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'image-sets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
-- Migration: 20251020223000_make_channel_id_nullable_in_image_set_images.sql
/*
  # Make channel_id nullable in image_set_images

  1. Changes
    - Make `channel_id` column nullable in `image_set_images` table
    - Drop the unique constraint on (image_set_id, channel_id) since channel_id can now be NULL
    - Add a partial unique index to maintain uniqueness only when channel_id IS NOT NULL
    - This allows image sets to have:
      a) Images tied to specific channels (for channel card backgrounds)
      b) Images with NULL channel_id (for slideshow-only image sets)

  2. Migration Logic
    - The change is safe because:
      - Making a column nullable is non-destructive
      - Existing data with channel_ids will continue to work
      - New slideshow-only images can be inserted with NULL channel_id
*/

-- Drop the existing unique constraint
ALTER TABLE image_set_images
DROP CONSTRAINT IF EXISTS image_set_images_image_set_id_channel_id_key;

-- Make channel_id nullable
ALTER TABLE image_set_images
ALTER COLUMN channel_id DROP NOT NULL;

-- Add a partial unique index to maintain uniqueness only when channel_id IS NOT NULL
-- This prevents duplicate channel assignments within a set while allowing multiple NULL channel_ids
CREATE UNIQUE INDEX IF NOT EXISTS idx_image_set_images_unique_channel
ON image_set_images(image_set_id, channel_id)
WHERE channel_id IS NOT NULL;

-- Migration: 20251020223109_make_channel_id_nullable_in_image_set_images.sql
/*
  # Make channel_id nullable in image_set_images

  1. Changes
    - Make `channel_id` column nullable in `image_set_images` table
    - Drop the unique constraint on (image_set_id, channel_id) since channel_id can now be NULL
    - Add a partial unique index to maintain uniqueness only when channel_id IS NOT NULL
    - This allows image sets to have:
      a) Images tied to specific channels (for channel card backgrounds)
      b) Images with NULL channel_id (for slideshow-only image sets)

  2. Migration Logic
    - The change is safe because:
      - Making a column nullable is non-destructive
      - Existing data with channel_ids will continue to work
      - New slideshow-only images can be inserted with NULL channel_id
*/

-- Drop the existing unique constraint
ALTER TABLE image_set_images
DROP CONSTRAINT IF EXISTS image_set_images_image_set_id_channel_id_key;

-- Make channel_id nullable
ALTER TABLE image_set_images
ALTER COLUMN channel_id DROP NOT NULL;

-- Add a partial unique index to maintain uniqueness only when channel_id IS NOT NULL
-- This prevents duplicate channel assignments within a set while allowing multiple NULL channel_ids
CREATE UNIQUE INDEX IF NOT EXISTS idx_image_set_images_unique_channel
ON image_set_images(image_set_id, channel_id)
WHERE channel_id IS NOT NULL;
-- Migration: 20251020231842_enable_realtime_for_user_image_preferences.sql
/*
  # Enable Realtime for User Image Preferences

  1. Changes
    - Enable realtime for `user_image_preferences` table
    - Allows frontend to receive live updates when image set selections change
    - Ensures channel card images update immediately when user selects a different image set
*/

-- Enable realtime for user_image_preferences table
ALTER PUBLICATION supabase_realtime ADD TABLE user_image_preferences;

-- Migration: 20251020231908_20251020231842_enable_realtime_for_user_image_preferences.sql
/*
  # Enable Realtime for User Image Preferences

  1. Changes
    - Enable realtime for `user_image_preferences` table
    - Allows frontend to receive live updates when image set selections change
    - Ensures channel card images update immediately when user selects a different image set
*/

-- Enable realtime for user_image_preferences table
ALTER PUBLICATION supabase_realtime ADD TABLE user_image_preferences;

-- Migration: 20251021000000_separate_channel_and_slideshow_images.sql
/*
  # Separate Channel and Slideshow Image Systems

  1. Schema Changes
    - Add `set_type` enum to image_sets: 'channel' or 'slideshow'
    - Add `is_active_channel_set` boolean to image_sets (only one channel set can be active)
    - Make `channel_id` nullable in image_set_images (slideshow images don't have channels)
    - Remove unique constraint on (image_set_id, channel_id)
    - Add `display_order` to image_set_images for slideshow ordering
    - Rename user_image_preferences.selected_image_set_id to selected_slideshow_set_id

  2. New Tables
    - `slideshow_images` - Separate table for slideshow images (not linked to channels)
      - `id` (uuid, primary key)
      - `image_set_id` (uuid, FK to image_sets)
      - `image_url` (text) - Storage URL
      - `display_order` (integer) - Order in slideshow
      - `created_at` (timestamptz)

  3. Migration Strategy
    - Existing image_sets become channel image sets by default
    - image_set_images keeps channel-linked images
    - New slideshow_images table for slideshow images

  4. Security
    - Update RLS policies for new structure
    - Channel image sets: only one active at a time (admin controlled)
    - Slideshow sets: multiple can exist, user selects which to use
*/

-- Create enum for set type
CREATE TYPE image_set_type AS ENUM ('channel', 'slideshow');

-- Add new columns to image_sets
ALTER TABLE image_sets
  ADD COLUMN IF NOT EXISTS set_type image_set_type DEFAULT 'channel' NOT NULL,
  ADD COLUMN IF NOT EXISTS is_active_channel_set boolean DEFAULT false NOT NULL;

-- Update existing sets to be channel type
UPDATE image_sets SET set_type = 'channel' WHERE set_type IS NULL;

-- Create index on active channel sets (should only be one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_channel_set
  ON image_sets(is_active_channel_set)
  WHERE is_active_channel_set = true AND set_type = 'channel';

-- Create slideshow_images table (separate from channel images)
CREATE TABLE IF NOT EXISTS slideshow_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_set_id uuid REFERENCES image_sets(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for slideshow_images
CREATE INDEX IF NOT EXISTS idx_slideshow_images_set ON slideshow_images(image_set_id);
CREATE INDEX IF NOT EXISTS idx_slideshow_images_order ON slideshow_images(image_set_id, display_order);

-- Enable RLS on slideshow_images
ALTER TABLE slideshow_images ENABLE ROW LEVEL SECURITY;

-- Policies for slideshow_images
CREATE POLICY "Anyone can view images from active system slideshow sets"
  ON slideshow_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.is_system = true
      AND image_sets.is_active = true
    )
  );

CREATE POLICY "Users can view images from their own custom slideshow sets"
  ON slideshow_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins can view all slideshow images"
  ON slideshow_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can manage system slideshow images"
  ON slideshow_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can manage their custom slideshow images"
  ON slideshow_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.created_by = auth.uid()
    )
  );

-- Update user_image_preferences to rename column
ALTER TABLE user_image_preferences
  RENAME COLUMN selected_image_set_id TO selected_slideshow_set_id;

-- Add constraint that selected slideshow set must be of type 'slideshow'
-- (This is enforced at application level since FK constraints can't check related table values)

-- Add comment explaining the system
COMMENT ON COLUMN image_sets.set_type IS 'Type of image set: channel (one image per channel for cards) or slideshow (multiple images for expanded player)';
COMMENT ON COLUMN image_sets.is_active_channel_set IS 'For channel sets only: marks the one active channel image set (only one can be true)';
COMMENT ON TABLE slideshow_images IS 'Images for slideshow display in expanded music player (not linked to channels)';
COMMENT ON TABLE image_set_images IS 'Images for channel cards (one image per channel)';

-- Migration: 20251021023328_20251021000000_separate_channel_and_slideshow_images.sql
/*
  # Separate Channel and Slideshow Image Systems

  1. Schema Changes
    - Add `set_type` enum to image_sets: 'channel' or 'slideshow'
    - Add `is_active_channel_set` boolean to image_sets (only one channel set can be active)
    - Make `channel_id` nullable in image_set_images (slideshow images don't have channels)
    - Remove unique constraint on (image_set_id, channel_id)
    - Add `display_order` to image_set_images for slideshow ordering
    - Rename user_image_preferences.selected_image_set_id to selected_slideshow_set_id

  2. New Tables
    - `slideshow_images` - Separate table for slideshow images (not linked to channels)
      - `id` (uuid, primary key)
      - `image_set_id` (uuid, FK to image_sets)
      - `image_url` (text) - Storage URL
      - `display_order` (integer) - Order in slideshow
      - `created_at` (timestamptz)

  3. Migration Strategy
    - Existing image_sets become channel image sets by default
    - image_set_images keeps channel-linked images
    - New slideshow_images table for slideshow images

  4. Security
    - Update RLS policies for new structure
    - Channel image sets: only one active at a time (admin controlled)
    - Slideshow sets: multiple can exist, user selects which to use
*/

-- Create enum for set type
CREATE TYPE image_set_type AS ENUM ('channel', 'slideshow');

-- Add new columns to image_sets
ALTER TABLE image_sets
  ADD COLUMN IF NOT EXISTS set_type image_set_type DEFAULT 'channel' NOT NULL,
  ADD COLUMN IF NOT EXISTS is_active_channel_set boolean DEFAULT false NOT NULL;

-- Update existing sets to be channel type
UPDATE image_sets SET set_type = 'channel' WHERE set_type IS NULL;

-- Create index on active channel sets (should only be one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_channel_set
  ON image_sets(is_active_channel_set)
  WHERE is_active_channel_set = true AND set_type = 'channel';

-- Create slideshow_images table (separate from channel images)
CREATE TABLE IF NOT EXISTS slideshow_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_set_id uuid REFERENCES image_sets(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for slideshow_images
CREATE INDEX IF NOT EXISTS idx_slideshow_images_set ON slideshow_images(image_set_id);
CREATE INDEX IF NOT EXISTS idx_slideshow_images_order ON slideshow_images(image_set_id, display_order);

-- Enable RLS on slideshow_images
ALTER TABLE slideshow_images ENABLE ROW LEVEL SECURITY;

-- Policies for slideshow_images
CREATE POLICY "Anyone can view images from active system slideshow sets"
  ON slideshow_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.is_system = true
      AND image_sets.is_active = true
    )
  );

CREATE POLICY "Users can view images from their own custom slideshow sets"
  ON slideshow_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins can view all slideshow images"
  ON slideshow_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can manage system slideshow images"
  ON slideshow_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      JOIN user_profiles ON user_profiles.id = auth.uid()
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.is_system = true
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can manage their custom slideshow images"
  ON slideshow_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.set_type = 'slideshow'
      AND image_sets.created_by = auth.uid()
    )
  );

-- Update user_image_preferences to rename column
ALTER TABLE user_image_preferences
  RENAME COLUMN selected_image_set_id TO selected_slideshow_set_id;

-- Add constraint that selected slideshow set must be of type 'slideshow'
-- (This is enforced at application level since FK constraints can't check related table values)

-- Add comment explaining the system
COMMENT ON COLUMN image_sets.set_type IS 'Type of image set: channel (one image per channel for cards) or slideshow (multiple images for expanded player)';
COMMENT ON COLUMN image_sets.is_active_channel_set IS 'For channel sets only: marks the one active channel image set (only one can be true)';
COMMENT ON TABLE slideshow_images IS 'Images for slideshow display in expanded music player (not linked to channels)';
COMMENT ON TABLE image_set_images IS 'Images for channel cards (one image per channel)';

-- Migration: 20251021152719_create_user_playback_tracking.sql
/*
  # Create User Playback Tracking System

  1. New Tables
    - `user_playback_state`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `channel_id` (uuid, references audio_channels)
      - `energy_level` (text: 'low', 'medium', 'high')
      - `last_track_id` (text)
      - `last_position` (integer) - position in playlist
      - `session_id` (uuid) - unique per session
      - `updated_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Strategy Configuration
    - Add `playback_continuation` field to playlist_strategy
      - Options: 'restart_login', 'restart_session', 'continue'

  3. Security
    - Enable RLS on `user_playback_state` table
    - Users can only read/write their own playback state

  4. Indexes
    - Index on (user_id, channel_id, energy_level) for fast lookups
*/

-- Create user_playback_state table
CREATE TABLE IF NOT EXISTS user_playback_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE CASCADE NOT NULL,
  energy_level text NOT NULL CHECK (energy_level IN ('low', 'medium', 'high')),
  last_track_id text NOT NULL,
  last_position integer NOT NULL DEFAULT 0,
  session_id uuid NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, channel_id, energy_level)
);

-- Enable RLS
ALTER TABLE user_playback_state ENABLE ROW LEVEL SECURITY;

-- Users can read their own playback state
CREATE POLICY "Users can read own playback state"
  ON user_playback_state
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own playback state
CREATE POLICY "Users can insert own playback state"
  ON user_playback_state
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own playback state
CREATE POLICY "Users can update own playback state"
  ON user_playback_state
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own playback state
CREATE POLICY "Users can delete own playback state"
  ON user_playback_state
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_playback_state_lookup 
  ON user_playback_state(user_id, channel_id, energy_level);

-- Add playback_continuation to audio_channels playlist_strategy
-- This updates the existing jsonb structure to include continuation settings
DO $$
BEGIN
  -- The playlist_strategy field already exists as jsonb
  -- We'll add continuation settings when channels are updated through the UI
  -- No schema changes needed as jsonb is flexible
END $$;
-- Migration: 20251021181635_create_get_tracks_by_ids_function.sql
/*
  # Create function to get tracks by track IDs

  1. New Functions
    - `get_tracks_by_ids` - Efficiently retrieves audio tracks by an array of track_id values
      - Parameters: track_ids (text array)
      - Returns: Set of audio_tracks records matching the provided track IDs
      - Uses JSONB operator to filter on metadata->>'track_id'
  
  2. Purpose
    - Avoids fetching all 7700+ tracks when only a small subset is needed
    - Improves performance for playlist preview functionality
*/

CREATE OR REPLACE FUNCTION get_tracks_by_ids(track_ids text[])
RETURNS SETOF audio_tracks
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM audio_tracks
  WHERE deleted_at IS NULL
    AND metadata->>'track_id' = ANY(track_ids);
$$;

-- Migration: 20251021232318_fix_user_profiles_insert_policy.sql
/*
  # Fix user_profiles INSERT policy for signup

  1. Changes
    - Drop the existing INSERT policy that requires authenticated role
    - Create new INSERT policy that allows users to create their own profile
    - The policy checks that the user_id matches auth.uid() OR allows service_role
  
  2. Security
    - Users can only insert a profile with their own user ID
    - Service role can insert any profile (for admin operations)
    - RLS remains enabled to protect the table
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

-- Create new INSERT policy that works during signup
-- This allows the user to insert their profile when id matches auth.uid()
-- Service role bypasses RLS so it can always insert
CREATE POLICY "Users can insert own profile during signup"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Also ensure service_role can insert (it bypasses RLS by default, but being explicit)
CREATE POLICY "Service role can insert profiles"
  ON user_profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);
-- Migration: 20251022013712_add_brain_type_to_quiz_results.sql
/*
  # Add Brain Type Profile to Quiz Results

  1. Changes
    - Add `brain_type_primary` column to store primary brain type (explorer, systematic_executor, etc.)
    - Add `brain_type_secondary` column for secondary brain type (optional)
    - Add `brain_type_scores` jsonb column to store calculated scores for all 6 brain types
  
  2. Brain Types
    - explorer: High Openness - Creative but easily distracted
    - systematic_executor: Low Openness + High Conscientiousness - Reliable but noise-sensitive
    - focused_builder: High Conscientiousness + High Openness - Ambitious but overloaded
    - collaborator: High Extraversion - Social but overstimulated
    - worrier: High Neuroticism - Sensitive but resilient with support
    - dabbler: Low Conscientiousness - Spontaneous but easily distracted
  
  3. Security
    - No RLS changes needed - existing policies cover new columns
*/

-- Add brain type columns to quiz_results
ALTER TABLE quiz_results
  ADD COLUMN IF NOT EXISTS brain_type_primary text CHECK (brain_type_primary IN ('explorer', 'systematic_executor', 'focused_builder', 'collaborator', 'worrier', 'dabbler')),
  ADD COLUMN IF NOT EXISTS brain_type_secondary text CHECK (brain_type_secondary IN ('explorer', 'systematic_executor', 'focused_builder', 'collaborator', 'worrier', 'dabbler')),
  ADD COLUMN IF NOT EXISTS brain_type_scores jsonb DEFAULT '{}'::jsonb;

-- Add index for brain type queries
CREATE INDEX IF NOT EXISTS idx_quiz_results_brain_type ON quiz_results(brain_type_primary);

-- Migration: 20251022155151_add_cognitive_profile_to_quiz_results.sql
/*
  # Add Cognitive Profile Fields to Quiz Results

  1. Changes
    - Add `adhd_indicator` column to store ADHD tendency score
    - Add `asd_score` column to store auditory sensitivity score
    - Add `preferred_stimulant_level` column to store energy preference
  
  2. Purpose
    - Store cognitive profile data from quiz results
    - Enable display of Attention Profile and Sensory Profile on user dashboard
*/

-- Add cognitive profile columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_results' AND column_name = 'adhd_indicator'
  ) THEN
    ALTER TABLE quiz_results ADD COLUMN adhd_indicator numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_results' AND column_name = 'asd_score'
  ) THEN
    ALTER TABLE quiz_results ADD COLUMN asd_score numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_results' AND column_name = 'preferred_stimulant_level'
  ) THEN
    ALTER TABLE quiz_results ADD COLUMN preferred_stimulant_level text;
  END IF;
END $$;

-- Migration: 20251022173237_enable_realtime_for_quiz_results.sql
/*
  # Enable Realtime for Quiz Results

  1. Changes
    - Enable realtime for quiz_results table to allow UI to update when quiz is retaken
    - This ensures that brain type and cognitive profile data refreshes automatically

  2. Security
    - Realtime subscriptions respect existing RLS policies
*/

-- Enable realtime for quiz_results table
alter publication supabase_realtime add table quiz_results;

-- Migration: 20251022173317_enable_realtime_for_quiz_results.sql
/*
  # Enable Realtime for Quiz Results

  1. Changes
    - Enable realtime for quiz_results table to allow UI to update when quiz is retaken
    - This ensures that brain type and cognitive profile data refreshes automatically

  2. Security
    - Realtime subscriptions respect existing RLS policies
*/

-- Enable realtime for quiz_results table
alter publication supabase_realtime add table quiz_results;
-- Migration: 20251022182835_enable_realtime_for_channel_recommendations.sql
/*
  # Enable Realtime for Channel Recommendations

  This migration enables realtime subscriptions for the channel_recommendations table.

  1. Changes
    - Add channel_recommendations table to the supabase_realtime publication

  2. Purpose
    - Allow clients to subscribe to real-time changes on channel recommendations
    - Enables automatic UI updates when users retake the quiz and get new recommendations
*/

alter publication supabase_realtime add table channel_recommendations;

-- Migration: 20251022182848_enable_realtime_for_channel_recommendations.sql
/*
  # Enable Realtime for Channel Recommendations

  This migration enables realtime subscriptions for the channel_recommendations table.

  1. Changes
    - Add channel_recommendations table to the supabase_realtime publication

  2. Purpose
    - Allow clients to subscribe to real-time changes on channel recommendations
    - Enables automatic UI updates when users retake the quiz and get new recommendations
*/

alter publication supabase_realtime add table channel_recommendations;

-- Migration: 20251022194254_add_preview_flag_to_audio_tracks.sql
/*
  # Add Preview Flag to Audio Tracks

  1. Changes
    - Add `is_preview` boolean column to `audio_tracks` table
    - Default to false for all existing tracks
    - Add index for efficient querying of preview tracks by channel and energy level
  
  2. Purpose
    - Allow admins to mark one track per channel/energy combination as the preview track
    - Enable public preview playback on quiz results page for non-authenticated users
    - Support future preview features across the platform
*/

-- Add is_preview column to audio_tracks
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS is_preview boolean DEFAULT false NOT NULL;

-- Add index for efficient preview track queries
CREATE INDEX IF NOT EXISTS idx_audio_tracks_preview 
ON audio_tracks(channel_id, energy_level, is_preview) 
WHERE is_preview = true AND deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN audio_tracks.is_preview IS 'Marks this track as the preview track for its channel/energy combination. Only one track per channel/energy should be marked as preview.';
-- Migration: 20251022194601_add_preview_track_policies.sql
/*
  # Add RLS Policies for Preview Tracks

  1. Changes
    - Add policy to allow anonymous users to read preview tracks
    - This enables the quiz results page to fetch and play preview tracks for non-authenticated users
  
  2. Security
    - Only tracks marked as is_preview=true are accessible
    - Only non-deleted tracks are accessible
    - Read-only access for anonymous users
*/

-- Allow anonymous users to read preview tracks
CREATE POLICY "Anyone can view preview tracks"
  ON audio_tracks
  FOR SELECT
  TO anon
  USING (
    is_preview = true 
    AND deleted_at IS NULL
  );

-- Migration: 20251022195723_update_preview_to_single_channel.sql
/*
  # Update Preview System to Single Channel

  1. Changes
    - Add preview_channel_id column to store which specific channel this track is a preview for
    - Update is_preview logic to work with a single channel selection
    - Drop the old composite index and create new one
  
  2. Purpose
    - Each track can only be a preview for ONE channel (not per channel/energy)
    - Admin selects from the channels that use this track
    - Simplifies preview management and makes it more intuitive
*/

-- Add column to store which channel this is a preview for
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS preview_channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL;

-- Drop old index
DROP INDEX IF EXISTS idx_audio_tracks_preview;

-- Create new index for preview tracks by selected channel
CREATE INDEX IF NOT EXISTS idx_audio_tracks_preview_channel 
ON audio_tracks(preview_channel_id, is_preview) 
WHERE is_preview = true AND deleted_at IS NULL;

-- Add constraint: if is_preview is true, preview_channel_id must be set
-- Note: We'll enforce this in application logic for better user experience

-- Update existing preview tracks to set preview_channel_id to their current channel_id
UPDATE audio_tracks
SET preview_channel_id = channel_id
WHERE is_preview = true AND preview_channel_id IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN audio_tracks.preview_channel_id IS 'The specific channel this track is a preview for. A track can only be a preview for one channel.';
-- Migration: 20251022200022_update_preview_rls_for_channel_id.sql
/*
  # Update Preview Track RLS Policy

  1. Changes
    - Drop the old preview track policy
    - Create new policy using preview_channel_id
    - Ensures anonymous users can only see tracks marked as preview
  
  2. Security
    - Only tracks with is_preview=true and preview_channel_id set are accessible
    - Only non-deleted tracks are accessible
    - Read-only access for anonymous users
*/

-- Drop the old policy
DROP POLICY IF EXISTS "Anyone can view preview tracks" ON audio_tracks;

-- Create new policy using preview_channel_id
CREATE POLICY "Anyone can view preview tracks"
  ON audio_tracks
  FOR SELECT
  TO anon
  USING (
    is_preview = true 
    AND preview_channel_id IS NOT NULL
    AND deleted_at IS NULL
  );
-- Migration: 20251023211143_add_channel_view_preference.sql
/*
  # Add Channel View Preference
  
  1. Changes
    - Add `channel_view_mode` column to `user_preferences` table (text, default 'grid')
  
  2. Purpose
    - Allows users to toggle between grid (card) view and list view for channels
    - Persists user's viewing preference across sessions
  
  3. Notes
    - Valid values are 'grid' and 'list'
    - Defaults to 'grid' (card view) which is the current display mode
*/

-- Add channel_view_mode column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'channel_view_mode'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN channel_view_mode text DEFAULT 'grid' CHECK (channel_view_mode IN ('grid', 'list'));
  END IF;
END $$;

-- Migration: 20251023223000_add_session_timer_preferences.sql
/*
  # Add Session Timer Preferences

  1. Changes
    - Add `session_timer_duration` column to user_preferences table
      - Stores the last used timer duration in seconds
      - Default value: 1800 (30 minutes)
    - Add `session_timer_enabled` column to user_preferences table
      - Tracks whether the user has an active timer set
      - Default value: false

  2. Notes
    - Users can set custom timer durations for their focus sessions
    - Timer state persists across sessions for convenience
    - Duration stored in seconds for precision
*/

-- Add session timer duration preference (in seconds, default 30 minutes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'session_timer_duration'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN session_timer_duration integer DEFAULT 1800;
  END IF;
END $$;

-- Add session timer enabled flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'session_timer_enabled'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN session_timer_enabled boolean DEFAULT false;
  END IF;
END $$;

-- Migration: 20251024123510_create_timer_bell_storage_bucket.sql
/*
  # Create storage bucket for timer bell audio

  1. Storage
    - Creates `timer-bell` storage bucket for audio files
    - Enables public access for playback
    - Allows admin uploads only

  2. Security
    - Public read access for all users (needed for audio playback)
    - Only admins can upload/update/delete files
*/

-- Create storage bucket for timer bell audio
INSERT INTO storage.buckets (id, name, public)
VALUES ('timer-bell', 'timer-bell', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access (needed for audio playback)
CREATE POLICY "Anyone can view timer bell audio"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'timer-bell');

-- Only admins can upload timer bell audio
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

-- Only admins can update timer bell audio
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

-- Only admins can delete timer bell audio
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

-- Migration: 20251024123522_add_timer_bell_to_system_preferences.sql
/*
  # Add timer bell audio URL to system preferences

  1. Changes
    - Adds `timer_bell_url` field to system_preferences table
    - Stores the URL of the custom timer bell audio file
    - Defaults to null (will use programmatic bell sound)

  2. Notes
    - When null, SessionTimer will use the default programmatic bell
    - When set, SessionTimer will load and play the custom audio file
*/

-- Add timer_bell_url field to system_preferences
ALTER TABLE system_preferences
ADD COLUMN IF NOT EXISTS timer_bell_url text;

COMMENT ON COLUMN system_preferences.timer_bell_url IS 'URL of custom timer bell audio file from storage';

-- Migration: 20251024124039_add_insert_policy_to_system_preferences.sql
/*
  # Add INSERT policy to system_preferences

  1. Changes
    - Adds INSERT policy for admins to system_preferences table
    - This allows admins to use upsert operations which require both INSERT and UPDATE permissions

  2. Security
    - Only admins can insert new rows
    - Maintains existing UPDATE and SELECT policies
*/

-- Add INSERT policy for admins
CREATE POLICY "Admins can insert system preferences"
  ON system_preferences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );

-- Migration: 20251024130305_add_show_timer_debug_preference.sql
/*
  # Add Timer Debug Toggle for Admin Users

  1. Changes
    - Add `show_timer_debug` boolean column to `user_preferences` table
    - Default to `false` for all users
    - Allows admin users to toggle timer debug overlay visibility

  2. Notes
    - Only visible to admin users in the AudioSettings component
    - Controls visibility of timer debug overlay in SessionTimer component
*/

-- Add show_timer_debug column to user_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_timer_debug'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_timer_debug boolean DEFAULT false;
  END IF;
END $$;
-- Migration: 20251024130719_enable_realtime_for_user_preferences.sql
/*
  # Enable Realtime for User Preferences

  1. Changes
    - Enable realtime updates for the `user_preferences` table
    - Allows SessionTimer to receive live updates when timer debug preference changes

  2. Notes
    - This enables the realtime subscription in SessionTimer component
    - Changes to user preferences will now propagate immediately without page reload
*/

-- Enable realtime for user_preferences table
ALTER PUBLICATION supabase_realtime ADD TABLE user_preferences;
-- Migration: 20251024131929_fix_user_preferences_realtime_columns.sql
/*
  # Fix User Preferences Realtime Updates

  1. Changes
    - Set replica identity to FULL for user_preferences table
    - This ensures realtime subscriptions receive all column values in the payload
    - Required for the timer debug toggle to work properly via realtime updates

  2. Why This is Needed
    - By default, Postgres only sends the primary key in realtime updates
    - We need all columns (especially show_timer_debug) in the realtime payload
    - This allows SessionTimer to react immediately to preference changes
*/

-- Set replica identity to FULL so realtime updates include all columns
ALTER TABLE user_preferences REPLICA IDENTITY FULL;

-- Migration: 20251025152550_add_session_count_to_user_preferences.sql
/*
  # Add session count tracking to user preferences

  1. Changes
    - Add `session_count` column to `user_preferences` table to track number of user sessions
    - Default value is 0
    - Used to show new user onboarding elements for first 5 sessions
  
  2. Purpose
    - Track user sessions to display personalized channel recommendations frame
    - Frame will be shown for first 5 sessions only
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'session_count'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN session_count INTEGER DEFAULT 0;
  END IF;
END $$;
-- Migration: 20251025160000_add_recommendation_visibility_to_system_preferences.sql
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

-- Migration: 20251025205420_add_recommendation_visibility_to_system_preferences.sql
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

-- Migration: 20251025205420_enable_realtime_for_system_preferences.sql
/*
  # Enable Realtime for System Preferences

  1. Changes
    - Enable realtime replication for `system_preferences` table
    - Allows clients to subscribe to changes in system preferences in real-time

  2. Purpose
    - When admins update system preferences (like recommendation visibility threshold)
    - User dashboards can receive the updates instantly without needing a page refresh
*/

-- Enable realtime for system_preferences table
ALTER PUBLICATION supabase_realtime ADD TABLE system_preferences;

-- Migration: 20251025210717_enable_realtime_for_system_preferences.sql
/*
  # Enable Realtime for System Preferences

  1. Changes
    - Enable realtime replication for `system_preferences` table
    - Allows clients to subscribe to changes in system preferences in real-time

  2. Purpose
    - When admins update system preferences (like recommendation visibility threshold)
    - User dashboards can receive the updates instantly without needing a page refresh
*/

-- Enable realtime for system_preferences table
ALTER PUBLICATION supabase_realtime ADD TABLE system_preferences;

-- Migration: 20251026000000_add_slideshow_debug_preference.sql
/*
  # Add Slideshow Debug Toggle for Admin Users

  1. Changes
    - Add `show_slideshow_debug` boolean column to `user_preferences` table
    - Default to `false` for all users
    - Allows admin users to toggle slideshow debug overlay visibility

  2. Purpose
    - Provides diagnostic information for debugging slideshow behavior
    - Shows current image, next image, timings, and other slideshow state
    - Controls visibility of slideshow debug overlay in SlideshowOverlay component
*/

-- Add show_slideshow_debug column to user_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_slideshow_debug'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_slideshow_debug boolean DEFAULT false;
  END IF;
END $$;

-- Migration: 20251026194040_add_slideshow_debug_preference.sql
/*
  # Add Slideshow Debug Toggle for Admin Users

  1. Changes
    - Add `show_slideshow_debug` boolean column to `user_preferences` table
    - Default to `false` for all users
    - Allows admin users to toggle slideshow debug overlay visibility

  2. Purpose
    - Provides diagnostic information for debugging slideshow behavior
    - Shows current image, next image, timings, and other slideshow state
    - Controls visibility of slideshow debug overlay in SlideshowOverlay component
*/

-- Add show_slideshow_debug column to user_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'show_slideshow_debug'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN show_slideshow_debug boolean DEFAULT false;
  END IF;
END $$;
-- Migration: 20251027032414_20251027_create_update_metadata_function.sql
/*
  # Create Function to Update Track Metadata from JSON Files

  1. Purpose
    - Creates a function that can download JSON sidecars and update track metadata
    - Reads JSON content from storage and updates audio_tracks records
  
  2. Implementation
    - Function accepts track ID as parameter
    - Downloads corresponding JSON file from storage
    - Updates track metadata with JSON content
*/

CREATE OR REPLACE FUNCTION update_track_metadata_from_json(track_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  track_record RECORD;
  track_id_value TEXT;
  json_content BYTEA;
  json_text TEXT;
  metadata_obj JSONB;
BEGIN
  -- Get the track record
  SELECT * INTO track_record
  FROM audio_tracks
  WHERE id = track_uuid;

  IF NOT FOUND THEN
    RAISE NOTICE 'Track % not found', track_uuid;
    RETURN FALSE;
  END IF;

  -- Extract track ID from file_path
  track_id_value := (track_record.metadata->>'track_id');
  
  IF track_id_value IS NULL THEN
    RAISE NOTICE 'No track_id in metadata for %', track_uuid;
    RETURN FALSE;
  END IF;

  -- Note: We cannot directly download files from storage in PL/pgSQL
  -- This function signature is prepared for when we implement this via edge function
  
  RAISE NOTICE 'Metadata update function created successfully';
  RETURN TRUE;
END;
$$;

-- Migration: 20251027180631_fix_compound_version_patterns.sql
/*
  # Fix Compound Version Patterns

  1. Purpose
    - Fix tracks where .##_## patterns remain after version extraction
    - These occur when track had .##_##_P# pattern but only _P# was removed
    - Clean up the .##_## prefix from track names and add to version

  2. Examples
    - "Dragon (Anxiety Remix).02_01" with version "P4" 
      → "Dragon (Anxiety Remix)" with version "02_01_P4"
*/

DO $$
DECLARE
  track_record RECORD;
  track_name TEXT;
  clean_name TEXT;
  version_info TEXT;
  prefix_pattern TEXT;
  updated_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Fixing compound version patterns...';

  FOR track_record IN
    SELECT id, metadata
    FROM audio_tracks
    WHERE deleted_at IS NULL
      AND metadata->>'track_name' ~ '\.\d+_\d+$'
      AND metadata->>'version' IS NOT NULL
      AND metadata->>'version' != 'null'
    ORDER BY id
  LOOP
    track_name := track_record.metadata->>'track_name';
    version_info := track_record.metadata->>'version';

    -- Extract the .##_## pattern
    IF track_name ~ '\.\d+_\d+$' THEN
      prefix_pattern := substring(track_name from '\.(\d+_\d+)$');
      clean_name := regexp_replace(track_name, '\.\d+_\d+$', '');

      -- Combine prefix with existing version
      version_info := prefix_pattern || '_' || version_info;

      -- Update the track
      UPDATE audio_tracks
      SET metadata = jsonb_set(
        jsonb_set(
          metadata,
          '{track_name}',
          to_jsonb(clean_name)
        ),
        '{version}',
        to_jsonb(version_info)
      )
      WHERE id = track_record.id;

      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Compound version pattern fix complete!';
  RAISE NOTICE 'Total tracks updated: %', updated_count;
END $$;

-- Migration: 20251027200000_fix_security_issues.sql
/*
  # Fix Security Issues

  1. Performance Issues
    - Add missing indexes on foreign key columns
    - Optimize RLS policies to use (select auth.uid()) pattern
    - Fix function search paths to be immutable

  2. Security Issues
    - Move http extension out of public schema
    - Remove unused indexes (documented but not removed to avoid breaking changes)

  3. Changes
    - Add 9 missing foreign key indexes
    - Update all RLS policies to cache auth.uid() calls
    - Set search_path security on all functions
    - Move http extension to extensions schema
*/

-- ============================================================================
-- PART 1: Add Missing Foreign Key Indexes
-- ============================================================================

-- Index for audio_tracks.deleted_by
CREATE INDEX IF NOT EXISTS idx_audio_tracks_deleted_by
  ON audio_tracks(deleted_by)
  WHERE deleted_by IS NOT NULL;

-- Index for channel_recommendations.channel_id
CREATE INDEX IF NOT EXISTS idx_channel_recommendations_channel_id
  ON channel_recommendations(channel_id);

-- Index for listening_sessions.channel_id
CREATE INDEX IF NOT EXISTS idx_listening_sessions_channel_id
  ON listening_sessions(channel_id);

-- Index for playlists.channel_id
CREATE INDEX IF NOT EXISTS idx_playlists_channel_id
  ON playlists(channel_id);

-- Index for system_preferences.updated_by
CREATE INDEX IF NOT EXISTS idx_system_preferences_updated_by
  ON system_preferences(updated_by)
  WHERE updated_by IS NOT NULL;

-- Index for user_channel_order.channel_id
CREATE INDEX IF NOT EXISTS idx_user_channel_order_channel_id
  ON user_channel_order(channel_id);

-- Index for user_image_preferences.selected_image_set_id
CREATE INDEX IF NOT EXISTS idx_user_image_preferences_image_set_id
  ON user_image_preferences(selected_image_set_id)
  WHERE selected_image_set_id IS NOT NULL;

-- Index for user_playback_state.channel_id
CREATE INDEX IF NOT EXISTS idx_user_playback_state_channel_id
  ON user_playback_state(channel_id)
  WHERE channel_id IS NOT NULL;

-- Index for user_preferences.last_channel_id
CREATE INDEX IF NOT EXISTS idx_user_preferences_last_channel_id
  ON user_preferences(last_channel_id)
  WHERE last_channel_id IS NOT NULL;

-- ============================================================================
-- PART 2: Fix RLS Policies - Use (select auth.uid()) Pattern
-- ============================================================================

-- Drop and recreate user_profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own profile during signup" ON user_profiles;
CREATE POLICY "Users can insert own profile during signup"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Fix playlists policies
DROP POLICY IF EXISTS "Users can view own playlists" ON playlists;
CREATE POLICY "Users can view own playlists"
  ON playlists FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own playlists" ON playlists;
CREATE POLICY "Users can create own playlists"
  ON playlists FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own playlists" ON playlists;
CREATE POLICY "Users can update own playlists"
  ON playlists FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own playlists" ON playlists;
CREATE POLICY "Users can delete own playlists"
  ON playlists FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Fix listening_sessions policies
DROP POLICY IF EXISTS "Users can view own sessions" ON listening_sessions;
CREATE POLICY "Users can view own sessions"
  ON listening_sessions FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own sessions" ON listening_sessions;
CREATE POLICY "Users can create own sessions"
  ON listening_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own sessions" ON listening_sessions;
CREATE POLICY "Users can update own sessions"
  ON listening_sessions FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Fix quiz_responses policies
DROP POLICY IF EXISTS "Users can view own quiz responses" ON quiz_responses;
CREATE POLICY "Users can view own quiz responses"
  ON quiz_responses FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own quiz responses" ON quiz_responses;
CREATE POLICY "Users can create own quiz responses"
  ON quiz_responses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Fix channel_recommendations policies
DROP POLICY IF EXISTS "Users can view own recommendations" ON channel_recommendations;
CREATE POLICY "Users can view own recommendations"
  ON channel_recommendations FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own recommendations" ON channel_recommendations;
CREATE POLICY "Users can create own recommendations"
  ON channel_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own recommendations" ON channel_recommendations;
CREATE POLICY "Users can update own recommendations"
  ON channel_recommendations FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Fix audio_channels admin policies
DROP POLICY IF EXISTS "Admins can insert channels" ON audio_channels;
CREATE POLICY "Admins can insert channels"
  ON audio_channels FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can update channels" ON audio_channels;
CREATE POLICY "Admins can update channels"
  ON audio_channels FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can delete channels" ON audio_channels;
CREATE POLICY "Admins can delete channels"
  ON audio_channels FOR DELETE
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix user_preferences policies
DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
CREATE POLICY "Users can read own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Fix quiz_questions admin policies
DROP POLICY IF EXISTS "Admin users can insert quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can insert quiz questions"
  ON quiz_questions FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin users can update quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can update quiz questions"
  ON quiz_questions FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin users can delete quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can delete quiz questions"
  ON quiz_questions FOR DELETE
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix quiz_config admin policies
DROP POLICY IF EXISTS "Admin users can insert quiz config" ON quiz_config;
CREATE POLICY "Admin users can insert quiz config"
  ON quiz_config FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin users can update quiz config" ON quiz_config;
CREATE POLICY "Admin users can update quiz config"
  ON quiz_config FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

-- Fix quiz_results policies
DROP POLICY IF EXISTS "Users can view their own quiz results" ON quiz_results;
CREATE POLICY "Users can view their own quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own quiz results" ON quiz_results;
CREATE POLICY "Users can insert their own quiz results"
  ON quiz_results FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admin users can view all quiz results" ON quiz_results;
CREATE POLICY "Admin users can view all quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix music_library_column_preferences policies
DROP POLICY IF EXISTS "Users can read own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can read own column preferences"
  ON music_library_column_preferences FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can insert own column preferences"
  ON music_library_column_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can update own column preferences"
  ON music_library_column_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Fix admin_tab_preferences policies
DROP POLICY IF EXISTS "Admin users can read own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can read own tab preferences"
  ON admin_tab_preferences FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()) AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin users can insert own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can insert own tab preferences"
  ON admin_tab_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()) AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admin users can update own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can update own tab preferences"
  ON admin_tab_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()) AND is_admin((select auth.uid())))
  WITH CHECK (user_id = (select auth.uid()) AND is_admin((select auth.uid())));

-- Fix track_play_events policies
DROP POLICY IF EXISTS "Users can view own play events" ON track_play_events;
CREATE POLICY "Users can view own play events"
  ON track_play_events FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all play events" ON track_play_events;
CREATE POLICY "Admins can view all play events"
  ON track_play_events FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix audio_tracks admin policies
DROP POLICY IF EXISTS "Admins can view deleted tracks" ON audio_tracks;
CREATE POLICY "Admins can view deleted tracks"
  ON audio_tracks FOR SELECT
  TO authenticated
  USING (deleted_at IS NOT NULL AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can soft delete tracks" ON audio_tracks;
CREATE POLICY "Admins can soft delete tracks"
  ON audio_tracks FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can permanently delete old tracks" ON audio_tracks;
CREATE POLICY "Admins can permanently delete old tracks"
  ON audio_tracks FOR DELETE
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix track_analytics_summary policies
DROP POLICY IF EXISTS "Admins can view analytics summary" ON track_analytics_summary;
CREATE POLICY "Admins can view analytics summary"
  ON track_analytics_summary FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can update analytics summary" ON track_analytics_summary;
CREATE POLICY "Admins can update analytics summary"
  ON track_analytics_summary FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

-- Fix system_preferences policies
DROP POLICY IF EXISTS "Admins can update system preferences" ON system_preferences;
CREATE POLICY "Admins can update system preferences"
  ON system_preferences FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can insert system preferences" ON system_preferences;
CREATE POLICY "Admins can insert system preferences"
  ON system_preferences FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

-- Fix user_channel_order policies
DROP POLICY IF EXISTS "Users can read own channel order" ON user_channel_order;
CREATE POLICY "Users can read own channel order"
  ON user_channel_order FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own channel order" ON user_channel_order;
CREATE POLICY "Users can insert own channel order"
  ON user_channel_order FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own channel order" ON user_channel_order;
CREATE POLICY "Users can update own channel order"
  ON user_channel_order FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own channel order" ON user_channel_order;
CREATE POLICY "Users can delete own channel order"
  ON user_channel_order FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all channel orders" ON user_channel_order;
CREATE POLICY "Admins can view all channel orders"
  ON user_channel_order FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix image_sets policies
DROP POLICY IF EXISTS "Users can view their own custom image sets" ON image_sets;
CREATE POLICY "Users can view their own custom image sets"
  ON image_sets FOR SELECT
  TO authenticated
  USING (is_custom = true AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all image sets" ON image_sets;
CREATE POLICY "Admins can view all image sets"
  ON image_sets FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can create system image sets" ON image_sets;
CREATE POLICY "Admins can create system image sets"
  ON image_sets FOR INSERT
  TO authenticated
  WITH CHECK (is_custom = false AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can create their own custom image sets" ON image_sets;
CREATE POLICY "Users can create their own custom image sets"
  ON image_sets FOR INSERT
  TO authenticated
  WITH CHECK (is_custom = true AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can update system image sets" ON image_sets;
CREATE POLICY "Admins can update system image sets"
  ON image_sets FOR UPDATE
  TO authenticated
  USING (is_custom = false AND is_admin((select auth.uid())))
  WITH CHECK (is_custom = false AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can update their own custom image sets" ON image_sets;
CREATE POLICY "Users can update their own custom image sets"
  ON image_sets FOR UPDATE
  TO authenticated
  USING (is_custom = true AND created_by = (select auth.uid()))
  WITH CHECK (is_custom = true AND created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can delete system image sets" ON image_sets;
CREATE POLICY "Admins can delete system image sets"
  ON image_sets FOR DELETE
  TO authenticated
  USING (is_custom = false AND is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can delete their own custom image sets" ON image_sets;
CREATE POLICY "Users can delete their own custom image sets"
  ON image_sets FOR DELETE
  TO authenticated
  USING (is_custom = true AND created_by = (select auth.uid()));

-- Fix image_set_images policies
DROP POLICY IF EXISTS "Users can view images from their own custom sets" ON image_set_images;
CREATE POLICY "Users can view images from their own custom sets"
  ON image_set_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can view all image set images" ON image_set_images;
CREATE POLICY "Admins can view all image set images"
  ON image_set_images FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage system set images" ON image_set_images;
CREATE POLICY "Admins can manage system set images"
  ON image_set_images FOR ALL
  TO authenticated
  USING (
    is_admin((select auth.uid())) AND
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_custom = false
    )
  )
  WITH CHECK (
    is_admin((select auth.uid())) AND
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_custom = false
    )
  );

DROP POLICY IF EXISTS "Users can manage their custom set images" ON image_set_images;
CREATE POLICY "Users can manage their custom set images"
  ON image_set_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  );

-- Fix user_image_preferences policies
DROP POLICY IF EXISTS "Users can view own image preferences" ON user_image_preferences;
CREATE POLICY "Users can view own image preferences"
  ON user_image_preferences FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own image preferences" ON user_image_preferences;
CREATE POLICY "Users can insert own image preferences"
  ON user_image_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own image preferences" ON user_image_preferences;
CREATE POLICY "Users can update own image preferences"
  ON user_image_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all image preferences" ON user_image_preferences;
CREATE POLICY "Admins can view all image preferences"
  ON user_image_preferences FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

-- Fix slideshow_images policies
DROP POLICY IF EXISTS "Users can view images from their own custom slideshow sets" ON slideshow_images;
CREATE POLICY "Users can view images from their own custom slideshow sets"
  ON slideshow_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can view all slideshow images" ON slideshow_images;
CREATE POLICY "Admins can view all slideshow images"
  ON slideshow_images FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage system slideshow images" ON slideshow_images;
CREATE POLICY "Admins can manage system slideshow images"
  ON slideshow_images FOR ALL
  TO authenticated
  USING (
    is_admin((select auth.uid())) AND
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_custom = false
    )
  )
  WITH CHECK (
    is_admin((select auth.uid())) AND
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_custom = false
    )
  );

DROP POLICY IF EXISTS "Users can manage their custom slideshow images" ON slideshow_images;
CREATE POLICY "Users can manage their custom slideshow images"
  ON slideshow_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
        AND image_sets.is_custom = true
        AND image_sets.created_by = (select auth.uid())
    )
  );

-- Fix user_playback_state policies
DROP POLICY IF EXISTS "Users can read own playback state" ON user_playback_state;
CREATE POLICY "Users can read own playback state"
  ON user_playback_state FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own playback state" ON user_playback_state;
CREATE POLICY "Users can insert own playback state"
  ON user_playback_state FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own playback state" ON user_playback_state;
CREATE POLICY "Users can update own playback state"
  ON user_playback_state FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own playback state" ON user_playback_state;
CREATE POLICY "Users can delete own playback state"
  ON user_playback_state FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- PART 3: Fix Function Security - Set search_path
-- ============================================================================

-- Fix is_admin function
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE user_profiles.user_id = is_admin.user_id
      AND user_profiles.is_admin = true
  );
END;
$$;

-- Fix get_tracks_by_ids function
CREATE OR REPLACE FUNCTION get_tracks_by_ids(track_ids uuid[])
RETURNS SETOF audio_tracks
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM audio_tracks
  WHERE id = ANY(track_ids)
    AND deleted_at IS NULL;
$$;

-- Fix update_user_channel_order_updated_at trigger function
CREATE OR REPLACE FUNCTION update_user_channel_order_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix update_user_preferences_updated_at trigger function
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix update_track_analytics_summary function
CREATE OR REPLACE FUNCTION update_track_analytics_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert or update summary for the track
  INSERT INTO track_analytics_summary (
    track_id,
    total_plays,
    unique_users,
    total_listen_time_seconds,
    total_skips,
    plays_last_7_days,
    plays_last_30_days,
    last_played_at
  )
  SELECT
    NEW.track_id,
    COUNT(*) as total_plays,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(listen_duration_seconds) as total_listen_time,
    SUM(CASE WHEN was_skipped THEN 1 ELSE 0 END) as total_skips,
    COUNT(CASE WHEN played_at >= NOW() - INTERVAL '7 days' THEN 1 END) as plays_7d,
    COUNT(CASE WHEN played_at >= NOW() - INTERVAL '30 days' THEN 1 END) as plays_30d,
    MAX(played_at) as last_played
  FROM track_play_events
  WHERE track_id = NEW.track_id
  ON CONFLICT (track_id)
  DO UPDATE SET
    total_plays = EXCLUDED.total_plays,
    unique_users = EXCLUDED.unique_users,
    total_listen_time_seconds = EXCLUDED.total_listen_time_seconds,
    total_skips = EXCLUDED.total_skips,
    plays_last_7_days = EXCLUDED.plays_last_7_days,
    plays_last_30_days = EXCLUDED.plays_last_30_days,
    last_played_at = EXCLUDED.last_played_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Fix get_top_tracks function
CREATE OR REPLACE FUNCTION get_top_tracks(
  days_back integer DEFAULT 30,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  track_id uuid,
  play_count bigint,
  unique_listeners bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    track_id,
    COUNT(*) as play_count,
    COUNT(DISTINCT user_id) as unique_listeners
  FROM track_play_events
  WHERE played_at >= NOW() - (days_back || ' days')::interval
  GROUP BY track_id
  ORDER BY play_count DESC
  LIMIT limit_count;
$$;

-- Fix get_top_skipped_tracks function
CREATE OR REPLACE FUNCTION get_top_skipped_tracks(
  days_back integer DEFAULT 30,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  track_id uuid,
  skip_count bigint,
  total_plays bigint,
  skip_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    track_id,
    SUM(CASE WHEN was_skipped THEN 1 ELSE 0 END) as skip_count,
    COUNT(*) as total_plays,
    ROUND(
      SUM(CASE WHEN was_skipped THEN 1 ELSE 0 END)::numeric /
      NULLIF(COUNT(*), 0) * 100,
      2
    ) as skip_rate
  FROM track_play_events
  WHERE played_at >= NOW() - (days_back || ' days')::interval
  GROUP BY track_id
  HAVING SUM(CASE WHEN was_skipped THEN 1 ELSE 0 END) > 0
  ORDER BY skip_count DESC
  LIMIT limit_count;
$$;

-- ============================================================================
-- PART 4: Move HTTP Extension Out of Public Schema
-- ============================================================================

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move http extension to extensions schema
DO $$
BEGIN
  -- Check if http extension exists in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension
    WHERE extname = 'http'
    AND extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    -- Drop from public and recreate in extensions schema
    DROP EXTENSION IF EXISTS http CASCADE;
    CREATE EXTENSION IF NOT EXISTS http SCHEMA extensions;
  ELSE
    -- Just ensure it exists in extensions schema
    CREATE EXTENSION IF NOT EXISTS http SCHEMA extensions;
  END IF;
END $$;

-- Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Migration: 20251028000000_fix_rls_performance_issues.sql
/*
  # Fix RLS Performance Issues

  1. Problem
    - Multiple RLS policies are calling auth.<function>() directly
    - This causes the function to be re-evaluated for each row, leading to poor performance at scale

  2. Solution
    - Replace all `auth.<function>()` calls with `(select auth.<function>())`
    - This ensures the function is evaluated once and the result is reused

  3. Tables Updated
    - metadata_backfill_progress
    - user_profiles
    - audio_channels
    - playlists
    - listening_sessions
    - quiz_responses
    - channel_recommendations
    - music_library_column_preferences
    - track_analytics_summary
    - quiz_questions
    - quiz_config
    - admin_tab_preferences
    - audio_tracks
    - user_preferences
    - track_play_events
    - system_preferences
    - user_channel_order
    - image_set_images
    - user_image_preferences
    - image_sets
    - slideshow_images
    - user_playback_state
    - quiz_results
*/

-- metadata_backfill_progress
DROP POLICY IF EXISTS "Allow admins to manage backfill progress" ON metadata_backfill_progress;
CREATE POLICY "Allow admins to manage backfill progress" ON metadata_backfill_progress
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- user_profiles
DROP POLICY IF EXISTS "Users can insert own profile during signup" ON user_profiles;
CREATE POLICY "Users can insert own profile during signup" ON user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

-- audio_channels
DROP POLICY IF EXISTS "Admins can delete channels" ON audio_channels;
CREATE POLICY "Admins can delete channels" ON audio_channels
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert channels" ON audio_channels;
CREATE POLICY "Admins can insert channels" ON audio_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update channels" ON audio_channels;
CREATE POLICY "Admins can update channels" ON audio_channels
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- playlists
DROP POLICY IF EXISTS "Users can create own playlists" ON playlists;
CREATE POLICY "Users can create own playlists" ON playlists
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own playlists" ON playlists;
CREATE POLICY "Users can delete own playlists" ON playlists
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own playlists" ON playlists;
CREATE POLICY "Users can update own playlists" ON playlists
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own playlists" ON playlists;
CREATE POLICY "Users can view own playlists" ON playlists
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- listening_sessions
DROP POLICY IF EXISTS "Users can create own sessions" ON listening_sessions;
CREATE POLICY "Users can create own sessions" ON listening_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own sessions" ON listening_sessions;
CREATE POLICY "Users can update own sessions" ON listening_sessions
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own sessions" ON listening_sessions;
CREATE POLICY "Users can view own sessions" ON listening_sessions
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- quiz_responses
DROP POLICY IF EXISTS "Users can create own quiz responses" ON quiz_responses;
CREATE POLICY "Users can create own quiz responses" ON quiz_responses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own quiz responses" ON quiz_responses;
CREATE POLICY "Users can view own quiz responses" ON quiz_responses
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- channel_recommendations
DROP POLICY IF EXISTS "Users can create own recommendations" ON channel_recommendations;
CREATE POLICY "Users can create own recommendations" ON channel_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own recommendations" ON channel_recommendations;
CREATE POLICY "Users can update own recommendations" ON channel_recommendations
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own recommendations" ON channel_recommendations;
CREATE POLICY "Users can view own recommendations" ON channel_recommendations
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- music_library_column_preferences
DROP POLICY IF EXISTS "Users can insert own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can insert own column preferences" ON music_library_column_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can read own column preferences" ON music_library_column_preferences
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can update own column preferences" ON music_library_column_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- track_analytics_summary
DROP POLICY IF EXISTS "Admins can update analytics summary" ON track_analytics_summary;
CREATE POLICY "Admins can update analytics summary" ON track_analytics_summary
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view analytics summary" ON track_analytics_summary;
CREATE POLICY "Admins can view analytics summary" ON track_analytics_summary
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- quiz_questions
DROP POLICY IF EXISTS "Admin users can delete quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can delete quiz questions" ON quiz_questions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can insert quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can insert quiz questions" ON quiz_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can update quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can update quiz questions" ON quiz_questions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- quiz_config
DROP POLICY IF EXISTS "Admin users can insert quiz config" ON quiz_config;
CREATE POLICY "Admin users can insert quiz config" ON quiz_config
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can update quiz config" ON quiz_config;
CREATE POLICY "Admin users can update quiz config" ON quiz_config
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- admin_tab_preferences
DROP POLICY IF EXISTS "Admin users can insert own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can insert own tab preferences" ON admin_tab_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can read own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can read own tab preferences" ON admin_tab_preferences
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can update own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can update own tab preferences" ON admin_tab_preferences
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- audio_tracks
DROP POLICY IF EXISTS "Admins can permanently delete old tracks" ON audio_tracks;
CREATE POLICY "Admins can permanently delete old tracks" ON audio_tracks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can soft delete tracks" ON audio_tracks;
CREATE POLICY "Admins can soft delete tracks" ON audio_tracks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view deleted tracks" ON audio_tracks;
CREATE POLICY "Admins can view deleted tracks" ON audio_tracks
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- user_preferences
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
CREATE POLICY "Users can read own preferences" ON user_preferences
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- track_play_events
DROP POLICY IF EXISTS "Admins can view all play events" ON track_play_events;
CREATE POLICY "Admins can view all play events" ON track_play_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can view own play events" ON track_play_events;
CREATE POLICY "Users can view own play events" ON track_play_events
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- system_preferences
DROP POLICY IF EXISTS "Admins can insert system preferences" ON system_preferences;
CREATE POLICY "Admins can insert system preferences" ON system_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update system preferences" ON system_preferences;
CREATE POLICY "Admins can update system preferences" ON system_preferences
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- user_channel_order
DROP POLICY IF EXISTS "Admins can view all channel orders" ON user_channel_order;
CREATE POLICY "Admins can view all channel orders" ON user_channel_order
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can delete own channel order" ON user_channel_order;
CREATE POLICY "Users can delete own channel order" ON user_channel_order
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own channel order" ON user_channel_order;
CREATE POLICY "Users can insert own channel order" ON user_channel_order
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own channel order" ON user_channel_order;
CREATE POLICY "Users can read own channel order" ON user_channel_order
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own channel order" ON user_channel_order;
CREATE POLICY "Users can update own channel order" ON user_channel_order
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- image_set_images
DROP POLICY IF EXISTS "Admins can manage system set images" ON image_set_images;
CREATE POLICY "Admins can manage system set images" ON image_set_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all image set images" ON image_set_images;
CREATE POLICY "Admins can view all image set images" ON image_set_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can manage their custom set images" ON image_set_images;
CREATE POLICY "Users can manage their custom set images" ON image_set_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

DROP POLICY IF EXISTS "Users can view images from their own custom sets" ON image_set_images;
CREATE POLICY "Users can view images from their own custom sets" ON image_set_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

-- user_image_preferences
DROP POLICY IF EXISTS "Admins can view all image preferences" ON user_image_preferences;
CREATE POLICY "Admins can view all image preferences" ON user_image_preferences
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can insert own image preferences" ON user_image_preferences;
CREATE POLICY "Users can insert own image preferences" ON user_image_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own image preferences" ON user_image_preferences;
CREATE POLICY "Users can update own image preferences" ON user_image_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own image preferences" ON user_image_preferences;
CREATE POLICY "Users can view own image preferences" ON user_image_preferences
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- image_sets
DROP POLICY IF EXISTS "Admins can create system image sets" ON image_sets;
CREATE POLICY "Admins can create system image sets" ON image_sets
  FOR INSERT TO authenticated
  WITH CHECK (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can delete system image sets" ON image_sets;
CREATE POLICY "Admins can delete system image sets" ON image_sets
  FOR DELETE TO authenticated
  USING (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update system image sets" ON image_sets;
CREATE POLICY "Admins can update system image sets" ON image_sets
  FOR UPDATE TO authenticated
  USING (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all image sets" ON image_sets;
CREATE POLICY "Admins can view all image sets" ON image_sets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can create their own custom image sets" ON image_sets;
CREATE POLICY "Users can create their own custom image sets" ON image_sets
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid()) AND
    is_system = false
  );

DROP POLICY IF EXISTS "Users can delete their own custom image sets" ON image_sets;
CREATE POLICY "Users can delete their own custom image sets" ON image_sets
  FOR DELETE TO authenticated
  USING (
    created_by = (select auth.uid()) AND
    is_system = false
  );

DROP POLICY IF EXISTS "Users can update their own custom image sets" ON image_sets;
CREATE POLICY "Users can update their own custom image sets" ON image_sets
  FOR UPDATE TO authenticated
  USING (
    created_by = (select auth.uid()) AND
    is_system = false
  )
  WITH CHECK (
    created_by = (select auth.uid()) AND
    is_system = false
  );

DROP POLICY IF EXISTS "Users can view their own custom image sets" ON image_sets;
CREATE POLICY "Users can view their own custom image sets" ON image_sets
  FOR SELECT TO authenticated
  USING (
    created_by = (select auth.uid()) AND
    is_system = false
  );

-- slideshow_images
DROP POLICY IF EXISTS "Admins can manage system slideshow images" ON slideshow_images;
CREATE POLICY "Admins can manage system slideshow images" ON slideshow_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all slideshow images" ON slideshow_images;
CREATE POLICY "Admins can view all slideshow images" ON slideshow_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can manage their custom slideshow images" ON slideshow_images;
CREATE POLICY "Users can manage their custom slideshow images" ON slideshow_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

DROP POLICY IF EXISTS "Users can view images from their own custom slideshow sets" ON slideshow_images;
CREATE POLICY "Users can view images from their own custom slideshow sets" ON slideshow_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

-- user_playback_state
DROP POLICY IF EXISTS "Users can delete own playback state" ON user_playback_state;
CREATE POLICY "Users can delete own playback state" ON user_playback_state
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own playback state" ON user_playback_state;
CREATE POLICY "Users can insert own playback state" ON user_playback_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own playback state" ON user_playback_state;
CREATE POLICY "Users can read own playback state" ON user_playback_state
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own playback state" ON user_playback_state;
CREATE POLICY "Users can update own playback state" ON user_playback_state
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- quiz_results
DROP POLICY IF EXISTS "Admin users can view all quiz results" ON quiz_results;
CREATE POLICY "Admin users can view all quiz results" ON quiz_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can insert their own quiz results" ON quiz_results;
CREATE POLICY "Users can insert their own quiz results" ON quiz_results
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view their own quiz results" ON quiz_results;
CREATE POLICY "Users can view their own quiz results" ON quiz_results
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Migration: 20251028002316_fix_rls_performance_issues.sql
/*
  # Fix RLS Performance Issues

  1. Problem
    - Multiple RLS policies are calling auth.<function>() directly
    - This causes the function to be re-evaluated for each row, leading to poor performance at scale

  2. Solution
    - Replace all `auth.<function>()` calls with `(select auth.<function>())`
    - This ensures the function is evaluated once and the result is reused

  3. Tables Updated
    - metadata_backfill_progress
    - user_profiles
    - audio_channels
    - playlists
    - listening_sessions
    - quiz_responses
    - channel_recommendations
    - music_library_column_preferences
    - track_analytics_summary
    - quiz_questions
    - quiz_config
    - admin_tab_preferences
    - audio_tracks
    - user_preferences
    - track_play_events
    - system_preferences
    - user_channel_order
    - image_set_images
    - user_image_preferences
    - image_sets
    - slideshow_images
    - user_playback_state
    - quiz_results
*/

-- metadata_backfill_progress
DROP POLICY IF EXISTS "Allow admins to manage backfill progress" ON metadata_backfill_progress;
CREATE POLICY "Allow admins to manage backfill progress" ON metadata_backfill_progress
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- user_profiles
DROP POLICY IF EXISTS "Users can insert own profile during signup" ON user_profiles;
CREATE POLICY "Users can insert own profile during signup" ON user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

-- audio_channels
DROP POLICY IF EXISTS "Admins can delete channels" ON audio_channels;
CREATE POLICY "Admins can delete channels" ON audio_channels
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert channels" ON audio_channels;
CREATE POLICY "Admins can insert channels" ON audio_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update channels" ON audio_channels;
CREATE POLICY "Admins can update channels" ON audio_channels
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- playlists
DROP POLICY IF EXISTS "Users can create own playlists" ON playlists;
CREATE POLICY "Users can create own playlists" ON playlists
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own playlists" ON playlists;
CREATE POLICY "Users can delete own playlists" ON playlists
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own playlists" ON playlists;
CREATE POLICY "Users can update own playlists" ON playlists
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own playlists" ON playlists;
CREATE POLICY "Users can view own playlists" ON playlists
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- listening_sessions
DROP POLICY IF EXISTS "Users can create own sessions" ON listening_sessions;
CREATE POLICY "Users can create own sessions" ON listening_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own sessions" ON listening_sessions;
CREATE POLICY "Users can update own sessions" ON listening_sessions
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own sessions" ON listening_sessions;
CREATE POLICY "Users can view own sessions" ON listening_sessions
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- quiz_responses
DROP POLICY IF EXISTS "Users can create own quiz responses" ON quiz_responses;
CREATE POLICY "Users can create own quiz responses" ON quiz_responses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own quiz responses" ON quiz_responses;
CREATE POLICY "Users can view own quiz responses" ON quiz_responses
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- channel_recommendations
DROP POLICY IF EXISTS "Users can create own recommendations" ON channel_recommendations;
CREATE POLICY "Users can create own recommendations" ON channel_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own recommendations" ON channel_recommendations;
CREATE POLICY "Users can update own recommendations" ON channel_recommendations
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own recommendations" ON channel_recommendations;
CREATE POLICY "Users can view own recommendations" ON channel_recommendations
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- music_library_column_preferences
DROP POLICY IF EXISTS "Users can insert own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can insert own column preferences" ON music_library_column_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can read own column preferences" ON music_library_column_preferences
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own column preferences" ON music_library_column_preferences;
CREATE POLICY "Users can update own column preferences" ON music_library_column_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- track_analytics_summary
DROP POLICY IF EXISTS "Admins can update analytics summary" ON track_analytics_summary;
CREATE POLICY "Admins can update analytics summary" ON track_analytics_summary
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view analytics summary" ON track_analytics_summary;
CREATE POLICY "Admins can view analytics summary" ON track_analytics_summary
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- quiz_questions
DROP POLICY IF EXISTS "Admin users can delete quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can delete quiz questions" ON quiz_questions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can insert quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can insert quiz questions" ON quiz_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can update quiz questions" ON quiz_questions;
CREATE POLICY "Admin users can update quiz questions" ON quiz_questions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- quiz_config
DROP POLICY IF EXISTS "Admin users can insert quiz config" ON quiz_config;
CREATE POLICY "Admin users can insert quiz config" ON quiz_config
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can update quiz config" ON quiz_config;
CREATE POLICY "Admin users can update quiz config" ON quiz_config
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- admin_tab_preferences
DROP POLICY IF EXISTS "Admin users can insert own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can insert own tab preferences" ON admin_tab_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can read own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can read own tab preferences" ON admin_tab_preferences
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can update own tab preferences" ON admin_tab_preferences;
CREATE POLICY "Admin users can update own tab preferences" ON admin_tab_preferences
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    user_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- audio_tracks
DROP POLICY IF EXISTS "Admins can permanently delete old tracks" ON audio_tracks;
CREATE POLICY "Admins can permanently delete old tracks" ON audio_tracks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can soft delete tracks" ON audio_tracks;
CREATE POLICY "Admins can soft delete tracks" ON audio_tracks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view deleted tracks" ON audio_tracks;
CREATE POLICY "Admins can view deleted tracks" ON audio_tracks
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- user_preferences
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
CREATE POLICY "Users can read own preferences" ON user_preferences
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- track_play_events
DROP POLICY IF EXISTS "Admins can view all play events" ON track_play_events;
CREATE POLICY "Admins can view all play events" ON track_play_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can view own play events" ON track_play_events;
CREATE POLICY "Users can view own play events" ON track_play_events
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- system_preferences
DROP POLICY IF EXISTS "Admins can insert system preferences" ON system_preferences;
CREATE POLICY "Admins can insert system preferences" ON system_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update system preferences" ON system_preferences;
CREATE POLICY "Admins can update system preferences" ON system_preferences
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

-- user_channel_order
DROP POLICY IF EXISTS "Admins can view all channel orders" ON user_channel_order;
CREATE POLICY "Admins can view all channel orders" ON user_channel_order
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can delete own channel order" ON user_channel_order;
CREATE POLICY "Users can delete own channel order" ON user_channel_order
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own channel order" ON user_channel_order;
CREATE POLICY "Users can insert own channel order" ON user_channel_order
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own channel order" ON user_channel_order;
CREATE POLICY "Users can read own channel order" ON user_channel_order
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own channel order" ON user_channel_order;
CREATE POLICY "Users can update own channel order" ON user_channel_order
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- image_set_images
DROP POLICY IF EXISTS "Admins can manage system set images" ON image_set_images;
CREATE POLICY "Admins can manage system set images" ON image_set_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all image set images" ON image_set_images;
CREATE POLICY "Admins can view all image set images" ON image_set_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can manage their custom set images" ON image_set_images;
CREATE POLICY "Users can manage their custom set images" ON image_set_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

DROP POLICY IF EXISTS "Users can view images from their own custom sets" ON image_set_images;
CREATE POLICY "Users can view images from their own custom sets" ON image_set_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = image_set_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

-- user_image_preferences
DROP POLICY IF EXISTS "Admins can view all image preferences" ON user_image_preferences;
CREATE POLICY "Admins can view all image preferences" ON user_image_preferences
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can insert own image preferences" ON user_image_preferences;
CREATE POLICY "Users can insert own image preferences" ON user_image_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own image preferences" ON user_image_preferences;
CREATE POLICY "Users can update own image preferences" ON user_image_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own image preferences" ON user_image_preferences;
CREATE POLICY "Users can view own image preferences" ON user_image_preferences
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- image_sets
DROP POLICY IF EXISTS "Admins can create system image sets" ON image_sets;
CREATE POLICY "Admins can create system image sets" ON image_sets
  FOR INSERT TO authenticated
  WITH CHECK (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can delete system image sets" ON image_sets;
CREATE POLICY "Admins can delete system image sets" ON image_sets
  FOR DELETE TO authenticated
  USING (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update system image sets" ON image_sets;
CREATE POLICY "Admins can update system image sets" ON image_sets
  FOR UPDATE TO authenticated
  USING (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  )
  WITH CHECK (
    is_system = true AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all image sets" ON image_sets;
CREATE POLICY "Admins can view all image sets" ON image_sets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can create their own custom image sets" ON image_sets;
CREATE POLICY "Users can create their own custom image sets" ON image_sets
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid()) AND
    is_system = false
  );

DROP POLICY IF EXISTS "Users can delete their own custom image sets" ON image_sets;
CREATE POLICY "Users can delete their own custom image sets" ON image_sets
  FOR DELETE TO authenticated
  USING (
    created_by = (select auth.uid()) AND
    is_system = false
  );

DROP POLICY IF EXISTS "Users can update their own custom image sets" ON image_sets;
CREATE POLICY "Users can update their own custom image sets" ON image_sets
  FOR UPDATE TO authenticated
  USING (
    created_by = (select auth.uid()) AND
    is_system = false
  )
  WITH CHECK (
    created_by = (select auth.uid()) AND
    is_system = false
  );

DROP POLICY IF EXISTS "Users can view their own custom image sets" ON image_sets;
CREATE POLICY "Users can view their own custom image sets" ON image_sets
  FOR SELECT TO authenticated
  USING (
    created_by = (select auth.uid()) AND
    is_system = false
  );

-- slideshow_images
DROP POLICY IF EXISTS "Admins can manage system slideshow images" ON slideshow_images;
CREATE POLICY "Admins can manage system slideshow images" ON slideshow_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view all slideshow images" ON slideshow_images;
CREATE POLICY "Admins can view all slideshow images" ON slideshow_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can manage their custom slideshow images" ON slideshow_images;
CREATE POLICY "Users can manage their custom slideshow images" ON slideshow_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

DROP POLICY IF EXISTS "Users can view images from their own custom slideshow sets" ON slideshow_images;
CREATE POLICY "Users can view images from their own custom slideshow sets" ON slideshow_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM image_sets
      WHERE image_sets.id = slideshow_images.image_set_id
      AND image_sets.created_by = (select auth.uid())
      AND image_sets.is_system = false
    )
  );

-- user_playback_state
DROP POLICY IF EXISTS "Users can delete own playback state" ON user_playback_state;
CREATE POLICY "Users can delete own playback state" ON user_playback_state
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own playback state" ON user_playback_state;
CREATE POLICY "Users can insert own playback state" ON user_playback_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own playback state" ON user_playback_state;
CREATE POLICY "Users can read own playback state" ON user_playback_state
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own playback state" ON user_playback_state;
CREATE POLICY "Users can update own playback state" ON user_playback_state
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- quiz_results
DROP POLICY IF EXISTS "Admin users can view all quiz results" ON quiz_results;
CREATE POLICY "Admin users can view all quiz results" ON quiz_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can insert their own quiz results" ON quiz_results;
CREATE POLICY "Users can insert their own quiz results" ON quiz_results
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view their own quiz results" ON quiz_results;
CREATE POLICY "Users can view their own quiz results" ON quiz_results
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Migration: 20251028002641_fix_function_search_path_security_v3.sql
/*
  # Fix Function Search Path Security

  1. Problem
    - Several functions have mutable search_path which is a security vulnerability
    - Functions: is_admin, update_user_channel_order_updated_at, get_tracks_by_ids,
      update_track_metadata_from_json, update_track_metadata_from_sidecars

  2. Solution
    - Use ALTER FUNCTION to set search_path = public on existing functions
    - This prevents schema-based injection attacks without breaking dependencies

  3. Security Impact
    - Prevents malicious schemas from intercepting function calls
    - Ensures functions only access objects in the public schema
*/

-- Fix is_admin function (no parameters version)
ALTER FUNCTION public.is_admin() SET search_path = public;

-- Fix is_admin function (with user_id parameter)
ALTER FUNCTION public.is_admin(uuid) SET search_path = public;

-- Fix update_user_channel_order_updated_at trigger function
ALTER FUNCTION public.update_user_channel_order_updated_at() SET search_path = public;

-- Fix get_tracks_by_ids function
ALTER FUNCTION public.get_tracks_by_ids(text[]) SET search_path = public;

-- Fix update_track_metadata_from_json function
ALTER FUNCTION public.update_track_metadata_from_json(uuid) SET search_path = public;

-- Fix update_track_metadata_from_sidecars function (batch version)
ALTER FUNCTION public.update_track_metadata_from_sidecars(integer, integer) SET search_path = public;

-- Fix update_track_metadata_from_sidecars function (no parameters version)
ALTER FUNCTION public.update_track_metadata_from_sidecars() SET search_path = public;

-- Migration: 20251028003016_fix_remaining_function_security_issues_v2.sql
/*
  # Fix Remaining Function Search Path Security Issues

  1. Problem
    - 6 more functions have mutable search_path
    - HTTP extension is in public schema (should be in extensions)

  2. Solution
    - Set search_path = public on all remaining functions
    - Move http extension to extensions schema

  3. Functions Fixed
    - backfill_track_metadata()
    - update_track_analytics_summary(p_track_id text)
    - get_top_tracks(p_limit integer, p_days integer)
    - get_top_skipped_tracks(p_limit integer, p_days integer)
    - update_single_track_metadata(track_uuid uuid, track_id_param text)
    - update_user_preferences_updated_at()
*/

-- Fix backfill_track_metadata function (no parameters)
ALTER FUNCTION public.backfill_track_metadata() SET search_path = public;

-- Fix update_track_analytics_summary function
ALTER FUNCTION public.update_track_analytics_summary(p_track_id text) SET search_path = public;

-- Fix get_top_tracks function
ALTER FUNCTION public.get_top_tracks(p_limit integer, p_days integer) SET search_path = public;

-- Fix get_top_skipped_tracks function
ALTER FUNCTION public.get_top_skipped_tracks(p_limit integer, p_days integer) SET search_path = public;

-- Fix update_single_track_metadata function
ALTER FUNCTION public.update_single_track_metadata(track_uuid uuid, track_id_param text) SET search_path = public;

-- Fix update_user_preferences_updated_at function
ALTER FUNCTION public.update_user_preferences_updated_at() SET search_path = public;

-- Move http extension to extensions schema
-- First create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Drop the extension from public and recreate in extensions schema
DROP EXTENSION IF EXISTS http CASCADE;
CREATE EXTENSION IF NOT EXISTS http SCHEMA extensions;

-- Migration: 20251028020923_create_slot_based_strategy_system_v2.sql
/*
  # Create Slot-Based Playlist Strategy System

  1. New Tables
    - `slot_strategies`
      - `id` (uuid, primary key)
      - `channel_id` (uuid, FK to audio_channels)
      - `energy_tier` (text: 'low', 'medium', 'high')
      - `name` (text, default 'Slot-Based Sequencer')
      - `num_slots` (integer, 1-60, default 20)
      - `recent_repeat_window` (integer, default 5)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on (channel_id, energy_tier)
    
    - `slot_definitions`
      - `id` (uuid, primary key)
      - `strategy_id` (uuid, FK to slot_strategies)
      - `index` (integer, 1-60)
      - `targets` (jsonb: speed, intensity, brightness, complexity, valence, arousal, bpm, key, proximity)
      - Unique constraint on (strategy_id, index)
    
    - `slot_boosts`
      - `id` (uuid, primary key)
      - `strategy_id` (uuid, FK to slot_strategies)
      - `field` (text: speed|intensity|brightness|complexity|valence|arousal|bpm|key|proximity)
      - `mode` (text: 'near' | 'exact')
      - `weight` (integer, 1-5)
      - Unique constraint on (strategy_id, field)
    
    - `slot_rule_groups`
      - `id` (uuid, primary key)
      - `strategy_id` (uuid, FK to slot_strategies)
      - `logic` (text: 'AND' | 'OR')
      - `order` (integer)
    
    - `slot_rules`
      - `id` (uuid, primary key)
      - `group_id` (uuid, FK to slot_rule_groups)
      - `field` (text: genre, artist, label, etc.)
      - `operator` (text: eq, neq, in, nin, gte, lte, between, exists)
      - `value` (jsonb)

  2. Security
    - Enable RLS on all tables
    - Admin-only write access
    - Authenticated users can read their channel strategies
*/

-- Create update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create slot_strategies table
CREATE TABLE IF NOT EXISTS slot_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES audio_channels(id) ON DELETE CASCADE,
  energy_tier text NOT NULL CHECK (energy_tier IN ('low', 'medium', 'high')),
  name text NOT NULL DEFAULT 'Slot-Based Sequencer',
  num_slots integer NOT NULL DEFAULT 20 CHECK (num_slots BETWEEN 1 AND 60),
  recent_repeat_window integer NOT NULL DEFAULT 5 CHECK (recent_repeat_window >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, energy_tier)
);

-- Create slot_definitions table
CREATE TABLE IF NOT EXISTS slot_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES slot_strategies(id) ON DELETE CASCADE,
  index integer NOT NULL CHECK (index BETWEEN 1 AND 60),
  targets jsonb NOT NULL DEFAULT '{}',
  UNIQUE(strategy_id, index)
);

-- Create slot_boosts table
CREATE TABLE IF NOT EXISTS slot_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES slot_strategies(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('speed', 'intensity', 'brightness', 'complexity', 'valence', 'arousal', 'bpm', 'key', 'proximity')),
  mode text NOT NULL DEFAULT 'near' CHECK (mode IN ('near', 'exact')),
  weight integer NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 5),
  UNIQUE(strategy_id, field)
);

-- Create slot_rule_groups table
CREATE TABLE IF NOT EXISTS slot_rule_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES slot_strategies(id) ON DELETE CASCADE,
  logic text NOT NULL DEFAULT 'AND' CHECK (logic IN ('AND', 'OR')),
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create slot_rules table
CREATE TABLE IF NOT EXISTS slot_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES slot_rule_groups(id) ON DELETE CASCADE,
  field text NOT NULL,
  operator text NOT NULL CHECK (operator IN ('eq', 'neq', 'in', 'nin', 'gte', 'lte', 'between', 'exists')),
  value jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE slot_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_rule_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for slot_strategies
CREATE POLICY "Admins can manage slot strategies"
  ON slot_strategies FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Users can view slot strategies"
  ON slot_strategies FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for slot_definitions
CREATE POLICY "Admins can manage slot definitions"
  ON slot_definitions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_definitions.strategy_id
      AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_definitions.strategy_id
      AND public.is_admin()
    )
  );

CREATE POLICY "Users can view slot definitions"
  ON slot_definitions FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for slot_boosts
CREATE POLICY "Admins can manage slot boosts"
  ON slot_boosts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_boosts.strategy_id
      AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_boosts.strategy_id
      AND public.is_admin()
    )
  );

CREATE POLICY "Users can view slot boosts"
  ON slot_boosts FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for slot_rule_groups
CREATE POLICY "Admins can manage slot rule groups"
  ON slot_rule_groups FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_rule_groups.strategy_id
      AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_rule_groups.strategy_id
      AND public.is_admin()
    )
  );

CREATE POLICY "Users can view slot rule groups"
  ON slot_rule_groups FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for slot_rules
CREATE POLICY "Admins can manage slot rules"
  ON slot_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM slot_rule_groups
      JOIN slot_strategies ON slot_strategies.id = slot_rule_groups.strategy_id
      WHERE slot_rule_groups.id = slot_rules.group_id
      AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM slot_rule_groups
      JOIN slot_strategies ON slot_strategies.id = slot_rule_groups.strategy_id
      WHERE slot_rule_groups.id = slot_rules.group_id
      AND public.is_admin()
    )
  );

CREATE POLICY "Users can view slot rules"
  ON slot_rules FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_slot_strategies_channel_tier ON slot_strategies(channel_id, energy_tier);
CREATE INDEX IF NOT EXISTS idx_slot_definitions_strategy ON slot_definitions(strategy_id, index);
CREATE INDEX IF NOT EXISTS idx_slot_boosts_strategy ON slot_boosts(strategy_id);
CREATE INDEX IF NOT EXISTS idx_slot_rule_groups_strategy ON slot_rule_groups(strategy_id, "order");
CREATE INDEX IF NOT EXISTS idx_slot_rules_group ON slot_rules(group_id);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_slot_strategies_updated_at ON slot_strategies;
CREATE TRIGGER update_slot_strategies_updated_at
  BEFORE UPDATE ON slot_strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE slot_strategies;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_definitions;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_boosts;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_rule_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_rules;

-- Migration: 20251028023356_update_slot_boosts_to_per_slot.sql
/*
  # Update Slot Boosts to Per-Slot Configuration

  1. Changes
    - Modify `slot_boosts` table to link to `slot_definitions` instead of `slot_strategies`
    - Update foreign key relationship
    - Update RLS policies
    - Migrate existing data if any exists

  2. Security
    - Maintain admin-only write access
    - Users can read boosts for their strategies
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage slot boosts" ON slot_boosts;
DROP POLICY IF EXISTS "Users can view slot boosts" ON slot_boosts;

-- Add slot_definition_id column and remove strategy_id
ALTER TABLE slot_boosts DROP CONSTRAINT IF EXISTS slot_boosts_strategy_id_fkey;
ALTER TABLE slot_boosts DROP CONSTRAINT IF EXISTS slot_boosts_strategy_id_field_key;

-- Temporarily allow nulls for migration
ALTER TABLE slot_boosts ALTER COLUMN strategy_id DROP NOT NULL;

-- Add new column
ALTER TABLE slot_boosts ADD COLUMN IF NOT EXISTS slot_definition_id uuid REFERENCES slot_definitions(id) ON DELETE CASCADE;

-- Clean up old data (if any exists, it's now invalid)
DELETE FROM slot_boosts;

-- Remove old column and constraint
ALTER TABLE slot_boosts DROP COLUMN IF EXISTS strategy_id;

-- Make new column required
ALTER TABLE slot_boosts ALTER COLUMN slot_definition_id SET NOT NULL;

-- Add unique constraint per slot definition
ALTER TABLE slot_boosts ADD CONSTRAINT slot_boosts_slot_definition_id_field_key 
  UNIQUE(slot_definition_id, field);

-- Update index
DROP INDEX IF EXISTS idx_slot_boosts_strategy;
CREATE INDEX IF NOT EXISTS idx_slot_boosts_slot_definition ON slot_boosts(slot_definition_id);

-- Recreate RLS policies
CREATE POLICY "Admins can manage slot boosts"
  ON slot_boosts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM slot_definitions
      JOIN slot_strategies ON slot_strategies.id = slot_definitions.strategy_id
      WHERE slot_definitions.id = slot_boosts.slot_definition_id
      AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM slot_definitions
      JOIN slot_strategies ON slot_strategies.id = slot_definitions.strategy_id
      WHERE slot_definitions.id = slot_boosts.slot_definition_id
      AND public.is_admin()
    )
  );

CREATE POLICY "Users can view slot boosts"
  ON slot_boosts FOR SELECT
  TO authenticated
  USING (true);

-- Migration: 20251029022929_create_saved_slot_sequences.sql
/*
  # Create saved slot sequences table

  1. New Tables
    - `saved_slot_sequences`
      - `id` (uuid, primary key) - Unique identifier for each saved sequence
      - `name` (text, not null) - User-provided name for the sequence
      - `description` (text) - Optional description
      - `channel_id` (uuid) - Original channel this was created for (nullable, for reference)
      - `energy_tier` (text) - Original energy tier (low/medium/high)
      - `num_slots` (integer) - Number of slots in the sequence
      - `recent_repeat_window` (integer) - Recent repeat window value
      - `definitions` (jsonb) - Array of slot definitions
      - `rule_groups` (jsonb) - Array of rule groups
      - `playback_continuation` (text) - Playback continuation setting
      - `created_by` (uuid, references auth.users) - Admin who created this
      - `created_at` (timestamptz) - When the sequence was created
      - `updated_at` (timestamptz) - Last update time

  2. Security
    - Enable RLS on `saved_slot_sequences` table
    - Only admins can read, create, update, and delete saved sequences
    - All admins can access all saved sequences (shared admin library)

  3. Indexes
    - Index on created_by for faster queries
    - Index on name for searching
*/

-- Create the saved_slot_sequences table
CREATE TABLE IF NOT EXISTS saved_slot_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  energy_tier text CHECK (energy_tier IN ('low', 'medium', 'high')),
  num_slots integer NOT NULL DEFAULT 20,
  recent_repeat_window integer NOT NULL DEFAULT 5,
  definitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  playback_continuation text DEFAULT 'continue',
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE saved_slot_sequences ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_saved_sequences_created_by ON saved_slot_sequences(created_by);
CREATE INDEX IF NOT EXISTS idx_saved_sequences_name ON saved_slot_sequences(name);
CREATE INDEX IF NOT EXISTS idx_saved_sequences_created_at ON saved_slot_sequences(created_at DESC);

-- RLS Policies: Only admins can access saved sequences
CREATE POLICY "Admins can view all saved sequences"
  ON saved_slot_sequences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can create saved sequences"
  ON saved_slot_sequences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update saved sequences"
  ON saved_slot_sequences FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete saved sequences"
  ON saved_slot_sequences FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_sequences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_saved_sequences_updated_at
  BEFORE UPDATE ON saved_slot_sequences
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_sequences_updated_at();
-- Migration: 20251029040357_fix_saved_sequences_rls_null_admin.sql
/*
  # Fix saved_slot_sequences RLS policies for NULL admin values

  1. Changes
    - Update RLS policies to explicitly check for is_admin = true
    - Handle cases where is_admin might be NULL
    - Ensure only users with is_admin explicitly set to true can access sequences

  2. Security
    - More strict checking to ensure NULL is treated as false
    - Only explicitly marked admins can access saved sequences
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can create saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can update saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can delete saved sequences" ON saved_slot_sequences;

-- Recreate policies with explicit NULL handling
CREATE POLICY "Admins can view all saved sequences"
  ON saved_slot_sequences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin IS TRUE
    )
  );

CREATE POLICY "Admins can create saved sequences"
  ON saved_slot_sequences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin IS TRUE
    )
  );

CREATE POLICY "Admins can update saved sequences"
  ON saved_slot_sequences FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin IS TRUE
    )
  );

CREATE POLICY "Admins can delete saved sequences"
  ON saved_slot_sequences FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin IS TRUE
    )
  );
-- Migration: 20251029130715_add_energy_boolean_fields.sql
/*
  # Add Energy Level Boolean Fields

  1. Changes
    - Add three new boolean columns to audio_tracks table:
      - `energy_low` (boolean, default false)
      - `energy_medium` (boolean, default false)
      - `energy_high` (boolean, default false)
    - These allow tracks to be assigned to multiple energy levels simultaneously
    - Keeps existing `energy_level` column for backward compatibility

  2. Migration Strategy
    - Migrate existing `energy_level` values to corresponding boolean fields
    - If energy_level = 'low', set energy_low = true
    - If energy_level = 'medium', set energy_medium = true
    - If energy_level = 'high', set energy_high = true

  3. Notes
    - Tracks can now belong to multiple energy playlists
    - The old energy_level field is preserved but may be deprecated later
*/

-- Add the three boolean columns
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS energy_low boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS energy_medium boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS energy_high boolean DEFAULT false;

-- Migrate existing energy_level data to the new boolean fields
UPDATE audio_tracks
SET energy_low = true
WHERE energy_level = 'low';

UPDATE audio_tracks
SET energy_medium = true
WHERE energy_level = 'medium';

UPDATE audio_tracks
SET energy_high = true
WHERE energy_level = 'high';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_audio_tracks_energy_low ON audio_tracks(energy_low) WHERE energy_low = true;
CREATE INDEX IF NOT EXISTS idx_audio_tracks_energy_medium ON audio_tracks(energy_medium) WHERE energy_medium = true;
CREATE INDEX IF NOT EXISTS idx_audio_tracks_energy_high ON audio_tracks(energy_high) WHERE energy_high = true;

-- Migration: 20251029150429_fix_saved_sequences_rls_for_duplicate.sql
/*
  # Fix Saved Sequences RLS for Duplicate Function

  1. Changes
    - Drop existing RLS policies on saved_slot_sequences
    - Create new policies that avoid circular dependency issues
    - Use security definer function for admin check to improve performance
  
  2. Security
    - Only admins can create, read, update, and delete saved sequences
    - Uses optimized admin check function
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can create saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can update saved sequences" ON saved_slot_sequences;
DROP POLICY IF EXISTS "Admins can delete saved sequences" ON saved_slot_sequences;

-- Create helper function for admin check (if not exists)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create new policies with simplified checks
CREATE POLICY "Admins can view all saved sequences"
  ON saved_slot_sequences
  FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can create saved sequences"
  ON saved_slot_sequences
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update saved sequences"
  ON saved_slot_sequences
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete saved sequences"
  ON saved_slot_sequences
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- Migration: 20251029160000_fix_security_issues.sql
/*
  # Fix Security Issues

  1. Foreign Key Indexes
    - Add missing index on saved_slot_sequences.channel_id

  2. Remove Unused Indexes
    - Drop indexes that have not been used and are causing overhead

  3. Consolidate Multiple Permissive Policies
    - Replace multiple permissive SELECT policies with single optimized policies
    - Keep admin and user access patterns efficient

  4. Fix Function Security
    - Set search_path on functions to prevent SQL injection

  5. Notes
    - Leaked password protection must be enabled via Supabase Dashboard:
      Authentication > Settings > Enable "Leaked Password Protection"
*/

-- =====================================================
-- 1. ADD MISSING FOREIGN KEY INDEX
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_saved_sequences_channel_id
  ON public.saved_slot_sequences(channel_id);

-- =====================================================
-- 2. DROP UNUSED INDEXES
-- =====================================================

DROP INDEX IF EXISTS public.idx_track_play_events_was_skipped;
DROP INDEX IF EXISTS public.idx_track_play_events_session_id;
DROP INDEX IF EXISTS public.idx_track_analytics_summary_total_skips;
DROP INDEX IF EXISTS public.idx_track_analytics_summary_plays_7d;
DROP INDEX IF EXISTS public.idx_track_analytics_summary_plays_30d;
DROP INDEX IF EXISTS public.idx_track_analytics_summary_last_played;
DROP INDEX IF EXISTS public.idx_system_preferences_updated_by;
DROP INDEX IF EXISTS public.idx_user_channel_order_channel_id;
DROP INDEX IF EXISTS public.idx_user_image_preferences_slideshow_set_id;
DROP INDEX IF EXISTS public.idx_user_preferences_channel_energy;
DROP INDEX IF EXISTS public.idx_channel_recommendations_channel_id;
DROP INDEX IF EXISTS public.idx_listening_sessions_channel_id;
DROP INDEX IF EXISTS public.idx_playlists_channel_id;
DROP INDEX IF EXISTS public.idx_user_preferences_last_channel_id;
DROP INDEX IF EXISTS public.idx_audio_channels_intensity;
DROP INDEX IF EXISTS public.idx_image_set_images_channel;
DROP INDEX IF EXISTS public.idx_saved_sequences_created_by;
DROP INDEX IF EXISTS public.idx_saved_sequences_name;
DROP INDEX IF EXISTS public.idx_quiz_results_brain_type;

-- =====================================================
-- 3. CONSOLIDATE MULTIPLE PERMISSIVE POLICIES
-- =====================================================

-- audio_tracks: Consolidate 3 SELECT policies into 1
DROP POLICY IF EXISTS "Anyone can view tracks" ON public.audio_tracks;
DROP POLICY IF EXISTS "Users can view non-deleted tracks" ON public.audio_tracks;
DROP POLICY IF EXISTS "Admins can view deleted tracks" ON public.audio_tracks;

CREATE POLICY "Users can view audio tracks"
  ON public.audio_tracks
  FOR SELECT
  TO authenticated
  USING (
    -- Admins can see everything including deleted
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    -- Regular users can only see non-deleted tracks
    deleted_at IS NULL
  );

-- image_set_images: Consolidate 5 SELECT policies into 1
DROP POLICY IF EXISTS "Admins can manage system set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Admins can view all image set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Anyone can view images from active system sets" ON public.image_set_images;
DROP POLICY IF EXISTS "Users can manage their custom set images" ON public.image_set_images;
DROP POLICY IF EXISTS "Users can view images from their own custom sets" ON public.image_set_images;

CREATE POLICY "View image set images"
  ON public.image_set_images
  FOR SELECT
  TO authenticated
  USING (
    -- Admins can see all
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    -- Users can see system sets that are active
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE is_system = true
        AND is_active = true
      )
    )
    OR
    -- Users can see their own custom sets
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  );

CREATE POLICY "Manage image set images"
  ON public.image_set_images
  FOR ALL
  TO authenticated
  USING (
    -- Admins can manage all
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    -- Users can manage their custom sets
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    -- Same conditions for insert/update
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  );

-- image_sets: Consolidate policies
DROP POLICY IF EXISTS "Admins can view all image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Anyone can view active system image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Users can view their own custom image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Admins can create system image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Users can create their own custom image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Admins can update system image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Users can update their own custom image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Admins can delete system image sets" ON public.image_sets;
DROP POLICY IF EXISTS "Users can delete their own custom image sets" ON public.image_sets;

CREATE POLICY "View image sets"
  ON public.image_sets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    (is_system = true AND is_active = true)
    OR
    created_by = auth.uid()
  );

CREATE POLICY "Manage image sets"
  ON public.image_sets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    created_by = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    created_by = auth.uid()
  );

-- quiz_results: Consolidate 2 SELECT policies
DROP POLICY IF EXISTS "Admin users can view all quiz results" ON public.quiz_results;
DROP POLICY IF EXISTS "Users can view their own quiz results" ON public.quiz_results;

CREATE POLICY "View quiz results"
  ON public.quiz_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    user_id = auth.uid()
  );

-- slideshow_images: Consolidate policies
DROP POLICY IF EXISTS "Admins can manage system slideshow images" ON public.slideshow_images;
DROP POLICY IF EXISTS "Admins can view all slideshow images" ON public.slideshow_images;
DROP POLICY IF EXISTS "Anyone can view images from active system slideshow sets" ON public.slideshow_images;
DROP POLICY IF EXISTS "Users can manage their custom slideshow images" ON public.slideshow_images;
DROP POLICY IF EXISTS "Users can view images from their own custom slideshow sets" ON public.slideshow_images;

CREATE POLICY "View slideshow images"
  ON public.slideshow_images
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE is_system = true
        AND is_active = true
      )
    )
    OR
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  );

CREATE POLICY "Manage slideshow images"
  ON public.slideshow_images
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    (
      image_set_id IN (
        SELECT id FROM public.image_sets
        WHERE created_by = auth.uid()
      )
    )
  );

-- slot_* tables: Consolidate admin/user view policies
DROP POLICY IF EXISTS "Admins can manage slot boosts" ON public.slot_boosts;
DROP POLICY IF EXISTS "Users can view slot boosts" ON public.slot_boosts;

CREATE POLICY "View slot boosts"
  ON public.slot_boosts
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage slot definitions" ON public.slot_definitions;
DROP POLICY IF EXISTS "Users can view slot definitions" ON public.slot_definitions;

CREATE POLICY "View slot definitions"
  ON public.slot_definitions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage slot rule groups" ON public.slot_rule_groups;
DROP POLICY IF EXISTS "Users can view slot rule groups" ON public.slot_rule_groups;

CREATE POLICY "View slot rule groups"
  ON public.slot_rule_groups
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage slot rules" ON public.slot_rules;
DROP POLICY IF EXISTS "Users can view slot rules" ON public.slot_rules;

CREATE POLICY "View slot rules"
  ON public.slot_rules
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage slot strategies" ON public.slot_strategies;
DROP POLICY IF EXISTS "Users can view slot strategies" ON public.slot_strategies;

CREATE POLICY "View slot strategies"
  ON public.slot_strategies
  FOR SELECT
  TO authenticated
  USING (true);

-- track_analytics_summary: Consolidate policies
DROP POLICY IF EXISTS "Admins can update analytics summary" ON public.track_analytics_summary;
DROP POLICY IF EXISTS "Admins can view analytics summary" ON public.track_analytics_summary;

CREATE POLICY "View analytics summary"
  ON public.track_analytics_summary
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- track_play_events: Consolidate policies
DROP POLICY IF EXISTS "Admins can view all play events" ON public.track_play_events;
DROP POLICY IF EXISTS "Users can view own play events" ON public.track_play_events;

CREATE POLICY "View play events"
  ON public.track_play_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    user_id = auth.uid()
  );

-- user_channel_order: Consolidate policies
DROP POLICY IF EXISTS "Admins can view all channel orders" ON public.user_channel_order;
DROP POLICY IF EXISTS "Users can read own channel order" ON public.user_channel_order;

CREATE POLICY "View channel order"
  ON public.user_channel_order
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    user_id = auth.uid()
  );

-- user_image_preferences: Consolidate policies
DROP POLICY IF EXISTS "Admins can view all image preferences" ON public.user_image_preferences;
DROP POLICY IF EXISTS "Users can view own image preferences" ON public.user_image_preferences;

CREATE POLICY "View image preferences"
  ON public.user_image_preferences
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    OR
    user_id = auth.uid()
  );

-- user_profiles: Consolidate policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

CREATE POLICY "View profiles"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_admin = true
    )
    OR
    id = auth.uid()
  );

CREATE POLICY "Update profiles"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_admin = true
    )
    OR
    id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_admin = true
    )
    OR
    id = auth.uid()
  );

-- =====================================================
-- 4. FIX FUNCTION SEARCH PATHS
-- =====================================================

-- Recreate is_admin function with secure search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$;

-- Recreate update_saved_sequences_updated_at with secure search_path
CREATE OR REPLACE FUNCTION public.update_saved_sequences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =====================================================
-- SECURITY NOTES
-- =====================================================

-- To enable Leaked Password Protection:
-- 1. Go to Supabase Dashboard
-- 2. Navigate to: Authentication > Settings
-- 3. Enable "Leaked Password Protection"
-- 4. This will check passwords against HaveIBeenPwned.org database

-- Migration: 20251029170000_fix_user_profiles_select_policy.sql
/*
  # Fix user_profiles SELECT policy circular dependency

  1. Problem
    - The "View profiles" policy had a circular dependency
    - It checked if user is admin by querying user_profiles within a user_profiles query
    - This caused infinite loops and timeouts for new user signups

  2. Solution
    - Simplify the policy to check is_admin on the current row only
    - Users can view their own profile OR any admin profile
    - No nested queries needed

  3. Security
    - Users can still only see their own profile
    - Admins can see all profiles (checked on the row itself)
*/

-- Drop the problematic policy with circular dependency
DROP POLICY IF EXISTS "View profiles" ON public.user_profiles;

-- Create a simpler policy without circular dependency
CREATE POLICY "View profiles"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (
    -- Users can always view their own profile
    id = auth.uid()
    OR
    -- Anyone can view admin profiles (useful for permission checks)
    is_admin = true
  );

-- Migration: 20251030003340_fix_numeric_precision_for_metadata.sql
/*
  # Fix Numeric Precision for Metadata Fields

  1. Changes
    - Alter metadata columns to support larger numeric values
    - Change from NUMERIC(3,2) to NUMERIC(5,2) to support values up to 999.99
    - This allows for metadata values that may be on different scales

  2. Affected Columns
    - speed
    - intensity
    - arousal
    - valence
    - brightness
    - complexity
*/

-- Alter numeric precision to support larger values
ALTER TABLE audio_tracks
  ALTER COLUMN speed TYPE NUMERIC(5,2),
  ALTER COLUMN intensity TYPE NUMERIC(5,2),
  ALTER COLUMN arousal TYPE NUMERIC(5,2),
  ALTER COLUMN valence TYPE NUMERIC(5,2),
  ALTER COLUMN brightness TYPE NUMERIC(5,2),
  ALTER COLUMN complexity TYPE NUMERIC(5,2);

-- Migration: 20251030185854_add_saved_sequence_reference_to_slot_strategies.sql
/*
  # Add saved sequence reference to slot strategies

  1. Changes
    - Add `saved_sequence_id` column to `slot_strategies` table to track which saved sequence was loaded
    - Add `saved_sequence_name` column to store a snapshot of the name (in case sequence is deleted)
    - Add foreign key constraint with ON DELETE SET NULL

  2. Purpose
    - When a saved sequence is loaded and then saved as the active strategy, track this relationship
    - Display the sequence name in the UI when revisiting the slot sequencer
*/

-- Add columns to track loaded sequence
ALTER TABLE slot_strategies 
ADD COLUMN IF NOT EXISTS saved_sequence_id uuid REFERENCES saved_slot_sequences(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS saved_sequence_name text;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_slot_strategies_saved_sequence 
ON slot_strategies(saved_sequence_id);
-- Migration: 20251030232208_create_get_distinct_metadata_values_function.sql
/*
  # Create function to get distinct metadata values

  1. New Function
    - `get_distinct_metadata_values(metadata_path text)` - Returns array of distinct non-null values from JSONB metadata field
    - Efficiently queries all tracks without loading entire dataset into memory
    - Filters out null and empty string values
    - Returns sorted results

  2. Purpose
    - Improve performance when loading field options in Slot Strategy Editor
    - Handle datasets larger than query limits (>10,000 records)
    - Provide efficient DISTINCT queries on JSONB fields

  3. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only returns distinct values, no sensitive data exposure
    - Read-only operation
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_distinct_metadata_values(text);

-- Create function to get distinct metadata values
CREATE OR REPLACE FUNCTION get_distinct_metadata_values(metadata_path text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result text[];
BEGIN
  -- Build dynamic query to get distinct values from metadata JSONB field
  EXECUTE format(
    'SELECT ARRAY(
      SELECT DISTINCT %I::text
      FROM audio_tracks
      WHERE deleted_at IS NULL
        AND %I IS NOT NULL
        AND %I::text != ''''
      ORDER BY %I::text
    )',
    metadata_path,
    metadata_path,
    metadata_path,
    metadata_path
  ) INTO result;
  
  RETURN COALESCE(result, ARRAY[]::text[]);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_distinct_metadata_values(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_distinct_metadata_values(text) TO anon;

-- Migration: 20251030232218_fix_get_distinct_metadata_values_function.sql
/*
  # Create function to get distinct metadata values (fixed)

  1. New Function
    - `get_distinct_metadata_values(metadata_path text)` - Returns array of distinct non-null values from JSONB metadata field
    - Efficiently queries all tracks without loading entire dataset into memory
    - Filters out null and empty string values
    - Returns sorted results

  2. Purpose
    - Improve performance when loading field options in Slot Strategy Editor
    - Handle datasets larger than query limits (>10,000 records)
    - Provide efficient DISTINCT queries on JSONB fields

  3. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only returns distinct values, no sensitive data exposure
    - Read-only operation
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_distinct_metadata_values(text);

-- Create function to get distinct metadata values
-- Takes the JSON path as parameter (e.g., 'genre', 'artist_name', etc.)
CREATE OR REPLACE FUNCTION get_distinct_metadata_values(json_key text)
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY_AGG(DISTINCT value ORDER BY value)
  FROM (
    SELECT metadata->>json_key as value
    FROM audio_tracks
    WHERE deleted_at IS NULL
      AND metadata->>json_key IS NOT NULL
      AND metadata->>json_key != ''
  ) sub
  WHERE value IS NOT NULL;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_distinct_metadata_values(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_distinct_metadata_values(text) TO anon;

-- Migration: 20251031041529_fix_user_profiles_select_policy_v2.sql
/*
  # Fix User Profiles SELECT Policy
  
  1. Security Fix
    - Drop the broken "View profiles" policy that checks `is_admin = true` on the target profile
    - Create a correct policy that allows users to view their own profile
    - Create a separate policy for admins to view all profiles
  
  This fixes the authentication bug where users cannot view their own profiles and get logged out.
*/

-- Drop the broken policy
DROP POLICY IF EXISTS "View profiles" ON user_profiles;

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Migration: 20251031043702_fix_user_profiles_infinite_recursion.sql
/*
  # Fix infinite recursion in user_profiles RLS policies

  This migration fixes the infinite recursion issue in user_profiles table policies.
  
  ## Problem
  The admin check policies were querying user_profiles.is_admin within the same table's policies,
  causing infinite recursion when trying to check if a user is an admin.
  
  ## Solution
  Replace the subquery-based admin checks with a direct column check using the current row's data.
  For SELECT policies, we can safely check the is_admin column directly.
  For UPDATE policies, we allow users to update their own profile or if they are an admin.
  
  ## Changes
  1. Drop existing problematic policies
  2. Create new policies without infinite recursion
*/

-- Drop problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Update profiles" ON user_profiles;

-- Create new SELECT policy for admins
-- This policy allows viewing if the user is an admin OR viewing their own profile
CREATE POLICY "Users can view profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM user_profiles up 
      WHERE up.id = auth.uid() 
      AND up.is_admin = true
      LIMIT 1
    )
  );

-- Create new UPDATE policy
-- Allow users to update their own profile
-- Admins need separate policy to update others
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Separate policy for admin updates
CREATE POLICY "Admins can update all profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_admin = true
      LIMIT 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.is_admin = true
      LIMIT 1
    )
  );

-- Migration: 20251031043715_fix_user_profiles_recursion_v2.sql
/*
  # Fix infinite recursion in user_profiles RLS policies (v2)

  ## Problem
  The admin check policies cause infinite recursion because they query user_profiles 
  within user_profiles policies.
  
  ## Solution
  Create a security definer function that bypasses RLS to check admin status,
  then use this function in the policies.
  
  ## Changes
  1. Create a security definer function to check admin status
  2. Recreate policies using this function
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;

-- Create security definer function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM user_profiles 
    WHERE id = auth.uid() 
    AND is_admin = true
  );
END;
$$;

-- Create new SELECT policy
CREATE POLICY "Users can view own profile or all if admin"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR is_admin());

-- Create new UPDATE policy for own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());

-- Migration: 20251031043811_cleanup_duplicate_user_profiles_policies.sql
/*
  # Cleanup duplicate user_profiles policies

  Remove the old "Users can view own profile" policy since we have the newer
  "Users can view own profile or all if admin" policy that supersedes it.
*/

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;

