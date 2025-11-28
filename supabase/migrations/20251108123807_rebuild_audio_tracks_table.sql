/*
  # Rebuild Audio Tracks Table from JSON Sidecars
  
  ## Summary
  Complete rebuild of corrupted audio_tracks table with fresh schema populated from JSON sidecar files.
  
  ## Changes Made
  
  ### 1. Drop Existing Table
  - Remove all policies from audio_tracks
  - Drop audio_tracks table completely with CASCADE
  - Removes all indexes, constraints, and dependencies
  
  ### 2. Create Fresh Table with Complete Schema
  - **Core Fields**:
    - id (uuid primary key with default)
    - channel_id (uuid nullable, FK to audio_channels)
    - file_path (text unique NOT NULL) - Format: "{track_id}.mp3"
    - duration_seconds (integer NOT NULL)
    - energy_level (text with CHECK constraint: low, medium, high)
  
  - **Energy Boolean Flags**:
    - energy_low, energy_medium, energy_high (boolean, default false)
    - Allow tracks to belong to multiple energy playlists
  
  - **Metadata Columns**:
    - track_id (integer indexed) - Original numeric ID from source
    - tempo (numeric) - BPM value
    - catalog (text) - Catalog classification (e.g., "ultimae")
    - locked (boolean) - Whether track is locked
    - track_user_genre_id (integer) - Genre identifier
  
  - **Audio Quality Metrics**:
    - speed (numeric 4,2) - Speed rating 0.00-1.00
    - intensity (numeric 4,2) - Intensity rating 0.00-1.00
    - arousal (numeric 5,2) - Arousal rating -1.00 to 1.00
    - valence (numeric 5,2) - Valence rating -1.00 to 1.00
    - brightness (numeric 4,2) - Brightness rating 0.00-1.00
    - complexity (numeric 4,2) - Complexity rating 0.00-1.00
    - music_key_value (text) - Musical key
    - energy_set (text) - Energy set classification
  
  - **Flexible Metadata**:
    - metadata (jsonb) - Complete JSON sidecar data
    - skip_rate (numeric) - Aggregate skip rate from analytics
  
  - **Preview System**:
    - is_preview (boolean default false) - Flag for preview tracks
    - preview_channel_id (uuid FK) - Which channel this previews
  
  - **Soft Delete Support**:
    - deleted_at (timestamptz) - Soft delete timestamp
    - deleted_by (uuid FK) - Admin who deleted
  
  - **Timestamps**:
    - created_at, updated_at (timestamptz with defaults)
  
  ### 3. Indexes for Performance
  - Primary key on id
  - Unique constraint on file_path
  - Index on channel_id for joins
  - Index on track_id for lookups
  - Index on energy_level for filtering
  - Partial indexes on energy booleans (WHERE true)
  - Partial index on deleted_at (WHERE NOT NULL)
  - Composite index on (channel_id, energy_level)
  - Partial index on preview tracks
  
  ### 4. Row Level Security
  - Enable RLS on table
  - Anonymous users can view non-deleted tracks
  - Authenticated users can view non-deleted tracks
  - Admins can view all tracks including deleted
  - Admins can insert, update, and soft delete tracks
  - Admins can permanently delete old soft-deleted tracks (28+ days)
  
  ## Notes
  - This migration drops ALL existing data in audio_tracks
  - Data will be repopulated from JSON sidecar files via import script
  - File paths will use format: "{numeric_track_id}.mp3"
  - All security policies are restored to match original design
*/

-- Step 1: Drop all existing policies
DROP POLICY IF EXISTS "Anyone can view tracks" ON audio_tracks;
DROP POLICY IF EXISTS "Anyone can view non-deleted tracks" ON audio_tracks;
DROP POLICY IF EXISTS "Users can view non-deleted tracks" ON audio_tracks;
DROP POLICY IF EXISTS "Users can view all tracks" ON audio_tracks;
DROP POLICY IF EXISTS "Admins can view deleted tracks" ON audio_tracks;
DROP POLICY IF EXISTS "Admins can view all tracks" ON audio_tracks;
DROP POLICY IF EXISTS "Admins can soft delete tracks" ON audio_tracks;
DROP POLICY IF EXISTS "Admins can insert tracks" ON audio_tracks;
DROP POLICY IF EXISTS "Admins can update tracks" ON audio_tracks;
DROP POLICY IF EXISTS "Admins can permanently delete old tracks" ON audio_tracks;

-- Step 2: Drop the entire table
DROP TABLE IF EXISTS audio_tracks CASCADE;

-- Step 3: Create fresh audio_tracks table with complete schema
CREATE TABLE audio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  file_path text UNIQUE NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  energy_level text CHECK (energy_level IN ('low', 'medium', 'high')),
  
  energy_low boolean DEFAULT false,
  energy_medium boolean DEFAULT false,
  energy_high boolean DEFAULT false,
  
  track_id integer,
  tempo numeric,
  catalog text,
  locked boolean DEFAULT false,
  track_user_genre_id integer,
  
  speed numeric(4,2),
  intensity numeric(4,2),
  arousal numeric(5,2),
  valence numeric(5,2),
  brightness numeric(4,2),
  complexity numeric(4,2),
  music_key_value text,
  energy_set text,
  
  metadata jsonb DEFAULT '{}',
  skip_rate numeric DEFAULT 0.0,
  
  is_preview boolean DEFAULT false NOT NULL,
  preview_channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Step 4: Create indexes
CREATE INDEX idx_audio_tracks_channel ON audio_tracks(channel_id);
CREATE INDEX idx_audio_tracks_track_id ON audio_tracks(track_id);
CREATE INDEX idx_audio_tracks_energy ON audio_tracks(energy_level);
CREATE INDEX idx_audio_tracks_energy_low ON audio_tracks(energy_low) WHERE energy_low = true;
CREATE INDEX idx_audio_tracks_energy_medium ON audio_tracks(energy_medium) WHERE energy_medium = true;
CREATE INDEX idx_audio_tracks_energy_high ON audio_tracks(energy_high) WHERE energy_high = true;
CREATE INDEX idx_audio_tracks_deleted_at ON audio_tracks(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_audio_tracks_channel_energy ON audio_tracks(channel_id, energy_level);
CREATE INDEX idx_audio_tracks_preview_channel ON audio_tracks(preview_channel_id, is_preview) WHERE is_preview = true AND deleted_at IS NULL;

-- Step 5: Enable RLS
ALTER TABLE audio_tracks ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies

-- Anonymous users can view non-deleted tracks
CREATE POLICY "Anonymous can view non-deleted tracks"
  ON audio_tracks
  FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

-- Authenticated users can view non-deleted tracks
CREATE POLICY "Users can view non-deleted tracks"
  ON audio_tracks
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- Admins can view all tracks including deleted
CREATE POLICY "Admins can view all tracks"
  ON audio_tracks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Admins can insert tracks
CREATE POLICY "Admins can insert tracks"
  ON audio_tracks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Admins can update tracks
CREATE POLICY "Admins can update tracks"
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

-- Admins can permanently delete old soft-deleted tracks
CREATE POLICY "Admins can delete old soft-deleted tracks"
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

-- Add helpful comments
COMMENT ON TABLE audio_tracks IS 'Audio tracks with metadata from JSON sidecar files';
COMMENT ON COLUMN audio_tracks.file_path IS 'Path to audio file in storage, format: {track_id}.mp3';
COMMENT ON COLUMN audio_tracks.track_id IS 'Original numeric track ID from source system';
COMMENT ON COLUMN audio_tracks.metadata IS 'Complete JSON sidecar metadata';
COMMENT ON COLUMN audio_tracks.energy_low IS 'Track can be used in low energy playlists';
COMMENT ON COLUMN audio_tracks.energy_medium IS 'Track can be used in medium energy playlists';
COMMENT ON COLUMN audio_tracks.energy_high IS 'Track can be used in high energy playlists';
COMMENT ON COLUMN audio_tracks.deleted_at IS 'Soft delete timestamp, NULL for active tracks';
