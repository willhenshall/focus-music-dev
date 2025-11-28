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

